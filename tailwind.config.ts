import type { Config } from "tailwindcss";

// 10xImpact brand palette — sourced from 10ximpact.co
const brand = {
  teal: {
    50:  "#edf5f4",
    100: "#d0e8e6",
    200: "#a4d4d0",
    300: "#6cbab5",
    400: "#3a9e99",
    500: "#0f8a80",
    600: "#086c64",  // --teal (primary)
    700: "#084f4a",  // --teal-dark
    800: "#063b37",
    900: "#042a27",
    950: "#021615",
  },
};

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        teal: brand.teal,
      },
      fontFamily: {
        sans:    ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Montserrat", "sans-serif"],
      },
      animation: {
        "fade-up":  "fadeUp .4s ease both",
        "slide-in": "slideIn .3s ease both",
      },
      keyframes: {
        fadeUp:  { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        slideIn: { from: { opacity: "0", transform: "translateX(-8px)" }, to: { opacity: "1", transform: "translateX(0)" } },
      },
    },
  },
  plugins: [],
};

export default config;
