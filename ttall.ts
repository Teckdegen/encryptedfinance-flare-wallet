import fs from "fs"; import path from "path"; import { ethers } from "ethers";
const store=new Map<string,string>();
(globalThis as any).localStorage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v),removeItem:(k:string)=>void store.delete(k)};
(globalThis as any).window={localStorage:(globalThis as any).localStorage,ethereum:undefined};
import { EfiClient } from "./app/lib/efi/client";
import { deriveSpendingKey } from "./app/lib/efi/crypto";
import { PROTOCOL, VAULT, TOKENS, CTOKENS } from "./app/lib/contracts";
function key(){const l=fs.readFileSync(path.join(__dirname,"..",".env"),"utf8").split(/\r?\n/).find(x=>x.startsWith("DEPLOYER_PRIVATE_KEY="));return l!.split("=")[1].trim().replace(/^["']|["']$/g,"");}
const TEE="https://extension-tee-production.up.railway.app";
const NS=ethers.id("NoteSpent(bytes32)");
async function nsCount(){const j=await(await fetch(`https://coston2-explorer.flare.network/api?module=logs&action=getLogs&address=${VAULT}&topic0=${NS}&fromBlock=0&toBlock=latest`)).json();return (j.result||[]).length;}
async function waitSettle(base:number,label:string){for(let i=0;i<16;i++){await new Promise(r=>setTimeout(r,12000));const c=await nsCount();if(c>base){console.log(`  ✅ ${label} SETTLED (NoteSpent ${base}→${c}) at t+${(i+1)*12}s`);return c;}}console.log(`  ❌ ${label} NOT settled after 192s`);return base;}
async function main(){
  const p=new ethers.JsonRpcProvider("https://coston2-api.flare.network/ext/C/rpc",{chainId:114,name:"c2"},{staticNetwork:true});
  const w=new ethers.Wallet(key(),p); const me=await w.getAddress();
  const GHST=TOKENS.find(t=>t.symbol==="GHST")!; const CIPH=TOKENS.find(t=>t.symbol==="CIPH")!; const cGHST=CTOKENS.find(c=>c.symbol==="cGHST")!;
  const c=await EfiClient.connect(w,{teeUrl:TEE,protocolAddress:PROTOCOL,chainId:114});
  const sk=ethers.hexlify(await deriveSpendingKey(w)); await c.registerKey(await deriveSpendingKey(w)).catch(()=>{});
  const getG=async()=>{const ns=await c.scanNotes(sk);return ns.filter(n=>n.token.toLowerCase()===GHST.address.toLowerCase()).sort((a,b)=>Number(b.amount-a.amount))[0];};
  let base=await nsCount(); console.log("start NoteSpent =",base);

  // 1. SWAP 5 GHST -> CIPH
  let n=await getG(); console.log(`\n[1] SWAP 5 GHST->CIPH (note ${ethers.formatUnits(n.amount,6)})`);
  const s1=await c.swap(n,CIPH.address,ethers.parseUnits("5",6)); console.log("  jobId:",s1.jobId||s1.txHash); base=await waitSettle(base,"SWAP");

  // 2. LEND 5 GHST -> cGHST
  await new Promise(r=>setTimeout(r,4000)); n=await getG(); console.log(`\n[2] LEND 5 GHST->cGHST (note ${ethers.formatUnits(n.amount,6)})`);
  const s2=await c.lend(n,cGHST.address,ethers.parseUnits("5",6)); console.log("  jobId:",s2.jobId||s2.txHash); base=await waitSettle(base,"LEND");

  // 3. UNSHIELD 5 GHST -> wallet
  await new Promise(r=>setTimeout(r,4000)); n=await getG(); console.log(`\n[3] UNSHIELD 5 GHST->${me.slice(0,8)} (note ${ethers.formatUnits(n.amount,6)})`);
  const bal0=await new ethers.Contract(GHST.address,["function balanceOf(address) view returns (uint256)"],p).balanceOf(me);
  const s3=await c.unshield(n,me,ethers.parseUnits("5",6)); console.log("  jobId:",s3.jobId||s3.txHash); base=await waitSettle(base,"UNSHIELD");
  const bal1=await new ethers.Contract(GHST.address,["function balanceOf(address) view returns (uint256)"],p).balanceOf(me);
  console.log("  GHST wallet balance:",ethers.formatUnits(bal0,6),"->",ethers.formatUnits(bal1,6));

  // 4. SELECTIVE DISCLOSURE (solvency proof, gasless direct)
  await new Promise(r=>setTimeout(r,4000)); const notes=(await c.scanNotes(sk)).filter(x=>x.token.toLowerCase()===GHST.address.toLowerCase());
  console.log(`\n[4] DISCLOSE solvency >=1 GHST over ${notes.length} note(s)`);
  try{const d=await c.discloseSolvency(me,GHST.address,ethers.parseUnits("1",6),notes); console.log("  status:",d.status,"data:",(d.data||"").slice(0,40),d.status===1?"✅":"❌");}catch(e:any){console.log("  ❌ disclose err:",e.message);}

  // 5. AUDIT TRAIL disclosure
  try{const d=await c.discloseAuditTrail(me,notes.slice(0,2)); console.log(`[5] DISCLOSE audit-trail status: ${d.status} ${d.status===1?"✅":"❌"}`);}catch(e:any){console.log("[5] ❌ audit err:",e.message);}
  console.log("\nDONE");
}
main().catch(e=>console.error("FATAL:",e.message||e));
