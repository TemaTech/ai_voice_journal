/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        'zen-bg': '#F2F2F7', // iOS系オフホワイト
        'zen-bg-dark': '#1C1C1E',
        'glass-border': 'rgba(255, 255, 255, 0.2)',
        'glass-surface': 'rgba(255, 255, 255, 0.65)',
        'liquid-primary': '#7C4DFF',
        'liquid-accent': '#FFD93D',
      },
      fontFamily: {
        'zen': ['System', 'sans-serif'], // Noto Sans JPがなければSystem
      }
    },
  },
  plugins: [],
}
