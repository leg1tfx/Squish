import { describe, expect, it } from 'vitest'
import { parseProbe, ProbeError } from './probe'

const base = {
  format: { duration: '134.0', bit_rate: '80320000' },
  streams: [
    { codec_type: 'video', codec_name: 'h264', width: 3840, height: 2160, avg_frame_rate: '60/1', r_frame_rate: '60/1', bit_rate: '80000000', color_transfer: 'bt709', disposition: { attached_pic: 0 } },
    { codec_type: 'audio', codec_name: 'aac', bit_rate: '320000' }
  ]
}

describe('parseProbe', () => {
  it('reads the basics', () => {
    expect(parseProbe(base, 'a.mp4', 123)).toEqual({
      path: 'a.mp4', sizeBytes: 123, durationSec: 134, width: 3840, height: 2160, fps: 60, fpsFraction: '60/1',
      videoCodec: 'h264', videoKbps: 80_000, hasAudio: true, audioCodec: 'aac', audioKbps: 320, hdr: false
    })
  })
  it('swaps width and height for rotated phone video', () => {
    const rotated = structuredClone(base)
    rotated.streams[0] = { ...rotated.streams[0], width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] } as never
    const i = parseProbe(rotated, 'a.mp4', 1)
    expect([i.width, i.height]).toEqual([1080, 1920])
  })
  it('detects HDR (PQ and HLG)', () => {
    for (const t of ['smpte2084', 'arib-std-b67']) {
      const h = structuredClone(base); (h.streams[0] as { color_transfer: string }).color_transfer = t
      expect(parseProbe(h, 'a', 1).hdr).toBe(true)
    }
  })
  it('handles 59.94 fps and missing stream bitrates', () => {
    const n = structuredClone(base)
    Object.assign(n.streams[0], { avg_frame_rate: '60000/1001', bit_rate: undefined })
    Object.assign(n.streams[1], { bit_rate: undefined })
    const i = parseProbe(n, 'a', 1)
    expect(i.fps).toBeCloseTo(59.94, 2)
    expect(i.fpsFraction).toBe('60000/1001')
    expect(i.videoKbps).toBe(80_320)
    expect(i.audioKbps).toBe(0)
  })
  it('ignores cover art and rejects files without video', () => {
    const art = { format: base.format, streams: [{ codec_type: 'video', codec_name: 'mjpeg', width: 600, height: 600, avg_frame_rate: '0/0', disposition: { attached_pic: 1 } }, base.streams[1]] }
    expect(() => parseProbe(art, 'a.mp3', 1)).toThrow(ProbeError)
  })
  it('rejects zero duration', () => {
    const z = structuredClone(base); z.format.duration = '0'
    try { parseProbe(z, 'a', 1); expect.fail('should throw') } catch (e) { expect((e as ProbeError).reason).toBe('unreadable') }
  })
})
