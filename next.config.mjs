/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: ".next",
  webpack: (config) => {
    // RainbowKit → wagmi/connectors → @base-org/account → @coinbase/cdp-sdk
    // pulls optional deps that aren't installable (x402 payments, react-native
    // async-storage, pino-pretty). The wallet never uses them — stub to empty
    // so the build resolves.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core": false,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/evm/exact/client": false,
      "@x402/evm/upto/client": false,
      "@x402/svm": false,
      "@x402/svm/exact/client": false,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
      encoding: false,
    };
    return config;
  },
};
export default nextConfig;
