"use client";
import { Clock, ArrowUpRight, ArrowDownLeft, FileText, ExternalLink } from "lucide-react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { fetchAddressTransactions } from "../lib/explorer";

const SELECTOR_RE = /^0x[a-f0-9]{8}$/i;

function prettyMethod(m?: string): string {
  if (!m) return "";
  if (SELECTOR_RE.test(m)) return "";
  return m.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function shortAddr(a: string | undefined | null): string {
  if (!a) return "contract";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export function Activity() {
  const { address, isConnected } = useAccount();

  const { data, isLoading } = useQuery({
    queryKey: ["address-txs", address],
    queryFn: () => fetchAddressTransactions(address!),
    enabled: !!address,
    refetchInterval: 20000,
  });

  const txs = data ?? [];

  if (!isConnected) {
    return (
      <div className="glass rounded-3xl p-6">
        <div className="glass-strong rounded-2xl p-8 text-center">
          <Clock size={28} strokeWidth={1.5} className="mx-auto mb-3 text-muted" />
          <div className="text-sm font-bold uppercase tracking-widest mb-1">Connect wallet</div>
          <div className="text-xs text-muted">See your transactions here</div>
        </div>
      </div>
    );
  }

  if (isLoading && txs.length === 0) {
    return (
      <div className="glass rounded-3xl p-6">
        <div className="text-center text-sm text-muted animate-pulse py-6">Loading activity...</div>
      </div>
    );
  }

  if (txs.length === 0) {
    return (
      <div className="glass rounded-3xl p-6">
        <div className="glass-strong rounded-2xl p-8 text-center">
          <Clock size={28} strokeWidth={1.5} className="mx-auto mb-3 text-muted" />
          <div className="text-sm font-bold uppercase tracking-widest mb-1">No activity yet</div>
          <div className="text-xs text-muted">Wraps, transfers, and swaps show here</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {txs.slice(0, 30).map((tx) => {
        const outgoing = address ? tx.from.hash.toLowerCase() === address.toLowerCase() : false;
        const counter = outgoing ? tx.to?.hash : tx.from.hash;
        const method = prettyMethod(tx.method);
        const title = method || (outgoing ? "Sent" : "Received");
        const Icon = method ? FileText : outgoing ? ArrowUpRight : ArrowDownLeft;
        const iconTint = method ? "text-muted" : outgoing ? "text-danger" : "text-success";
        const when = tx.timestamp
          ? new Date(tx.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
          : "";
        return (
          <a
            key={tx.hash}
            href={`https://coston2-explorer.flare.network/tx/${tx.hash}`}
            target="_blank"
            rel="noreferrer"
            className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-white/10 transition"
          >
            <div className="w-10 h-10 rounded-full glass-strong flex items-center justify-center flex-shrink-0">
              <Icon size={18} strokeWidth={2} className={iconTint} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">{title}</div>
              <div className="text-xs text-muted font-mono truncate">
                {outgoing ? "→ " : "← "}{shortAddr(counter)}
              </div>
            </div>

            <div className="text-right flex-shrink-0">
              <div className="text-xs text-muted whitespace-nowrap">{when}</div>
              <div className="text-[10px] text-muted flex items-center justify-end gap-1 mt-0.5">
                <span>#{tx.block}</span>
                <ExternalLink size={10} />
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
