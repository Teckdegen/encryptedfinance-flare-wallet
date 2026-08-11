import { ethers } from "ethers";
import type { WalletClient } from "viem";

/** Bridge a wagmi/viem WalletClient to an ethers v6 signer. */
export function walletClientToSigner(walletClient: WalletClient): ethers.JsonRpcSigner {
  const { account, chain, transport } = walletClient;
  if (!account || !chain) throw new Error("wallet not connected");
  const provider = new ethers.BrowserProvider(transport as ethers.Eip1193Provider, {
    chainId: chain.id,
    name: chain.name,
  });
  return new ethers.JsonRpcSigner(provider, account.address);
}
