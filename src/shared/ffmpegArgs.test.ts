import { describe, expect, it } from 'vitest'
import { buildArgs, videoFilter } from './ffmpegArgs'
import { buildPlan } from './planner'
import type { Settings, VideoInfo } from './types'

const info: VideoInfo = {
  path: 'C:\\v\\Pyno\'s clip ä.mp4', sizeBytes: 1e9, durationSec: 134, width: 3840, height: 2160, fps: 60, fpsFraction: '60/1',
  videoCodec: 'h264', videoKbps: 80_000, hasAudio: true, audioCodec: 'aac', audioKbps: 320, hdr: false
}
const s = (p: Partial<Settings> = {}): Settings => ({
  res: 'best', fps: 'best', audio: 'best', codec: 'h265', maxMB: null, bitrateKbps: null, interpolate: 'off', encoder: 'auto', ...p
})
const pick = (args: string[], flag: string): string | undefined => args[args.indexOf(flag) + 1]

describe('videoFilter', () => {
  it('always sets fps and pixel format', () => {
    expect(videoFilter(info, buildPlan(info, s(), ['cpu']))).toBe('fps=60,format=yuv420p')
  })
  it('scales, tonemaps HDR and uses nv12 for QSV', () => {
    const hdr = { ...info, hdr: true }
    const vf = videoFilter(hdr, buildPlan(hdr, s({ res: '1080' }), ['qsv', 'cpu']))
    expect(vf.startsWith('zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv')).toBe(true)
    expect(vf).toContain('scale=1920:1080:flags=lanczos')
    expect(vf.endsWith('fps=60,format=nv12')).toBe(true)
  })
})

describe('buildArgs', () => {
  const o = { input: info.path, output: 'C:\\out\\a_squish.mp4' }

  it('passes the input path as one argument and writes faststart MP4', () => {
    const a = buildArgs(info, buildPlan(info, s(), ['cpu']), o)
    expect(pick(a, '-i')).toBe(info.path)
    expect(a.at(-1)).toBe(o.output)
    expect(pick(a, '-movflags')).toBe('+faststart')
    expect(pick(a, '-progress')).toBe('pipe:1')
  })
  it('CPU H.265 quality: crf 23, hvc1 tag, AAC 320k', () => {
    const a = buildArgs(info, buildPlan(info, s(), ['cpu']), o)
    expect(pick(a, '-c:v')).toBe('libx265')
    expect(pick(a, '-crf')).toBe('23')
    expect(pick(a, '-tag:v')).toBe('hvc1')
    expect(pick(a, '-b:a')).toBe('320k')
  })
  it('CPU H.264 target pass 1 writes to NUL without audio', () => {
    const plan = buildPlan(info, s({ codec: 'h264', maxMB: 10 }), ['cpu'])
    const a = buildArgs(info, plan, { ...o, pass: 1, passLogName: 'squish2pass' })
    expect(pick(a, '-pass')).toBe('1')
    expect(pick(a, '-passlogfile')).toBe('squish2pass')
    expect(pick(a, '-b:v')).toBe(`${plan.videoKbps}k`)
    expect(pick(a, '-maxrate')).toBe(`${Math.round(plan.videoKbps * 1.5)}k`)
    expect(a).toContain('-an')
    expect(a.slice(-3)).toEqual(['-f', 'null', 'NUL'])
    expect(a).not.toContain('0:a:0')
  })
  it('CPU H.265 2-pass uses x265-params with a relative stats file', () => {
    const plan = buildPlan(info, s({ maxMB: 10 }), ['cpu'])
    const a = buildArgs(info, plan, { ...o, pass: 2, passLogName: 'squish2pass' })
    expect(pick(a, '-x265-params')).toBe('pass=2:stats=squish2pass.log:log-level=error')
  })
  it('NVENC quality and target', () => {
    const q = buildArgs(info, buildPlan(info, s({ codec: 'h264' }), ['nvenc', 'cpu']), o)
    expect(pick(q, '-c:v')).toBe('h264_nvenc')
    expect(pick(q, '-cq')).toBe('23')
    expect(pick(q, '-b:v')).toBe('0')
    const t = buildArgs(info, buildPlan(info, s({ maxMB: 25 }), ['nvenc', 'cpu']), o)
    expect(pick(t, '-c:v')).toBe('hevc_nvenc')
    expect(pick(t, '-multipass')).toBe('fullres')
  })
  it('AMF and QSV quality flags', () => {
    const amf = buildArgs(info, buildPlan(info, s(), ['amf', 'cpu']), o)
    expect(pick(amf, '-rc')).toBe('qvbr')
    expect(pick(amf, '-qvbr_quality_level')).toBe('25')
    const qsv = buildArgs(info, buildPlan(info, s({ codec: 'h264' }), ['qsv', 'cpu']), o)
    expect(pick(qsv, '-global_quality')).toBe('23')
  })
  it('silent source gets -an', () => {
    const silent = { ...info, hasAudio: false, audioKbps: 0, audioCodec: '' }
    const a = buildArgs(silent, buildPlan(silent, s(), ['cpu']), o)
    expect(a).toContain('-an')
    expect(a).not.toContain('-c:a')
  })
  it('sample seeks before input and limits duration after', () => {
    const a = buildArgs(info, buildPlan(info, s(), ['cpu']), { ...o, sample: { startSec: 64.5, durationSec: 5 } })
    expect(a.indexOf('-ss')).toBeLessThan(a.indexOf('-i'))
    expect(pick(a, '-ss')).toBe('64.5')
    expect(pick(a, '-t')).toBe('5')
  })
})
