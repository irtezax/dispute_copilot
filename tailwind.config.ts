import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070b12",
          900: "#0b111c",
          850: "#0f1624",
          800: "#141d2e",
          700: "#1d2940",
          600: "#2a3a57",
        },
        signal: {
          DEFAULT: "#2ee6a8",
          dim: "#19b98a",
          faint: "rgba(46, 230, 168, 0.12)",
        },
        alert: {
          DEFAULT: "#f5a524",
          faint: "rgba(245, 165, 36, 0.12)",
        },
        danger: {
          DEFAULT: "#f0455f",
          faint: "rgba(240, 69, 95, 0.12)",
        },
        fintech: {
          DEFAULT: "#3b82f6",
          faint: "rgba(59, 130, 246, 0.12)",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "SF Mono",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;