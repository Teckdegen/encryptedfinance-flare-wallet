export const COSTON2 = {
  id: 114,
  name: "Flare Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] },
    public: { http: ["https://coston2-api.flare.network/ext/C/rpc"] },
  },
  blockExplorers: {
    default: { name: "Flare Coston2 Explorer", url: "https://coston2-explorer.flare.network" },
  },
  testnet: true,
} as const;

// Live Railway / Coston2 endpoints — baked in so the frontend runs with NO .env
// file. Override at build time only if you need to point at a different stack.
export const TEE_URL = "https://extension-tee-production.up.railway.app" as const;
export const EXPLORER_URL = "https://coston2-explorer.flare.network" as const;
export const INDEXER_URL = "https://indexer-production-7edb.up.railway.app" as const;

export const PROTOCOL = "0x16490D95A0244b5a378621409B07D5A07823e1F1" as const;
export const VAULT = "0x5296df6E4285f6e8c4F7960f0D2a050C7E4D2823" as const;
export const RELAYER = "0x7981879dBF87DAAa7A7755d9650497566379f59E" as const;
export const FAUCET = "0x8F8184c1d1842d18cB789102Deaa09baEF0c344D" as const;

export const TOKENS = [
  { symbol: "GHST", name: "Ghost", address: "0xC57201aD89B86Af48c0dB303350b364A8ED9582b", decimals: 6 },
  { symbol: "CIPH", name: "Cipher", address: "0xE211Cd80d70b2C5FA5e82355E4B50924A907018A", decimals: 6 },
  { symbol: "VEIL", name: "Veil", address: "0x0a3730D8B5c627563DAC3aB4EF725CEb671D2D60", decimals: 18 },
  { symbol: "NOIR", name: "Noir", address: "0xC84D1e9C9Acc23254E7202a0a549e6c93D1bE6dB", decimals: 8 },
  { symbol: "PHTM", name: "Phantom", address: "0xa779d43BCaBda81f3324d11392f4ae35Bb2Fbfec", decimals: 18 },
  { symbol: "MASK", name: "Mask", address: "0x8Ed0987b36655AF304c65DFea3c5eb55478f3B95", decimals: 18 },
  { symbol: "SHDE", name: "Shade", address: "0x00081D91D90c2D980793543f9ED67124229dAeE2", decimals: 18 },
  { symbol: "NULL", name: "Null", address: "0xF3499196F8bd6E6d499a5A68dbeD30C78137e940", decimals: 6 },
  { symbol: "MRKL", name: "Merkle", address: "0x9c98C243978240C43A151fd1ebBD5DCb40BE5624", decimals: 18 },
  { symbol: "ENIG", name: "Enigma", address: "0x282F06BdE6E660d62a17B9A651a84e1CFEDD3927", decimals: 18 },
] as const;

export type Token = (typeof TOKENS)[number];

export const CTOKENS = [
  { symbol: "cGHST", address: "0xEf22768e7dec3b7c8e45b6c02B2B76a444Dd2331", underlying: "GHST", apr: 500 },
  { symbol: "cCIPH", address: "0x5117B2A697e5339C3122D42e45D5dC284bB654E0", underlying: "CIPH", apr: 450 },
  { symbol: "cVEIL", address: "0xB668e732fCdbc32f87Af2fFF4Ff6fc0650B441F4", underlying: "VEIL", apr: 800 },
  { symbol: "cNOIR", address: "0x38C0Fa11CDa9c20b8486Cc33b345d43ADDf48523", underlying: "NOIR", apr: 650 },
  { symbol: "cNULL", address: "0x16FDB4001Bb154a0E0efb7AA4e629f8BA01144C8", underlying: "NULL", apr: 400 },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export const FAUCET_ABI = [
  { type: "function", name: "claimAll", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "lastClaim", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "cooldown", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const VAULT_ABI = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [
    { type: "address", name: "token" },
    { type: "uint256", name: "amount" },
    { type: "bytes32", name: "noteId" },
    { type: "bytes", name: "encryptedNote" },
    { type: "bytes32", name: "salt" },
  ], outputs: [] },
  { type: "function", name: "isSpent", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
] as const;
