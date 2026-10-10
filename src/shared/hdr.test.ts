import { describe, expect, it } from 'vitest'
import { applyHdrOverride } from './hdr'
import { buildPlan } from './planner'
import { videoFilter } from './ffmpegArgs'
import type { Settings, VideoInfo } from './types'

const info: VideoInfo = {
  path: 'a.mov', sizeBytes: 1, durationSec: 10, width: 1080, height: 1920, fps: 60, fpsFraction: '60/1', videoCodec: 'prores', videoKbps: 1,
  hasAudio: false, audioCodec: '', audioKbps: 0, hdr: false, bitDepth: 12, is444: true, proresProfile: 4, rgbMatrix: true,
  colorTags: { primaries: 'bt709', trc: 'bt709', space: 'gbr' }
}
const s: Settings = { res: 'best', fps: 'best', audio: 'high', codec: 'h265', maxMB: null, bitrateKbps: null, interpolate: 'off', encoder: 'auto' }

describe('applyHdrOverride', () => {
  it('leaves the file alone on auto', () => { expect(applyHdrOverride(info, 'auto')).toBe(info) })
  it('tags HLG and PQ as BT.2020 HDR', () => {
    expect(applyHdrOverride(info, 'hlg')).toMatchObject({ hdr: true, colorTags: { primaries: 'bt2020', trc: 'arib-std-b67', space: 'bt2020nc' } })
    expect(applyHdrOverride(info, 'pq').colorTags?.trc).toBe('smpte2084')
  })
  it('keeps HDR in H.265 (no tone map) and converts RGB-style YUV with the BT.2020 matrix', () => {
    const h = applyHdrOverride(info, 'hlg')
    const p = buildPlan(h, s, ['cpu'])
    expect(p.hdr).toBe(true)
    expect(videoFilter(h, p)).toBe('fps=60,scale=out_color_matrix=bt2020nc,setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc,format=yuv420p12le')
  })
  it('uses the BT.709 matrix for SDR gbr sources', () => {
    expect(videoFilter(info, buildPlan(info, s, ['cpu']))).toContain('scale=out_color_matrix=bt709')
  })
})
