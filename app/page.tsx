"use client";
import { useState } from "react";
import { useChainId, useSwitchChain, useAccount } from "wagmi";
import { Nav, Page } from "./components/Nav";
import { Home } from "./components/Home";
import { SubHeader } from "./components/SubHeader";
import { Shield } from "./components/Shield";
import { Unshield } from "./components/Unshield";
import { Send } from "./components/Send";
import { Receive } from "./components/Receive";
import { Swap } from "./components/Swap";
import { Earn } from "./components/Earn";
import { More } from "./components/More";
import { Activity } from "./components/Activity";
import { Settings } from "./components/Settings";
import { Disclosure } from "./components/Disclosure";
import { Messages } from "./components/Messages";
import { useEfi } from "./lib/efi/useEfi";
import { AlertTriangle } from "lucide-react";

export default function Index() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [page, setPage] = useState<Page>("home");
  const efi = useEfi();

  if (isConnected && chainId !== 114) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 relative z-10">
        <div className="glass rounded-3xl p-8 max-w-md w-full text-center">
          <AlertTriangle size={40} className="mx-auto mb-4 text-amber-600" />
          <h2 className="text-xl font-bold mb-2">Wrong network</h2>
          <p className="text-sm text-muted mb-6">Switch to Flare Coston2 to continue.</p>
          <button
            onClick={() => switchChain({ chainId: 114 })}
            className="glass-btn w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase"
          >
            Switch to Coston2
          </button>
        </div>
      </main>
    );
  }

  if (page === "send") return <Send onBack={() => setPage("home")} efi={efi} />;

  const isSubPage = ["receive", "shield", "unshield", "swap", "earn", "more", "disclosure", "messages"].includes(page);
  const subTitle: Record<string, string> = {
    receive: "Receive",
    shield: "Shield",
    unshield: "Unshield",
    swap: "Swap",
    earn: "Earn",
    more: "More apps",
    disclosure: "Selective Disclosure",
    messages: "Encrypted Messages",
  };

  return (
    <main className="min-h-screen relative z-10 pb-28">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-8 pt-6 sm:pt-10">
        {page === "home" && <Home onGo={setPage} efi={efi} />}
        {isSubPage && (
          <>
            <SubHeader title={subTitle[page]} onBack={() => setPage("home")} />
            {page === "receive" && <Receive />}
            {page === "shield" && <Shield efi={efi} />}
            {page === "unshield" && <Unshield efi={efi} />}
            {page === "swap" && <Swap efi={efi} />}
            {page === "earn" && <Earn efi={efi} />}
            {page === "more" && <More onGo={setPage} />}
            {page === "disclosure" && <Disclosure efi={efi} />}
            {page === "messages" && <Messages efi={efi} />}
          </>
        )}
        {page === "activity" && (
          <>
            <SubHeader title="Activity" onBack={() => setPage("home")} />
            <Activity />
          </>
        )}
        {page === "settings" && (
          <>
            <SubHeader title="Settings" onBack={() => setPage("home")} />
            <Settings />
          </>
        )}
      </div>
      <Nav current={page} onChange={setPage} />
    </main>
  );
}
