"use client";
import { useState, useEffect } from "react";
import { X, Search, ChevronLeft, ChevronDown, Delete, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { TOKENS, Token } from "../lib/contracts";
import { TokenPicker } from "./TokenPicker";
import { PrivacyGate } from "./PrivacyGate";
import { EfiState } from "../lib/efi/useEfi";
import { useTokenBalance, parseAmount } from "../lib/efi/useTokenBalance";
import { ethers } from "ethers";
import { playTap, playSubmit, playSuccess, playError, haptic } from "../lib/sound";

const RECENTS_KEY = "encryptedfi.send.recents";
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
type Screen = "recipients" | "compose" | "review" | "success";
type Mode = "private" | "public";

function loadRecents(): string[] {
  if (typeof window === "undefined") return [];
  try { const a = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]"); return Array.isArray(a) ? a.slice(0, 20) : []; } catch { return []; }
}
function saveRecent(addr: string) {
  const ex = loadRecents().filter((a) => a.toLowerCase() !== addr.toLowerCase());
  localStorage.setItem(RECENTS_KEY, JSON.stringify([addr, ...ex].slice(0, 20)));
}
const short = (a: string) => (a ? `${a.slice(0, 6)}...${a.slice(-5)}` : "");

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex justify-center overflow-hidden">
      <div className="w-full max-w-md h-[100dvh] flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}

export function Send({ onBack, efi }: { onBack: () => void; efi: EfiState }) {
  const [screen, setScreen] = useState<Screen>("recipients");
  const [mode, setMode] = useState<Mode>("private");
  const [recipient, setRecipient] = useState("");
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("0");
  const [token, setToken] = useState<Token>(TOKENS[0]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settling, setSettling] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => setRecents(loadRecents()), []);
  useEffect(() => {
    if (screen === "recipients" && ADDR_RE.test(search.trim())) {
      setRecipient(search.trim()); setSearch(""); setScreen("compose");
    }
  }, [search, screen]);

  function press(k: string) {
    playTap();
    setAmount((cur) => {
      if (k === "back") return cur.length <= 1 ? "0" : cur.slice(0, -1);
      if (k === ".") return cur.includes(".") ? cur : cur + ".";
      if (cur === "0") return k;
      return cur + k;
    });
  }

  const hasAmount = amount !== "0" && amount !== "0." && amount !== "";
  const units = () => ethers.parseUnits(amount || "0", token.decimals);

  // Available balance for the selected token: private note total or public ERC-20.
  const { raw: bal, formatted: balStr, loading: balLoading } = useTokenBalance(token, mode === "private", efi);
  const amtUnits = parseAmount(amount, token.decimals);
  const overBalance = amtUnits !== null && amtUnits > bal;

  // Poll the input note's on-chain spent status until settled (~12s) or we give
  // up after ~60s. Returns true only when the enclave has really executed.
  async function pollSpent(noteId: string, tries = 20, gapMs = 3000): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
      try { if (await efi.client!.isNoteSpent(noteId)) return true; } catch { /* transient RPC */ }
      await new Promise((r) => setTimeout(r, gapMs));
    }
    return false;
  }

  async function confirm() {
    if (!efi.client) return;
    setBusy(true); setErr(null);
    playSubmit();
    try {
      const amt = units();
      if (amt <= 0n) throw new Error("Enter an amount.");
      if (amt > bal) throw new Error(`Not enough ${mode === "private" ? "private " : ""}${token.symbol}. You have ${balStr}.`);
      if (mode === "public") {
        const hash = await efi.client.publicTransfer(token.address, recipient, amt);
        setTxHash(hash);
      } else {
        // private: need a spending key + a shielded note for this token
        const keyHex = await efi.ensureKey();
        const notes = (await efi.client.scanNotes(keyHex)).filter(
          (n) => n.token.toLowerCase() === token.address.toLowerCase() && n.amount >= amt,
        );
        if (notes.length === 0) throw new Error(`No private ${token.symbol} note with enough balance. Shield some first.`);
        const spent = notes[0];
        const res = await efi.client.privateTransfer(spent, recipient, amt);
        setTxHash(res.txHash ?? res.jobId ?? "submitted");
        // The relay ack is not settlement. Poll until the input note actually
        // reads spent on chain (~12s typical) so "Sent" means truly sent — and a
        // silent enclave failure surfaces as an error instead of a false success.
        setSettling(true);
        const settled = await pollSpent(spent.noteId);
        setSettling(false);
        if (!settled) throw new Error("The TEE accepted it but it hasn't settled. Your balance is unchanged — check Activity in a moment, or try again.");
      }
      saveRecent(recipient);
      playSuccess();
      setScreen("success");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      playError();
    } finally {
      setBusy(false);
      setSettling(false);
    }
  }

  // ── SUCCESS ──
  if (screen === "success") {
    return (
      <Frame>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5 animate-slide-up">
          <div className="w-20 h-20 rounded-full glass-strong flex items-center justify-center animate-pop">
            <CheckCircle2 size={40} className="text-success" />
          </div>
          <div>
            <div className="text-2xl font-bold mb-1">Sent</div>
            <div className="text-sm text-muted">
              {amount} {mode === "private" ? "e" : ""}{token.symbol} to {short(recipient)}
            </div>
          </div>
          {mode === "private" && (
            <div className="glass rounded-2xl px-4 py-3 text-xs text-muted leading-relaxed">
              Submitted to the TEE. It settles privately in the background — nothing on
              chain links you, the recipient, or the amount.
            </div>
          )}
          {txHash && txHash.startsWith("0x") && (
            <a href={`https://coston2-explorer.flare.network/tx/${txHash}`} target="_blank" rel="noreferrer"
              className="text-xs text-muted font-mono flex items-center gap-1 hover:text-ink">
              {short(txHash)} <ExternalLink size={11} />
            </a>
          )}
        </div>
        <div className="px-6 pb-8">
          <button onClick={onBack} className="glass-btn w-full py-4 rounded-full text-base font-bold">Done</button>
        </div>
      </Frame>
    );
  }

  // ── RECIPIENTS ──
  if (screen === "recipients") {
    const filtered = search.trim() ? recents.filter((a) => a.toLowerCase().includes(search.toLowerCase())) : recents;
    return (
      <Frame>
        <div className="flex items-center px-5 pt-6 pb-4">
          <button onClick={onBack} className="glass w-10 h-10 rounded-full flex items-center justify-center"><X size={18} /></button>
          <div className="text-lg font-bold ml-4">Send</div>
        </div>
        <div className="px-5 pb-3 flex gap-2">
          {(["private", "public"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest ${mode === m ? "glass-btn" : "glass text-muted"}`}>
              {m}
            </button>
          ))}
        </div>
        <div className="px-5 pb-3 text-sm font-bold">Recents</div>
        <div className="flex-1 overflow-y-auto hide-scrollbar px-3 pb-4">
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted py-10">No recent addresses yet</div>
          ) : filtered.map((a) => (
            <button key={a} onClick={() => { setRecipient(a); setScreen("compose"); }}
              className="w-full flex items-center gap-3 px-2 py-3 rounded-2xl hover:bg-white/10 transition">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 via-amber-300 to-rose-400" />
              <div className="text-sm font-mono">{short(a)}</div>
            </button>
          ))}
        </div>
        <div className="px-4 pb-6">
          <div className="glass rounded-full pl-4 pr-2 py-2 flex items-center gap-3">
            <Search size={16} className="text-muted" />
            <input type="text" placeholder="0x wallet address" value={search} onChange={(e) => setSearch(e.target.value)}
              autoFocus spellCheck={false} autoComplete="off"
              className="bg-transparent flex-1 text-sm focus:outline-none min-w-0 font-mono" />
          </div>
        </div>
      </Frame>
    );
  }

  // ── REVIEW ──
  if (screen === "review") {
    return (
      <Frame>
        <div className="flex items-center gap-4 px-5 pt-6 pb-4">
          <button onClick={() => setScreen("compose")} className="glass w-10 h-10 rounded-full flex items-center justify-center"><ChevronLeft size={18} /></button>
          <div className="text-lg font-bold">Review {mode === "private" ? "Private" : "Public"} Send</div>
        </div>
        <div className="flex-1 flex flex-col px-6 pt-4">
          <div className="text-6xl sm:text-7xl font-bold tracking-tight mb-8">{amount} <span className="text-2xl text-muted">{mode === "private" ? "e" : ""}{token.symbol}</span></div>
          <div className="mt-auto space-y-4">
            <Row label="Recipient" value={short(recipient)} />
            <Row label="Mode" value={mode === "private" ? "Private · via TEE" : "Public · on chain"} />
            <Row label="Token" value={`${token.symbol}${mode === "private" ? " (encrypted note)" : ""}`} />
            {err && <div className="text-xs text-danger">{err}</div>}
          </div>
        </div>
        <div className="px-6 pb-8 pt-2">
          <button onClick={confirm} disabled={busy}
            className="glass-btn w-full py-4 rounded-full text-base font-bold flex items-center justify-center gap-2">
            {settling ? <><Loader2 size={16} className="animate-spin" /> Settling in the TEE…</>
              : busy ? <><Loader2 size={16} className="animate-spin" /> Confirming…</>
              : "Confirm"}
          </button>
          {settling && <div className="text-[11px] text-muted text-center mt-2">Waiting for the enclave to settle this privately — usually ~15s.</div>}
        </div>
      </Frame>
    );
  }

  // ── COMPOSE ──
  // A private send needs the enclave to hold your spending key. If it doesn't
  // (fresh wallet, or node wiped), prompt to register here instead of showing a
  // balance you can't actually spend.
  if (mode === "private" && efi.regState !== "registered") {
    return (
      <Frame>
        <div className="flex items-center px-5 pt-6 pb-4">
          <button onClick={() => setScreen("recipients")} className="glass w-10 h-10 rounded-full flex items-center justify-center"><ChevronLeft size={18} /></button>
          <div className="text-lg font-bold ml-4">Private Send</div>
        </div>
        <div className="flex-1 flex flex-col justify-center px-6">
          <PrivacyGate efi={efi}><div /></PrivacyGate>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="flex items-center px-5 pt-6 pb-4">
        <button onClick={() => setScreen("recipients")} className="glass w-10 h-10 rounded-full flex items-center justify-center"><ChevronLeft size={18} /></button>
        <div className="ml-4">
          <div className="text-lg font-bold leading-tight">Send {mode === "private" ? "· Private" : "· Public"}</div>
          <div className="text-xs font-mono text-muted">{short(recipient)}</div>
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center px-6">
        <div className={`text-6xl sm:text-8xl font-bold tracking-tight mb-3 leading-none ${overBalance ? "text-danger" : "text-ink"}`}>
          {hasAmount ? amount : <span className="text-muted">0</span>}
          <span className="text-2xl text-muted ml-2">{mode === "private" ? "e" : ""}{token.symbol}</span>
        </div>
        <button type="button" onClick={() => bal > 0n && setAmount(balStr)} className="text-xs text-muted hover:text-ink self-start">
          {mode === "private" ? "private " : ""}balance {balLoading ? "…" : Number(balStr).toLocaleString(undefined, { maximumFractionDigits: 4 })} {mode === "private" ? "e" : ""}{token.symbol} · <span className="font-bold">Max</span>
        </button>
      </div>
      <div className="px-6 pb-2">
        <button onClick={() => setPicking(true)} className="flex items-center justify-between w-full py-2 mb-4">
          <span className="text-sm font-bold uppercase tracking-wide">{mode === "private" ? "e" : ""}{token.symbol}</span>
          <ChevronDown size={18} className="text-muted" />
        </button>
        {hasAmount && (
          <button onClick={() => setScreen("review")} disabled={overBalance}
            className="glass-btn w-full py-4 rounded-full text-base font-bold mb-4 disabled:opacity-50">
            {overBalance ? "Insufficient balance" : "Continue"}
          </button>
        )}
      </div>
      <div className="px-6 pb-8">
        <div className="grid grid-cols-3 gap-y-3 gap-x-2 text-center">
          {["1","2","3","4","5","6","7","8","9",".","0","back"].map((k) => (
            <button key={k} onClick={() => press(k)} className="text-2xl sm:text-3xl font-medium py-2 hover:opacity-60 transition flex items-center justify-center">
              {k === "back" ? <Delete size={22} strokeWidth={1.5} /> : k}
            </button>
          ))}
        </div>
      </div>
      {picking && <TokenPicker current={token} onPick={setToken} onClose={() => setPicking(false)} label={mode === "private" ? "Private balance" : "Public balance"} encrypted={mode === "private"} efi={efi} />}
    </Frame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between border-b border-white/10 pb-4">
      <div>
        <div className="text-xs text-muted uppercase tracking-widest mb-1">{label}</div>
        <div className="font-mono text-sm">{value}</div>
      </div>
    </div>
  );
}
