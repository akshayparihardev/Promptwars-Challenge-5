/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#faf6f0',
        card: '#ffffff',
        ink: { DEFAULT: '#2a2420', soft: '#5f554d' },
        line: '#e8dfd3',
        accent: { DEFAULT: '#5e2750', dark: '#471c3c', soft: '#f4eaf1' },
        ok: '#2f6b45',
        warn: { DEFAULT: '#b3261e', soft: '#fdecea' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(42, 36, 32, 0.05), 0 6px 18px -8px rgba(42, 36, 32, 0.12)',
      },
      transitionTimingFunction: { out: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    },
  },
  plugins: [],
};
