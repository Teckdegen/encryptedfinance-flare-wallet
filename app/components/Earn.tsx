"use client";
import { useState } from "react";
import { ethers } from "ethers";
import { TrendingUp, Loader2, X } from "lucide-react";
import { CTOKENS, TOKENS } from "../lib/contracts";
import { EfiState } from "../lib/efi/useEfi";
import { useNotes, groupNotes, pickNote } from "../lib/efi/useNotes";
import { parseAmount } from "../lib/efi/useTokenBalance";
import { PrivacyGate } from "./PrivacyGate";
import { playSubmit, playSuccess, playError } from "../lib/sound";

type Market = (typeof CTOKENS)[number];

export function Earn({ efi }: { efi: EfiState }) {
  const { notes, refresh } = useNotes(efi);
  const groups = groupNotes(notes);
  const [open, setOpen] = useState<Market | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = open ? TOKENS.find((t) => t.symbol === open.underlying) : undefined;
  const bal = token ? (groups.find((g) => g.token.symbol === token.symbol)?.total ?? 0n) : 0n;
  const balStr = token ? ethers.formatUnits(bal, token.decimals) : "0";
  const amtUnits = token ? parseAmount(amount, token.decimals) : null;
  const overBalance = amtUnits !== null && amtUnits > bal;

  async function lend() {
    if (!efi.client || !open || !token) return;
    setBusy(true); setError(null); setStatus(null); playSubmit();
    try {
      const amt = ethers.parseUnits(amount || "0", token.decimals);
      if (amt <= 0n) throw new Error("Enter an amount.");
      if (amt > bal) throw new Error(`Not enough private ${token.symbol}. You have ${balStr}.`);
      const note = pickNote(notes, token.address, amt);
      if (!note) throw new Error(`No private ${token.symbol} note with ${amount}. Shield some first.`);
      const res = await efi.client.lend(note, open.address, amt);
      setStatus(`Lending ${amount} ${token.symbol} into ${open.symbol} · ${(res.txHash ?? res.jobId ?? "submitted").slice(0, 10)}…`);
      playSuccess();
      setTimeout(refresh, 1500);
      setTimeout(() => { setOpen(null); setAmount(""); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      playError();
    } finally {
      setBusy(false);
    }
  }

  return (
    <PrivacyGate efi={efi}>
      <div className="space-y-4">
        <div className="glass rounded-3xl p-6">
          <div className="text-xs uppercase tracking-widest text-muted mb-1">Earn</div>
          <h2 className="text-2xl font-bold mb-6">Private lending</h2>
          <div className="space-y-3">
            {CTOKENS.map((c) => (
              <button key={c.symbol} onClick={() => { setOpen(c); setAmount(""); setStatus(null); setError(null); }}
                className="glass-strong rounded-2xl p-4 flex items-center justify-between w-full hover:bg-white/10 transition">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                    <TrendingUp size={18} className="text-success" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">{c.symbol}</div>
                    <div className="text-xs text-muted">lend e{c.underlying}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-success">{(c.apr / 100).toFixed(2)}% APR</div>
                  <div className="text-[10px] text-muted uppercase tracking-widest mt-1">Deposit →</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {open && token && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => !busy && setOpen(null)}>
          <div className="glass rounded-3xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="font-bold text-lg">Lend into {open.symbol}</div>
              <button onClick={() => setOpen(null)} className="glass-strong w-9 h-9 rounded-full flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{(open.apr / 100).toFixed(2)}% APR</span>
              <button type="button" onClick={() => bal > 0n && setAmount(balStr)} className="hover:text-ink">
                private bal {balStr} e{token.symbol} · <span className="font-bold">Max</span>
              </button>
            </div>
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus
              className={`glass-strong rounded-2xl px-4 py-4 text-2xl font-bold w-full font-mono ${overBalance ? "text-danger" : ""}`} />
            <button onClick={lend} disabled={busy || !amount || Number(amount) === 0 || overBalance}
              className="glass-btn w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase flex items-center justify-center gap-2">
              {busy ? <><Loader2 size={16} className="animate-spin" /> Depositing…</> : overBalance ? "Insufficient balance" : `Lend e${token.symbol}`}
            </button>
            {error && <div className="text-xs text-danger break-words">{error}</div>}
            {status && <div className="text-xs text-success break-words">{status}</div>}
            {!error && !status && <div className="text-xs text-muted text-center">Spends a private note into the market. Relayed by the TEE — gasless.</div>}
          </div>
        </div>
      )}
    </PrivacyGate>
  );
}
