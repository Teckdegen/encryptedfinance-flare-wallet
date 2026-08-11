import { ethers } from "ethers";
import { FAUCET, TOKENS } from "./app/lib/contracts";
const RPC = "https://coston2-api.flare.network/ext/C/rpc";
const FA = ["function dripCount() view returns (uint256)","function drips(uint256) view returns (address token, uint256 amount, bool active)","function cooldown() view returns (uint256)"];
const ERC20 = ["function balanceOf(address) view returns (uint256)","function symbol() view returns (string)","function decimals() view returns (uint8)"];
async function main(){
  const p=new ethers.JsonRpcProvider(RPC,{chainId:114,name:"c2"},{staticNetwork:true});
  const f=new ethers.Contract(FAUCET,FA,p);
  const n=Number(await f.dripCount()); const cd=Number(await f.cooldown());
  console.log("faucet",FAUCET,"| drips:",n,"| cooldown:",cd/3600,"h");
  const sym=(a:string)=>TOKENS.find(t=>t.address.toLowerCase()===a.toLowerCase());
  let deliverable=0;
  for(let i=0;i<n;i++){
    const d=await f.drips(i); const t=sym(d.token);
    const erc=new ethers.Contract(d.token,ERC20,p);
    const bal=await erc.balanceOf(FAUCET) as bigint; const dec=t?.decimals??18;
    const canPay = bal>=d.amount ? d.amount : bal;
    if(canPay>0n && d.active) deliverable++;
    console.log(`  drip ${i}: ${t?.symbol??d.token} active=${d.active} amount=${ethers.formatUnits(d.amount,dec)} reserve=${ethers.formatUnits(bal,dec)} ${canPay>0n&&d.active?"✅ pays":"❌ empty/inactive"}`);
  }
  console.log(`\n${deliverable}/${n} drips will deliver on claimAll.`);
}
main().catch(e=>console.error("FATAL:",e.message||e));
