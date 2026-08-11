/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0b0f14',
          800: '#111823',
          700: '#18212e',
          600: '#22303f',
          500: '#31435a',
        },
        accent: {
          DEFAULT: '#38bdf8',
          soft: '#0ea5e9',
        },
        good: '#34d399',
        warn: '#fbbf24',
        bad: '#f87171',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
