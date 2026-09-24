import type { Preset } from './types'

const base = { res: 'best', fps: 'best', bitrateKbps: null } as const

export const BUILT_IN_PRESETS: Preset[] = [
  { id: 'tiktok', label: 'TikTok', builtIn: true, settings: { ...base, audio: 'best', codec: 'h265', maxMB: null } },
  { id: 'reels', label: 'Reels', builtIn: true, settings: { ...base, audio: 'high', codec: 'h265', maxMB: null } },
  { id: 'shorts', label: 'Shorts', builtIn: true, settings: { ...base, audio: 'best', codec: 'h265', maxMB: null } },
  { id: 'youtube', label: 'YouTube', builtIn: true, settings: { ...base, audio: 'best', codec: 'h265', maxMB: null } },
  { id: 'x', label: 'X', builtIn: true, settings: { ...base, audio: 'high', codec: 'h264', maxMB: null } },
  { id: 'discord', label: 'Discord · 10 MB', builtIn: true, settings: { ...base, audio: 'high', codec: 'h264', maxMB: 10 } },
  { id: 'whatsapp', label: 'WhatsApp · 16 MB', builtIn: true, settings: { ...base, audio: 'high', codec: 'h264', maxMB: 16 } },
  { id: 'email', label: 'Email · 25 MB', builtIn: true, settings: { ...base, audio: 'high', codec: 'h264', maxMB: 25 } }
]

export const DEFAULT_PRESET_ID = 'tiktok'
