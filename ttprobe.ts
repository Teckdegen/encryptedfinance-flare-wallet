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
  const c:any=await EfiClient.connect(w,{teeUrl:"https://extension-tee-production.up.railway.app",protocolAddress:PROTOCOL,chainId:114});
  const sk=ethers.hexlify(await deriveSpendingKey(w));
  const n=(await c.scanNotes(sk)).filter((x:any)=>x.token.toLowerCase()===GHST.address.toLowerCase()).sort((a:any,b:any)=>Number(b.amount-a.amount))[0];
  // Send SWAP-shaped payload (8 fields) but under opCommand=TRANSFER to test if the opCommand is the delivery gate
  const r=await c.submit("TX","TRANSFER",
    ["bytes32","address","address","uint256","uint256","uint256","uint256","bytes32"],
    [n.noteId,n.token,CIPH.address,n.amount,ethers.parseUnits("5",6),0n,0n,n.salt]);
  console.log("PROBE submitted (SWAP payload under opCommand=TRANSFER):",r.jobId||r.txHash);
}
main().catch(e=>console.error("FATAL:",e.message||e));
