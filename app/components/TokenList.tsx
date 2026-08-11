"use client";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ethers } from "ethers";
import { Mode } from "./BalanceCard";
import { TOKENS } from "../lib/contracts";
import { coston2Provider } from "../lib/efi/rpc";
import { tokenGradient, symbolInitial } from "../lib/explorer";

const ERC20 = ["function balanceOf(address) view returns (uint256)"];

// Reads are pinned to Coston2 (where the tokens live) so balances don't read 0
// when the wallet is pointed at another network.
function browserProvider(): ethers.Provider {
  return coston2Provider();
}

// Read balances for EVERY known token directly (balanceOf), instead of trusting
// the explorer's token-balances endpoint which only lists what it has indexed
// (often just one token on Coston2).
export function TokenList({ mode }: { mode: Mode }) {
  const { address, isConnected } = useAccount();

  const { data, isLoading } = useQuery({
    queryKey: ["token-balances-all", address],
    enabled: !!address && mode === "public",
    refetchInterval: 15000,
    staleTime: 10000,
    queryFn: async () => {
      const provider = browserProvider();
      return Promise.all(
        TOKENS.map(async (token) => {
          try {
            const c = new ethers.Contract(token.address, ERC20, provider);
            const value = (await c.balanceOf(address!)) as bigint;
            return { token, value };
          } catch {
            return { token, value: 0n };
          }
        }),
      );
    },
  });

  if (!isConnected) {
    return (
      <div className="glass rounded-2xl px-4 py-8 text-center text-sm text-muted">
        Connect wallet to see balances
      </div>
    );
  }

  if (mode === "private") {
    return (
      <div className="glass rounded-2xl px-4 py-8 text-center text-sm text-muted">
        No private notes yet · Shield a token to begin
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="glass rounded-2xl px-4 py-8 text-center text-sm text-muted animate-pulse">
        Loading balances…
      </div>
    );
  }

  const rows = (data ?? []).slice().sort((a, b) => {
    const na = Number(ethers.formatUnits(a.value, a.token.decimals));
    const nb = Number(ethers.formatUnits(b.value, b.token.decimals));
    return nb - na;
  });

  return (
    <div className="space-y-2">
      {rows.map(({ token, value }) => {
        const num = Number(ethers.formatUnits(value, token.decimals));
        const display = num.toLocaleString(undefined, { maximumFractionDigits: 4 });
        return (
          <div key={token.address} className="glass rounded-2xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${tokenGradient(token.symbol)} flex items-center justify-center text-sm font-bold text-white`}>
                {symbolInitial(token.symbol)}
              </div>
              <div>
                <div className="text-sm font-bold">{token.symbol}</div>
                <div className="text-xs text-muted">{token.name}</div>
              </div>
            </div>
            <div className="text-sm font-mono font-bold">{display}</div>
          </div>
        );
      })}
    </div>
  );
}
