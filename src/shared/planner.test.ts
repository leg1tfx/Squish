import { describe, expect, it } from 'vitest'
import { buildPlan, disabledFps, disabledRes, outputDims } from './planner'
import type { Settings, VideoInfo } from './types'

const info = (p: Partial<VideoInfo> = {}): VideoInfo => ({
  path: 'C:\\v\\a.mp4', sizeBytes: 1_340_000_000, durationSec: 134,
  width: 3840, height: 2160, fps: 60, fpsFraction: '60/1', videoCodec: 'h264', videoKbps: 80_000,
  hasAudio: true, audioCodec: 'aac', audioKbps: 320, hdr: false, bitDepth: 8, ...p
})
const s = (p: Partial<Settings> = {}): Settings => ({
  res: 'best', fps: 'best', audio: 'best', codec: 'h265', maxMB: null, bitrateKbps: null, interpolate: 'off', encoder: 'auto', ...p
})
const ALL = ['nvenc', 'amf', 'qsv', 'cpu'] as const

describe('outputDims', () => {
  it('keeps source size on Best up to 4K', () => {
    expect(outputDims(info(), 'best')).toEqual({ width: 3840, height: 2160 })
  })
  it('caps Best at short side 2160', () => {
    expect(outputDims(info({ width: 7680, height: 4320 }), 'best')).toEqual({ width: 3840, height: 2160 })
  })
  it('uses the short side for portrait video', () => {
    expect(outputDims(info({ width: 2160, height: 3840 }), '1080')).toEqual({ width: 1080, height: 1920 })
  })
  it('never upscales', () => {
    expect(outputDims(info({ width: 1280, height: 720 }), '1080')).toEqual({ width: 1280, height: 720 })
  })
  it('rounds odd sizes to even', () => {
    expect(outputDims(info({ width: 1081, height: 1921 }), 'best')).toEqual({ width: 1082, height: 1922 })
  })
})

describe('disabled options', () => {
  it('disables resolutions above the source', () => {
    expect(disabledRes(info({ width: 1920, height: 1080 }))).toEqual(['1440'])
  })
  it('disables 60 fps for 30 fps sources', () => {
    expect(disabledFps(info({ fps: 30 }))).toEqual(['60'])
    expect(disabledFps(info({ fps: 59.94 }))).toEqual([])
  })
})

describe('buildPlan: best rules', () => {
  it('caps frame rate at 60 and keeps the exact source fraction when unchanged', () => {
    expect(buildPlan(info({ fps: 120, fpsFraction: '120/1' }), s(), ['cpu'])).toMatchObject({ fps: 60, fpsExpr: '60' })
    expect(buildPlan(info({ fps: 59.94, fpsFraction: '60000/1001' }), s(), ['cpu'])).toMatchObject({ fpsExpr: '60000/1001' })
  })
  it('never raises audio above the source bitrate', () => {
    expect(buildPlan(info({ audioKbps: 192 }), s(), ['cpu']).audioKbps).toBe(192)
    expect(buildPlan(info({ audioKbps: 1536, audioCodec: 'pcm_s16le' }), s({ audio: 'high' }), ['cpu']).audioKbps).toBe(192)
  })
  it('returns null audio for silent video', () => {
    expect(buildPlan(info({ hasAudio: false, audioKbps: 0, audioCodec: '' }), s(), ['cpu']).audioKbps).toBeNull()
  })
})

