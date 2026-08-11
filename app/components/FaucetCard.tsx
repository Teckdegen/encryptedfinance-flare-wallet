"use client";
import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { Droplets, Loader2, Check } from "lucide-react";
import { FAUCET, FAUCET_ABI, COSTON2 } from "../lib/contracts";
import { playSuccess, playError, playSubmit } from "../lib/sound";

export function FaucetCard() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: last } = useReadContract({
    address: FAUCET, abi: FAUCET_ABI, functionName: "lastClaim",
    args: address ? [address] : undefined,
    chainId: COSTON2.id,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const { data: cooldown } = useReadContract({
    address: FAUCET, abi: FAUCET_ABI, functionName: "cooldown", chainId: COSTON2.id,
  });

  const now = Math.floor(Date.now() / 1000);
  const nextAt = last !== undefined && cooldown !== undefined ? Number(last) + Number(cooldown) : 0;
  const waitLeft = nextAt > now ? nextAt - now : 0;
  const onCooldown = waitLeft > 0;

  async function claim() {
    if (!address) return;
    setBusy(true); setErr(null); setDone(false); playSubmit();
    try {
      const hash = await writeContractAsync({
        address: FAUCET, abi: FAUCET_ABI, functionName: "claimAll", chainId: COSTON2.id,
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      setDone(true);
      playSuccess();
      setTimeout(() => setDone(false), 4000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(/cooldown|too soon|wait/i.test(msg) ? "On cooldown — try again later." : msg.split("\n")[0].slice(0, 120));
      playError();
    } finally {
      setBusy(false);
    }
  }

  const label = busy ? "Claiming…" : done ? "Claimed!" : onCooldown ? `Wait ${fmt(waitLeft)}` : "Claim test tokens";

  return (
    <div className="glass rounded-3xl p-6">
      <div className="text-xs uppercase tracking-widest text-muted mb-4">Faucet</div>
      <div className="text-xs text-muted leading-relaxed mb-4">
        Drip a batch of every test token to your wallet on Coston2 — free, for testing. Shield them to start using private balances.
      </div>
      <button
        onClick={claim}
        disabled={!isConnected || busy || onCooldown}
        className="glass-btn w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : done ? <Check size={16} /> : <Droplets size={16} />}
        {!isConnected ? "Connect wallet to claim" : label}
      </button>
      {err && <div className="text-xs text-danger mt-3 break-words">{err}</div>}
    </div>
  );
}

function fmt(s: number): string {
  if (s >= 3600) return `${Math.ceil(s / 3600)}h`;
  if (s >= 60) return `${Math.ceil(s / 60)}m`;
  return `${s}s`;
}
