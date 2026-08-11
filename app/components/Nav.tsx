"use client";
import { Home as HomeIcon, Clock, Settings as SettingsIcon, LucideIcon } from "lucide-react";
export type Page = "home" | "activity" | "settings" | "send" | "receive" | "shield" | "unshield" | "swap" | "earn" | "more" | "disclosure" | "messages";

const items: { id: Page; icon: LucideIcon }[] = [
  { id: "home", icon: HomeIcon },
  { id: "activity", icon: Clock },
  { id: "settings", icon: SettingsIcon },
];

export function Nav({ current, onChange }: { current: Page; onChange: (p: Page) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 pb-6 pt-2 bg-gradient-to-t from-bg via-bg/95 to-transparent">
      <div className="max-w-md mx-auto px-8 flex items-center justify-around">
        {items.map(({ id, icon: Icon }) => {
          const active = current === id || (id === "home" && ["send","receive","shield","unshield","swap","earn","more","disclosure","messages"].includes(current));
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="p-3 transition"
              aria-label={id}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.5} className={active ? "text-ink" : "text-muted"} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
