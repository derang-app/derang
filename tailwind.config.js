/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
      height: { 22: '5.5rem' },
    },
  },
  plugins: [],
};
