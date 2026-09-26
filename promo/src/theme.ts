// Copied from src/renderer/src/styles/tokens.css (app). Keep in sync by hand.
export const C = {
  ground: '#0b1416', surface: '#111d20', surfaceRaised: '#172629', surfaceSunken: '#081012',
  hairline: '#22363b', rule: '#587479',
  ink: '#eef2ee', ink2: '#bccaca', ink3: '#8fa3a6',
  gold: '#d4af37', goldHover: '#f0d27a', goldText: '#e2bf55', onGold: '#16120a',
  goldWash: 'rgba(212, 175, 55, 0.14)', circuit: '#4fd6c0', negative: '#ff8a70'
} as const

export const FONT = {
  display: "'Fraunces', Georgia, serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', Consolas, monospace"
} as const

export const SPRING = { damping: 200 } as const
export const MARGIN = 120
export const W = 1440
export const H = 1080
export const FPS = 60

// Animation lengths are authored in seconds so they hold at any frame rate.
export const sec = (s: number, fps: number) => Math.round(s * fps)
