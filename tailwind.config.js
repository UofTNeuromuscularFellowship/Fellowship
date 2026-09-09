/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Class-based rather than media-based: the toggle has to be able to override
  // the operating system, not merely follow it.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink:      'rgb(var(--c-ink) / <alpha-value>)',
        paper:    'rgb(var(--c-paper) / <alpha-value>)',
        surface:  'rgb(var(--c-surface) / <alpha-value>)',
        line:     'rgb(var(--c-line) / <alpha-value>)',
        muted:    'rgb(var(--c-muted) / <alpha-value>)',
        accent:   'rgb(var(--c-accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        signal:   'rgb(var(--c-signal) / <alpha-value>)',

        // Only the shades the app actually uses are redefined. Anything else
        // keeps Tailwind's stock value, so an unlisted class is a visible
        // mistake in dark mode rather than a silent one.
        amber: {
          50: 'rgb(var(--c-amber-50) / <alpha-value>)',
          100: 'rgb(var(--c-amber-100) / <alpha-value>)',
          300: 'rgb(var(--c-amber-300) / <alpha-value>)',
          400: 'rgb(var(--c-amber-400) / <alpha-value>)',
          600: 'rgb(var(--c-amber-600) / <alpha-value>)',
          700: 'rgb(var(--c-amber-700) / <alpha-value>)',
          800: 'rgb(var(--c-amber-800) / <alpha-value>)',
          900: 'rgb(var(--c-amber-900) / <alpha-value>)',
        },
        blue: {
          100: 'rgb(var(--c-blue-100) / <alpha-value>)',
          800: 'rgb(var(--c-blue-800) / <alpha-value>)',
        },
        cyan: {
          50: 'rgb(var(--c-cyan-50) / <alpha-value>)',
          100: 'rgb(var(--c-cyan-100) / <alpha-value>)',
          900: 'rgb(var(--c-cyan-900) / <alpha-value>)',
        },
        emerald: {
          50: 'rgb(var(--c-emerald-50) / <alpha-value>)',
          100: 'rgb(var(--c-emerald-100) / <alpha-value>)',
          500: 'rgb(var(--c-emerald-500) / <alpha-value>)',
          600: 'rgb(var(--c-emerald-600) / <alpha-value>)',
          900: 'rgb(var(--c-emerald-900) / <alpha-value>)',
        },
        fuchsia: {
          50: 'rgb(var(--c-fuchsia-50) / <alpha-value>)',
          100: 'rgb(var(--c-fuchsia-100) / <alpha-value>)',
          900: 'rgb(var(--c-fuchsia-900) / <alpha-value>)',
        },
        indigo: {
          50: 'rgb(var(--c-indigo-50) / <alpha-value>)',
          100: 'rgb(var(--c-indigo-100) / <alpha-value>)',
          800: 'rgb(var(--c-indigo-800) / <alpha-value>)',
          900: 'rgb(var(--c-indigo-900) / <alpha-value>)',
        },
        lime: {
          50: 'rgb(var(--c-lime-50) / <alpha-value>)',
          100: 'rgb(var(--c-lime-100) / <alpha-value>)',
          900: 'rgb(var(--c-lime-900) / <alpha-value>)',
        },
        orange: {
          50: 'rgb(var(--c-orange-50) / <alpha-value>)',
          100: 'rgb(var(--c-orange-100) / <alpha-value>)',
          900: 'rgb(var(--c-orange-900) / <alpha-value>)',
        },
        purple: {
          100: 'rgb(var(--c-purple-100) / <alpha-value>)',
          800: 'rgb(var(--c-purple-800) / <alpha-value>)',
        },
        red: {
          50: 'rgb(var(--c-red-50) / <alpha-value>)',
          200: 'rgb(var(--c-red-200) / <alpha-value>)',
          300: 'rgb(var(--c-red-300) / <alpha-value>)',
          500: 'rgb(var(--c-red-500) / <alpha-value>)',
          600: 'rgb(var(--c-red-600) / <alpha-value>)',
          700: 'rgb(var(--c-red-700) / <alpha-value>)',
        },
        rose: {
          50: 'rgb(var(--c-rose-50) / <alpha-value>)',
          100: 'rgb(var(--c-rose-100) / <alpha-value>)',
          300: 'rgb(var(--c-rose-300) / <alpha-value>)',
          400: 'rgb(var(--c-rose-400) / <alpha-value>)',
          600: 'rgb(var(--c-rose-600) / <alpha-value>)',
          900: 'rgb(var(--c-rose-900) / <alpha-value>)',
        },
        sky: {
          50: 'rgb(var(--c-sky-50) / <alpha-value>)',
          100: 'rgb(var(--c-sky-100) / <alpha-value>)',
          900: 'rgb(var(--c-sky-900) / <alpha-value>)',
        },
        stone: {
          100: 'rgb(var(--c-stone-100) / <alpha-value>)',
          200: 'rgb(var(--c-stone-200) / <alpha-value>)',
          900: 'rgb(var(--c-stone-900) / <alpha-value>)',
        },
        teal: {
          50: 'rgb(var(--c-teal-50) / <alpha-value>)',
          100: 'rgb(var(--c-teal-100) / <alpha-value>)',
          900: 'rgb(var(--c-teal-900) / <alpha-value>)',
        },
        violet: {
          50: 'rgb(var(--c-violet-50) / <alpha-value>)',
          100: 'rgb(var(--c-violet-100) / <alpha-value>)',
          900: 'rgb(var(--c-violet-900) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
