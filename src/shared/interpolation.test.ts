import { describe, expect, it } from 'vitest'
import { disabledInterpolate, interpTarget, interpolationDiskBytes, overallFraction, sourceFrameCount } from './interpolation'
import { buildPlan } from './planner'
import type { Settings, VideoInfo } from './types'

const info = (p: Partial<VideoInfo> = {}): VideoInfo => ({
  path: 'C:\v\a.mp4', sizeBytes: 1e8, durationSec: 30, width: 1920, height: 1080, fps: 30, fpsFraction: '30/1',
  videoCodec: 'h264', videoKbps: 20_000, hasAudio: true, audioCodec: 'aac', audioKbps: 192, hdr: false, bitDepth: 8, ...p
})
const s = (p: Partial<Settings> = {}): Settings => ({
  res: 'best', fps: 'best', interpolate: 'off', audio: 'best', codec: 'h265', maxMB: null, bitrateKbps: null, encoder: 'auto', ...p
})

describe('interpolation helpers', () => {
  it('maps choices to targets', () => {
    expect(interpTarget('off')).toBeNull()
    expect(interpTarget('60')).toBe(60)
    expect(interpTarget('120')).toBe(120)
  })
  it('disables targets the source already reaches (0.5 fps tolerance)', () => {
    expect(disabledInterpolate(info({ fps: 30 }))).toEqual([])
    expect(disabledInterpolate(info({ fps: 59.94 }))).toEqual(['60'])
    expect(disabledInterpolate(info({ fps: 60 }))).toEqual(['60'])
    expect(disabledInterpolate(info({ fps: 120 }))).toEqual(['60', '120'])
  })
  it('counts source frames', () => {
    expect(sourceFrameCount(info({ durationSec: 30, fps: 30 }))).toBe(900)
  })
  it('estimates peak disk use as input + output frames at 1.5 bytes per pixel plus 20% reserve', () => {
    const i = info()
    const plan = buildPlan(i, s({ interpolate: '120' }), ['cpu'])
    expect(interpolationDiskBytes(i, plan)).toBe(16_796_160_000)
  })
  it('needs no disk without interpolation', () => {
    const i = info()
    expect(interpolationDiskBytes(i, buildPlan(i, s(), ['cpu']))).toBe(0)
  })
  it('weights the phases 10 / 60 / 30 and clamps', () => {
    expect(overallFraction('prepare', 0.5)).toBeCloseTo(0.05)
    expect(overallFraction('interpolate', 0)).toBeCloseTo(0.1)
    expect(overallFraction('interpolate', 1)).toBeCloseTo(0.7)
    expect(overallFraction('encode', 0.5)).toBeCloseTo(0.85)
    expect(overallFraction('encode', 3)).toBeCloseTo(1)
    expect(overallFraction('prepare', -1)).toBe(0)
  })
})
