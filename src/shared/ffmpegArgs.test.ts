import { describe, expect, it } from 'vitest'
import { buildArgs, buildFrameExportArgs, videoFilter } from './ffmpegArgs'
import { buildPlan } from './planner'
import type { Settings, VideoInfo } from './types'

const info: VideoInfo = {
  path: 'C:\\v\\Pyno\'s clip ä.mp4', sizeBytes: 1e9, durationSec: 134, width: 3840, height: 2160, fps: 60, fpsFraction: '60/1',
  videoCodec: 'h264', videoKbps: 80_000, hasAudio: true, audioCodec: 'aac', audioKbps: 320, hdr: false, bitDepth: 8
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
    const vf = videoFilter(hdr, buildPlan(hdr, s({ res: '1080', codec: 'h264' }), ['qsv', 'cpu']))
    expect(vf.startsWith('zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv')).toBe(true)
    expect(vf).toContain('scale=1920:1080:flags=lanczos')
    expect(vf.endsWith('fps=60,format=nv12')).toBe(true)
  })
})

describe('10-bit', () => {
  const ten = { ...info, bitDepth: 10 as const }
  it('uses planar 10-bit on CPU and p010le on hardware encoders', () => {
    expect(videoFilter(ten, buildPlan(ten, s(), ['cpu']))).toBe('fps=60,format=yuv420p10le')
    expect(videoFilter(ten, buildPlan(ten, s(), ['nvenc', 'cpu']))).toBe('fps=60,format=p010le')
    expect(videoFilter(ten, buildPlan(ten, s(), ['qsv', 'cpu']))).toBe('fps=60,format=p010le')
  })
  it('keeps HDR with HEVC: no tone mapping, source colour tags, 12-bit on CPU', () => {
    const hdr = { ...ten, hdr: true, colorTags: { primaries: 'bt2020', trc: 'smpte2084', space: 'bt2020nc' } }
    const p = buildPlan(hdr, s(), ['cpu'])
    expect(videoFilter(hdr, p)).toBe('fps=60,format=yuv420p10le')
    const a = buildArgs(hdr, p, { input: hdr.path, output: 'o.mp4' })
    expect(a.slice(a.indexOf('-color_primaries'), a.indexOf('-color_primaries') + 6)).toEqual(['-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc'])
    const t12 = { ...info, bitDepth: 12 as const }
    expect(videoFilter(t12, buildPlan(t12, s(), ['nvenc', 'cpu']))).toBe('fps=60,format=yuv420p12le')
  })
  it('stays 8-bit for H.264', () => {
    expect(videoFilter(ten, buildPlan(ten, s({ codec: 'h264' }), ['cpu']))).toBe('fps=60,format=yuv420p')
  })
})

