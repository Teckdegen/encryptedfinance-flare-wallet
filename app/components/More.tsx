"use client";
import { TrendingUp, Layers, Coins, Vote, Shuffle, KeyRound, Palette, Shield, ArrowUpDown, MessageSquareLock, LucideIcon } from "lucide-react";
import { Page } from "./Nav";

const apps: { id: Page | "soon"; label: string; desc: string; Icon: LucideIcon; live: boolean }[] = [
  { id: "unshield", label: "Unshield", desc: "Turn encrypted notes back to public tokens", Icon: Shield, live: true },
  { id: "swap", label: "Swap", desc: "Private swap between encrypted notes", Icon: ArrowUpDown, live: true },
  { id: "disclosure", label: "Selective Disclosure", desc: "Prove solvency without revealing your balance", Icon: KeyRound, live: true },
  { id: "soon", label: "Lending", desc: "Deposit encrypted notes into cToken markets", Icon: TrendingUp, live: false },
  { id: "soon", label: "Messages", desc: "Send end-to-end encrypted notes to any address", Icon: MessageSquareLock, live: false },
  { id: "soon", label: "Stake", desc: "Stake into sFLR privately for FLR rewards", Icon: Coins, live: false },
  { id: "soon", label: "Bridge", desc: "Move encrypted assets cross chain", Icon: Shuffle, live: false },
  { id: "soon", label: "Perps", desc: "Perpetual futures with private positions", Icon: Layers, live: false },
  { id: "soon", label: "Governance", desc: "Vote privately using notes as weight", Icon: Vote, live: false },
  { id: "soon", label: "Themes", desc: "Change the look of your wallet", Icon: Palette, live: false },
];

export function More({ onGo }: { onGo: (page: Page) => void }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {apps.map((a, i) => (
          <button
            key={i}
            onClick={() => a.live && a.id !== "soon" && onGo(a.id as Page)}
            disabled={!a.live}
            className="glass rounded-2xl p-4 text-left hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 rounded-full glass-strong flex items-center justify-center mb-3">
              <a.Icon size={18} className="text-ink" />
            </div>
            <div className="text-sm font-bold mb-1">{a.label}</div>
            <div className="text-xs text-muted mb-2">{a.desc}</div>
            <div className={`text-[10px] uppercase tracking-widest ${a.live ? "text-success" : "text-muted"}`}>
              {a.live ? "Live" : "Soon"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
