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
  const w=new ethers.Wallet(key(),p); const GHST=TOKENS.find(t=>t.symbol==="GHST")!;
  const c=await EfiClient.connect(w,{teeUrl:"https://extension-tee-production.up.railway.app",protocolAddress:PROTOCOL,chainId:114});
  const sk=ethers.hexlify(await deriveSpendingKey(w)); await c.registerKey(await deriveSpendingKey(w)).catch(()=>{});
  let notes=await c.scanNotes(sk); let n=notes.find(x=>x.token.toLowerCase()===GHST.address.toLowerCase());
  if(!n){console.log("no note — shielding 100 GHST first…");await c.shield(GHST.address,ethers.parseUnits("100",6),new ethers.SigningKey(sk).compressedPublicKey);await new Promise(r=>setTimeout(r,6000));notes=await c.scanNotes(sk);n=notes.find(x=>x.token.toLowerCase()===GHST.address.toLowerCase());}
  console.log("note:",n?ethers.formatUnits(n.amount,6):"none");
  const res=await c.privateTransfer(n!,"0x000000000000000000000000000000000000dEaD",ethers.parseUnits("10",6));
  console.log("submitted:",JSON.stringify(res));
  const NS=ethers.id("NoteSpent(bytes32)");
  for(let i=0;i<16;i++){await new Promise(r=>setTimeout(r,12000));
    const j=await(await fetch(`https://coston2-explorer.flare.network/api?module=logs&action=getLogs&address=${VAULT}&topic0=${NS}&fromBlock=0&toBlock=latest`)).json();
    const ns=(j.result||[]).length; console.log(`t+${(i+1)*12}s NoteSpent=${ns}`);
    if(ns>0){console.log("SETTLED_OK");return;}}
  console.log("NOT_SETTLED");
}
main().catch(e=>console.error("FATAL:",e.message||e));
