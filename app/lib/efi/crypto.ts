import { encrypt as eciesEncrypt, decrypt as eciesDecrypt, PublicKey } from "eciesjs";
import { ethers } from "ethers";

/**
 * Decrypt an inbox message with the reader's spending key. The TEE stores each
 * message ECIES-encrypted to the recipient's spending pubkey; the inner payload
 * is abi.encode(["address","bytes","uint256"], [sender, content, timestamp]).
 * Returns null if this key can't decrypt it (not ours / corrupt).
 */
export function decryptInboxMessage(
  spendingKeyHex: string,
  ciphertextHex: string,
): { from: string; text: string; ts: number } | null {
  try {
    const sk = Buffer.from(ethers.getBytes(spendingKeyHex));
    const ct = Buffer.from(ethers.getBytes(ciphertextHex));
    const plain = eciesDecrypt(sk, ct);
    const [from, content, ts] = ethers.AbiCoder.defaultAbiCoder().decode(
      ["address", "bytes", "uint256"],
      plain,
    );
    return { from: from as string, text: ethers.toUtf8String(content as string), ts: Number(ts) };
  } catch {
    return null;
  }
}

const ZERO32 = "0x" + "0".repeat(64);
const isProofId = (h: string) => /^0x[0-9a-fA-F]{64}$/.test(h) && h !== ZERO32;

/**
 * A bytes32 proof id is exactly 32 bytes — whether raw or abi.encode(["bytes32"]).
 * Only treat an exactly-32-byte payload as an id; decoding a longer payload as
 * bytes32 would wrongly grab its leading ABI offset word.
 */
function idFrom(bytes: Uint8Array): string | null {
  if (bytes.length !== 32) return null;
  const h = ethers.hexlify(bytes);
  return isProofId(h) ? h : null;
}

/**
 * Recover the plaintext proofId a subject hands a verifier from a disclosure
 * handler's response. Different deployed TEE builds answer in different shapes,
 * so try each: a bare bytes32, an abi.encode(["bytes"]) envelope wrapping either
 * plaintext or an ECIES ciphertext decrypted with the spending key.
 * Returns null only if none of them yield a proof id.
 */
export function decryptProofId(spendingKeyHex: string, dataHex: string): string | null {
  const A = ethers.AbiCoder.defaultAbiCoder();
  let raw: Uint8Array;
  try {
    raw = ethers.getBytes(dataHex);
  } catch {
    return null;
  }

  // 1) response is already the proof id (plaintext bytes32 / abi bytes32)
  const direct = idFrom(raw);
  if (direct) return direct;

  // 2) unwrap the abi.encode(["bytes"], [inner]) envelope
  let inner: Uint8Array | null = null;
  try {
    const [x] = A.decode(["bytes"], dataHex);
    inner = ethers.getBytes(x as string);
  } catch {
    inner = null;
  }

  // 2a) inner is plaintext proof id (older handler that didn't encrypt)
  if (inner) {
    const plainId = idFrom(inner);
    if (plainId) return plainId;
  }

  // 3) inner (or the whole payload) is an ECIES ciphertext -> decrypt -> proof id
  const sk = Buffer.from(ethers.getBytes(spendingKeyHex));
  for (const ct of [inner, raw]) {
    if (!ct || ct.length < 33) continue;
    try {
      const id = idFrom(eciesDecrypt(sk, Buffer.from(ct)));
      if (id) return id;
    } catch {
      /* wrong key / not ciphertext — try next */
    }
  }
  return null;
}

export function randSalt(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}
export function randNoteId(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

export function noteCommitment(noteId: string, amount: bigint, token: string, salt: string): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "address", "bytes32"],
      [noteId, amount, token, salt],
    ),
  );
}

/** ECIES-encrypt an ABI-encoded payload to the TEE's secp256k1 public key. */
export function encryptForTEE(
  pubKeyHex: string,
  types: readonly string[],
  values: readonly unknown[],
): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(types as string[], values as unknown[]);
  const pubKey = PublicKey.fromHex(pubKeyHex.replace(/^0x/, ""));
  const encrypted = eciesEncrypt(pubKey.toBytes(), Buffer.from(ethers.getBytes(encoded)));
  return "0x" + Buffer.from(encrypted).toString("hex");
}

/**
 * Deterministically derive a 32-byte spending key from a single wallet
 * signature. Same signature → same key, so the user never stores it and can
 * always recover it by re-signing. Never leaves the browser.
 */
export async function deriveSpendingKey(signer: ethers.Signer): Promise<Uint8Array> {
  const sig = await signer.signMessage("EncryptedFi spending key v1");
  return ethers.getBytes(ethers.keccak256(sig));
}

export async function signRelayedInstruction(
  signer: ethers.Signer,
  protocolAddress: string,
  chainId: number,
  opType: string,
  opCommand: string,
  encryptedData: string,
  deadline: number,
): Promise<string> {
  const provider = signer.provider!;
  const protocol = new ethers.Contract(
    protocolAddress,
    ["function nonces(address) view returns (uint256)"],
    provider,
  );
  const user = await signer.getAddress();
  const nonce = (await protocol.nonces(user)) as bigint;
  const domain = { name: "EncryptedFi", version: "1", chainId, verifyingContract: protocolAddress };
  const types = {
    RelayedInstruction: [
      { name: "opType", type: "bytes32" },
      { name: "opCommand", type: "bytes32" },
      { name: "encryptedDataHash", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const value = {
    opType: ethers.zeroPadBytes(ethers.toUtf8Bytes(opType), 32),
    opCommand: ethers.zeroPadBytes(ethers.toUtf8Bytes(opCommand), 32),
    encryptedDataHash: ethers.keccak256(encryptedData),
    nonce,
    deadline,
  };
  return signer.signTypedData(domain, types, value);
}
