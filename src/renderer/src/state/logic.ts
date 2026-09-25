import { BUILT_IN_PRESETS } from '@shared/presets'
import type { EncoderChoice, Preset, Settings, StoreData, VideoInfo } from '@shared/types'

export function allPresets(d: StoreData): Preset[] {
  return [...BUILT_IN_PRESETS, ...d.userPresets]
}

export function settingsFromPreset(p: Preset, encoder: EncoderChoice): Settings {
  return { ...p.settings, encoder }
}

export function doneSummary(info: VideoInfo, maxMB: number | null, bytes: number): string {
  const pct = Math.round((1 - bytes / info.sizeBytes) * 100)
  const smaller = pct > 0 ? `${pct}% smaller than before.` : 'Slightly larger than the original. The source was already well compressed.'
  if (maxMB === null) return smaller
  const spare = (maxMB * 1e6 - bytes) / 1e6
  return `Fits under ${maxMB} MB with ${spare.toFixed(1)} MB to spare. ${smaller}`
}

export function nextPresetName(d: StoreData): string {
  const taken = new Set(d.userPresets.map((p) => p.label))
  for (let n = 1; ; n++) if (!taken.has(`My preset ${n}`)) return `My preset ${n}`
}
