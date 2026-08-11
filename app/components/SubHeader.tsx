"use client";
import { ArrowLeft } from "lucide-react";

export function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-6 px-1">
      <button onClick={onBack} className="glass w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition">
        <ArrowLeft size={18} className="text-ink" />
      </button>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
    </div>
  );
}
