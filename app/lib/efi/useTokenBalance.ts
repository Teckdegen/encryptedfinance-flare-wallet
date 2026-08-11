"use client";
import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ethers } from "ethers";
import { Token } from "../contracts";
import { EfiState } from "./useEfi";
import { coston2Provider } from "./rpc";

const ERC20 = ["function balanceOf(address) view returns (uint256)"];

/**
 * Live available balance for ONE token. `encrypted` picks the source:
 *   false → public ERC-20 balanceOf (on Coston2)
 *   true  → private = sum of the user's shielded notes for this token
 * Returns the raw bigint + a formatted string, polled every 5s. This is the
 * single source of truth every amount form uses to cap what you can enter.
 */
export function useTokenBalance(token: Token, encrypted: boolean, efi?: EfiState) {
  const { address } = useAccount();
  const [raw, setRaw] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) { setRaw(0n); setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      try {
        let v = 0n;
        if (encrypted) {
          if (efi?.client && efi.spendingKeyHex) {
            const notes = await efi.client.scanNotes(efi.spendingKeyHex);
            v = notes
              .filter((n) => n.token.toLowerCase() === token.address.toLowerCase())
              .reduce((a, n) => a + n.amount, 0n);
          }
        } else {
          const c = new ethers.Contract(token.address, ERC20, coston2Provider());
          v = (await c.balanceOf(address)) as bigint;
        }
        if (!cancelled) { setRaw(v); setLoading(false); }
      } catch { /* keep last good value */ }
    };
    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [address, token.address, encrypted, efi?.client, efi?.spendingKeyHex]);

  return { raw, formatted: ethers.formatUnits(raw, token.decimals), loading };
}

/**
 * Parse a user-typed amount to base units without throwing on partial input
 * ("", "0.", "1.2.3"). Returns null when the string isn't a valid number yet.
 */
export function parseAmount(amount: string, decimals: number): bigint | null {
  const s = (amount || "").trim();
  if (!s || s === "." || Number.isNaN(Number(s))) return null;
  try { return ethers.parseUnits(s, decimals); } catch { return null; }
}
