"use client";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { ethers } from "ethers";
import { EfiClient } from "./client";
import { walletClientToSigner } from "./ethersAdapter";
import { deriveSpendingKey } from "./crypto";
import { PROTOCOL, TEE_URL } from "../contracts";

const CHAIN_ID = 114;
const keyStore = (addr: string) => `efi:spendkey:${addr.toLowerCase()}`;

export type RegState = "unknown" | "unregistered" | "registering" | "registered" | "error";

export interface EfiState {
  client: EfiClient | null;
  ready: boolean;
  teeUrl: string;
  regState: RegState;
  regError: string | null;
  spendingKeyHex: string | null;
  efPubKeyHex: string | null;
  /** First-time setup: one signature → derive + register + cache. Idempotent. */
  enablePrivacy: () => Promise<void>;
  /** Returns the spending key, running setup if needed. Throws if user cancels. */
  ensureKey: () => Promise<string>;
  refresh: () => void;
}

export function useEfi(): EfiState {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [client, setClient] = useState<EfiClient | null>(null);
  const [regState, setRegState] = useState<RegState>("unknown");
  const [regError, setRegError] = useState<string | null>(null);
  const [spendingKeyHex, setSpendingKeyHex] = useState<string | null>(null);
  const [efPubKeyHex, setEfPubKeyHex] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Connect the client + restore a cached key for this address (no re-prompt).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!walletClient || !address) {
        setClient(null);
        setRegState("unknown");
        setSpendingKeyHex(null);
        setEfPubKeyHex(null);
        return;
      }
      try {
        const signer = walletClientToSigner(walletClient);
        const c = await EfiClient.connect(signer, { teeUrl: TEE_URL, protocolAddress: PROTOCOL, chainId: CHAIN_ID });
        if (cancelled) return;
        setClient(c);
        const cached = typeof window !== "undefined" ? localStorage.getItem(keyStore(address)) : null;
        if (cached) {
          // Keep the key locally so balances still decrypt, but the source of
          // truth for "registered" is the ENCLAVE, not this cache — the node may
          // have been wiped/redeployed. If it no longer holds our key, drop to
          // "unregistered" so the private views prompt a one-tap re-register
          // instead of silently failing every spend with "No spending key".
          setSpendingKeyHex(cached);
          setEfPubKeyHex(new ethers.SigningKey(cached).compressedPublicKey);
          try {
            const ok = await c.isRegistered(ethers.getBytes(cached));
            if (!cancelled) setRegState(ok ? "registered" : "unregistered");
          } catch {
            if (!cancelled) setRegState("unregistered");
          }
        } else {
          setRegState("unregistered");
        }
      } catch {
        if (!cancelled) {
          setRegState("error");
          setRegError("Cannot reach the TEE right now. Check your connection and retry.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [walletClient, address, nonce]);

  const enablePrivacy = useCallback(async () => {
    if (!client || !address) throw new Error("not connected");
    setRegState("registering");
    setRegError(null);
    try {
      // Reuse the device's cached key if we already derived one — a wiped enclave
      // just needs the same key re-registered, with no new wallet signature. Only
      // first-time setup on this device pops the (deterministic) signature.
      const cachedHex = typeof window !== "undefined" ? localStorage.getItem(keyStore(address)) : null;
      const key = cachedHex ? ethers.getBytes(cachedHex) : await deriveSpendingKey(client.signer);
      const hex = ethers.hexlify(key);
      // Idempotent: registerKey just re-stores efaddr in the enclave. Safe to
      // call even if this address registered before on another device.
      await client.registerKey(key);
      localStorage.setItem(keyStore(address), hex);
      setSpendingKeyHex(hex);
      setEfPubKeyHex(new ethers.SigningKey(hex).compressedPublicKey);
      setRegState("registered");
    } catch (e) {
      setRegState("error");
      setRegError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [client, address]);

  const ensureKey = useCallback(async () => {
    // Guarantee the ENCLAVE holds our key, not just this browser. If the node
    // was wiped, regState is "unregistered" even with a cached key — re-register
    // (gasless, reuses the cached key, no new signature) before any private op.
    if (regState !== "registered") await enablePrivacy();
    const k = spendingKeyHex ?? (address ? localStorage.getItem(keyStore(address)) : null);
    if (!k) throw new Error("key setup did not complete");
    return k;
  }, [regState, spendingKeyHex, enablePrivacy, address]);

  return {
    client, ready: !!client, teeUrl: TEE_URL,
    regState, regError, spendingKeyHex, efPubKeyHex,
    enablePrivacy, ensureKey,
    refresh: () => setNonce((n) => n + 1),
  };
}
