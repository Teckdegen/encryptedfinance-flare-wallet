"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet } from "lucide-react";

export function Welcome() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 relative z-10">
      <div className="glass rounded-3xl p-10 max-w-md w-full text-center">
        <div className="mb-2 text-xs uppercase tracking-[0.3em] text-muted">Encrypted Finance</div>
        <h1 className="text-4xl font-bold tracking-tight mb-3 mt-4">
          <span className="text-muted">&lt;/</span>
          <span className="text-ink">Private</span>
          <span className="text-muted">&gt;</span>
        </h1>
        <p className="text-sm text-muted mb-10 leading-relaxed">
          Privacy preserving DeFi on Flare.<br />
          Your address stays yours. Your trades stay private.
        </p>

        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) => {
            if (!mounted) return null;
            return (
              <button
                onClick={openConnectModal}
                className="glass-btn w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase flex items-center justify-center gap-2"
              >
                <Wallet size={16} />
                Connect Wallet
              </button>
            );
          }}
        </ConnectButton.Custom>

        <div className="mt-8 pt-6 border-t border-white/5 text-xs text-muted">
          Coston2 testnet · Chain 114
        </div>
      </div>
    </main>
  );
}
