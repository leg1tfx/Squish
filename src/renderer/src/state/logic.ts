import { formatBytes, formatFps } from '@shared/format'
import { BUILT_IN_PRESETS } from '@shared/presets'
import type { EncodeProgress, EncoderChoice, Plan, Preset, Settings, StoreData, VideoInfo } from '@shared/types'

export function allPresets(d: StoreData): Preset[] {
  return [...BUILT_IN_PRESETS, ...d.userPresets]
}

export function settingsFromPreset(p: Preset, encoder: EncoderChoice): Settings {
  return { ...p.settings, encoder }
}

export function doneSummary(info: VideoInfo, maxMB: number | null, bytes: number): string {
  const pct = Math.round((1 - bytes / info.sizeBytes) * 100)
  const smaller =
    bytes > info.sizeBytes
      ? 'Slightly larger than the original. The source was already well compressed.'
      : pct <= 0
        ? 'About the same size as the original.'
        : `${pct}% smaller than before.`
  if (maxMB === null) return smaller
  const spare = (maxMB * 1e6 - bytes) / 1e6
  return `Fits under ${maxMB} MB with ${spare.toFixed(1)} MB to spare. ${smaller}`
}

export function nextPresetName(d: StoreData): string {
  const taken = new Set(d.userPresets.map((p) => p.label))
  for (let n = 1; ; n++) if (!taken.has(`My preset ${n}`)) return `My preset ${n}`
}

export function addonQuestion(sizeBytes: number): string {
  return `Smooth motion needs a small add-on (about ${formatBytes(sizeBytes)}). Download now?`
}

export function downloadLabel(done: number, total: number): string {
  return `${formatBytes(done)} of ${formatBytes(total)}`
}

export function smoothHint(needBytes: number): string {
  return `Smoothing can take a while and needs about ${formatBytes(needBytes)} of free disk space.`
}

export function smoothDone(plan: Plan, info: VideoInfo): string | null {
  return plan.interpolation ? `Frame rate smoothed from ${formatFps(info.fps)} to ${plan.interpolation.targetFps} fps.` : null
}

export function phaseLabel(p: EncodeProgress | null): string {
  if (!p) return 'STARTING'
  if (p.phase === 'prepare') return 'PREPARING FRAMES'
  if (p.phase === 'interpolate') return 'SMOOTHING MOTION'
  return p.passes === 2 ? `PASS ${p.pass} OF 2 · ${p.pass === 1 ? 'ANALYSING' : 'ENCODING'}` : 'ENCODING'
}
