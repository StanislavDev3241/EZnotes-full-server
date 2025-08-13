/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "clearly-blue": "#1e40af",
        "clearly-light-blue": "#3b82f6",
      },
    },
  },
  plugins: [],
};
