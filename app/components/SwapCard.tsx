"use client";
import { TOKENS, Token } from "../lib/contracts";
import { ChevronDown, ArrowDown, Settings2 } from "lucide-react";
import { useState } from "react";
import { TokenPicker } from "./TokenPicker";
import { EfiState } from "../lib/efi/useEfi";
import { useTokenBalance, parseAmount } from "../lib/efi/useTokenBalance";

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

function TokenBadge({ symbol, encrypted, onSelect, locked }: { symbol: string; encrypted?: boolean; onSelect: () => void; locked?: boolean }) {
  const base = symbol.replace(/^e/, "");
  const display = encrypted ? `e${base}` : base;
  return (
    <button
      onClick={onSelect}
      disabled={locked}
      className="flex items-center gap-2 glass-strong rounded-full pl-1 pr-3 py-1 hover:bg-white/10 transition disabled:opacity-100 disabled:cursor-default"
    >
      <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${COLOR_MAP[base] ?? "from-gray-500 to-gray-700"} flex items-center justify-center text-[11px] font-bold text-white`}>
        {display.charAt(0)}
      </div>
      <span className="text-sm font-bold">{display}</span>
      {!locked && <ChevronDown size={14} className="text-muted" />}
    </button>
  );
}

type Mode = "shield" | "unshield" | "swap";

export function SwapCard({
  title,
  mode,
  submitLabel,
  onSubmit,
  hint,
  busy,
  status,
  error,
  efi,
}: {
  title: string;
  mode: Mode;
  submitLabel: string;
  onSubmit?: (from: Token, to: Token, amount: string) => void;
  hint?: string;
  busy?: boolean;
  status?: string | null;
  error?: string | null;
  efi?: EfiState;
}) {
  const [fromToken, setFromToken] = useState<Token>(TOKENS[0]);
  const [toToken, setToToken] = useState<Token>(TOKENS[1]);
  const [amount, setAmount] = useState("0");
  const [picking, setPicking] = useState<"from" | "to" | null>(null);

  const linked = mode !== "swap";
  const displayFrom = mode === "unshield" ? true : false;
  const displayTo = mode === "shield" ? true : linked ? false : false;

  const effectiveTo = linked ? fromToken : toToken;

  const outAmount = amount && Number(amount) > 0 ? (Number(amount) * 0.995).toFixed(4) : "0";

  // Cap "You Pay" at the wallet's available balance for this token.
  // shield pays a public ERC-20; unshield/swap pay a private (encrypted) note.
  const { raw: payBal, formatted: payBalStr, loading: balLoading } = useTokenBalance(fromToken, displayFrom, efi);
  const amtUnits = parseAmount(amount, fromToken.decimals);
  const overBalance = amtUnits !== null && amtUnits > payBal;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-lg font-bold">{title}</div>
        <button className="glass w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition">
          <Settings2 size={16} className="text-muted" />
        </button>
      </div>

      <div className="glass rounded-3xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted uppercase tracking-widest">You Pay</span>
          <button type="button" onClick={() => payBal > 0n && setAmount(payBalStr)} className="text-xs text-muted hover:text-ink">
            bal {balLoading ? "…" : Number(payBalStr).toLocaleString(undefined, { maximumFractionDigits: 4 })} · <span className="font-bold">Max</span>
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`bg-transparent text-4xl font-bold tracking-tight w-full focus:outline-none min-w-0 ${overBalance ? "text-danger" : ""}`}
            placeholder="0"
          />
          <TokenBadge
            symbol={fromToken.symbol}
            encrypted={displayFrom}
            onSelect={() => setPicking("from")}
          />
        </div>
      </div>

      <div className="flex justify-center -my-2">
        <div className="glass-strong w-10 h-10 rounded-full flex items-center justify-center z-10">
          <ArrowDown size={16} className="text-ink" />
        </div>
      </div>

      <div className="glass rounded-3xl p-5">
        <div className="text-xs text-muted uppercase tracking-widest mb-3">You Receive</div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-4xl font-bold tracking-tight text-muted">{outAmount}</div>
          <TokenBadge
            symbol={effectiveTo.symbol}
            encrypted={displayTo}
            onSelect={() => !linked && setPicking("to")}
            locked={linked}
          />
        </div>
      </div>

      <button
        onClick={() => onSubmit?.(fromToken, effectiveTo, amount)}
        disabled={busy || !amount || Number(amount) === 0 || overBalance}
        className="glass-btn w-full py-4 rounded-full text-sm font-bold tracking-widest uppercase mt-3"
      >
        {busy ? "Working…" : overBalance ? "Insufficient balance" : submitLabel}
      </button>

      {error && <div className="text-xs text-danger text-center mt-1 break-words">{error}</div>}
      {status && <div className="text-xs text-success text-center mt-1 break-words">{status}</div>}
      {hint && !error && !status && (
        <div className="text-xs text-muted text-center mt-1">{hint}</div>
      )}

      {picking && (
        <TokenPicker
          current={picking === "from" ? fromToken : toToken}
          onPick={(t) => (picking === "from" ? setFromToken(t) : setToToken(t))}
          onClose={() => setPicking(null)}
          label={picking === "from" ? "You Pay" : "You Receive"}
          encrypted={picking === "from" ? displayFrom : displayTo}
          efi={efi}
        />
      )}
    </div>
  );
}
