"use client";
import { useCallback, useEffect, useState } from "react";
import { EfiState } from "./useEfi";
import { PrivateNote } from "./client";
import { TOKENS, Token } from "../contracts";

export function tokenByAddress(addr: string): Token | undefined {
  return TOKENS.find((t) => t.address.toLowerCase() === addr.toLowerCase());
}

/** Group notes by token, summing balances. */
export function groupNotes(notes: PrivateNote[]): { token: Token; total: bigint; notes: PrivateNote[] }[] {
  const map = new Map<string, PrivateNote[]>();
  for (const n of notes) {
    const k = n.token.toLowerCase();
    map.set(k, [...(map.get(k) ?? []), n]);
  }
  const out: { token: Token; total: bigint; notes: PrivateNote[] }[] = [];
  for (const [addr, ns] of map) {
    const token = tokenByAddress(addr);
    if (!token) continue;
    out.push({ token, total: ns.reduce((s, n) => s + n.amount, 0n), notes: ns });
  }
  return out.sort((a, b) => (a.token.symbol < b.token.symbol ? -1 : 1));
}

/** Smallest single note of `tokenAddr` that covers `needed` (keeps big notes whole). */
export function pickNote(notes: PrivateNote[], tokenAddr: string, needed: bigint): PrivateNote | null {
  return (
    notes
      .filter((n) => n.token.toLowerCase() === tokenAddr.toLowerCase() && n.amount >= needed)
      .sort((a, b) => (a.amount < b.amount ? -1 : 1))[0] ?? null
  );
}

/** Scans the caller's private notes (decrypts locally with the spending key). */
export function useNotes(efi: EfiState) {
  const [notes, setNotes] = useState<PrivateNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false); // first scan completed (stays true across polls)
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!efi.client || !efi.spendingKeyHex) return;
    setLoading(true); setError(null);
    try {
      setNotes(await efi.client.scanNotes(efi.spendingKeyHex));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false); setReady(true);
    }
  }, [efi.client, efi.spendingKeyHex]);

  // Auto-poll every 5s so balances stay live without a manual refresh.
  useEffect(() => {
    void refresh();
    const id = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return { notes, loading, ready, error, refresh };
}
