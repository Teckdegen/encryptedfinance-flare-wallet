import fs from "fs"; import path from "path"; import { ethers } from "ethers";
const store=new Map<string,string>();
(globalThis as any).localStorage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v),removeItem:(k:string)=>void store.delete(k)};
(globalThis as any).window={localStorage:(globalThis as any).localStorage};
import { EfiClient } from "./app/lib/efi/client";
import { deriveSpendingKey } from "./app/lib/efi/crypto";
import { PROTOCOL, TOKENS } from "./app/lib/contracts";
function key(){const l=fs.readFileSync(path.join(__dirname,"..",".env"),"utf8").split(/\r?\n/).find(x=>x.startsWith("DEPLOYER_PRIVATE_KEY="));return l!.split("=")[1].trim().replace(/^["']|["']$/g,"");}
async function main(){
  const p=new ethers.JsonRpcProvider("https://coston2-api.flare.network/ext/C/rpc",{chainId:114,name:"c2"},{staticNetwork:true});
  const w=new ethers.Wallet(key(),p); const GHST=TOKENS.find(t=>t.symbol==="GHST")!; const CIPH=TOKENS.find(t=>t.symbol==="CIPH")!;
  const c=await EfiClient.connect(w,{teeUrl:"https://extension-tee-production.up.railway.app",protocolAddress:PROTOCOL,chainId:114});
  const sk=ethers.hexlify(await deriveSpendingKey(w)); 
  const n=(await c.scanNotes(sk)).filter(x=>x.token.toLowerCase()===GHST.address.toLowerCase()).sort((a,b)=>Number(b.amount-a.amount))[0];
  const r=await c.swap(n,CIPH.address,ethers.parseUnits("5",6)); console.log("SWAP submitted jobId:",r.jobId||r.txHash);
}
main().catch(e=>console.error("FATAL:",e.message||e));
