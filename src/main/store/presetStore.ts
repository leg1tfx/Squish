import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DEFAULT_PRESET_ID } from '@shared/presets'
import type { Preset, PresetSettings, StoreData } from '@shared/types'

const RES_VALUES = new Set(['best', '1440', '1080', '720'])
const FPS_VALUES = new Set(['best', '60', '30'])
const AUDIO_VALUES = new Set(['best', 'high', 'standard'])
const CODEC_VALUES = new Set(['h264', 'h265'])

function isPositiveFiniteNumberOrNull(x: unknown): x is number | null {
  return x === null || (typeof x === 'number' && Number.isFinite(x) && x > 0)
}

export function isPresetSettings(x: unknown): x is PresetSettings {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  return (
    typeof s.res === 'string' &&
    RES_VALUES.has(s.res) &&
    typeof s.fps === 'string' &&
    FPS_VALUES.has(s.fps) &&
    typeof s.audio === 'string' &&
    AUDIO_VALUES.has(s.audio) &&
    typeof s.codec === 'string' &&
    CODEC_VALUES.has(s.codec) &&
    isPositiveFiniteNumberOrNull(s.maxMB) &&
    isPositiveFiniteNumberOrNull(s.bitrateKbps)
  )
}

export function defaultStore(): StoreData {
  return { version: 1, userPresets: [], lastPresetId: DEFAULT_PRESET_ID, promoDismissed: false, telemetry: 'on', telemetryNoticeSeen: false }
}

/** A file that exists but can't be used may have held an opt-out, so stats stay off (the About switch can turn them back on). */
function unusableStore(): StoreData {
  return { ...defaultStore(), telemetry: 'off', telemetryNoticeSeen: true }
}

export async function loadStore(file: string): Promise<StoreData> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? defaultStore() : unusableStore()
  }
  try {
    const d = JSON.parse(raw) as Partial<StoreData>
    if (d.version !== 1 || !Array.isArray(d.userPresets)) return unusableStore()
    return {
      version: 1,
      userPresets: d.userPresets
        .filter((p) => p && typeof p.id === 'string' && typeof p.label === 'string' && isPresetSettings(p.settings))
        .map((p) => ({ ...p, builtIn: false })),
      lastPresetId: typeof d.lastPresetId === 'string' ? d.lastPresetId : DEFAULT_PRESET_ID,
      promoDismissed: d.promoDismissed === true,
      // Missing field (file from 1.0.0) means the default 'on'. A present but unknown value means 'off': when unsure, don't send.
      telemetry: d.telemetry === undefined || d.telemetry === 'on' ? 'on' : 'off',
      telemetryNoticeSeen: d.telemetryNoticeSeen === true
    }
  } catch {
    return unusableStore()
  }
}

export async function saveStore(file: string, d: StoreData): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(d, null, 2), 'utf8')
  await rename(tmp, file)
}

export function cleanLabel(label: string): string | null {
  const t = label.trim().slice(0, 40)
  return t.length ? t : null
}

export function addPreset(d: StoreData, label: string, settings: PresetSettings, now: number): { data: StoreData; preset: Preset } {
  const preset: Preset = { id: `user-${now}`, label: cleanLabel(label) ?? 'My preset', builtIn: false, settings }
  return { preset, data: { ...d, userPresets: [...d.userPresets, preset], lastPresetId: preset.id } }
}

export function renamePreset(d: StoreData, id: string, label: string): StoreData {
  const l = cleanLabel(label)
  if (!l) return d
  return { ...d, userPresets: d.userPresets.map((p) => (p.id === id ? { ...p, label: l } : p)) }
}

export function deletePreset(d: StoreData, id: string): StoreData {
  return {
    ...d,
    userPresets: d.userPresets.filter((p) => p.id !== id),
    lastPresetId: d.lastPresetId === id ? DEFAULT_PRESET_ID : d.lastPresetId
  }
}
