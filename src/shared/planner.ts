import { codecLabel, formatFps, resLabel } from './format'
import { INTERP_TOLERANCE, interpTarget } from './interpolation'
import type {
  AudioChoice, Change, Codec, EncoderChoice, EncoderId, FpsChoice, Plan, PlanMode, PlanWarning, ResChoice, Settings, VideoInfo
} from './types'

export const MAX_SHORT_SIDE = 2160
export const MAX_FPS = 60
export const SIZE_MARGIN = 0.97
export const MIN_VIDEO_KBPS = 50
export const ENCODER_ORDER: EncoderId[] = ['nvenc', 'amf', 'qsv', 'cpu']
export const AUDIO_KBPS: Record<AudioChoice, number> = { best: 320, high: 192, standard: 128 }
// ProRes 422 HQ is about 3.5 bits per pixel; it has fixed profiles instead of a bitrate.
export const QUALITY_BPP: Record<Codec, number> = { h264: 0.1, h265: 0.06, prores: 3.5 }
export const PRORES_BPP = [0.72, 1.64, 2.36, 3.5, 5.3, 8]
export const WARN_BPP: Record<Codec, number> = { h264: 0.035, h265: 0.022, prores: 0 }
const RES_SHORT: Record<Exclude<ResChoice, 'best'>, number> = { '1440': 1440, '1080': 1080, '720': 720 }
const LOWER_RES: Exclude<ResChoice, 'best'>[] = ['1440', '1080', '720']

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2)
const srcShort = (info: VideoInfo): number => Math.min(info.width, info.height)

export function outputDims(info: VideoInfo, res: ResChoice): { width: number; height: number } {
  const src = srcShort(info)
  const cap = res === 'best' ? MAX_SHORT_SIDE : RES_SHORT[res]
  const target = Math.min(src, cap)
  const k = target / src
  return { width: even(info.width * k), height: even(info.height * k) }
}

export function disabledRes(info: VideoInfo): ResChoice[] {
  return LOWER_RES.filter((r) => RES_SHORT[r] > srcShort(info))
}

export function disabledFps(info: VideoInfo): FpsChoice[] {
  return info.fps < 59.5 ? ['60'] : []
}

function outputFps(info: VideoInfo, fps: FpsChoice): { fps: number; expr: string } {
  const cap = fps === '30' ? 30 : MAX_FPS
  if (info.fps <= cap + 0.01) return { fps: info.fps, expr: info.fpsFraction.replace(/\/1$/, '') }
  return { fps: cap, expr: String(cap) }
}

function outputAudio(info: VideoInfo, audio: AudioChoice): number | null {
  if (!info.hasAudio) return null
  const src = info.audioKbps > 0 ? info.audioKbps : Infinity
  return Math.min(AUDIO_KBPS[audio], src)
}

function resolveEncoder(choice: EncoderChoice, available: EncoderId[]): EncoderId {
  if (choice !== 'auto') return available.includes(choice) ? choice : 'cpu'
  return ENCODER_ORDER.find((e) => available.includes(e)) ?? 'cpu'
}

function warningFor(
  info: VideoInfo, s: Settings, width: number, height: number, fps: number, videoKbps: number
): PlanWarning | null {
  if (s.maxMB === null) return null
  const thr = WARN_BPP[s.codec]
  const bpp = (w: number, h: number): number => (videoKbps * 1000) / (w * h * fps)
  if (bpp(width, height) >= thr) return null
  const current = Math.min(width, height)
  const lower = LOWER_RES.filter((r) => RES_SHORT[r] < current)
  if (lower.length === 0) return null
  const fit = lower.find((r) => {
    const d = outputDims(info, r)
    return bpp(d.width, d.height) >= thr
  })
  const suggest = fit ?? '720'
  return { text: `${s.maxMB} MB is tight for ${resLabel(current)}. ${resLabel(RES_SHORT[suggest])} will look cleaner.`, suggest }
}

