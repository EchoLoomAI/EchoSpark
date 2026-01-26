/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#2badee",
        secondary: "#ee8c2b",
        "background-light": "#f6f7f8",
        "background-dark": "#101c22",
      },
      fontFamily: {
        sans: ["Noto Sans SC", "sans-serif"],
        display: ["Lexend", "Noto Sans SC", "sans-serif"],
        serif: ["Noto Serif SC", "serif"],
        condensed: ["Roboto Condensed", "sans-serif"],
      },
      borderRadius: {
        "DEFAULT": "1rem",
        "lg": "2rem",
        "xl": "3rem",
        "full": "9999px"
      }
    },
  },
  plugins: [],
}
