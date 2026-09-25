import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DEFAULT_PRESET_ID } from '@shared/presets'
import type { Preset, PresetSettings, StoreData } from '@shared/types'

export function defaultStore(): StoreData {
  return { version: 1, userPresets: [], lastPresetId: DEFAULT_PRESET_ID, promoDismissed: false }
}

export async function loadStore(file: string): Promise<StoreData> {
  try {
    const d = JSON.parse(await readFile(file, 'utf8')) as Partial<StoreData>
    if (d.version !== 1 || !Array.isArray(d.userPresets)) return defaultStore()
    return {
      version: 1,
      userPresets: d.userPresets.filter((p) => p && typeof p.id === 'string' && typeof p.label === 'string' && p.settings),
      lastPresetId: typeof d.lastPresetId === 'string' ? d.lastPresetId : DEFAULT_PRESET_ID,
      promoDismissed: d.promoDismissed === true
    }
  } catch {
    return defaultStore()
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
