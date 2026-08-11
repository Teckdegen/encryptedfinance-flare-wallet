import { ethers } from "ethers";
import {
  encryptForTEE,
  signRelayedInstruction,
  noteCommitment,
  randSalt,
  randNoteId,
} from "./crypto";
import { encryptNote221, decryptNote221, NOTE_BYTES } from "./noteCipher";
import { RELAYER, TOKENS, EXPLORER_URL } from "../contracts";
import { coston2Provider } from "./rpc";

export interface TEEInfo {
  teePublicKey: string;
  hotWallet: string;
  protocolAddress: string;
  chainId: number;
}

export interface PrivateNote {
  noteId: string;
  token: string;
  amount: bigint;
  salt: string;
}

const VAULT_ABI = [
  "function deposit(address token, uint256 amount, bytes32 noteId, bytes32 salt, bytes encryptedNote)",
  "function quoteWrap(uint256 amount) view returns (uint256 netAmount, uint256 fee)",
  "function registeredTokens(address) view returns (bool)",
  "function isSpent(bytes32) view returns (bool)",
  "function noteCommitment(bytes32) view returns (bytes32)",
  "event NoteCreated(bytes32 indexed noteId, bytes encryptedNote)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];
const PROTOCOL_ABI = ["function vault() view returns (address)"];
const RELAYER_ABI = [
  "function disclosureProofs(bytes32) view returns (address subject, address recipient, uint8 proofType, bytes proofData, uint256 expiresAt, bool revoked)",
  "function isDisclosureProofValid(bytes32 proofId) view returns (bool)",
  "function isDisclosureProofValidFor(bytes32 proofId, address intendedRecipient) view returns (bool)",
];

const PROOF_TYPE_NAMES = ["Compliance", "Solvency", "Audit trail", "Identity", "Trade history", "Tax export"] as const;

export interface DisclosureResult {
  found: boolean;      // a proof with this id exists on-chain
  valid: boolean;      // exists && not revoked && not expired
  validForYou: boolean | null; // scoped to the connected verifier (null if not checked)
  subject: string;     // who the proof is about
  recipient: string;   // who it was issued to (0xdead = public)
  proofType: string;   // human label
  claim: string;       // decoded human-readable claim
  expiresAt: number;   // unix seconds
  revoked: boolean;
}

function decodeClaim(proofType: number, proofData: string): string {
  const A = ethers.AbiCoder.defaultAbiCoder();
  try {
    if (proofType === 1) {
      // SOLVENCY: [tag, subject, token, threshold, ok]
      const [, , token, threshold] = A.decode(["string", "address", "address", "uint256", "bool"], proofData);
      const t = TOKENS.find((x) => x.address.toLowerCase() === (token as string).toLowerCase());
      const amt = ethers.formatUnits(threshold as bigint, t?.decimals ?? 18);
      return `Holds at least ${Number(amt).toLocaleString()} ${t?.symbol ?? "tokens"}`;
    }
    if (proofType === 0) {
      // COMPLIANCE: [tag, jurisdiction, subject, ts, ok]
      const [, jurisdiction] = A.decode(["string", "string", "address", "uint256", "bool"], proofData);
      return `Compliance attestation · jurisdiction ${jurisdiction as string}`;
    }
    if (proofType === 2) {
      // AUDIT_TRAIL: [tag, subject, entries[], ts]
      const [, , entries] = A.decode(
        ["string", "address", "tuple(bytes32 noteId, uint256 amount, address token, uint8 kind)[]", "uint256"],
        proofData,
      );
      return `Signed audit trail over ${(entries as unknown[]).length} note(s)`;
    }
  } catch {
    /* fall through */
  }
  return "Attestation";
}

export interface EfiConfig {
  teeUrl: string;
  protocolAddress: string;
  chainId: number;
}

export class EfiClient {
  readonly signer: ethers.Signer;
  readonly provider: ethers.Provider;
  readonly config: EfiConfig;
  teeInfo!: TEEInfo;
  private _vaultAddr: string | null = null;

  private constructor(signer: ethers.Signer, config: EfiConfig) {
    this.signer = signer;
    // Reads are pinned to Coston2 regardless of the wallet's selected network,
    // so balances/notes never read 0 just because MetaMask is on another chain.
    // The signer is still used for writes (which require the wallet on Coston2).
    this.provider = coston2Provider();
    this.config = config;
  }

  static async connect(signer: ethers.Signer, config: EfiConfig): Promise<EfiClient> {
    const c = new EfiClient(signer, config);
    const res = await fetch(`${config.teeUrl}/info`);
    if (!res.ok) throw new Error(`TEE /info returned ${res.status}`);
    c.teeInfo = (await res.json()) as TEEInfo;
    return c;
  }

  async vaultAddr(): Promise<string> {
    if (!this._vaultAddr) {
      const p = new ethers.Contract(this.config.protocolAddress, PROTOCOL_ABI, this.provider);
      this._vaultAddr = (await p.vault()) as string;
    }
    return this._vaultAddr;
  }
  private async vault(withSigner = false): Promise<ethers.Contract> {
    return new ethers.Contract(await this.vaultAddr(), VAULT_ABI, withSigner ? this.signer : this.provider);
  }

  // Has this note's nullifier been consumed on chain? A relayed op (transfer,
  // swap, lend) is only truly settled once the input note reads spent. The UI
  // polls this to show real success instead of the optimistic relay ack.
  async isNoteSpent(noteId: string): Promise<boolean> {
    const vault = await this.vault();
    return (await vault.isSpent(noteId)) as boolean;
  }

  // ── on-chain relayed op (value ops: transfer/burn/swap/lend/key) ──
  private async submit(
    opType: string,
    opCommand: string,
    types: readonly string[],
    values: readonly unknown[],
  ): Promise<{ jobId?: string; txHash?: string }> {
    const user = await this.signer.getAddress();
    const encryptedData = encryptForTEE(this.teeInfo.teePublicKey, types, values);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const sig = await signRelayedInstruction(
      this.signer, this.config.protocolAddress, this.config.chainId,
      opType, opCommand, encryptedData, deadline,
    );
    const res = await fetch(`${this.config.teeUrl}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, opType, opCommand, encryptedData, deadline, sig }),
    });
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(e.error ?? `/submit returned ${res.status}`);
    }
    const body = (await res.json()) as { jobId?: string; txHash?: string; queued?: boolean };
    // Queue the settling tx so the next scan harvests its freshly-minted notes
    // (change / swap output) straight from the receipt — no dependency on the
    // TEE's per-owner index or the laggy log endpoint. Persisted so a reload
    // right after the op doesn't drop the change note.
    if (body.txHash) this.addPendingTx(body.txHash);
    return { jobId: body.jobId, txHash: body.txHash };
  }

  // ── gasless direct op (reads/proofs: disclosure, messaging) ──
  async directHandle(
    opType: string,
    opCommand: string,
    types: readonly string[],
    values: readonly unknown[],
  ): Promise<{ data: string | null; status: number; error?: string }> {
    const user = await this.signer.getAddress();
    const encryptedData = encryptForTEE(this.teeInfo.teePublicKey, types, values);
    const message = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes"], [user, encryptedData]);
    const instructionId = ethers.keccak256(ethers.toUtf8Bytes(`ui:${opType}:${opCommand}:${Date.now()}:${Math.random()}`));
    const res = await fetch(`${this.config.teeUrl}/handle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opType, opCommand, message, instructionId }),
    });
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(e.error ?? `/handle returned ${res.status}`);
    }
    return (await res.json()) as { data: string | null; status: number; error?: string };
  }

  // ── spending-key registration (the first-time gate) ──
  async isRegistered(spendingKey: Uint8Array): Promise<boolean> {
    // The enclave stores efaddr:<user>. We probe by asking MSG:READ (harmless);
    // if the key isn't loaded the handler errors, otherwise status 1.
    try {
      const r = await this.directHandle("MSG", "READ", ["uint256"], [0n]);
      return r.status === 1;
    } catch {
      return false;
    }
  }
  async registerKey(spendingKey: Uint8Array): Promise<void> {
    // Gasless direct — stores efaddr + on-chain sealed backup.
    const r = await this.directHandle("KEY", "REGISTER", ["bytes"], [spendingKey]);
    if (r.status !== 1) throw new Error(r.error ?? "key registration failed");
  }

  // ── SHIELD: wrap ERC20 into an encrypted note ──
  async shield(token: string, amount: bigint, efPubKeyHex: string): Promise<PrivateNote & { txHash: string }> {
    const vault = await this.vault(true);
    const vaultAddr = await this.vaultAddr();
    const user = await this.signer.getAddress();
    const erc20 = new ethers.Contract(token, ERC20_ABI, this.signer);
    const allowance = (await erc20.allowance(user, vaultAddr)) as bigint;
    if (allowance < amount) await (await erc20.approve(vaultAddr, ethers.MaxUint256)).wait();
    const noteId = randNoteId();
    const salt = randSalt();
    const [netAmount] = (await vault.quoteWrap(amount)) as [bigint, bigint];
    const encryptedNote = await encryptNote221(efPubKeyHex, user, netAmount, token, salt);
    const tx = await vault.deposit(token, amount, noteId, salt, encryptedNote);
    const receipt = await tx.wait();
    const note = { noteId, token, amount: netAmount, salt };
    // Cache the note we just created — the public RPC's log endpoint lags the
    // head by ~1000 blocks, so scanning wouldn't see it for ~30min. We already
    // know it, so store it and the balance shows immediately.
    this.cacheNote(user, note);
    return { ...note, txHash: receipt.hash };
  }

  // ── local note cache (per user) — the note secrets we already know ──
  private noteCacheKey(user: string): string {
    // v2: ignore caches written by earlier buggy sessions — the chain-derived
    // scan rebuilds everything from the explorer, so a clean slate is safe.
    return `efi:notes:v2:${user.toLowerCase()}`;
  }
  private loadCachedNotes(user: string): PrivateNote[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(this.noteCacheKey(user));
      if (!raw) return [];
      return (JSON.parse(raw) as { noteId: string; token: string; amount: string; salt: string }[])
        .map((n) => ({ noteId: n.noteId, token: n.token, amount: BigInt(n.amount), salt: n.salt }));
    } catch { return []; }
  }
  private saveCachedNotes(user: string, notes: PrivateNote[]): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        this.noteCacheKey(user),
        JSON.stringify(notes.map((n) => ({ noteId: n.noteId, token: n.token, amount: n.amount.toString(), salt: n.salt }))),
      );
    } catch { /* quota / private mode */ }
  }
  cacheNote(user: string, note: PrivateNote): void {
    const notes = this.loadCachedNotes(user);
    if (notes.some((n) => n.noteId.toLowerCase() === note.noteId.toLowerCase())) return;
    notes.push(note);
    this.saveCachedNotes(user, notes);
  }

  // Harvest notes minted by our just-submitted value ops. Reads each op's receipt
  // (a direct eth_getTransactionReceipt — no log-endpoint lag), decrypts every
  // NoteCreated in it, and caches the ones owned by us (the change note after an
  // unshield/transfer, the output note after a swap). Non-blocking: a tx that
  // isn't mined yet stays queued for the next scan.
  private pendingTxKey(): string { return "efi:pendingtx"; }
  private loadPendingTxs(): string[] {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem(this.pendingTxKey()) ?? "[]") as string[]; } catch { return []; }
  }
  private savePendingTxs(txs: string[]): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(this.pendingTxKey(), JSON.stringify([...new Set(txs)].slice(-50))); } catch { /* ignore */ }
  }
  private addPendingTx(tx: string): void { this.savePendingTxs([...this.loadPendingTxs(), tx]); }

  private async harvestPendingTxs(spendingPrivKeyHex: string): Promise<void> {
    const txs = this.loadPendingTxs();
    if (txs.length === 0) return;
    const keep: string[] = [];
    const vaultAddr = (await this.vaultAddr()).toLowerCase();
    const iface = new ethers.Interface(["event NoteCreated(bytes32 indexed noteId, bytes encryptedNote)"]);
    const user = (await this.signer.getAddress()).toLowerCase();
    for (const tx of txs) {
      try {
        const rc = await this.provider.getTransactionReceipt(tx);
        if (!rc) { keep.push(tx); continue; } // not mined yet — retry next scan
        for (const log of rc.logs) {
          if (log.address.toLowerCase() !== vaultAddr) continue;
          let parsed: ethers.LogDescription | null = null;
          try { parsed = iface.parseLog({ topics: [...log.topics], data: log.data }); } catch { continue; }
          if (!parsed || parsed.name !== "NoteCreated") continue;
          const noteId = parsed.args[0] as string;
          const enc = parsed.args[1] as string;
          try {
            if (ethers.getBytes(enc).length !== NOTE_BYTES) continue;
            const dec = await decryptNote221(spendingPrivKeyHex, enc);
            if (dec.owner.toLowerCase() !== user) continue;
            this.cacheNote(user, { noteId, token: dec.token, amount: dec.amount, salt: dec.salt });
          } catch { /* not ours */ }
        }
      } catch { keep.push(tx); } // transient RPC error — retry next scan
    }
    this.savePendingTxs(keep);
  }

  // ── PUBLIC transfer: plain ERC20 (no privacy) ──
  async publicTransfer(token: string, to: string, amount: bigint): Promise<string> {
    const erc20 = new ethers.Contract(token, ERC20_ABI, this.signer);
    const tx = await erc20.transfer(to, amount);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  // ── PRIVATE transfer: spend a note, TEE routes to recipient ──
  async privateTransfer(note: PrivateNote, recipient: string, amount: bigint): Promise<{ jobId?: string; txHash?: string }> {
    // The Flare FCC delivery layer only forwards the TX:TRANSFER opCommand to the
    // node; TX:SWAP / TX:LEND are silently dropped (proven 2026-08-10). So every
    // value op rides the TRANSFER envelope with a 1-byte sub-op tag as the first
    // field (0=transfer, 1=swap, 2=lend); handleTxTransfer reads the tag and routes.
    return this.submit(
      "TX", "TRANSFER",
      ["uint8", "bytes32", "address", "address", "uint256", "uint256", "bytes32", "uint256"],
      [0, note.noteId, note.token, recipient, amount, note.amount, note.salt, 0n],
    );
  }

  // ── PRIVATE swap ── (rides the TRANSFER envelope, sub-op tag 1)
  async swap(note: PrivateNote, tokenOut: string, amountIn: bigint, slippageBps = 500): Promise<{ jobId?: string; txHash?: string }> {
    return this.submit(
      "TX", "TRANSFER",
      ["uint8", "bytes32", "address", "address", "uint256", "uint256", "uint256", "uint256", "bytes32"],
      [1, note.noteId, note.token, tokenOut, note.amount, amountIn, 0n, 0n, note.salt],
    );
  }

  // ── PRIVATE lend ── (rides the TRANSFER envelope, sub-op tag 2)
  async lend(note: PrivateNote, market: string, amount: bigint): Promise<{ jobId?: string; txHash?: string }> {
    return this.submit(
      "TX", "TRANSFER",
      ["uint8", "bytes32", "address", "address", "uint256", "uint256", "bytes32", "uint256"],
      [2, note.noteId, note.token, market, note.amount, amount, note.salt, 0n],
    );
  }

  // ── UNSHIELD (burn note back to plain ERC20 at `to`) ──
  async unshield(note: PrivateNote, to: string, amount: bigint): Promise<{ jobId?: string; txHash?: string }> {
    const isFull = amount >= note.amount;
    return this.submit(
      "TX", "BURN",
      ["bytes32", "address", "address", "uint256", "uint256", "bytes32", "uint256", "bool"],
      [note.noteId, note.token, to, note.amount, isFull ? 0n : amount, note.salt, 0n, isFull],
    );
  }

  // ── SELECTIVE DISCLOSURE: prove solvency ≥ threshold ──
  async discloseSolvency(recipient: string, token: string, threshold: bigint, notes: PrivateNote[], expiresInSec = 3600) {
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + expiresInSec);
    return this.directHandle(
      "DISCLOSE", "SOLVENCY",
      ["address", "uint256", "address", "uint256", "bytes32[]", "uint256[]", "bytes32[]"],
      [recipient, expiresAt, token, threshold, notes.map((n) => n.noteId), notes.map((n) => n.amount), notes.map((n) => n.salt)],
    );
  }

  // ── SELECTIVE DISCLOSURE: regulator/compliance attestation over a jurisdiction ──
  async discloseCompliance(recipient: string, jurisdiction: string, notes: PrivateNote[], expiresInSec = 3600) {
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + expiresInSec);
    const commitments = notes.map((n) => noteCommitment(n.noteId, n.amount, n.token, n.salt));
    return this.directHandle(
      "DISCLOSE", "COMPLIANCE",
      ["address", "uint256", "string", "bytes32[]"],
      [recipient, expiresAt, jurisdiction, commitments],
    );
  }

  // ── SELECTIVE DISCLOSURE: signed audit trail of specific notes ──
  async discloseAuditTrail(recipient: string, notes: PrivateNote[], expiresInSec = 3600) {
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + expiresInSec);
    const entries = notes.map((n) => [n.noteId, n.amount, n.token, n.salt, 0]);
    return this.directHandle(
      "DISCLOSE", "AUDIT_TRAIL",
      ["address", "uint256", "tuple(bytes32 noteId, uint256 amount, address token, bytes32 salt, uint8 kind)[]"],
      [recipient, expiresAt, entries],
    );
  }

  /**
   * VERIFIER SIDE: given a proofId (shared by a subject), read the on-chain
   * disclosure record and check its validity. Pure read — no TEE needed.
   * `verifier` (optional) additionally checks the proof was scoped to them.
   */
  async verifyProof(proofId: string, verifier?: string): Promise<DisclosureResult> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(proofId.trim())) throw new Error("Not a proof id — expected a 32-byte 0x… hash.");
    const id = proofId.trim();
    const c = new ethers.Contract(RELAYER, RELAYER_ABI, this.provider);
    const p = await c.disclosureProofs(id);
    const subject = p.subject as string;
    if (subject === ethers.ZeroAddress) {
      return { found: false, valid: false, validForYou: null, subject, recipient: ethers.ZeroAddress, proofType: "Unknown", claim: "", expiresAt: 0, revoked: false };
    }
    const proofType = Number(p.proofType);
    const [valid, validForYou] = await Promise.all([
      c.isDisclosureProofValid(id) as Promise<boolean>,
      verifier ? (c.isDisclosureProofValidFor(id, verifier) as Promise<boolean>) : Promise.resolve<boolean | null>(null),
    ]);
    return {
      found: true,
      valid,
      validForYou,
      subject,
      recipient: p.recipient as string,
      proofType: PROOF_TYPE_NAMES[proofType] ?? "Unknown",
      claim: decodeClaim(proofType, p.proofData as string),
      expiresAt: Number(p.expiresAt),
      revoked: p.revoked as boolean,
    };
  }

  /**
   * Fallback for recovering a just-minted proofId when the TEE response can't be
   * decrypted: read it from the DisclosureProofSubmitted event (proofId is the
   * first indexed topic) filtered to this subject, newest first. Small block
   * range to stay under Coston2's getLogs cap.
   */
  async latestProofIdFor(subject: string, lookback = 25): Promise<string | null> {
    const c = new ethers.Contract(
      RELAYER,
      ["event DisclosureProofSubmitted(bytes32 indexed proofId, address indexed subject, address indexed recipient, uint8 proofType, uint256 expiresAt)"],
      this.provider,
    );
    try {
      const head = await this.provider.getBlockNumber();
      const from = Math.max(0, head - lookback);
      const logs = await c.queryFilter(c.filters.DisclosureProofSubmitted(null, subject), from, head);
      if (logs.length) return ((logs[logs.length - 1] as ethers.EventLog).args?.[0] as string) ?? null;
    } catch {
      /* getLogs lag / range — caller falls back to its own message */
    }
    return null;
  }

  // ── ENCRYPTED MESSAGING ──
  async msgSend(recipient: string, text: string, expiresInSec = 86400) {
    const expiry = BigInt(Math.floor(Date.now() / 1000) + expiresInSec);
    return this.directHandle("MSG", "SEND", ["address", "bytes", "uint256"], [recipient, ethers.toUtf8Bytes(text), expiry]);
  }
  async msgRead() {
    return this.directHandle("MSG", "READ", ["uint256"], [0n]);
  }
  /**
   * Full inbox — every non-expired message ECIES-encrypted to me. `since=1`
   * forces the TEE to return all history each call (not just since the cursor),
   * so the chat can rebuild threads. Returns raw ciphertext hex strings; decrypt
   * client-side with the spending key (decryptInboxMessage).
   */
  async msgInbox(): Promise<string[]> {
    const r = await this.directHandle("MSG", "READ", ["uint256"], [1n]);
    if (r.status !== 1 || !r.data || r.data === "0x") return [];
    try {
      const [arr] = ethers.AbiCoder.defaultAbiCoder().decode(["bytes[]"], r.data);
      return (arr as string[]).filter((c) => c && c !== "0x");
    } catch {
      return [];
    }
  }

  // ── PRIVATE BALANCE: find my unspent notes, straight from chain ──
  // Source of truth is the vault's NoteCreated logs (fetched from the explorer's
  // indexed log API in one call — no 30-block cap, no ~30-min raw-RPC lag), and
  // EVERY candidate is validated with an on-chain isSpent() call. Nothing stale
  // can survive: a spent note is dropped even if it's still in a cache. The local
  // cache is only a secret store for just-minted notes the explorer hasn't indexed
  // yet (harvested from the op receipt) — it never overrides the chain.
  async scanNotes(spendingPrivKeyHex: string, _fromBlock = 0, _deep = false): Promise<PrivateNote[]> {
    const userAddr = await this.signer.getAddress();
    const user = userAddr.toLowerCase();
    const vaultAddr = await this.vaultAddr();
    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, this.provider);

    // Harvest notes minted by our just-submitted ops (change / swap output) from
    // their receipts — covers the seconds before the explorer indexes them.
    await this.harvestPendingTxs(spendingPrivKeyHex);

    // Candidate notes (noteId -> decrypted note), from chain first then cache.
    const cand = new Map<string, PrivateNote>();

    // 1) All NoteCreated logs from the explorer; decrypt, keep the ones I own.
    for (const { noteId, encNote } of await this.fetchNoteEvents(vaultAddr)) {
      try {
        if (!encNote || ethers.getBytes(encNote).length !== NOTE_BYTES) continue;
        const dec = await decryptNote221(spendingPrivKeyHex, encNote);
        if (dec.owner.toLowerCase() !== user) continue;
        cand.set(noteId.toLowerCase(), { noteId, token: dec.token, amount: dec.amount, salt: dec.salt });
      } catch { /* not ours */ }
    }

    // 2) Locally-cached secrets (fresh receipts / shields) the explorer may not
    // have indexed yet. Added only if not already seen from chain.
    for (const n of this.loadCachedNotes(userAddr)) {
      if (!cand.has(n.noteId.toLowerCase())) cand.set(n.noteId.toLowerCase(), n);
    }

    // 3) Validate EVERY candidate on-chain in parallel: it must EXIST
    // (noteCommitment != 0) and be UNSPENT. This makes the balance purely
    // chain-verified — a stale or phantom cache entry (non-existent note) is
    // dropped, and a spent note is dropped, no matter what a cache says.
    const notes = [...cand.values()];
    const live = await Promise.all(
      notes.map(async (n) => {
        try {
          const [spent, commit] = await Promise.all([
            vault.isSpent(n.noteId) as Promise<boolean>,
            vault.noteCommitment(n.noteId) as Promise<string>,
          ]);
          return !spent && commit !== ethers.ZeroHash;
        } catch {
          return false;
        }
      }),
    );
    const valid = notes.filter((_, i) => live[i]);

    // Keep the cache to just the live secrets so it can't resurrect anything.
    this.saveCachedNotes(userAddr, valid);
    return valid;
  }

  // Fetch every NoteCreated(noteId, encNote) from the vault via the explorer's
  // indexed log API — one request, current to head, no RPC log-lag.
  private async fetchNoteEvents(vaultAddr: string): Promise<{ noteId: string; encNote: string }[]> {
    const base = EXPLORER_URL.replace(/\/$/, "");
    const topic0 = ethers.id("NoteCreated(bytes32,bytes)");
    const url = `${base}/api?module=logs&action=getLogs&address=${vaultAddr}&topic0=${topic0}&fromBlock=0&toBlock=latest`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) return [];
      const body = (await res.json()) as { result?: { topics: string[]; data: string }[] };
      const out: { noteId: string; encNote: string }[] = [];
      for (const it of body.result ?? []) {
        try {
          const noteId = it.topics?.[1];
          if (!noteId) continue;
          const [enc] = ethers.AbiCoder.defaultAbiCoder().decode(["bytes"], it.data);
          out.push({ noteId, encNote: enc as string });
        } catch { /* skip malformed */ }
      }
      return out;
    } catch {
      return [];
    }
  }

  // Rate-limit-safe on-chain fallback: bounded range, one window at a time, with
  // exponential backoff on 429/"could not coalesce" so it degrades instead of crashing.
  private async scanNotesOnChain(spendingPrivKeyHex: string, fromBlock = 0): Promise<PrivateNote[]> {
    const vaultAddr = await this.vaultAddr();
    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, this.provider);
    const user = (await this.signer.getAddress()).toLowerCase();
    // Log endpoint lags head ~1000 blocks; stay below it and keep the window
    // small (freshly-created notes come from the local cache, not this scan).
    const end = Math.max(0, (await this.provider.getBlockNumber()) - 1_100);
    const start = fromBlock || Math.max(0, end - 3_000);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const queryWithRetry = async (from: number, to: number): Promise<ethers.Log[]> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await vault.queryFilter(vault.filters.NoteCreated(), from, to);
        } catch (e) {
          const msg = String((e as { message?: string })?.message ?? e);
          if (attempt >= 5 || !/429|rate limit|coalesce|timeout/i.test(msg)) throw e;
          await sleep(400 * 2 ** attempt); // 0.4s, 0.8s, 1.6s, …
        }
      }
    };
    const notes: PrivateNote[] = [];
    for (let from = start; from <= end; from += 25) {
      const to = Math.min(from + 24, end);
      const logs = await queryWithRetry(from, to);
      for (const log of logs) {
        const ev = log as ethers.EventLog;
        const noteId = ev.args[0] as string;
        const encNote = ev.args[1] as string;
        if (ethers.getBytes(encNote).length !== NOTE_BYTES) continue;
        try {
          const dec = await decryptNote221(spendingPrivKeyHex, encNote);
          if (dec.owner.toLowerCase() !== user) continue;
          const expected = noteCommitment(noteId, dec.amount, dec.token, dec.salt);
          const onChain = (await vault.noteCommitment(noteId)) as string;
          if (onChain.toLowerCase() !== expected.toLowerCase()) continue;
          if (await vault.isSpent(noteId)) continue;
          notes.push({ noteId, token: dec.token, amount: dec.amount, salt: dec.salt });
        } catch { /* not ours */ }
      }
      await sleep(60); // gentle pacing so the public RPC doesn't 429
    }
    return notes;
  }
}
