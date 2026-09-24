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
}

const NAMES: Record<Codec, Record<EncoderId, string>> = {
  h264: { cpu: 'libx264', nvenc: 'h264_nvenc', amf: 'h264_amf', qsv: 'h264_qsv' },
  h265: { cpu: 'libx265', nvenc: 'hevc_nvenc', amf: 'hevc_amf', qsv: 'hevc_qsv' }
}
const QUALITY: Record<EncoderId, Record<Codec, string>> = {
  cpu: { h264: '20', h265: '23' }, nvenc: { h264: '23', h265: '25' },
  amf: { h264: '23', h265: '25' }, qsv: { h264: '23', h265: '25' }
}

export function videoFilter(info: VideoInfo, plan: Plan): string {
  const parts: string[] = []
  if (info.hdr) parts.push(...TONEMAP_CHAIN)
  if (plan.width !== info.width || plan.height !== info.height) parts.push(`scale=${plan.width}:${plan.height}:flags=lanczos`)
  parts.push(`fps=${plan.fpsExpr}`)
  parts.push(`format=${plan.encoder === 'qsv' ? 'nv12' : 'yuv420p'}`)
  return parts.join(',')
}

function rateArgs(plan: Plan): string[] {
  const v = plan.videoKbps
  return ['-b:v', `${v}k`, '-maxrate', `${Math.round(v * 1.5)}k`, '-bufsize', `${v * 2}k`]
}

function encoderArgs(plan: Plan, o: ArgsOptions): string[] {
  const name = NAMES[plan.codec][plan.encoder]
  const q = QUALITY[plan.encoder][plan.codec]
  const quality = plan.mode === 'quality'
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
  if (o.sample) a.push('-ss', String(o.sample.startSec))
  a.push('-i', o.input)
  if (o.sample) a.push('-t', String(o.sample.durationSec))
  a.push('-map', '0:v:0')
  const withAudio = plan.audioKbps !== null && o.pass !== 1
  if (withAudio) a.push('-map', '0:a:0')
  a.push('-vf', videoFilter(info, plan))
  if (info.hdr) a.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709')
  a.push(...encoderArgs(plan, o))
  if (o.pass === 1) {
    a.push('-an', '-f', 'null', 'NUL')
    return a
  }
  a.push(...(withAudio ? ['-c:a', 'aac', '-b:a', `${plan.audioKbps}k`] : ['-an']))
  a.push('-movflags', '+faststart', o.output)
  return a
}
