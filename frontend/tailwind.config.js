/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary-fixed": "#7b9cff",
        "tertiary": "#006573",
        "outline": "#73777b",
        "on-secondary": "#e9f4ff",
        "on-primary-fixed": "#000000",
        "on-primary-fixed-variant": "#00266e",
        "tertiary-container": "#3adffa",
        "on-tertiary-fixed-variant": "#005561",
        "surface": "#f3f7fb",
        "inverse-on-surface": "#999da1",
        "surface-container": "#e3e9ee",
        "surface-variant": "#d7dee3",
        "on-surface-variant": "#575c60",
        "surface-bright": "#f3f7fb",
        "primary-fixed-dim": "#658eff",
        "on-secondary-fixed": "#003853",
        "surface-dim": "#ced5db",
        "error-container": "#fb5151",
        "secondary-container": "#a4d8ff",
        "surface-container-highest": "#d7dee3",
        "tertiary-dim": "#005865",
        "inverse-surface": "#0a0f12",
        "surface-container-low": "#ecf1f6",
        "secondary-dim": "#00557b",
        "surface-tint": "#0050d4",
        "on-tertiary-container": "#004b56",
        "on-tertiary-fixed": "#00363e",
        "on-surface": "#2a2f32",
        "error": "#b31b25",
        "secondary": "#00628c",
        "inverse-primary": "#618bff",
        "on-secondary-container": "#004c6f",
        "on-background": "#2a2f32",
        "tertiary-fixed-dim": "#1ad0eb",
        "surface-container-high": "#dde3e8",
        "primary-dim": "#0046bb",
        "surface-container-lowest": "#ffffff",
        "on-tertiary": "#daf8ff",
        "outline-variant": "#a9aeb1",
        "on-error": "#ffefee",
        "tertiary-fixed": "#3adffa",
        "primary-container": "#7b9cff",
        "background": "#f3f7fb",
        "on-primary-container": "#001e5a",
        "secondary-fixed-dim": "#81ccff",
        "primary": "#0050d4",
        "on-error-container": "#570008",
        "error-dim": "#9f0519",
        "on-primary": "#f1f2ff"
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      fontFamily: {
        "headline": ["Noto Sans Arabic", "Manrope", "sans-serif"],
        "body": ["Noto Sans Arabic", "Manrope", "sans-serif"],
        "label": ["Noto Sans Arabic", "Manrope", "sans-serif"],
        "manrope": ["Manrope", "sans-serif"]
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.8 },
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