describe('buildPlan: encoder + mode', () => {
  it('auto picks the first available encoder in NVENC, AMF, QSV, CPU order', () => {
    expect(buildPlan(info(), s(), ['amf', 'cpu']).encoder).toBe('amf')
    expect(buildPlan(info(), s(), ['cpu']).encoder).toBe('cpu')
  })
  it('falls back to CPU when the chosen encoder is not available', () => {
    expect(buildPlan(info(), s({ encoder: 'nvenc' }), ['cpu']).encoder).toBe('cpu')
  })
  it('quality mode estimates with bits per pixel', () => {
    const p = buildPlan(info(), s(), [...ALL])
    expect(p.mode).toBe('quality')
    expect(p.videoKbps).toBe(29_860)
    expect(p.passes).toBe(1)
  })
  it('target mode budgets 97 % of the limit minus audio', () => {
    const p = buildPlan(info(), s({ maxMB: 10, audio: 'high' }), ['cpu'])
    expect(p.mode).toBe('target')
    expect(p.videoKbps).toBe(387)
    expect(p.estimateBytes).toBeLessThanOrEqual(9_700_000)
    expect(p.passes).toBe(2)
  })
  it('GPU target encodes are single pass', () => {
    expect(buildPlan(info(), s({ maxMB: 10 }), ['nvenc', 'cpu']).passes).toBe(1)
  })
  it('never goes below 50 kbit/s video', () => {
    expect(buildPlan(info({ durationSec: 3600 }), s({ maxMB: 10 }), ['cpu']).videoKbps).toBe(50)
  })
  it('reports an honest estimate above the requested limit when the minimum bitrate binds', () => {
    expect(buildPlan(info({ durationSec: 3600 }), s({ maxMB: 10 }), ['cpu']).estimateBytes).toBeGreaterThan(10_000_000)
  })
  it('manual bitrate mode uses the given bitrate', () => {
    expect(buildPlan(info(), s({ bitrateKbps: 12_000 }), ['cpu'])).toMatchObject({ mode: 'bitrate', videoKbps: 12_000 })
  })
  it('max size wins over manual bitrate', () => {
    expect(buildPlan(info(), s({ bitrateKbps: 12_000, maxMB: 10 }), ['cpu']).mode).toBe('target')
  })
  it('override replaces encoder and bitrate', () => {
    expect(buildPlan(info(), s({ maxMB: 10 }), ['nvenc', 'cpu'], { encoder: 'cpu', videoKbps: 300 }))
      .toMatchObject({ encoder: 'cpu', videoKbps: 300, passes: 2 })
  })
})

describe('buildPlan: warning', () => {
  it('warns when 10 MB is tight for 4K and suggests 720p', () => {
    const w = buildPlan(info(), s({ maxMB: 10, codec: 'h264', audio: 'high' }), ['cpu']).warning
    expect(w).toEqual({ text: '10 MB is tight for 4K. 720p will look cleaner.', suggest: '720' })
  })
  it('suggests the largest lower resolution that clears the threshold', () => {
    const w = buildPlan(info({ durationSec: 40 }), s({ maxMB: 25, codec: 'h264', audio: 'high' }), ['cpu']).warning
    expect(w?.suggest).toBe('1080')
  })
  it('does not warn at 720p or in quality mode', () => {
    expect(buildPlan(info(), s({ maxMB: 10, res: '720' }), ['cpu']).warning).toBeNull()
    expect(buildPlan(info(), s(), ['cpu']).warning).toBeNull()
  })
})

describe('buildPlan: changes', () => {
  it('marks unchanged values as kept', () => {
    const c = buildPlan(info(), s(), ['cpu']).changes
    expect(c.map((x) => [x.label, x.to])).toEqual([
      ['RESOLUTION', 'kept'], ['FRAME RATE', 'kept'], ['AUDIO', 'kept'], ['VIDEO', 'H.265 29.9M']
    ])
  })
  it('lists lowered values and HDR conversion', () => {
    const c = buildPlan(info({ hdr: true }), s({ res: '1080', audio: 'standard', codec: 'h264' }), ['cpu']).changes
    expect(c.find((x) => x.label === 'RESOLUTION')?.to).toBe('1920×1080')
    expect(c.find((x) => x.label === 'AUDIO')?.to).toBe('AAC 128k')
    expect(c.find((x) => x.label === 'HDR')).toEqual({ label: 'HDR', from: 'HDR', to: 'SDR' })
  })
  it('keeps the bit depth for HEVC only, and never with smooth motion', () => {
    const ten = info({ bitDepth: 10 })
    expect(buildPlan(ten, s({ codec: 'h265' }), ['cpu']).bitDepth).toBe(10)
    expect(buildPlan(ten, s({ codec: 'h265' }), ['cpu']).changes.find((x) => x.label === 'COLOR')).toEqual({ label: 'COLOR', from: '10-bit', to: 'kept' })
    expect(buildPlan(ten, s({ codec: 'h264' }), ['cpu']).bitDepth).toBe(8)
    expect(buildPlan(ten, s({ codec: 'h264' }), ['cpu']).changes.find((x) => x.label === 'COLOR')?.to).toBe('8-bit')
    expect(buildPlan(info(), s({ codec: 'h265' }), ['cpu']).bitDepth).toBe(8)
    expect(buildPlan(info(), s({ codec: 'h265' }), ['cpu']).changes.some((x) => x.label === 'COLOR')).toBe(false)
    const slow = info({ bitDepth: 10, fps: 30, fpsFraction: '30/1' })
    expect(buildPlan(slow, s({ codec: 'h265', interpolate: '60' }), ['cpu']).bitDepth).toBe(8)
  })
  it('keeps HDR with HEVC and tone maps otherwise', () => {
    const h = info({ hdr: true, bitDepth: 10 })
    expect(buildPlan(h, s({ codec: 'h265' }), ['cpu']).hdr).toBe(true)
    expect(buildPlan(h, s({ codec: 'h265' }), ['cpu']).changes.find((x) => x.label === 'HDR')?.to).toBe('kept')
    expect(buildPlan(h, s({ codec: 'h264' }), ['cpu']).hdr).toBe(false)
    expect(buildPlan(h, s({ codec: 'h264' }), ['cpu']).changes.find((x) => x.label === 'HDR')?.to).toBe('SDR')
  })
  it('ignores the size limit for ProRes', () => {
    const p = buildPlan(info(), s({ codec: 'prores', maxMB: 5 }), ['cpu'])
    expect([p.mode, p.warning, p.bitDepth]).toEqual(['quality', null, 10])
  })
  it('sends 12-bit to the CPU encoder', () => {
    const p = buildPlan(info({ bitDepth: 12 }), s({ codec: 'h265' }), ['nvenc', 'cpu'])
    expect([p.bitDepth, p.encoder]).toEqual([12, 'cpu'])
  })
  it('omits the audio row for silent video', () => {
    const c = buildPlan(info({ hasAudio: false, audioKbps: 0, audioCodec: '' }), s(), ['cpu']).changes
    expect(c.some((x) => x.label === 'AUDIO')).toBe(false)
  })
})

