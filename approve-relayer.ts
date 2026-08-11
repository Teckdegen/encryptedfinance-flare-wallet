// Whitelist the TEE hot wallet as an authorized relayer on the protocol.
// Fixes "EFP: not relayer" reverts. Governor-only (deployer key 0xdb4034).
//   cd TEE/test-frontend && npx tsx approve-relayer.ts
import fs from "fs"; import path from "path"; import { ethers } from "ethers";
import { PROTOCOL } from "./app/lib/contracts";

const HOT = "0x5cdAf8Feaaeb9e81D11eb2091633Ff3E2f33d046"; // TEE node signer
const RPC = "https://coston2-api.flare.network/ext/C/rpc";
const ABI = [
  "function setRelayer(address relayer, bool approved) external",
  "function isRelayer(address) view returns (bool)",
  "function governor() view returns (address)",
];
function key(){const l=fs.readFileSync(path.join(__dirname,"..",".env"),"utf8").split(/\r?\n/).find(x=>x.startsWith("DEPLOYER_PRIVATE_KEY="));return l!.split("=")[1].trim().replace(/^["']|["']$/g,"");}

async function main(){
  const p=new ethers.JsonRpcProvider(RPC,{chainId:114,name:"c2"},{staticNetwork:true});
  const w=new ethers.Wallet(key(),p);
  const c=new ethers.Contract(PROTOCOL,ABI,w);
  console.log("signer:",w.address,"\nprotocol:",PROTOCOL,"\nhot wallet:",HOT);
  const gov=await c.governor(); console.log("governor on-chain:",gov);
  if(gov.toLowerCase()!==w.address.toLowerCase()){
    console.error(`❌ ABORT: your key (${w.address}) is not governor (${gov}). setRelayer is governor-only.`); process.exit(1);
  }
  const before=await c.isRelayer(HOT); console.log("isRelayer before:",before);
  if(before){console.log("✅ already a relayer — nothing to do."); return;}
  const tx=await c.setRelayer(HOT,true); console.log("setRelayer tx",tx.hash,"..."); await tx.wait();
  const after=await c.isRelayer(HOT); console.log("isRelayer after:",after, after?"✅ approved":"❌ still not");
}
main().catch(e=>console.error("FATAL:",e.message||e));
