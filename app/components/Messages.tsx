"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Send as SendIcon, Loader2, Lock, Plus, ChevronLeft, ShieldCheck, RefreshCw } from "lucide-react";
import { EfiState } from "../lib/efi/useEfi";
import { PrivacyGate } from "./PrivacyGate";
import { decryptInboxMessage } from "../lib/efi/crypto";
import { appendSent, buildConversations, loadSent, shortAddr, fmtTime, Conversation } from "../lib/efi/chat";
import { playSubmit, playSuccess, playError, playTap } from "../lib/sound";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const POLL_MS = 8000;

export function Messages({ efi }: { efi: EfiState }) {
  const { address } = useAccount();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null); // peer address
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [newAddr, setNewAddr] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!efi.client || !efi.spendingKeyHex || !address) return;
    try {
      const cts = await efi.client.msgInbox();
      const incoming = cts
        .map((c) => decryptInboxMessage(efi.spendingKeyHex!, c))
        .filter((m): m is { from: string; text: string; ts: number } => !!m);
      setConvos(buildConversations(incoming, loadSent(address)));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [efi.client, efi.spendingKeyHex, address]);

  // initial load + poll
  useEffect(() => {
    if (!efi.spendingKeyHex) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [efi.spendingKeyHex, refresh]);

  // keep thread pinned to newest
  const activeConvo = convos.find((c) => c.peer === active);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [active, activeConvo?.messages.length]);

  async function send(peer: string, text: string) {
    if (!efi.client || !address || !text.trim()) return;
    setSending(true);
    setErr(null);
    playSubmit();
    try {
      const res = await efi.client.msgSend(peer, text.trim());
      if (res.status !== 1) throw new Error(res.error ?? "send failed");
      appendSent(address, peer, text.trim(), Math.floor(Date.now() / 1000));
      setDraft("");
      playSuccess();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      playError();
    } finally {
      setSending(false);
    }
  }

  function openNew() {
    const a = newAddr.trim();
    if (!ADDR_RE.test(a)) {
      setErr("Enter a valid 0x wallet address");
      return;
    }
    if (a.toLowerCase() === address?.toLowerCase()) {
      setErr("You can't message yourself");
      return;
    }
    setActive(a.toLowerCase());
    setComposing(false);
    setNewAddr("");
    setErr(null);
  }

  // ─────────────────────────── THREAD VIEW ───────────────────────────
  if (active) {
    return (
      <PrivacyGate efi={efi}>
        <div className="glass rounded-3xl overflow-hidden flex flex-col h-[70vh]">
          <div className="glass-strong px-4 py-3 flex items-center gap-3 border-b border-white/10">
            <button onClick={() => setActive(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10">
              <ChevronLeft size={18} />
            </button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 via-amber-300 to-rose-400" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold font-mono truncate">{shortAddr(active)}</div>
              <div className="text-[10px] text-success flex items-center gap-1"><Lock size={9} /> End-to-end encrypted</div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto hide-scrollbar px-4 py-4 space-y-2">
            {!activeConvo || activeConvo.messages.length === 0 ? (
              <div className="text-center text-xs text-muted py-10">No messages yet. Say hi — it's encrypted end to end.</div>
            ) : (
              activeConvo.messages.map((m, i) => (
                <div key={i} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] rounded-2xl px-4 py-2 ${m.mine ? "glass-btn" : "glass-strong"}`}>
                    <div className="text-sm whitespace-pre-wrap break-words">{m.text}</div>
                    <div className={`text-[9px] mt-0.5 ${m.mine ? "text-black/50" : "text-muted"}`}>{fmtTime(m.ts)}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {err && <div className="px-4 pb-1 text-[11px] text-danger">{err}</div>}
          <div className="px-3 py-3 border-t border-white/10 flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(active, draft); } }}
              placeholder="Encrypted message…"
              className="glass-strong rounded-full px-4 py-3 text-sm flex-1 min-w-0"
            />
            <button
              onClick={() => send(active, draft)}
              disabled={sending || !draft.trim()}
              className="glass-btn w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <SendIcon size={16} />}
            </button>
          </div>
        </div>
      </PrivacyGate>
    );
  }

  // ─────────────────────────── CONVERSATION LIST ───────────────────────────
  return (
    <PrivacyGate efi={efi}>
      <div className="space-y-4">
        <div className="glass rounded-3xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-success shrink-0" />
            <span className="text-xs text-muted">Encrypted to the recipient's key. Nothing readable is on chain.</span>
          </div>
          <button onClick={() => { playTap(); setLoading(true); refresh().finally(() => setLoading(false)); }} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 shrink-0">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {composing && (
          <div className="glass rounded-3xl p-4 space-y-3">
            <div className="text-xs uppercase tracking-widest text-muted">New conversation</div>
            <input
              value={newAddr}
              onChange={(e) => setNewAddr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && openNew()}
              placeholder="Recipient 0x address"
              autoFocus
              className="glass-strong rounded-2xl px-4 py-3 text-sm font-mono w-full"
            />
            <div className="flex gap-2">
              <button onClick={openNew} className="glass-btn flex-1 py-3 rounded-2xl text-sm font-bold">Start chat</button>
              <button onClick={() => { setComposing(false); setNewAddr(""); setErr(null); }} className="glass-strong px-4 py-3 rounded-2xl text-sm">Cancel</button>
            </div>
            <div className="text-[11px] text-muted">The recipient must have enabled privacy (registered a spending key) to receive.</div>
          </div>
        )}

        {err && !composing && <div className="text-xs text-danger px-1">{err}</div>}

        <div className="glass rounded-3xl overflow-hidden">
          {convos.length === 0 ? (
            <div className="text-center text-sm text-muted py-12 px-6">
              {loading ? "Loading your encrypted inbox…" : "No conversations yet. Tap + to start an encrypted chat."}
            </div>
          ) : (
            convos.map((c) => (
              <button
                key={c.peer}
                onClick={() => { playTap(); setActive(c.peer); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition border-b border-white/10 last:border-0 text-left"
              >
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 via-amber-300 to-rose-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold font-mono truncate">{shortAddr(c.peer)}</div>
                    <div className="text-[10px] text-muted shrink-0">{fmtTime(c.last.ts)}</div>
                  </div>
                  <div className="text-xs text-muted truncate">{c.unreadPreview}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {!composing && (
        <button
          onClick={() => { playTap(); setComposing(true); }}
          className="fixed bottom-28 right-6 sm:right-[calc(50%-18rem)] glass-btn w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-20"
          aria-label="New chat"
        >
          <Plus size={22} />
        </button>
      )}
    </PrivacyGate>
  );
}
