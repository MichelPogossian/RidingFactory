/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ocean: {
          50: "#eef9fc",
          100: "#d5f0f7",
          200: "#b0e2ef",
          300: "#79cce3",
          400: "#3bacd0",
          500: "#1f8fb5",
          600: "#1d7398",
          700: "#1e5d7c",
          800: "#204e66",
          900: "#1f4257",
          950: "#0f2a3a",
        },
        sand: {
          50: "#fbf8f1",
          100: "#f5eedc",
          200: "#eadbb6",
          300: "#dcc188",
          400: "#cfa65f",
          500: "#c39043",
          600: "#b17838",
          700: "#935e30",
          800: "#784c2d",
          900: "#624027",
        },
      },
      fontFamily: {
        display: ['"Sora"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,42,58,.06), 0 8px 24px -12px rgba(16,42,58,.18)",
      },
    },
  },
  plugins: [],
};
