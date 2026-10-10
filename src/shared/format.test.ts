import { describe, expect, it } from 'vitest'
import { codecLabel, formatBytes, formatFps, resLabel } from './format'

describe('format', () => {
  it('formats bytes as MB below 1 GB and GB above', () => {
    expect(formatBytes(9_700_000)).toBe('9.7 MB')
    expect(formatBytes(1_340_000_000)).toBe('1.34 GB')
  })
  it('labels short sides', () => {
    expect(resLabel(2160)).toBe('4K')
    expect(resLabel(1080)).toBe('1080p')
  })
  it('labels codecs', () => {
    expect(codecLabel('h264')).toBe('H.264')
    expect(codecLabel('hevc')).toBe('H.265')
    expect(codecLabel('prores')).toBe('ProRes')
  })
  it('formats fps without trailing zeros', () => {
    expect(formatFps(60)).toBe('60 fps')
    expect(formatFps(59.94006)).toBe('59.94 fps')
  })
})
