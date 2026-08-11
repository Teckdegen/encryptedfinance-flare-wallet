"use client";
import { useState, useEffect, useCallback } from "react";
import { EyeOff } from "lucide-react";
import { ethers } from "ethers";
import { EfiState } from "../lib/efi/useEfi";
import { PrivacyGate } from "./PrivacyGate";
import { TOKENS } from "../lib/contracts";

interface Bal { token: string; totalAmount: bigint; noteCount: number }

function meta(addr: string) {
  const t = TOKENS.find((x) => x.address.toLowerCase() === addr.toLowerCase());
  return { sym: t?.symbol ?? addr.slice(0, 8), dec: t?.decimals ?? 18 };
}

export function PrivateBalance({ efi }: { efi: EfiState }) {
  const [bals, setBals] = useState<Bal[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // deep=true also scans the chain for notes not in the local cache (swap outputs,
  // received transfers, older shields). It's slower, so it's only the manual button.
  const scan = useCallback(async (deep = false) => {
    if (!efi.client || !efi.spendingKeyHex) return;
    setLoading(true); setErr(null);
    try {
      const notes = await efi.client.scanNotes(efi.spendingKeyHex, 0, deep);
      const byToken = new Map<string, Bal>();
      for (const n of notes) {
        const k = n.token.toLowerCase();
        const cur = byToken.get(k) ?? { token: n.token, totalAmount: 0n, noteCount: 0 };
        cur.totalAmount += n.amount; cur.noteCount += 1;
        byToken.set(k, cur);
      }
      setBals([...byToken.values()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [efi.client, efi.spendingKeyHex]);

  // Auto-poll every 5s — no manual refresh.
  useEffect(() => {
    if (efi.regState !== "registered") return;
    scan(false);
    const id = setInterval(() => scan(false), 5000);
    return () => clearInterval(id);
  }, [efi.regState, scan]);

  return (
    <PrivacyGate efi={efi}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold px-1">
          <EyeOff size={15} /> Private balance
        </div>

        {err && <div className="glass rounded-2xl px-4 py-3 text-xs text-danger">{err}</div>}

        {!bals && loading && (
          <div className="glass rounded-2xl px-4 py-8 text-center text-sm text-muted animate-pulse">Scanning encrypted notes…</div>
        )}
        {bals && bals.length === 0 && (
          <div className="glass rounded-2xl px-4 py-8 text-center text-sm text-muted">
            No private notes yet — Shield a token to begin.
          </div>
        )}
        {bals?.map((b) => {
          const { sym, dec } = meta(b.token);
          const amt = Number(ethers.formatUnits(b.totalAmount, dec));
          return (
            <div key={b.token} className="glass rounded-2xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-black border border-white/20 flex items-center justify-center text-sm font-bold text-white">{sym[0]}</div>
                <div>
                  <div className="text-sm font-bold">e{sym}</div>
                  <div className="text-xs text-muted">{b.noteCount} encrypted note{b.noteCount === 1 ? "" : "s"}</div>
                </div>
              </div>
              <div className="text-sm font-mono font-bold">{amt.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
            </div>
          );
        })}
      </div>
    </PrivacyGate>
  );
}
