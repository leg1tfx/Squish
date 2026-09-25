import { describe, expect, it } from 'vitest'
import { allPresets, doneSummary, nextPresetName, settingsFromPreset } from './logic'
import type { StoreData, VideoInfo } from '@shared/types'

const store: StoreData = {
  version: 1, lastPresetId: 'tiktok', promoDismissed: false,
  userPresets: [{ id: 'user-1', label: 'My preset 1', builtIn: false, settings: { res: '1080', fps: 'best', audio: 'best', codec: 'h265', maxMB: null, bitrateKbps: null } }]
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
  it('suggests the next free preset name', () => {
    expect(nextPresetName(store)).toBe('My preset 2')
  })
})
