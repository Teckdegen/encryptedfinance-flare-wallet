import fs from "fs"; import path from "path"; import { ethers } from "ethers";
const store=new Map<string,string>();
(globalThis as any).localStorage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v),removeItem:(k:string)=>void store.delete(k)};
(globalThis as any).window={localStorage:(globalThis as any).localStorage,ethereum:undefined};
import { EfiClient } from "./app/lib/efi/client";
import { deriveSpendingKey } from "./app/lib/efi/crypto";
import { PROTOCOL, VAULT, TOKENS } from "./app/lib/contracts";
function key(){const l=fs.readFileSync(path.join(__dirname,"..",".env"),"utf8").split(/\r?\n/).find(x=>x.startsWith("DEPLOYER_PRIVATE_KEY="));return l!.split("=")[1].trim().replace(/^["']|["']$/g,"");}
async function main(){
  const p=new ethers.JsonRpcProvider("https://coston2-api.flare.network/ext/C/rpc",{chainId:114,name:"c2"},{staticNetwork:true});
  const w=new ethers.Wallet(key(),p); const me=await w.getAddress(); const GHST=TOKENS.find(t=>t.symbol==="GHST")!;
  const c=await EfiClient.connect(w,{teeUrl:"https://extension-tee-production.up.railway.app",protocolAddress:PROTOCOL,chainId:114});
  const sk=ethers.hexlify(await deriveSpendingKey(w)); await c.registerKey(await deriveSpendingKey(w)).catch(()=>{});
  const notes=(await c.scanNotes(sk)).filter(x=>x.token.toLowerCase()===GHST.address.toLowerCase());
  console.log("GHST notes:",notes.length,"total",notes.reduce((a,n)=>a+Number(ethers.formatUnits(n.amount,6)),0));
  // DISCLOSE solvency (direct handle — no settlement needed)
  try{const d=await Promise.race([c.discloseSolvency(me,GHST.address,ethers.parseUnits("1",6),notes),new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout 20s")),20000))]) as any;
    console.log("DISCLOSE solvency: status",d.status, d.status===1?"✅ WORKS":"❌", "proofData:",(d.data||"").slice(0,30));}catch(e:any){console.log("DISCLOSE ❌:",e.message);}
  try{const d=await Promise.race([c.discloseAuditTrail(me,notes.slice(0,2)),new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),20000))]) as any;
    console.log("DISCLOSE audit-trail: status",d.status, d.status===1?"✅ WORKS":"❌");}catch(e:any){console.log("DISCLOSE audit ❌:",e.message);}
}
main().catch(e=>console.error("FATAL:",e.message||e));