describe('ProRes', () => {
  it('uses prores_ks HQ with 4:2:2 10-bit, ignoring size limits and GPU encoders', () => {
    const p = buildPlan(info, s({ codec: 'prores', maxMB: 5, encoder: 'auto' }), ['nvenc', 'cpu'])
    expect([p.encoder, p.mode, p.bitDepth, p.passes]).toEqual(['cpu', 'quality', 10, 1])
    expect(videoFilter(info, p)).toBe('fps=60,format=yuv422p10le')
    const a = buildArgs(info, p, { input: info.path, output: 'o.mov' })
    expect(a.slice(a.indexOf('-c:v'), a.indexOf('-c:v') + 6)).toEqual(['-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0'])
    expect(a).not.toContain('-b:v')
  })
  it('keeps the profile of a ProRes source', () => {
    const std = { ...info, videoCodec: 'prores', proresProfile: 2 }
    const p = buildPlan(std, s({ codec: 'prores' }), ['cpu'])
    expect([p.proresProfile, p.chroma444]).toEqual([2, false])
    const a = buildArgs(std, p, { input: std.path, output: 'o.mov' })
    expect(a[a.indexOf('-profile:v') + 1]).toBe('2')
    expect(buildPlan({ ...info, proresProfile: -1 }, s({ codec: 'prores' }), ['cpu']).proresProfile).toBe(3)
  })
  it('picks 4444 for 4:4:4 sources and keeps HDR tags', () => {
    const src = { ...info, is444: true, hdr: true, colorTags: { primaries: 'bt2020', trc: 'smpte2084', space: 'bt2020nc' } }
    const p = buildPlan(src, s({ codec: 'prores' }), ['cpu'])
    expect([p.chroma444, p.hdr]).toEqual([true, true])
    expect(videoFilter(src, p)).toBe('fps=60,format=yuv444p10le')
    const a = buildArgs(src, p, { input: src.path, output: 'o.mov' })
    expect(a[a.indexOf('-profile:v') + 1]).toBe('4')
    expect(a[a.indexOf('-color_trc') + 1]).toBe('smpte2084')
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

describe('frame pipeline args', () => {
  const src = { ...info, width: 1920, height: 1080, fps: 30, fpsFraction: '30/1', durationSec: 10 }
  const plan = buildPlan(src, s({ interpolate: '120' }), ['cpu'])
  const out = 'C:\\out\\a_squish.mp4'

  it('exports PNG frames at output size with the exact source rate', () => {
    const a = buildFrameExportArgs(src, plan, { input: src.path, dir: 'C:\\w\\frames-in' })
    expect(pick(a, '-i')).toBe(src.path)
    expect(pick(a, '-vf')).toBe('fps=30,format=rgb24')
    expect(a.at(-1)).toBe('C:\\w\\frames-in\\%08d.png')
    expect(pick(a, '-progress')).toBe('pipe:1')
  })
  it('keeps the fractional source rate and tonemaps HDR before scaling', () => {
    const hdr = { ...src, hdr: true, fps: 29.97, fpsFraction: '30000/1001', width: 3840, height: 2160 }
    const p = buildPlan(hdr, s({ interpolate: '60', res: '1080' }), ['cpu'])
    const vf = pick(buildFrameExportArgs(hdr, p, { input: hdr.path, dir: 'D:\\f' }), '-vf')!
    expect(vf.startsWith('zscale=t=linear:npl=100')).toBe(true)
    expect(vf).toContain('scale=1920:1080:flags=lanczos')
    expect(vf.endsWith('fps=30000/1001,format=rgb24')).toBe(true)
  })
  it('uses the even output size for odd and portrait sources', () => {
    const odd = { ...src, width: 1081, height: 1921 }
    const vf = pick(buildFrameExportArgs(odd, buildPlan(odd, s({ interpolate: '60' }), ['cpu']), { input: odd.path, dir: 'D:\\f' }), '-vf')!
    expect(vf).toContain('scale=1082:1922:flags=lanczos')
    const portrait = { ...src, width: 2160, height: 3840 }
    const vf2 = pick(buildFrameExportArgs(portrait, buildPlan(portrait, s({ interpolate: '60', res: '1080' }), ['cpu']), { input: portrait.path, dir: 'D:\\f' }), '-vf')!
    expect(vf2).toContain('scale=1080:1920:flags=lanczos')
  })
  it('encodes from frames with audio from the source and BT.709 tags', () => {
    const a = buildArgs(src, plan, { input: src.path, output: out, frames: { dir: 'C:\\w\\frames-out', fps: 120 } })
    const i = a.indexOf('-framerate')
    expect(a.slice(i, i + 4)).toEqual(['-framerate', '120', '-i', 'C:\\w\\frames-out\\%08d.png'])
    expect(a.filter((x) => x === '-i')).toHaveLength(2)
    expect(a.lastIndexOf('-i')).toBeGreaterThan(i)
    expect(a[a.lastIndexOf('-i') + 1]).toBe(src.path)
    expect(a).toContain('1:a:0')
    expect(a).not.toContain('0:a:0')
    expect(pick(a, '-vf')).toBe('scale=out_color_matrix=bt709,format=yuv420p')
    expect(pick(a, '-colorspace')).toBe('bt709')
    expect(a.at(-1)).toBe(out)
  })
  it('uses nv12 for QSV and has a single input for silent sources and pass 1', () => {
    const qsv = buildArgs(src, buildPlan(src, s({ interpolate: '60' }), ['qsv', 'cpu']), { input: src.path, output: out, frames: { dir: 'F', fps: 60 } })
    expect(pick(qsv, '-vf')).toBe('scale=out_color_matrix=bt709,format=nv12')
    const silent = { ...src, hasAudio: false, audioKbps: 0, audioCodec: '' }
    const a = buildArgs(silent, buildPlan(silent, s({ interpolate: '60' }), ['cpu']), { input: silent.path, output: out, frames: { dir: 'F', fps: 60 } })
    expect(a.filter((x) => x === '-i')).toHaveLength(1)
    expect(a).toContain('-an')
    const t = buildPlan(src, s({ interpolate: '60', maxMB: 10 }), ['cpu'])
    const p1 = buildArgs(src, t, { input: src.path, output: out, pass: 1, passLogName: 'squish2pass', frames: { dir: 'F', fps: 60 } })
    expect(p1.filter((x) => x === '-i')).toHaveLength(1)
    expect(p1.slice(-3)).toEqual(['-f', 'null', 'NUL'])
  })
  it('leaves the normal path untouched', () => {
    const a = buildArgs(src, buildPlan(src, s(), ['cpu']), { input: src.path, output: out })
    expect(a).not.toContain('-framerate')
    expect(pick(a, '-vf')).toBe('fps=30,format=yuv420p')
  })
})
