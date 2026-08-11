"use client";
import { useAccount } from "wagmi";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

export function Receive() {
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);
  const short = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  function copy() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl p-6 text-center">
        <div className="text-xs uppercase tracking-widest text-muted mb-2">Receive</div>
        <h2 className="text-2xl font-bold mb-2">Your address</h2>
        <p className="text-sm text-muted mb-6">
          Share to receive tokens or encrypted notes.
        </p>

        <div className="glass-strong rounded-2xl p-6 mb-4">
          <div className="text-lg font-mono font-bold mb-2">{short}</div>
          <div className="text-xs text-muted font-mono break-all">{address}</div>
        </div>

        <button
          onClick={copy}
          className="glass-btn w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase flex items-center justify-center gap-2"
        >
          {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy Address</>}
        </button>
      </div>

      <div className="glass rounded-3xl p-5 text-xs text-muted leading-relaxed">
        Anyone can send you tokens or encrypted notes at this address. Encrypted notes route to you through the TEE without exposing your identity on chain.
      </div>
    </div>
  );
}
