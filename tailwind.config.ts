import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#000000",
        panel: "#16140f",
        ink: "#ECE3D0",
        cream: "#ECE3D0",
        muted: "#8f887a",
        success: "#7ED9A0",
        danger: "#F06A6A",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
