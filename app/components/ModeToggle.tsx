"use client";
import { Mode } from "./BalanceCard";

export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex gap-6 px-1 mb-4">
      <button
        onClick={() => onChange("public")}
        className={`text-sm font-bold tracking-wide transition pb-1 border-b-2 ${
          mode === "public" ? "text-ink border-ink" : "text-muted border-transparent"
        }`}
      >
        Public Balance
      </button>
      <button
        onClick={() => onChange("private")}
        className={`text-sm font-bold tracking-wide transition pb-1 border-b-2 ${
          mode === "private" ? "text-ink border-ink" : "text-muted border-transparent"
        }`}
      >
        Private Balance
      </button>
    </div>
  );
}
