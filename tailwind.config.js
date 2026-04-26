/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        leaf: {
          50: '#f1faf2',
          100: '#dff3e2',
          500: '#4caf50',
          600: '#3b8f3f',
          700: '#2e7031',
        },
        soil: {
          500: '#8d6e63',
          700: '#5d4037',
        },
      },
      fontSize: {
        'tap': '1.25rem',
      },
    },
  },
  plugins: [],
};
