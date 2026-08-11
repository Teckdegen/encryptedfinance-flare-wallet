/**
 * Browser-compatible note cipher — byte-for-byte identical to the SDK/extension
 * noteCipher.ts (Node crypto), so notes encrypted here decrypt in the enclave
 * and vice-versa.
 *
 * Layout (221 bytes): ephemPub(65) | iv(12) | ciphertext(128) | tag(16)
 * AES key = SHA-256(ECDH shared X). Plaintext = abi.encode(address,uint256,address,bytes32) = 128B.
 */
import { secp256k1 } from "@noble/curves/secp256k1";
import { ethers } from "ethers";

export const NOTE_BYTES = 221;
const PLAIN_BYTES = 128;

// Newer TS DOM libs type WebCrypto's BufferSource params against ArrayBuffer-
// backed views, but ethers.getBytes()/.slice() yield Uint8Array<ArrayBufferLike>.
// These are valid BufferSources at runtime; normalize the type so `next build`
// (strict type-check) accepts them.
const bs = (u: Uint8Array): BufferSource => u as BufferSource;

function encodePlain(owner: string, amount: bigint, token: string, salt: string): Uint8Array {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256", "address", "bytes32"],
    [owner, amount, token, salt],
  );
  const bytes = ethers.getBytes(encoded);
  if (bytes.length !== PLAIN_BYTES) throw new Error(`plaintext must be ${PLAIN_BYTES} bytes`);
  return bytes;
}

async function aesKey(sharedX: Uint8Array): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", bs(sharedX));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptNote221(
  recipientPubKeyHex: string,
  owner: string,
  amount: bigint,
  token: string,
  salt: string,
): Promise<string> {
  const plain = encodePlain(owner, amount, token, salt);
  const ephemPriv = secp256k1.utils.randomPrivateKey();
  const ephemPub = secp256k1.getPublicKey(ephemPriv, false); // 65B uncompressed
  const recipientPub = ethers.getBytes(recipientPubKeyHex);
  // ECDH: shared point X (32B) — matches Node ECDH.computeSecret for secp256k1.
  const sharedX = secp256k1.getSharedSecret(ephemPriv, recipientPub, false).slice(1, 33);
  const key = await aesKey(sharedX);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctWithTag = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv), tagLength: 128 }, key, bs(plain)),
  );
  const ciphertext = ctWithTag.slice(0, PLAIN_BYTES);
  const tag = ctWithTag.slice(PLAIN_BYTES);
  const out = new Uint8Array(NOTE_BYTES);
  out.set(ephemPub, 0);
  out.set(iv, 65);
  out.set(ciphertext, 77);
  out.set(tag, 77 + PLAIN_BYTES);
  return ethers.hexlify(out);
}

export async function decryptNote221(
  spendingPrivKeyHex: string,
  encryptedHex: string,
): Promise<{ owner: string; amount: bigint; token: string; salt: string }> {
  const buf = ethers.getBytes(encryptedHex);
  if (buf.length !== NOTE_BYTES) throw new Error(`expected ${NOTE_BYTES}-byte note`);
  const ephemPub = buf.slice(0, 65);
  const iv = buf.slice(65, 77);
  const ciphertext = buf.slice(77, 77 + PLAIN_BYTES);
  const tag = buf.slice(77 + PLAIN_BYTES);
  const priv = ethers.getBytes(spendingPrivKeyHex);
  const sharedX = secp256k1.getSharedSecret(priv, ephemPub, false).slice(1, 33);
  const key = await aesKey(sharedX);
  const ctWithTag = new Uint8Array(ciphertext.length + tag.length);
  ctWithTag.set(ciphertext, 0);
  ctWithTag.set(tag, ciphertext.length);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(iv), tagLength: 128 }, key, bs(ctWithTag)),
  );
  const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
    ["address", "uint256", "address", "bytes32"],
    plain,
  );
  return { owner: decoded[0], amount: decoded[1], token: decoded[2], salt: decoded[3] };
}
