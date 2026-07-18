import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Ink scale — warm navy-black of printed briefs (darker = stronger)
        primary: {
          950: '#131a26',
          900: '#1c2433',
          800: '#2a3242',
          700: '#3a4252',
          600: '#4c5364',
          500: '#5c6375',
          400: '#878d9b',
          300: '#c6c8ce',
          200: '#e2e0d8',
          100: '#efece3',
          50: '#f7f5f0',
          DEFAULT: '#131a26',
        },
        brass: {
          DEFAULT: '#96762e',
          bright: '#c9a84c',
        },
        verdigris: {
          DEFAULT: '#2f6f52',
          soft: '#e7efe9',
        },
        oxblood: {
          DEFAULT: '#9e3b31',
          soft: '#f4e6e3',
        },
        democrat: {
          50: '#eef4f9',
          100: '#dde8f2',
          200: '#c2d6e8',
          300: '#93b6d4',
          500: '#3d6d9e',
          600: '#2b5c8a',
          700: '#234d74',
          DEFAULT: '#2b5c8a',
        },
        republican: {
          50: '#f9efed',
          100: '#f2dedb',
          200: '#e5c2bd',
          300: '#d29a92',
          500: '#b0493d',
          600: '#a13d33',
          700: '#87332b',
          DEFAULT: '#a13d33',
        },
        independent: {
          50: '#f7f5f0',
          100: '#efece3',
          200: '#e2e0d8',
          500: '#5c6375',
          600: '#4c5364',
          DEFAULT: '#5c6375',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display': ['3.052rem', { lineHeight: '1.08', letterSpacing: '-0.015em', fontWeight: '600' }],
        'heading-1': ['2.441rem', { lineHeight: '1.12', letterSpacing: '-0.012em', fontWeight: '600' }],
        'heading-2': ['1.953rem', { lineHeight: '1.18', letterSpacing: '-0.008em', fontWeight: '600' }],
        'heading-3': ['1.563rem', { lineHeight: '1.25', fontWeight: '600' }],
        'heading-4': ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],
        'body': ['1rem', { lineHeight: '1.65', fontWeight: '400' }],
        'body-sm': ['0.875rem', { lineHeight: '1.55', fontWeight: '400' }],
        'caption': ['0.78rem', { lineHeight: '1.4', fontWeight: '400' }],
      },
      boxShadow: {
        'card': '0 1px 2px rgba(19, 26, 38, 0.03)',
        'card-hover': '0 2px 10px rgba(19, 26, 38, 0.05)',
        'elevated': '0 8px 24px rgba(19, 26, 38, 0.07)',
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '10px',
        '2xl': '12px',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'fade-in-up': 'fadeInUp 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
