/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#fdf2f6',
          100: '#fce7ef',
          200: '#fad0e0',
          300: '#f6a8c5',
          400: '#ef72a0',
          500: '#e4467c',
          600: '#d02660',
          700: '#ae1a4d',
          800: '#8f1840',
          900: '#6B1E3C',
          950: '#420e22',
        },
        gold: {
          50:  '#fdf9ec',
          100: '#faf0cc',
          200: '#f5df99',
          300: '#eec85d',
          400: '#e9b23a',
          500: '#C9A24B',
          600: '#b8892a',
          700: '#986824',
          800: '#7c5224',
          900: '#664422',
        },
      },
    },
  },
  plugins: [],
}
