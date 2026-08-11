"use client";
import { ArrowUp, ArrowDown, Shield, ArrowUpDown, LayoutGrid, LucideIcon } from "lucide-react";
import { useAccount } from "wagmi";
import { Page } from "./Nav";
import { Mode } from "./BalanceCard";

export function ActionRow({ onGo, mode }: { onGo: (page: Page) => void; mode: Mode }) {
  const { isConnected } = useAccount();

  const publicActions: { id: Page; label: string; Icon: LucideIcon }[] = [
    { id: "send", label: "Send", Icon: ArrowUp },
    { id: "receive", label: "Receive", Icon: ArrowDown },
    { id: "shield", label: "Shield", Icon: Shield },
    { id: "more", label: "More", Icon: LayoutGrid },
  ];

  const privateActions: { id: Page; label: string; Icon: LucideIcon }[] = [
    { id: "send", label: "Send", Icon: ArrowUp },
    { id: "receive", label: "Receive", Icon: ArrowDown },
    { id: "swap", label: "Swap", Icon: ArrowUpDown },
    { id: "more", label: "More", Icon: LayoutGrid },
  ];

  const actions = mode === "private" ? privateActions : publicActions;

  return (
    <div className="grid grid-cols-4 gap-3 mb-8">
      {actions.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onGo(id)}
          disabled={!isConnected}
          className="flex flex-col items-center gap-2 hover:opacity-80 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className="glass w-16 h-16 rounded-full flex items-center justify-center">
            <Icon size={24} strokeWidth={1.8} className="text-ink" />
          </div>
          <span className="text-xs font-bold tracking-wide text-ink">{label}</span>
        </button>
      ))}
    </div>
  );
}
