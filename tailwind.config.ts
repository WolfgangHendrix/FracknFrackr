import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        space: {
          900: '#0a0a1a',
          800: '#111133',
          700: '#1a1a4d',
        },
        asteroid: {
          brown: '#8B6914',
          gray: '#6B6B6B',
          gold: '#FFD700',
        },
        hud: {
          green: '#00FF88',
          blue: '#00AAFF',
          red: '#FF4444',
          amber: '#FFAA00',
        },
      },
      fontFamily: {
        sans: ['var(--font-rubik)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-rubik-mono-one)', 'ui-monospace', 'monospace'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
