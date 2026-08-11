"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { FileCheck2, Loader2, Copy, Check, ShieldCheck, ScrollText, Landmark, Search, BadgeCheck, XCircle, Clock } from "lucide-react";
import { EfiState } from "../lib/efi/useEfi";
import { DisclosureResult } from "../lib/efi/client";
import { decryptProofId } from "../lib/efi/crypto";
import { PrivacyGate } from "./PrivacyGate";
import { TOKENS, Token } from "../lib/contracts";
import { playSuccess, playError, playSubmit } from "../lib/sound";

type Kind = "solvency" | "compliance" | "audit";

const KINDS: { id: Kind; label: string; icon: typeof ShieldCheck; blurb: string }[] = [
  { id: "solvency", label: "Solvency", icon: ShieldCheck, blurb: "Prove your private balance is at least a threshold — without revealing the exact amount. The verifier learns only “yes”." },
  { id: "compliance", label: "Compliance", icon: Landmark, blurb: "Issue a jurisdiction-scoped attestation over your holdings for a regulator or auditor — commitments only, no balances." },
  { id: "audit", label: "Audit Trail", icon: ScrollText, blurb: "Hand a specific auditor a signed, one-time trail of the chosen notes. Scoped to them, expires automatically." },
];

export function Disclosure({ efi }: { efi: EfiState }) {
  const [tab, setTab] = useState<"prove" | "verify">("prove");
  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-2 grid grid-cols-2 gap-1">
        <button onClick={() => setTab("prove")}
          className={`py-3 rounded-2xl flex items-center justify-center gap-2 text-[12px] font-bold transition ${tab === "prove" ? "glass-btn" : "hover:bg-white/10 text-muted"}`}>
          <FileCheck2 size={15} /> Prove
        </button>
        <button onClick={() => setTab("verify")}
          className={`py-3 rounded-2xl flex items-center justify-center gap-2 text-[12px] font-bold transition ${tab === "verify" ? "glass-btn" : "hover:bg-white/10 text-muted"}`}>
          <Search size={15} /> Verify
        </button>
      </div>
      {/* Prove needs your own privacy key; Verify is a pure on-chain read — anyone connected can check a proof. */}
      {tab === "prove" ? <PrivacyGate efi={efi}><Prove efi={efi} /></PrivacyGate> : <Verify efi={efi} />}
    </div>
  );
}