describe('buildPlan: smooth motion', () => {
  const src30 = (p: Partial<VideoInfo> = {}): VideoInfo => info({ width: 1920, height: 1080, fps: 30, fpsFraction: '30/1', ...p })
  it('is off by default', () => {
    expect(buildPlan(src30(), s(), ['cpu']).interpolation).toBeNull()
  })
  it('raises 30 fps to 120 with an exact frame target', () => {
    const p = buildPlan(src30(), s({ interpolate: '120' }), ['cpu'])
    expect(p).toMatchObject({ fps: 120, fpsExpr: '120', interpolation: { targetFps: 120, sourceFps: 30, frames: 16_080 } })
  })
  it('interpolation wins over the fps choice', () => {
    expect(buildPlan(src30(), s({ interpolate: '60', fps: '30' }), ['cpu'])).toMatchObject({ fps: 60, interpolation: { targetFps: 60 } })
  })
  it('does not interpolate when the source already reaches the target', () => {
    expect(buildPlan(info({ fps: 60 }), s({ interpolate: '60' }), ['cpu']).interpolation).toBeNull()
    expect(buildPlan(info({ fps: 59.94, fpsFraction: '60000/1001' }), s({ interpolate: '60' }), ['cpu'])).toMatchObject({ interpolation: null, fpsExpr: '60000/1001' })
  })
  it('handles fractional source rates with the exact duration', () => {
    const p = buildPlan(src30({ fps: 29.97, fpsFraction: '30000/1001', durationSec: 10.01 }), s({ interpolate: '60' }), ['cpu'])
    expect(p.interpolation).toEqual({ targetFps: 60, sourceFps: 29.97, frames: 601 })
  })
  it('does not interpolate clips with fewer than 2 source frames', () => {
    expect(buildPlan(src30({ durationSec: 0.03 }), s({ interpolate: '120' }), ['cpu']).interpolation).toBeNull()
  })
  it('shows the interpolated rate in the changes table', () => {
    const rows = buildPlan(src30(), s({ interpolate: '120' }), ['cpu']).changes
    expect(rows.find((r) => r.label === 'FRAME RATE')).toEqual({ label: 'FRAME RATE', from: '30 fps', to: '120 fps (interpolated)' })
  })
  it('warns about a tight size limit using the interpolated rate', () => {
    const base = src30()
    expect(buildPlan(base, s({ maxMB: 60 }), ['cpu']).warning).toBeNull()
    expect(buildPlan(base, s({ maxMB: 60, interpolate: '120' }), ['cpu']).warning).toMatchObject({ suggest: '720' })
  })
})
