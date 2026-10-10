import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { VideoInfo } from '@shared/types'

export class ProbeError extends Error {
  constructor(public reason: 'no-video' | 'unreadable', message = reason) { super(message) }
}

interface Stream {
  codec_type?: string; codec_name?: string; width?: number; height?: number
  avg_frame_rate?: string; r_frame_rate?: string; bit_rate?: string; color_transfer?: string
  pix_fmt?: string; bits_per_raw_sample?: string
  disposition?: { attached_pic?: number }; side_data_list?: { rotation?: number }[]; tags?: { rotate?: string }
}
interface ProbeJson { format?: { duration?: string; bit_rate?: string }; streams?: Stream[] }

function rate(s: string | undefined): { fps: number; fraction: string } | null {
  if (!s) return null
  const [n, d] = s.split('/').map(Number)
  if (!n || !d) return null
  return { fps: n / d, fraction: `${n}/${d}` }
}

export function parseProbe(json: unknown, path: string, sizeBytes: number): VideoInfo {
  const j = json as ProbeJson
  const streams = j.streams ?? []
  const v = streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1)
  if (!v || !v.width || !v.height) throw new ProbeError('no-video')
  const duration = Number(j.format?.duration)
  if (!Number.isFinite(duration) || duration <= 0) throw new ProbeError('unreadable')
  const r = rate(v.avg_frame_rate) ?? rate(v.r_frame_rate)
  if (!r) throw new ProbeError('unreadable')

  const rotation = Math.abs(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? Number(v.tags?.rotate ?? 0))
  const swap = rotation % 180 === 90
  const a = streams.find((s) => s.codec_type === 'audio')
  const audioKbps = a?.bit_rate ? Math.round(Number(a.bit_rate) / 1000) : 0
  const totalKbps = j.format?.bit_rate ? Math.round(Number(j.format.bit_rate) / 1000) : 0
  const videoKbps = v.bit_rate ? Math.round(Number(v.bit_rate) / 1000) : Math.max(0, totalKbps - audioKbps)

  return {
    path, sizeBytes, durationSec: duration,
    width: swap ? v.height : v.width, height: swap ? v.width : v.height,
    fps: r.fps, fpsFraction: r.fraction,
    videoCodec: v.codec_name ?? 'unknown', videoKbps,
    hasAudio: Boolean(a), audioCodec: a?.codec_name ?? '', audioKbps,
    tenBit: Number(v.bits_per_raw_sample) >= 10 || /(10|12|14|16)(le|be)$|p010|p012|p016/.test(v.pix_fmt ?? ''),
    hdr: v.color_transfer === 'smpte2084' || v.color_transfer === 'arib-std-b67'
  }
}

const run = promisify(execFile)

export async function probeFile(ffprobe: string, path: string): Promise<VideoInfo> {
  let stdout: string
  try {
    ;({ stdout } = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }))
  } catch {
    throw new ProbeError('unreadable')
  }
  const { size } = await stat(path)
  return parseProbe(JSON.parse(stdout), path, size)
}
