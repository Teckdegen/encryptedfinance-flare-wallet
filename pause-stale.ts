// Pause the 5 stale PRODUCTION machines on extension 66038, leaving only the
// live one (0x2270C924) active. Fixes getRandomTeeIds dispatching to dead
// machines. Run with the MACHINE OWNER key (0xdb4034...).
//
//   cd TEE/test-frontend && npx tsx pause-stale.ts
//
// Reads the owner key from TEE/.env (DEPLOYER_PRIVATE_KEY). This script signs
// pause() txs with YOUR key on YOUR machine; the key is never printed or sent
// anywhere except the Coston2 RPC as a normal signed transaction.

import fs from "fs";
import path from "path";
import { ethers } from "ethers";

const RPC = "https://coston2-api.flare.network/ext/C/rpc";
const DIAMOND = "0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE"; // FlareTeeManager

// The one machine your node actually holds — MUST stay active, never paused.
const LIVE = "0x2270C924a6b587C91831630E49583dE48b4732b8";

// The five stale PRODUCTION zombies to pause (all owned by 0xdb4034, same URL).
const STALE = [
  "0xdEe1092dd84b2ce2446c4a45E89644cD4A916E26",
  "0xE41A63C0975D9Da7E68Ae83B5b5Bc7c677f8B819",
  "0x479259930c8C9d262Efbc7Db044943048a16f9ED",
  "0x7a5ad4960d983503F07dF490859Cb16Dbb170422",
  "0x7978635BB99A8e402083E55B40e11AD8B67047d5",
];

const STATUS = ["NONE", "INITIALIZED", "PRODUCTION", "SUSPENDED", "PAUSED", "BANNED"];

const ABI = [
  "function pause(address _teeId)",
  "function getTeeMachineStatus(address) view returns (uint8)",
  "function getTeeMachineOwner(address) view returns (address)",
  "function getActiveTeeMachines(uint256) view returns (address[] teeIds, string[] urls)",
];

function ownerKey(): string {
  const l = fs
    .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split(/\r?\n/)
    .find((x) => x.startsWith("DEPLOYER_PRIVATE_KEY="));
  if (!l) throw new Error("DEPLOYER_PRIVATE_KEY not found in TEE/.env");
  return l.split("=")[1].trim().replace(/^["']|["']$/g, "");
}

async function statusOf(c: ethers.Contract, id: string): Promise<number> {
  try {
    return Number(await c.getTeeMachineStatus(id));
  } catch {
    return -1;
  }
}

async function main() {
  const p = new ethers.JsonRpcProvider(RPC, { chainId: 114, name: "c2" }, { staticNetwork: true });
  const w = new ethers.Wallet(ownerKey(), p);
  const c = new ethers.Contract(DIAMOND, ABI, w);

  console.log("signer:", w.address);

  // Confirm this key actually owns the machines before signing anything.
  const owner = await c.getTeeMachineOwner(ethers.getAddress(LIVE));
  console.log("machine owner on-chain:", owner);
  if (owner.toLowerCase() !== w.address.toLowerCase()) {
    console.error(
      `\n❌ ABORT: your key (${w.address}) is NOT the machine owner (${owner}).\n` +
        `   pause() is owner-only. Put the owner key (0xdb4034...) in TEE/.env as DEPLOYER_PRIVATE_KEY and rerun.`
    );
    process.exit(1);
  }

  console.log("\n=== status BEFORE ===");
  console.log(`  LIVE  ${LIVE}  ->  ${STATUS[await statusOf(c, ethers.getAddress(LIVE))] ?? "?"}`);
  for (const id of STALE) {
    console.log(`  stale ${id}  ->  ${STATUS[await statusOf(c, ethers.getAddress(id))] ?? "?"}`);
  }

  console.log("\n=== pausing stale machines ===");
  for (const raw of STALE) {
    const id = ethers.getAddress(raw);
    const st = await statusOf(c, id);
    if (st === 4 || st === 5) {
      console.log(`  skip ${id} (already ${STATUS[st]})`);
      continue;
    }
    try {
      const tx = await c.pause(id);
      console.log(`  pause ${id} -> tx ${tx.hash} ...`);
      await tx.wait();
      const after = await statusOf(c, id);
      console.log(`    now ${STATUS[after] ?? after} ${after === 4 ? "✅" : "⚠️"}`);
    } catch (e: any) {
      console.error(`    ❌ pause failed for ${id}: ${e.shortMessage || e.message || e}`);
    }
  }

  console.log("\n=== active set AFTER (extension 66038) ===");
  try {
    const out = await c.getActiveTeeMachines(66038n);
    const ids: string[] = out.teeIds ?? out[0];
    if (!ids || ids.length === 0) console.log("  (none)");
    for (const id of ids) {
      const tag = id.toLowerCase() === LIVE.toLowerCase() ? "  <-- LIVE (keep)" : "  <-- still active?!";
      console.log(`  ${id}${tag}`);
    }
    if (ids.length === 1 && ids[0].toLowerCase() === LIVE.toLowerCase()) {
      console.log("\n✅ DONE. Active set = 1 live machine. Delivery back to 100%.");
    } else {
      console.log("\n⚠️ Active set is not exactly [LIVE]. Re-check the statuses above.");
    }
  } catch (e: any) {
    console.log("  (getActiveTeeMachines not readable via this ABI — check statuses above instead)");
  }
}

main().catch((e) => console.error("FATAL:", e.message || e));
