"use client";
import { useState } from "react";
import { parseUnits } from "viem";
import { ethers } from "ethers";
import { SwapCard } from "./SwapCard";
import { Token } from "../lib/contracts";
import { EfiState } from "../lib/efi/useEfi";
import { playSubmit, playSuccess, playError } from "../lib/sound";

/**
 * Shield = wrap a public ERC-20 into an encrypted note. This is a *direct*
 * on-chain deposit (not a relayed/gasless op) — your wallet approves + signs
 * `vault.deposit`, so it needs C2FLR for gas and a balance of the token. We use
 * the real client.shield(): it encrypts a 221-byte note to your spending key and
 * calls deposit with the correct ABI (the old stub reverted → "gas unavailable").
 */
export function Shield({ efi }: { efi: EfiState }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(from: Token, _to: Token, amount: string) {
    if (!efi.client) { setError("Connect your wallet first."); return; }
    setBusy(true); setError(null); setStatus(null); playSubmit();
    try {
      const wei = parseUnits(amount, from.decimals);
      if (wei <= 0n) throw new Error("Enter an amount.");
      // Need a spending key so the note is encrypted to us (one-time signature).
      const keyHex = await efi.ensureKey();
      const efPub = new ethers.SigningKey(keyHex).compressedPublicKey;
      const res = await efi.client.shield(from.address, wei, efPub);
      const net = ethers.formatUnits(res.amount, from.decimals);
      setStatus(`Shielded ${net} ${from.symbol} into a private note · ${res.txHash.slice(0, 10)}…`);
      playSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Make the common wallet failures human.
      setError(
        /insufficient funds|gas required|exceeds|balance/i.test(msg)
          ? "Wallet has no C2FLR gas or not enough of this token. Use the faucet first."
          : msg,
      );
      playError();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SwapCard
      title="Shield"
      mode="shield"
      submitLabel="Shield"
      onSubmit={onSubmit}
      busy={busy}
      status={status}
      error={error}
      efi={efi}
      hint="Turn a token into its encrypted note. 0.5% wrap fee. Needs C2FLR gas."
    />
  );
}
