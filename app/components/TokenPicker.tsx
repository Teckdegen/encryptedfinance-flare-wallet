"use client";
import { TOKENS, Token } from "../lib/contracts";
import { Search, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ethers } from "ethers";
import { EfiState } from "../lib/efi/useEfi";
import { coston2Provider } from "../lib/efi/rpc";

const ERC20 = ["function balanceOf(address) view returns (uint256)"];

// Reads are pinned to Coston2 (where the tokens live) so balances don't read 0
// when the wallet is pointed at another network.
function browserProvider(): ethers.Provider {
  return coston2Provider();
}

const COLOR_MAP: Record<string, string> = {
  GHST: "from-slate-400 to-slate-600",
  CIPH: "from-cyan-400 to-blue-600",
  VEIL: "from-purple-400 to-fuchsia-600",
  NOIR: "from-zinc-700 to-zinc-900",
  PHTM: "from-indigo-400 to-violet-600",
  MASK: "from-rose-400 to-pink-600",
  SHDE: "from-neutral-500 to-neutral-700",
  NULL: "from-amber-400 to-orange-600",
  MRKL: "from-emerald-400 to-teal-600",
  ENIG: "from-lime-400 to-green-600",
};

// Live balances, polled every 5s, straight from chain / the TEE — no stale cache.
// Public = ERC-20 balanceOf. Private = scanNotes (cache + NOTE:LIST) summed per token.
function useBalances(encrypted?: boolean, efi?: EfiState): { bals: Record<string, number>; loading: boolean } {
  const { address } = useAccount();
  const [bals, setBals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const load = async () => {
      const out: Record<string, number> = {};
      try {
        if (encrypted) {
          if (!efi?.client || !efi.spendingKeyHex) return;
          const notes = await efi.client.scanNotes(efi.spendingKeyHex);
          for (const t of TOKENS) {
            const sum = notes
              .filter((n) => n.token.toLowerCase() === t.address.toLowerCase())
              .reduce((a, n) => a + n.amount, 0n);
            out[t.symbol] = Number(ethers.formatUnits(sum, t.decimals));
          }
        } else {
          const provider = browserProvider();
          await Promise.all(
            TOKENS.map(async (t) => {
              try {
                const c = new ethers.Contract(t.address, ERC20, provider);
                out[t.symbol] = Number(ethers.formatUnits((await c.balanceOf(address)) as bigint, t.decimals));
              } catch { out[t.symbol] = 0; }
            }),
          );
        }
        if (!cancelled) { setBals(out); setLoading(false); }
      } catch { /* keep last */ }
    };
    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [address, encrypted, efi?.client, efi?.spendingKeyHex]);
  return { bals, loading };
}

export function TokenPicker({
  current,
  onPick,
  onClose,
  label,
  encrypted,
  efi,
}: {
  current: Token;
  onPick: (t: Token) => void;
  onClose: () => void;
  label?: string;
  encrypted?: boolean;
  efi?: EfiState;
}) {
  const [q, setQ] = useState("");
  const { bals, loading } = useBalances(encrypted, efi);
  const filtered = TOKENS.filter(
    (t) => t.symbol.toLowerCase().includes(q.toLowerCase()) || t.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center pt-3 pb-2">
          <div className="w-12 h-1 rounded-full bg-white/15" />
        </div>
        <div className="px-5 pb-3 flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-muted">{label ?? "Select token"}</div>
          <button onClick={onClose} className="w-9 h-9 rounded-full glass flex items-center justify-center" aria-label="close">
            <X size={16} className="text-ink" />
          </button>
        </div>
        <div className="px-5 pb-3">
          <div className="glass rounded-full pl-4 pr-2 py-2 flex items-center gap-2">
            <Search size={14} className="text-muted" />
            <input type="text" placeholder="Search token" value={q} onChange={(e) => setQ(e.target.value)} className="bg-transparent flex-1 text-sm focus:outline-none min-w-0" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto hide-scrollbar px-3 pb-6 space-y-1">
          {filtered.map((t) => {
            const sym = encrypted ? `e${t.symbol}` : t.symbol;
            const name = encrypted ? `Encrypted ${t.name}` : t.name;
            const bal = bals[t.symbol] ?? 0;
            const isCurrent = current.symbol === t.symbol;
            return (
              <button
                key={t.symbol}
                onClick={() => { onPick(t); onClose(); }}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl transition ${isCurrent ? "bg-white/10" : "hover:bg-white/10"}`}
              >
                <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${COLOR_MAP[t.symbol] ?? "from-gray-500 to-gray-700"} flex items-center justify-center text-sm font-bold text-white shadow-inner`}>
                  {sym.charAt(0)}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-bold">{sym}</div>
                  <div className="text-xs text-muted">{name}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold">{loading ? "…" : bal.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                  <div className="text-[10px] text-muted uppercase tracking-widest">{encrypted ? "Note" : "Balance"}</div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="text-center text-sm text-muted py-8">No tokens match</div>}
        </div>
      </div>
    </div>
  );
}
