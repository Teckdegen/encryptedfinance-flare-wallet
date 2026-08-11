// Whitelist the Spark swap router + cToken lending markets on the protocol.
// Fixes "EFP: router not whitelisted" / "market not whitelisted". Governor-only.
//   cd TEE/test-frontend && npx tsx whitelist-protocols.ts
import fs from "fs"; import path from "path"; import { ethers } from "ethers";
import { PROTOCOL, CTOKENS } from "./app/lib/contracts";

const RPC = "https://coston2-api.flare.network/ext/C/rpc";
const SPARK_ROUTER = "0x76f4ff5dc77355fb1a4feb6fcdd8d6207aac0410";
const TARGETS: { label: string; addr: string }[] = [
  { label: "SPARK_ROUTER", addr: SPARK_ROUTER },
  ...CTOKENS.map((c) => ({ label: c.symbol, addr: c.address })),
];
const ABI = [
  "function setProtocolWhitelist(address _protocol, bool approved) external",
  "function isWhitelistedProtocol(address) view returns (bool)",
  "function governor() view returns (address)",
];
function key(){const l=fs.readFileSync(path.join(__dirname,"..",".env"),"utf8").split(/\r?\n/).find(x=>x.startsWith("DEPLOYER_PRIVATE_KEY="));return l!.split("=")[1].trim().replace(/^["']|["']$/g,"");}

async function main(){
  const p=new ethers.JsonRpcProvider(RPC,{chainId:114,name:"c2"},{staticNetwork:true});
  const w=new ethers.Wallet(key(),p);
  const c=new ethers.Contract(PROTOCOL,ABI,w);
  console.log("signer:",w.address,"protocol:",PROTOCOL);
  const gov=await c.governor();
  if(gov.toLowerCase()!==w.address.toLowerCase()){console.error(`❌ ABORT: your key is not governor (${gov}).`);process.exit(1);}
  for(const t of TARGETS){
    const a=ethers.getAddress(t.addr);
    const already=await c.isWhitelistedProtocol(a);
    if(already){console.log(`  skip ${t.label} ${a} (already whitelisted)`);continue;}
    const tx=await c.setProtocolWhitelist(a,true); console.log(`  whitelist ${t.label} ${a} -> ${tx.hash} ...`); await tx.wait();
    const ok=await c.isWhitelistedProtocol(a); console.log(`    ${ok?"✅":"❌"} ${t.label}`);
  }
  console.log("\ndone.");
}
main().catch(e=>console.error("FATAL:",e.message||e));
