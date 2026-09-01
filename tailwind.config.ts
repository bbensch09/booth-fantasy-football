import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F1F3EF",
        surface: "#FBFCFA",
        ink: "#191D19",
        muted: "#6B7268",
        rule: "#D5DAD2",
        crimson: "#A8232C",
        gold: "#C9A227",
        teal: "#2F6F6A"
      },
      fontFamily: {
        display: ["Archivo", "system-ui", "sans-serif"],
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
export default config;
