// Send test funds on Flare Coston2 to a recipient.
// Key is read from PRIVATE_KEY env var — never hardcode it, never commit it.
//
// Usage (PowerShell):
//   $env:PRIVATE_KEY="<key>"; node scripts/send-test-funds.js 0xCdE661fDebC9dea26BC7212E9BAF3e4c7e46B656
// Usage (bash):
//   PRIVATE_KEY=<key> node scripts/send-test-funds.js 0xCdE661fDebC9dea26BC7212E9BAF3e4c7e46B656
//
// Optional 2nd/3rd args override native + token amounts (human units):
//   node scripts/send-test-funds.js <to> 10 10000

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = "https://coston2-api.flare.network/ext/C/rpc";

// Minimal .env reader — pulls one var out of TEE/.env without needing dotenv,
// and without ever printing the value.
function fromEnvFile(name) {
  for (const p of [path.join(__dirname, "..", ".env"), path.join(__dirname, "..", "coston2", ".env")]) {
    try {
      const line = fs.readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.trim().startsWith(name + "="));
      if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    } catch { /* file not there */ }
  }
  return undefined;
}
const TOKENS = [
  { symbol: "GHST", address: "0xC57201aD89B86Af48c0dB303350b364A8ED9582b", decimals: 6 },
  { symbol: "CIPH", address: "0xE211Cd80d70b2C5FA5e82355E4B50924A907018A", decimals: 6 },
  { symbol: "VEIL", address: "0x0a3730D8B5c627563DAC3aB4EF725CEb671D2D60", decimals: 18 },
  { symbol: "NOIR", address: "0xC84D1e9C9Acc23254E7202a0a549e6c93D1bE6dB", decimals: 8 },
  { symbol: "PHTM", address: "0xa779d43BCaBda81f3324d11392f4ae35Bb2Fbfec", decimals: 18 },
  { symbol: "MASK", address: "0x8Ed0987b36655AF304c65DFea3c5eb55478f3B95", decimals: 18 },
  { symbol: "SHDE", address: "0x00081D91D90c2D980793543f9ED67124229dAeE2", decimals: 18 },
  { symbol: "NULL", address: "0xF3499196F8bd6E6d499a5A68dbeD30C78137e940", decimals: 6 },
  { symbol: "MRKL", address: "0x9c98C243978240C43A151fd1ebBD5DCb40BE5624", decimals: 18 },
  { symbol: "ENIG", address: "0x282F06BdE6E660d62a17B9A651a84e1CFEDD3927", decimals: 18 },
];
const ERC20 = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function main() {
  // Prefer PRIVATE_KEY env var; otherwise load DEPLOYER_PRIVATE_KEY from TEE/.env.
  const pk = process.env.PRIVATE_KEY || fromEnvFile("DEPLOYER_PRIVATE_KEY");
  const to = process.argv[2];
  const nativeAmt = process.argv[3] || "10";
  const tokenAmt = process.argv[4] || "10000";

  if (!pk) throw new Error("No key found — set PRIVATE_KEY or add DEPLOYER_PRIVATE_KEY to TEE/.env");
  if (!ethers.isAddress(to)) throw new Error(`Pass a recipient address as the first arg. Got: ${to}`);

  const provider = new ethers.JsonRpcProvider(RPC, { chainId: 114, name: "coston2" }, { staticNetwork: true });
  const wallet = new ethers.Wallet(pk, provider);
  console.log(`From: ${wallet.address}`);
  console.log(`To:   ${to}`);
  console.log(`Sending ${nativeAmt} C2FLR + ${tokenAmt} of each of ${TOKENS.length} tokens\n`);

  // Native C2FLR
  try {
    const tx = await wallet.sendTransaction({ to, value: ethers.parseEther(nativeAmt) });
    await tx.wait();
    console.log(`✓ C2FLR  ${nativeAmt.padStart(8)}  ${tx.hash}`);
  } catch (e) {
    console.log(`✗ C2FLR  failed: ${e.shortMessage || e.message}`);
  }

  // ERC-20 test tokens (sequential so nonces stay ordered)
  for (const t of TOKENS) {
    try {
      const c = new ethers.Contract(t.address, ERC20, wallet);
      const amount = ethers.parseUnits(tokenAmt, t.decimals);
      const bal = await c.balanceOf(wallet.address);
      if (bal < amount) {
        console.log(`• ${t.symbol.padEnd(4)} skipped — balance ${ethers.formatUnits(bal, t.decimals)} < ${tokenAmt}`);
        continue;
      }
      const tx = await c.transfer(to, amount);
      await tx.wait();
      console.log(`✓ ${t.symbol.padEnd(5)} ${tokenAmt.padStart(8)}  ${tx.hash}`);
    } catch (e) {
      console.log(`✗ ${t.symbol.padEnd(5)} failed: ${e.shortMessage || e.message}`);
    }
  }
  console.log("\nDone.");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
