#!/usr/bin/env bash
echo "[t] waiting 8min for provider pickup... ($(date -u +%T))"
sleep 480
echo "[t] firing swap ($(date -u +%T))"
for i in 1 2 3; do out=$(timeout 70 npx --yes tsx ./ttswap.ts 2>&1 | tail -1); echo "$out" | grep -q jobId && { echo "SWAP: $out"; break; }; sleep 6; done
sleep 130
VAULT=0x5296df6E4285f6e8c4F7960f0D2a050C7E4D2823; NS=0xd13faa8100906cf559aebacf9c16532cfc9708645c198c8f15798ee049dbcfc1
echo "[t] NoteSpent: $(curl -s --max-time 20 "https://coston2-explorer.flare.network/api?module=logs&action=getLogs&address=$VAULT&topic0=$NS&fromBlock=0&toBlock=latest" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log((JSON.parse(s).result||[]).length,"(4+ = swap SETTLED)")}catch(e){console.log("net")}})')"
echo "[t] done ($(date -u +%T))"
