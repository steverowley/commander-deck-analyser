/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Playfair Display', 'EB Garamond', 'Georgia', 'Times New Roman', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
