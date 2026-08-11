"use client";
import { useState } from "react";
import { ethers } from "ethers";
import { Loader2 } from "lucide-react";
import { TOKENS, Token } from "../lib/contracts";
import { EfiState } from "../lib/efi/useEfi";
import { useNotes, groupNotes, pickNote } from "../lib/efi/useNotes";
import { PrivacyGate } from "./PrivacyGate";
import { playSubmit, playSuccess, playError } from "../lib/sound";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function Unshield({ efi }: { efi: EfiState }) {
  const { notes, ready, refresh } = useNotes(efi);
  const groups = groupNotes(notes);
  const [token, setToken] = useState<Token>(TOKENS[0]);
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bal = groups.find((g) => g.token.symbol === token.symbol)?.total ?? 0n;
  const balStr = ethers.formatUnits(bal, token.decimals);

  async function run() {
    if (!efi.client) return;
    setBusy(true); setError(null); setStatus(null); playSubmit();
    try {
      const amt = ethers.parseUnits(amount || "0", token.decimals);
      if (amt <= 0n) throw new Error("Enter an amount.");
      const dest = to.trim() || (await efi.client.signer.getAddress());
      if (!ADDR_RE.test(dest)) throw new Error("Invalid destination address.");
      const note = pickNote(notes, token.address, amt);
      if (!note) throw new Error(`No private ${token.symbol} note with ${amount}. Shield some first.`);
      const res = await efi.client.unshield(note, dest, amt);
      setStatus(`Unshielding ${amount} ${token.symbol} → ${dest.slice(0, 8)}… · ${(res.txHash ?? res.jobId ?? "submitted").slice(0, 10)}…`);
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
      <div className="space-y-4">
        <div className="glass rounded-3xl p-6 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted">Unshield</div>
            <h2 className="text-2xl font-bold">Private → Public</h2>
          </div>

          <div className="glass-strong rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted uppercase tracking-widest">From private balance</span>
              <span className="text-xs text-muted">bal {ready ? balStr : "…"}</span>
            </div>
            <div className="flex gap-2">
              <select value={token.symbol} onChange={(e) => setToken(TOKENS.find((t) => t.symbol === e.target.value)!)}
                className="glass rounded-xl px-3 py-3 text-sm font-bold">
                {TOKENS.map((t) => <option key={t.symbol} value={t.symbol}>e{t.symbol}</option>)}
              </select>
              <input type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="glass rounded-xl px-3 py-3 text-sm flex-1 font-mono" />
            </div>
          </div>

          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Send to 0x… (blank = your wallet)"
            className="glass-strong rounded-2xl px-4 py-3 text-sm font-mono w-full" />

          <button onClick={run} disabled={busy || !ready || !amount || Number(amount) === 0}
            className="glass-btn w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase flex items-center justify-center gap-2">
            {busy ? <><Loader2 size={16} className="animate-spin" /> Unshielding…</> : !ready ? "Loading balance…" : "Unshield"}
          </button>

          {error && <div className="text-xs text-danger break-words">{error}</div>}
          {status && <div className="text-xs text-success break-words">{status}</div>}
        </div>
      </div>
    </PrivacyGate>
  );
}
