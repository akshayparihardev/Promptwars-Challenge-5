/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#faf7f2',
        card: '#ffffff',
        ink: { DEFAULT: '#2b2622', soft: '#5c534b' },
        line: '#e6dfd5',
        accent: { DEFAULT: '#0e5a5f', dark: '#0a4247', soft: '#e3f0ef' },
        ok: '#2f6b45',
        warn: { DEFAULT: '#b3261e', soft: '#fdecea' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
