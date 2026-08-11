import { ethers } from "ethers";
import { COSTON2 } from "../contracts";

let _p: ethers.JsonRpcProvider | null = null;

/**
 * A read-only provider pinned to Coston2. All view calls (token balances, note
 * isSpent checks, vault lookups, proof verification) go through this instead of
 * window.ethereum, so reads never return 0 just because the wallet happens to be
 * pointed at another network. Writes still go through the connected signer.
 */
export function coston2Provider(): ethers.JsonRpcProvider {
  if (!_p) {
    _p = new ethers.JsonRpcProvider(
      COSTON2.rpcUrls.default.http[0],
      { chainId: COSTON2.id, name: COSTON2.name },
      { staticNetwork: true },
    );
  }
  return _p;
}