function changesFor(info: VideoInfo, p: Omit<Plan, 'changes'>): Change[] {
  const rows: Change[] = []
  const sameDims = p.width === even(info.width) && p.height === even(info.height)
  rows.push({ label: 'RESOLUTION', from: `${info.width}×${info.height}`, to: sameDims ? 'kept' : `${p.width}×${p.height}` })
  rows.push({
    label: 'FRAME RATE', from: formatFps(info.fps),
    to: p.interpolation ? `${formatFps(p.fps)} (interpolated)` : Math.abs(p.fps - info.fps) < 0.01 ? 'kept' : formatFps(p.fps)
  })
  if (p.audioKbps !== null) {
    const from = info.audioKbps > 0 ? `${codecLabel(info.audioCodec)} ${info.audioKbps}k` : codecLabel(info.audioCodec)
    const kept = info.audioCodec === 'aac' && p.audioKbps >= info.audioKbps
    rows.push({ label: 'AUDIO', from, to: kept ? 'kept' : `AAC ${p.audioKbps}k` })
  }
  const srcM = info.videoKbps > 0 ? ` ${(info.videoKbps / 1000).toFixed(0)}M` : ''
  rows.push({ label: 'VIDEO', from: `${codecLabel(info.videoCodec)}${srcM}`, to: `${codecLabel(p.codec)} ${(p.videoKbps / 1000).toFixed(1)}M` })
  if (info.hdr) rows.push({ label: 'HDR', from: 'HDR', to: p.hdr ? 'kept' : 'SDR' })
  if (info.bitDepth > 8) rows.push({ label: 'COLOR', from: `${info.bitDepth}-bit`, to: p.bitDepth === info.bitDepth ? 'kept' : `${p.bitDepth}-bit` })
  return rows
}

export function buildPlan(
  info: VideoInfo, s: Settings, available: EncoderId[], override: { encoder?: EncoderId; videoKbps?: number } = {}
): Plan {
  const { width, height } = outputDims(info, s.res)
  const prores = s.codec === 'prores'
  // Keep the source's ProRes profile (HQ from Standard would only inflate the file); otherwise HQ, or 4444 for 4:4:4 sources.
  const proresProfile = info.proresProfile !== undefined && info.proresProfile >= 0 ? info.proresProfile : info.is444 ? 4 : 3
  const target = interpTarget(s.interpolate)
  // Needs at least 2 source frames and a source clearly slower than the target.
  const interp = target !== null && info.fps < target - INTERP_TOLERANCE && info.durationSec * info.fps >= 2 ? target : null
  const { fps, expr } = interp !== null ? { fps: interp, expr: String(interp) } : outputFps(info, s.fps)
  const audioKbps = outputAudio(info, s.audio)
  const a = audioKbps ?? 0
  const dur = info.durationSec

  let mode: PlanMode
  let videoKbps: number
  if (prores) {
    mode = 'quality'
    videoKbps = Math.round((width * height * fps * PRORES_BPP[proresProfile]) / 1000)
  } else if (s.maxMB !== null) {
    mode = 'target'
    const budget = s.maxMB * 1e6 * SIZE_MARGIN
    videoKbps = override.videoKbps ?? Math.max(MIN_VIDEO_KBPS, Math.floor((budget * 8) / dur / 1000 - a))
  } else if (s.bitrateKbps !== null) {
    mode = 'bitrate'
    videoKbps = override.videoKbps ?? s.bitrateKbps
  } else {
    mode = 'quality'
    videoKbps = Math.round((width * height * fps * QUALITY_BPP[s.codec]) / 1000)
  }

  const estimateBytes = Math.round(((videoKbps + a) * 1000 * dur) / 8)

  // Above 8 bit and HDR only where they play everywhere (HEVC). Smooth motion goes through 8-bit PNG frames, so it stays 8-bit SDR.
  const deep = (s.codec === 'h265' || prores) && interp === null
  // ffmpeg's ProRes encoder is 10-bit only.
  const bitDepth = prores ? 10 : deep ? info.bitDepth : 8
  const hdr = deep && info.hdr
  // No GPU encoder does 12-bit, so it goes to the CPU.
  const encoder = override.encoder ?? (bitDepth === 12 || prores ? 'cpu' : resolveEncoder(s.encoder, available))

  const base = {
    mode, bitDepth, hdr, proresProfile, chroma444: prores && proresProfile >= 4, encoder, codec: s.codec, width, height, fps, fpsExpr: expr, audioKbps, videoKbps,
    interpolation: interp !== null
      ? { targetFps: interp, sourceFps: info.fps, frames: Math.round(info.durationSec * interp) }
      : null,
    passes: (encoder === 'cpu' && mode === 'target' ? 2 : 1) as 1 | 2,
    estimateBytes,
    warning: prores ? null : warningFor(info, s, width, height, fps, videoKbps)
  }
  return { ...base, changes: changesFor(info, base) }
}
