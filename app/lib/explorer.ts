export const EXPLORER_BASE = "https://coston2-explorer.flare.network/api/v2";

export interface ExplorerToken {
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: string | null;
  type: string;
  icon_url?: string | null;
  exchange_rate?: string | null;
  holders?: string | null;
}

export interface ExplorerBalance {
  token: ExplorerToken;
  value: string;
  token_id: string | null;
}

export interface ExplorerAddressInfo {
  hash: string;
  coin_balance: string | null;
  exchange_rate?: string | null;
  is_contract?: boolean;
}

export async function fetchTokenBalances(address: string): Promise<ExplorerBalance[]> {
  const url = `${EXPLORER_BASE}/addresses/${address}/token-balances`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`explorer ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter((b: ExplorerBalance) => b.token && b.token.type?.startsWith("ERC-20"));
}

export async function fetchAddressInfo(address: string): Promise<ExplorerAddressInfo | null> {
  const url = `${EXPLORER_BASE}/addresses/${address}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchAddressTransactions(address: string): Promise<Array<{ hash: string; block: number; from: { hash: string }; to: { hash: string } | null; value: string; method?: string; timestamp: string }>> {
  const url = `${EXPLORER_BASE}/addresses/${address}/transactions`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

export function formatBalance(value: string, decimals: string | number | null): number {
  if (!value) return 0;
  const d = Number(decimals ?? 18);
  try {
    const v = BigInt(value);
    const div = BigInt(10) ** BigInt(d);
    const whole = v / div;
    const frac = v % div;
    return Number(whole) + Number(frac) / Number(div);
  } catch {
    return 0;
  }
}

export function symbolInitial(sym: string | null | undefined): string {
  if (!sym) return "?";
  return sym.charAt(0).toUpperCase();
}

const COLOR_POOL = [
  "from-slate-400 to-slate-600",
  "from-cyan-400 to-blue-600",
  "from-purple-400 to-fuchsia-600",
  "from-zinc-700 to-zinc-900",
  "from-indigo-400 to-violet-600",
  "from-rose-400 to-pink-600",
  "from-neutral-500 to-neutral-700",
  "from-amber-400 to-orange-600",
  "from-emerald-400 to-teal-600",
  "from-lime-400 to-green-600",
];

export function tokenGradient(sym: string | null | undefined): string {
  if (!sym) return COLOR_POOL[0];
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) >>> 0;
  return COLOR_POOL[h % COLOR_POOL.length];
}
