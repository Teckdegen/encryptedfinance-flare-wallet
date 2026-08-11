"use client";
import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme, connectorsForWallets } from "@rainbow-me/rainbowkit";
import { metaMaskWallet, injectedWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defineChain } from "viem";
import { ReactNode, useEffect } from "react";
import { COSTON2 } from "./lib/contracts";

const coston2 = defineChain(COSTON2);

// MetaMask-first. We deliberately avoid getDefaultConfig (it bundles Coinbase +
// WalletConnect connectors that race MetaMask on window.ethereum and drag broken
// optional deps). metaMaskWallet uses EIP-6963 to target the real MetaMask
// provider even when other wallet extensions are installed.
const connectors = connectorsForWallets(
  [{ groupName: "Connect", wallets: [metaMaskWallet, injectedWallet, walletConnectWallet] }],
  { appName: "Encrypted Finance", projectId: "ENCRYPTEDFI_COSTON2_BETA" },
);

const config = createConfig({
  chains: [coston2],
  connectors,
  transports: { [coston2.id]: http(coston2.rpcUrls.default.http[0]) },
  ssr: true,
});

const queryClient = new QueryClient();

/** Swallow benign injected-wallet rejections so Next's dev overlay stays quiet. */
function useSuppressWalletNoise() {
  useEffect(() => {
    const isNoise = (m: unknown) => {
      const s = String((m as { message?: string })?.message ?? m ?? "");
      return /failed to connect to metamask|inpage\.js|page\.js|user rejected|resource unavailable|already pending|connector not found|not been authorized|not authorized|authorized yet|subwallet/i.test(s);
    };
    const onRej = (e: PromiseRejectionEvent) => { if (isNoise(e.reason)) { e.preventDefault(); e.stopImmediatePropagation(); } };
    const onErr = (e: ErrorEvent) => { if (isNoise(e.error ?? e.message)) { e.preventDefault(); e.stopImmediatePropagation(); } };
    window.addEventListener("unhandledrejection", onRej, true);
    window.addEventListener("error", onErr, true);
    return () => {
      window.removeEventListener("unhandledrejection", onRej, true);
      window.removeEventListener("error", onErr, true);
    };
  }, []);
}

export function Providers({ children }: { children: ReactNode }) {
  useSuppressWalletNoise();
  return (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({ accentColor: "#ffffff", accentColorForeground: "#000000", borderRadius: "large", overlayBlur: "small" })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
