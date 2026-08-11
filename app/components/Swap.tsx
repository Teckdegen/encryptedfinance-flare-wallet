"use client";
import { useState } from "react";
import { ethers } from "ethers";
import { ArrowDown, Loader2 } from "lucide-react";
import { TOKENS, Token } from "../lib/contracts";
import { EfiState } from "../lib/efi/useEfi";
import { useNotes, groupNotes, pickNote } from "../lib/efi/useNotes";
import { parseAmount } from "../lib/efi/useTokenBalance";
import { PrivacyGate } from "./PrivacyGate";
import { TokenPicker } from "./TokenPicker";
import { playSubmit, playSuccess, playError } from "../lib/sound";

export function Swap({ efi }: { efi: EfiState }) {
  const { notes, ready, refresh } = useNotes(efi);
  const groups = groupNotes(notes);
  const [fromToken, setFromToken] = useState<Token>(TOKENS[0]);
  const [toToken, setToToken] = useState<Token>(TOKENS[1]);
  const [amount, setAmount] = useState("");
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fromBal = groups.find((g) => g.token.symbol === fromToken.symbol)?.total ?? 0n;
  const fromBalStr = ethers.formatUnits(fromBal, fromToken.decimals);
  const outEst = amount && Number(amount) > 0 ? (Number(amount) * 0.995).toFixed(4) : "0";
  const amtUnits = parseAmount(amount, fromToken.decimals);
  const overBalance = amtUnits !== null && amtUnits > fromBal;

  async function run() {
    if (!efi.client) return;
    setBusy(true); setError(null); setStatus(null); playSubmit();
    try {
      const amt = ethers.parseUnits(amount || "0", fromToken.decimals);
      if (amt <= 0n) throw new Error("Enter an amount.");
      if (fromToken.symbol === toToken.symbol) throw new Error("Pick two different tokens.");
      if (amt > fromBal) throw new Error(`Not enough private ${fromToken.symbol}. You have ${fromBalStr}.`);
      const note = pickNote(notes, fromToken.address, amt);
      if (!note) throw new Error(`No private ${fromToken.symbol} note with ${amount}. Shield some first.`);
      const res = await efi.client.swap(note, toToken.address, amt);
      setStatus(`Swapping ${amount} ${fromToken.symbol} → ${toToken.symbol} privately · ${(res.txHash ?? res.jobId ?? "submitted").slice(0, 10)}…`);
      playSuccess();
      setTimeout(refresh, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      playError();
    } finally {
      setBusy(false);
    }
  }

  return (
    <PrivacyGate efi={efi}>
      <div className="flex flex-col gap-3">
        <div className="text-lg font-bold mb-1">Private Swap</div>

        <div className="glass rounded-3xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted uppercase tracking-widest">You Pay (private)</span>
            <button type="button" onClick={() => fromBal > 0n && setAmount(fromBalStr)} className="text-xs text-muted hover:text-ink">
              bal {ready ? fromBalStr : "…"} · <span className="font-bold">Max</span>
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0" className="bg-transparent text-4xl font-bold tracking-tight w-full focus:outline-none min-w-0" />
            <button onClick={() => setPicking("from")} className="glass-strong rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap">e{fromToken.symbol}</button>
          </div>
        </div>

        <div className="flex justify-center -my-2">
          <div className="glass-strong w-10 h-10 rounded-full flex items-center justify-center z-10"><ArrowDown size={16} /></div>
        </div>

        <div className="glass rounded-3xl p-5">
          <div className="text-xs text-muted uppercase tracking-widest mb-3">You Receive (est.)</div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-4xl font-bold tracking-tight text-muted">{outEst}</div>
            <button onClick={() => setPicking("to")} className="glass-strong rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap">e{toToken.symbol}</button>
          </div>
        </div>

        <button onClick={run} disabled={busy || !ready || !amount || Number(amount) === 0 || overBalance}
          className="glass-btn w-full py-4 rounded-full text-sm font-bold tracking-widest uppercase mt-3 flex items-center justify-center gap-2">
          {busy ? <><Loader2 size={16} className="animate-spin" /> Swapping…</> : !ready ? "Loading balance…" : overBalance ? "Insufficient balance" : "Swap privately"}
        </button>

        {error && <div className="text-xs text-danger text-center break-words">{error}</div>}
        {status && <div className="text-xs text-success text-center break-words">{status}</div>}

        {picking && (
          <TokenPicker
            current={picking === "from" ? fromToken : toToken}
            onPick={(t) => (picking === "from" ? setFromToken(t) : setToToken(t))}
            onClose={() => setPicking(null)}
            label={picking === "from" ? "You Pay" : "You Receive"}
            encrypted
            efi={efi}
          />
        )}
      </div>
    </PrivacyGate>
  );
}
