/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:      '#0F1B2D',
        paper:    '#F7F8FA',
        surface:  '#FFFFFF',
        line:     '#E2E6EC',
        muted:    '#5B6677',
        accent:   '#0E7C86',
        'accent-soft': '#E6F2F3',
        signal:   '#16B5C2',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
