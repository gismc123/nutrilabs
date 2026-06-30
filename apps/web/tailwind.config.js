import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          300: '#86efac',
          600: '#16a34a',
          900: '#14532d',
        },
        accent: {
          50:  '#fffbeb',
          100: '#fef3c7',
          300: '#fcd34d',
          600: '#d97706',
          900: '#78350f',
        },
        danger: colors.red,
        neutral: colors.slate,
      },
    },
  },
  plugins: [],
};
