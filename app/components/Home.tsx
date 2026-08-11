"use client";
import { useState } from "react";
import { BalanceCard, Mode } from "./BalanceCard";
import { ActionRow } from "./ActionRow";
import { ModeToggle } from "./ModeToggle";
import { TokenList } from "./TokenList";
import { PrivateBalance } from "./PrivateBalance";
import { Page } from "./Nav";
import { EfiState } from "../lib/efi/useEfi";

export function Home({ onGo, efi }: { onGo: (page: Page) => void; efi: EfiState }) {
  const [mode, setMode] = useState<Mode>("public");

  return (
    <div>
      <BalanceCard mode={mode} />
      <ActionRow onGo={onGo} mode={mode} />
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === "private" ? <PrivateBalance efi={efi} /> : <TokenList mode={mode} />}
    </div>
  );
}
