import type { Codec, EncoderId, Plan, VideoInfo } from './types'

export const PASSLOG_NAME = 'squish2pass'

export const TONEMAP_CHAIN = [
  'zscale=t=linear:npl=100', 'format=gbrpf32le', 'zscale=p=bt709',
  'tonemap=tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv'
]

export interface ArgsOptions {
  input: string
  output: string
  pass?: 1 | 2
  passLogName?: string
  sample?: { startSec: number; durationSec: number }
  /** Read interpolated PNG frames instead of the source video. Audio still comes from `input`. */
  frames?: { dir: string; fps: number }
}

type Lossy = Exclude<Codec, 'prores'>
const NAMES: Record<Lossy, Record<EncoderId, string>> = {
  h264: { cpu: 'libx264', nvenc: 'h264_nvenc', amf: 'h264_amf', qsv: 'h264_qsv' },
  h265: { cpu: 'libx265', nvenc: 'hevc_nvenc', amf: 'hevc_amf', qsv: 'hevc_qsv' }
}
const QUALITY: Record<EncoderId, Record<Lossy, string>> = {
  cpu: { h264: '20', h265: '23' }, nvenc: { h264: '23', h265: '25' },
  amf: { h264: '23', h265: '25' }, qsv: { h264: '23', h265: '25' }
}

export function videoFilter(info: VideoInfo, plan: Plan): string {
  const parts: string[] = []
  if (info.hdr && !plan.hdr) parts.push(...TONEMAP_CHAIN)
  if (plan.width !== info.width || plan.height !== info.height) parts.push(`scale=${plan.width}:${plan.height}:flags=lanczos`)
  parts.push(`fps=${plan.fpsExpr}`)
  parts.push(`format=${pixFmt(plan)}`)
  return parts.join(',')
}

/** Hardware encoders take semi-planar input (nv12, or p010le for 10-bit); libx265 takes planar. 12-bit is CPU only. */
function pixFmt(plan: Plan): string {
  if (plan.codec === 'prores') return plan.chroma444 ? 'yuv444p10le' : 'yuv422p10le'
  if (plan.bitDepth === 12) return 'yuv420p12le'
  if (plan.bitDepth === 10) return plan.encoder === 'cpu' ? 'yuv420p10le' : 'p010le'
  return plan.encoder === 'qsv' ? 'nv12' : 'yuv420p'
}

export function framesFilter(plan: Plan): string {
  return `scale=out_color_matrix=bt709,format=${pixFmt(plan)}`
}

/** Decode, tonemap and scale the source once, at output size, into numbered PNGs for RIFE. */
export function buildFrameExportArgs(info: VideoInfo, plan: Plan, o: { input: string; dir: string }): string[] {
  const parts: string[] = []
  if (info.hdr) parts.push(...TONEMAP_CHAIN)
  if (plan.width !== info.width || plan.height !== info.height) parts.push(`scale=${plan.width}:${plan.height}:flags=lanczos`)
  parts.push(`fps=${info.fpsFraction.replace(/\/1$/, '')}`, 'format=rgb24')
  return ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-nostats', '-i', o.input,
    '-map', '0:v:0', '-vf', parts.join(','), '-start_number', '1', `${o.dir}\\%08d.png`]
}

function rateArgs(plan: Plan): string[] {
  const v = plan.videoKbps
  return ['-b:v', `${v}k`, '-maxrate', `${Math.round(v * 1.5)}k`, '-bufsize', `${v * 2}k`]
}

function encoderArgs(plan: Plan, o: ArgsOptions): string[] {
  const prores = plan.codec === 'prores'
  const name = prores ? '' : NAMES[plan.codec as Lossy][plan.encoder]
  const q = prores ? '' : QUALITY[plan.encoder][plan.codec as Lossy]
  const quality = plan.mode === 'quality'
  if (plan.codec === 'prores') return ['-c:v', 'prores_ks', '-profile:v', plan.chroma444 ? '4' : '3', '-vendor', 'apl0']
  const out: string[] = ['-c:v', name]
  switch (plan.encoder) {
    case 'cpu': {
      out.push('-preset', 'medium')
      out.push(...(quality ? ['-crf', q] : rateArgs(plan)))
      if (plan.codec === 'h264') {
        out.push('-profile:v', 'high')
        if (o.pass) out.push('-pass', String(o.pass), '-passlogfile', o.passLogName ?? PASSLOG_NAME)
      } else {
        const p = o.pass ? `pass=${o.pass}:stats=${o.passLogName ?? PASSLOG_NAME}.log:` : ''
        out.push('-x265-params', `${p}log-level=error`)
      }
      break
    }
    case 'nvenc':
      out.push('-preset', 'p5', '-rc', 'vbr')
      if (quality) out.push('-cq', q, '-b:v', '0')
      else out.push(...(plan.mode === 'target' ? ['-multipass', 'fullres'] : []), ...rateArgs(plan))
      break
    case 'amf':
      out.push(...(quality ? ['-rc', 'qvbr', '-qvbr_quality_level', q] : ['-rc', 'vbr_peak', ...rateArgs(plan)]))
      break
    case 'qsv':
      out.push('-preset', 'medium', ...(quality ? ['-global_quality', q] : rateArgs(plan)))
      break
  }
  if (plan.codec === 'h265') out.push('-tag:v', 'hvc1')
  return out
}

export function buildArgs(info: VideoInfo, plan: Plan, o: ArgsOptions): string[] {
  const a: string[] = ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-nostats']
  const withAudio = plan.audioKbps !== null && o.pass !== 1
  if (o.frames) {
    a.push('-framerate', String(o.frames.fps), '-i', `${o.frames.dir}\\%08d.png`)
    if (withAudio) a.push('-i', o.input)
    a.push('-map', '0:v:0')
    if (withAudio) a.push('-map', '1:a:0')
    a.push('-vf', framesFilter(plan))
  } else {
    if (o.sample) a.push('-ss', String(o.sample.startSec))
    a.push('-i', o.input)
    if (o.sample) a.push('-t', String(o.sample.durationSec))
    a.push('-map', '0:v:0')
    if (withAudio) a.push('-map', '0:a:0')
    a.push('-vf', videoFilter(info, plan))
  }
  if (plan.hdr && info.colorTags) a.push('-color_primaries', info.colorTags.primaries, '-color_trc', info.colorTags.trc, '-colorspace', info.colorTags.space)
  else if (info.hdr || o.frames) a.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709')
  a.push(...encoderArgs(plan, o))
  if (o.pass === 1) {
    a.push('-an', '-f', 'null', 'NUL')
    return a
  }
  a.push(...(withAudio ? ['-c:a', 'aac', '-b:a', `${plan.audioKbps}k`] : ['-an']))
  a.push('-movflags', '+faststart', o.output)
  return a
}
