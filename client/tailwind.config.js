// client/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        buram: {
          bg: 'rgb(var(--color-bg) / <alpha-value>)',
          canvas: 'rgb(var(--color-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-surface) / <alpha-value>)',
          elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
          amber: 'rgb(var(--color-amber) / <alpha-value>)',
          gold: 'rgb(var(--color-gold) / <alpha-value>)',
          pale: 'rgb(var(--color-pale) / <alpha-value>)',
          text: 'rgb(var(--color-text) / <alpha-value>)',
          ink: 'rgb(var(--color-ink) / <alpha-value>)',
          muted: 'rgb(var(--color-muted) / <alpha-value>)',
          success: 'rgb(var(--color-success) / <alpha-value>)',
          warning: 'rgb(var(--color-warning) / <alpha-value>)',
          critical: 'rgb(var(--color-critical) / <alpha-value>)',
          tech: 'rgb(var(--color-tech) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"Cascadia Code"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        amberGlow: 'var(--shadow-amber)',
        techGlow: 'var(--shadow-tech)',
      },
    },
  },
  plugins: [],
};