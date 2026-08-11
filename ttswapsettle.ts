import fs from "fs"; import path from "path"; import { ethers } from "ethers";
const store=new Map<string,string>();
(globalThis as any).localStorage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v),removeItem:(k:string)=>void store.delete(k)};
(globalThis as any).window={localStorage:(globalThis as any).localStorage};
import { EfiClient } from "./app/lib/efi/client";
import { deriveSpendingKey } from "./app/lib/efi/crypto";
import { PROTOCOL, VAULT, TOKENS } from "./app/lib/contracts";
function key(){const l=fs.readFileSync(path.join(__dirname,"..",".env"),"utf8").split(/\r?\n/).find(x=>x.startsWith("DEPLOYER_PRIVATE_KEY="));return l!.split("=")[1].trim().replace(/^["']|["']$/g,"");}
const NS="0xd13faa8100906cf559aebacf9c16532cfc9708645c198c8f15798ee049dbcfc1";
async function nsc(){const j=await(await fetch(`https://coston2-explorer.flare.network/api?module=logs&action=getLogs&address=${VAULT}&topic0=${NS}&fromBlock=0&toBlock=latest`)).json();return (j.result||[]).length;}
async function main(){
  const p=new ethers.JsonRpcProvider("https://coston2-api.flare.network/ext/C/rpc",{chainId:114,name:"c2"},{staticNetwork:true});
  const w=new ethers.Wallet(key(),p); const GHST=TOKENS.find(t=>t.symbol==="GHST")!; const CIPH=TOKENS.find(t=>t.symbol==="CIPH")!;
  const c=await EfiClient.connect(w,{teeUrl:"https://extension-tee-production.up.railway.app",protocolAddress:PROTOCOL,chainId:114});
  const sk=ethers.hexlify(await deriveSpendingKey(w));
  const n=(await c.scanNotes(sk)).filter(x=>x.token.toLowerCase()===GHST.address.toLowerCase()).sort((a,b)=>Number(b.amount-a.amount))[0];
  const base=await nsc(); console.log("GHST note",ethers.formatUnits(n.amount,6),"| NoteSpent base",base);
  const r=await c.swap(n,CIPH.address,ethers.parseUnits("5",6)); console.log("SWAP jobId",r.jobId||r.txHash);
  for(let i=0;i<25;i++){await new Promise(r=>setTimeout(r,12000));const c2=await nsc();console.log(`t+${(i+1)*12}s NoteSpent=${c2}`);if(c2>base){console.log("SWAP SETTLED ✅  delivery = 100%");return;}}
  console.log("SWAP NOT settled after 5min ❌");
}
main().catch(e=>console.error("FATAL:",e.message||e));
