import { describe, expect, it } from 'vitest'
import { addonQuestion, allPresets, doneSummary, downloadLabel, nextPresetName, phaseLabel, settingsFromPreset, smoothDone, smoothHint } from './logic'
import type { EncodeProgress, Plan, StoreData, VideoInfo } from '@shared/types'

const store: StoreData = {
  version: 1, lastPresetId: 'tiktok', promoDismissed: false, telemetry: 'on', telemetryNoticeSeen: false,
  userPresets: [{ id: 'user-1', label: 'My preset 1', builtIn: false, settings: { res: '1080', fps: 'best', audio: 'best', codec: 'h265', maxMB: null, bitrateKbps: null, interpolate: 'off' } }]
}
const info = { sizeBytes: 1_340_000_000 } as VideoInfo

describe('logic', () => {
  it('lists built-ins first, then user presets', () => {
    const ids = allPresets(store).map((p) => p.id)
    expect(ids[0]).toBe('tiktok')
    expect(ids.at(-1)).toBe('user-1')
  })
  it('builds settings from a preset and keeps the encoder choice', () => {
    expect(settingsFromPreset(allPresets(store).at(-1)!, 'nvenc')).toMatchObject({ res: '1080', encoder: 'nvenc' })
  })
  it('summarises a size-limit result', () => {
    expect(doneSummary(info, 10, 9_700_000)).toBe('Fits under 10 MB with 0.3 MB to spare. 99% smaller than before.')
  })
  it('summarises a quality result', () => {
    expect(doneSummary(info, null, 335_000_000)).toBe('75% smaller than before.')
  })
  it('does not claim smaller when the result grew', () => {
    expect(doneSummary(info, null, 1_400_000_000)).toBe('Slightly larger than the original. The source was already well compressed.')
  })
  it('calls out equal size as about the same, not larger', () => {
    expect(doneSummary(info, null, info.sizeBytes)).toBe('About the same size as the original.')
    expect(doneSummary(info, 1400, info.sizeBytes)).toBe('Fits under 1400 MB with 60.0 MB to spare. About the same size as the original.')
  })
  it('calls out a negligible shrink as about the same, not smaller', () => {
    const bytes = Math.round(info.sizeBytes * 0.998)
    expect(doneSummary(info, null, bytes)).toBe('About the same size as the original.')
  })
  it('suggests the next free preset name', () => {
    expect(nextPresetName(store)).toBe('My preset 2')
  })

  it('asks for the add-on download with its size', () => {
    expect(addonQuestion(31_000_000)).toBe('Smooth motion needs a small add-on (about 31.0 MB). Download now?')
  })
  it('formats download progress', () => {
    expect(downloadLabel(12_300_000, 31_000_000)).toBe('12.3 MB of 31.0 MB')
  })
  it('warns about time and disk before the run', () => {
    expect(smoothHint(16_796_160_000)).toBe('Smoothing can take a while and needs about 16.80 GB of free disk space.')
  })
  it('summarises a smoothed result and stays silent otherwise', () => {
    const plan = { interpolation: { targetFps: 120, sourceFps: 30, frames: 1 } } as Plan
    expect(smoothDone(plan, { fps: 30 } as VideoInfo)).toBe('Frame rate smoothed from 30 fps to 120 fps.')
    expect(smoothDone({ interpolation: null } as Plan, { fps: 30 } as VideoInfo)).toBeNull()
  })
  it('labels each phase of the progress screen', () => {
    const p = (o: Partial<EncodeProgress>): EncodeProgress => ({ fraction: 0, pass: 1, passes: 1, speed: null, remainingSec: null, encoder: 'cpu', phase: 'encode', ...o })
    expect(phaseLabel(null)).toBe('STARTING')
    expect(phaseLabel(p({ phase: 'prepare' }))).toBe('PREPARING FRAMES')
    expect(phaseLabel(p({ phase: 'interpolate' }))).toBe('SMOOTHING MOTION')
    expect(phaseLabel(p({}))).toBe('ENCODING')
    expect(phaseLabel(p({ passes: 2, pass: 1 }))).toBe('PASS 1 OF 2 · ANALYSING')
    expect(phaseLabel(p({ passes: 2, pass: 2 }))).toBe('PASS 2 OF 2 · ENCODING')
  })
})
