"use client";
import { ChevronDown, Wallet } from "lucide-react";
import { useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { fetchTokenBalances, fetchAddressInfo, formatBalance } from "../lib/explorer";
import { COSTON2 } from "../lib/contracts";

export type Mode = "public" | "private";

const FLR_USD_FALLBACK = 0.0068;

export function BalanceCard({ mode }: { mode: Mode }) {
  const { address, isConnected } = useAccount();
  const { data: nativeBal } = useBalance({ address, chainId: COSTON2.id, query: { enabled: !!address } });
  const [expanded, setExpanded] = useState(false);

  const { data: addressInfo } = useQuery({
    queryKey: ["address-info", address],
    queryFn: () => fetchAddressInfo(address!),
    enabled: !!address,
    refetchInterval: 20000,
  });

  const { data: tokenBalances } = useQuery({
    queryKey: ["token-balances", address],
    queryFn: () => fetchTokenBalances(address!),
    enabled: !!address && mode === "public",
    refetchInterval: 20000,
  });

  if (!isConnected) {
    return (
      <div className="glass rounded-3xl p-6 mb-6">
        <div className="text-xs text-muted mb-3 uppercase tracking-widest">Balance</div>
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
      </div>
    );
  }

  const flr = nativeBal ? Number(formatEther(nativeBal.value)) : 0;
  const flrRate = addressInfo?.exchange_rate ? Number(addressInfo.exchange_rate) : FLR_USD_FALLBACK;

  let tokensUsd = 0;
  if (tokenBalances) {
    for (const b of tokenBalances) {
      const rate = b.token.exchange_rate ? Number(b.token.exchange_rate) : 0;
      if (rate <= 0) continue;
      const num = formatBalance(b.value, b.token.decimals);
      tokensUsd += num * rate;
    }
  }

  const publicUsd = flr * flrRate + tokensUsd;
  const privateUsd = 0;

  const total = mode === "private" ? privateUsd : publicUsd;
  const display = `$${total.toFixed(2)}`;
  const [dollars, cents] = display.split(".");

  return (
    <div className="glass rounded-3xl p-6 mb-6">
      <div className="flex items-end justify-between">
        <div className="text-5xl font-bold tracking-tight">
          <span>{dollars}</span>
          {cents !== undefined && <span className="text-muted">.{cents}</span>}
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10 transition"
        >
          <ChevronDown size={16} className={`text-muted transition ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      {mode === "public" && (
        <div className="text-xs text-muted mt-1">1 FLR = ${flrRate.toFixed(4)}</div>
      )}
      {expanded && mode === "public" && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">C2FLR</span>
            <span className="font-mono">{flr.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Tokens</span>
            <span className="font-mono">${tokensUsd.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
