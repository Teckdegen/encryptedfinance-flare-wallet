"use client";
/**
 * Local chat store. Incoming messages come from the TEE inbox (decrypted with
 * the spending key). Outgoing messages are ECIES-encrypted to the *recipient*,
 * so we can't decrypt our own — we keep a plaintext copy locally when we send,
 * exactly like Signal/iMessage do. Merging the two gives a full two-sided
 * thread. Keyed per wallet so switching accounts doesn't leak threads.
 */

export interface ChatMsg {
  peer: string; // the other party's address (lowercased)
  text: string;
  ts: number; // unix seconds
  mine: boolean;
}

const sentKey = (me: string) => `efi:chat:sent:${me.toLowerCase()}`;

interface SentRecord {
  to: string;
  text: string;
  ts: number;
}

export function loadSent(me: string): SentRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(sentKey(me));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function appendSent(me: string, to: string, text: string, ts: number): void {
  if (typeof window === "undefined") return;
  const list = loadSent(me);
  list.push({ to: to.toLowerCase(), text, ts });
  // keep it bounded
  localStorage.setItem(sentKey(me), JSON.stringify(list.slice(-2000)));
}

export interface Conversation {
  peer: string;
  messages: ChatMsg[];
  last: ChatMsg;
  unreadPreview: string;
}

/** Merge decrypted inbox + local sent into per-peer, time-sorted threads. */
export function buildConversations(
  incoming: { from: string; text: string; ts: number }[],
  sent: SentRecord[],
): Conversation[] {
  const byPeer = new Map<string, ChatMsg[]>();
  const push = (m: ChatMsg) => {
    const arr = byPeer.get(m.peer) ?? [];
    arr.push(m);
    byPeer.set(m.peer, arr);
  };
  for (const m of incoming) {
    push({ peer: m.from.toLowerCase(), text: m.text, ts: m.ts, mine: false });
  }
  for (const s of sent) {
    push({ peer: s.to.toLowerCase(), text: s.text, ts: s.ts, mine: true });
  }
  const convos: Conversation[] = [];
  for (const [peer, msgs] of byPeer) {
    // de-dupe (a message can arrive twice across polls) by mine+ts+text
    const seen = new Set<string>();
    const deduped = msgs.filter((m) => {
      const k = `${m.mine}:${m.ts}:${m.text}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    deduped.sort((a, b) => a.ts - b.ts);
    const last = deduped[deduped.length - 1];
    convos.push({
      peer,
      messages: deduped,
      last,
      unreadPreview: (last.mine ? "You: " : "") + last.text,
    });
  }
  convos.sort((a, b) => b.last.ts - a.last.ts);
  return convos;
}

export const shortAddr = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const fmtTime = (ts: number) => {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) +
        " " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