function Prove({ efi }: { efi: EfiState }) {
  const [kind, setKind] = useState<Kind>("solvency");
  const [token, setToken] = useState<Token>(TOKENS[0]);
  const [threshold, setThreshold] = useState("50");
  const [jurisdiction, setJurisdiction] = useState("US");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [proofId, setProofId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const active = KINDS.find((k) => k.id === kind)!;

  async function prove() {
    if (!efi.client || !efi.spendingKeyHex) return;
    setBusy(true); setErr(null); setProofId(null); playSubmit();
    try {
      const notes = (await efi.client.scanNotes(efi.spendingKeyHex))
        .filter((n) => n.token.toLowerCase() === token.address.toLowerCase());
      if (notes.length === 0) throw new Error(`No private ${token.symbol} notes. Shield some first.`);
      const to = recipient.trim() || "0x000000000000000000000000000000000000dEaD";
      let res;
      if (kind === "solvency") {
        const thr = BigInt(Math.floor(Number(threshold) * 10 ** token.decimals));
        res = await efi.client.discloseSolvency(to, token.address, thr, notes);
      } else if (kind === "compliance") {
        res = await efi.client.discloseCompliance(to, jurisdiction.trim() || "US", notes);
      } else {
        res = await efi.client.discloseAuditTrail(to, notes);
      }
      if (res.status !== 1 || !res.data) throw new Error(res.error ?? "disclosure failed");
      // Primary: decrypt the id from the TEE response. Fallback: read it from the
      // on-chain DisclosureProofSubmitted event just emitted for this subject.
      let id = decryptProofId(efi.spendingKeyHex, res.data);
      if (!id) {
        const me = await efi.client.signer.getAddress();
        id = await efi.client.latestProofIdFor(me);
      }
      if (!id) throw new Error("Proof minted on-chain, but its id couldn't be read back yet. Give it a few seconds and check the Verify tab — the event may still be settling.");
      setProofId(id);
      playSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      playError();
    } finally {
      setBusy(false);
    }
  }

  const cta =
    kind === "solvency" ? `Prove ≥ ${threshold} ${token.symbol}` :
    kind === "compliance" ? `Attest ${token.symbol} · ${jurisdiction || "US"}` :
    `Export ${token.symbol} audit trail`;

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-2 grid grid-cols-3 gap-1">
        {KINDS.map((k) => {
          const Icon = k.icon;
          const on = k.id === kind;
          return (
            <button key={k.id} onClick={() => { setKind(k.id); setProofId(null); setErr(null); }}
              className={`py-3 rounded-2xl flex flex-col items-center gap-1 transition ${on ? "glass-btn" : "hover:bg-white/10 text-muted"}`}>
              <Icon size={16} />
              <span className="text-[11px] font-bold">{k.label}</span>
            </button>
          );
        })}
      </div>

      <div className="glass rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <FileCheck2 size={18} /><div className="text-sm font-bold">{active.label} disclosure</div>
        </div>
        <div className="text-xs text-muted leading-relaxed">{active.blurb}</div>

        <div className="grid grid-cols-2 gap-2">
          <select value={token.symbol} onChange={(e) => setToken(TOKENS.find((t) => t.symbol === e.target.value) ?? TOKENS[0])}
            className="glass-strong rounded-2xl px-4 py-3 text-sm font-bold">
            {TOKENS.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
          </select>
          {kind === "solvency" && (
            <input value={threshold} onChange={(e) => setThreshold(e.target.value)}
              placeholder="≥ amount" inputMode="decimal"
              className="glass-strong rounded-2xl px-4 py-3 text-sm font-mono" />
          )}
          {kind === "compliance" && (
            <input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}
              placeholder="Jurisdiction (US)"
              className="glass-strong rounded-2xl px-4 py-3 text-sm font-mono" />
          )}
          {kind === "audit" && (
            <div className="glass-strong rounded-2xl px-4 py-3 text-xs text-muted flex items-center">All {token.symbol} notes</div>
          )}
        </div>
        <input value={recipient} onChange={(e) => setRecipient(e.target.value)}
          placeholder={kind === "solvency" ? "Verifier address (optional)" : "Recipient / auditor address (optional)"}
          className="glass-strong rounded-2xl px-4 py-3 text-sm font-mono w-full" />

        <button onClick={prove} disabled={busy}
          className="glass-btn w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase flex items-center justify-center gap-2">
          {busy ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : cta}
        </button>
        {err && <div className="text-xs text-danger">{err}</div>}
      </div>

      {proofId && (
        <div className="glass rounded-3xl p-5 space-y-3 animate-pop">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest text-success font-bold">{active.label} proof minted</div>
            <button onClick={() => { navigator.clipboard.writeText(proofId); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="text-muted hover:text-ink flex items-center gap-1 text-xs">
              {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy id</>}
            </button>
          </div>
          <div className="glass-strong rounded-2xl px-4 py-3 text-[11px] font-mono break-all leading-relaxed">{proofId}</div>
          <div className="text-xs text-muted">This is the proof id. Give it to your verifier — they open <span className="text-ink font-bold">Verify</span>, paste it, and the chain confirms your claim. It expires automatically; you can revoke it anytime.</div>
        </div>
      )}
    </div>
  );
}

function Verify({ efi }: { efi: EfiState }) {
  const { address } = useAccount();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<DisclosureResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!efi.client) return;
    setBusy(true); setErr(null); setRes(null); playSubmit();
    try {
      const r = await efi.client.verifyProof(input, address);
      setRes(r);
      (r.valid ? playSuccess : playError)();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      playError();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Search size={18} /><div className="text-sm font-bold">Verify a disclosure proof</div>
        </div>
        <div className="text-xs text-muted leading-relaxed">Paste a proof id someone shared with you. Encrypted Finance reads the attestation straight from the chain — no trust in the sender required.</div>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="0x… proof id (32 bytes)"
          className="glass-strong rounded-2xl px-4 py-3 text-sm font-mono w-full" />
        <button onClick={run} disabled={busy || !input.trim() || !efi.client}
          className="glass-btn w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase flex items-center justify-center gap-2">
          {busy ? <><Loader2 size={16} className="animate-spin" /> Checking chain…</> : !efi.client ? "Connect wallet to verify" : "Verify proof"}
        </button>
        {err && <div className="text-xs text-danger break-words">{err}</div>}
      </div>

      {res && <VerifyResultCard res={res} hasVerifier={!!address} />}
    </div>
  );
}

function VerifyResultCard({ res, hasVerifier }: { res: DisclosureResult; hasVerifier: boolean }) {
  if (!res.found) {
    return (
      <div className="glass rounded-3xl p-6 flex items-center gap-3 animate-pop">
        <XCircle size={22} className="text-danger shrink-0" />
        <div>
          <div className="text-sm font-bold text-danger">No such proof</div>
          <div className="text-xs text-muted">This id isn’t on-chain. Check for a typo or ask for a fresh proof.</div>
        </div>
      </div>
    );
  }
  const expired = Date.now() / 1000 > res.expiresAt;
  const bad = res.revoked ? "Revoked" : expired ? "Expired" : null;
  const okColor = res.valid ? "text-success" : "text-danger";
  const Icon = res.valid ? BadgeCheck : XCircle;
  const exp = new Date(res.expiresAt * 1000);
  const isDead = res.recipient.toLowerCase() === "0x000000000000000000000000000000000000dead";

  return (
    <div className="glass rounded-3xl p-6 space-y-4 animate-pop">
      <div className="flex items-center gap-3">
        <Icon size={24} className={`${okColor} shrink-0`} />
        <div>
          <div className={`text-base font-bold ${okColor}`}>{res.valid ? "Valid proof" : bad ?? "Invalid"}</div>
          <div className="text-xs text-muted">{res.proofType} attestation, signed by the TEE</div>
        </div>
      </div>

      <div className="glass-strong rounded-2xl px-4 py-3 text-sm font-bold text-ink">{res.claim}</div>

      <div className="space-y-2 text-xs">
        <Row label="Subject" value={short(res.subject)} />
        <Row label="Issued to" value={isDead ? "Anyone (public)" : short(res.recipient)} />
        {hasVerifier && res.validForYou !== null && (
          <Row label="Scoped to you" value={res.validForYou ? "Yes" : "No — issued to someone else"} valueClass={res.validForYou ? "text-success" : "text-danger"} />
        )}
        <Row label={expired ? "Expired" : "Expires"} value={exp.toLocaleString()} valueClass={expired ? "text-danger" : undefined} />
        {res.revoked && <Row label="Status" value="Revoked by subject" valueClass="text-danger" />}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted pt-1 border-t border-white/5">
        <Clock size={12} /> Read live from the TeeRelayer contract on Flare Coston2.
      </div>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={`font-mono font-bold text-right ${valueClass ?? "text-ink"}`}>{value}</span>
    </div>
  );
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
