import type { EncodeMeta, EncodeOutcome } from './api'
import { BUILT_IN_PRESETS } from './presets'
import type { EncoderId, Settings, VideoInfo } from './types'

export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mts', 'm2ts', 'wmv'] as const
export const RENDERER_EVENTS = ['promo_shown', 'promo_clicked', 'promo_dismissed'] as const
export type RendererEventName = (typeof RENDERER_EVENTS)[number]
export type Mode = 'quality' | 'target' | 'bitrate'

export type TelemetryEvent =
  | { name: 'app_started'; props: { encoders: string } }
  | {
      name: 'encode_done'
      props: {
        preset: string; edited: boolean; codec: string; res: string; fps: string; mode: Mode; encoder: EncoderId
        gpu_fallback: boolean; attempts: number; input_mb: string; ratio: string; duration: string
      }
    }
  | { name: 'encode_failed'; props: { kind: 'ffmpeg' | 'disk' | 'size'; preset: string; codec: string; encoder_choice: string; encoders: string } }
  | { name: 'encode_cancelled'; props: { progress: string } }
  | { name: 'probe_failed'; props: { ext: string } }
  | { name: RendererEventName }

/** Lower bound inclusive, upper bound exclusive. Non-finite values count as 0. */
function bucket(value: number, edges: number[], labels: string[]): string {
  const v = Number.isFinite(value) ? value : 0
  const i = edges.findIndex((e) => v < e)
  return labels[i === -1 ? edges.length : i]
}

export const sizeBucket = (bytes: number): string =>
  bucket(bytes / 1e6, [10, 50, 100, 500, 2000], ['<10', '10-50', '50-100', '100-500', '500-2000', '>=2000'])

const RATIO_LABELS = ['<10%', '10-30%', '30-50%', '50-70%', '70-90%', '>=90%']
export const ratioBucket = (inBytes: number, outBytes: number): string =>
  inBytes > 0 ? bucket((outBytes / inBytes) * 100, [10, 30, 50, 70, 90], RATIO_LABELS) : RATIO_LABELS[RATIO_LABELS.length - 1]

export const durationBucket = (sec: number): string =>
  bucket(sec, [15, 60, 300, 1200], ['<15', '15-60', '60-300', '300-1200', '>=1200'])

export const progressBucket = (fraction: number | null): string =>
  bucket((fraction ?? 0) * 100, [25, 50, 75], ['0-25%', '25-50%', '50-75%', '75-100%'])

export const presetProp = (id: string): string => (BUILT_IN_PRESETS.some((p) => p.id === id) ? id : 'custom')

export function extProp(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? ''
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase()
  return ext && (VIDEO_EXTENSIONS as readonly string[]).includes(ext) ? ext : 'other'
}

export const modeProp = (s: Settings): Mode => (s.maxMB !== null ? 'target' : s.bitrateKbps !== null ? 'bitrate' : 'quality')

export const encodersProp = (list: readonly EncoderId[]): string => [...list].sort().join(',')

export const isRendererEvent = (name: unknown): name is RendererEventName =>
  typeof name === 'string' && (RENDERER_EVENTS as readonly string[]).includes(name)

export interface EncodeEventInput {
  outcome: EncodeOutcome
  info: Pick<VideoInfo, 'sizeBytes' | 'durationSec'>
  settings: Settings
  meta: EncodeMeta
  encoders: readonly EncoderId[]
  /** Last progress fraction reported before the encode ended, or null if none. */
  lastFraction: number | null
}

export function encodeEvent({ outcome, info, settings, meta, encoders, lastFraction }: EncodeEventInput): TelemetryEvent {
  if (outcome.ok) {
    const r = outcome.result
    return {
      name: 'encode_done',
      props: {
        preset: presetProp(meta.presetId), edited: meta.edited, codec: settings.codec, res: settings.res, fps: settings.fps,
        mode: modeProp(settings), encoder: r.encoder, gpu_fallback: r.fellBack, attempts: r.attempts,
        input_mb: sizeBucket(info.sizeBytes), ratio: ratioBucket(info.sizeBytes, r.bytes), duration: durationBucket(info.durationSec)
      }
    }
  }
  if (outcome.kind === 'aborted') return { name: 'encode_cancelled', props: { progress: progressBucket(lastFraction) } }
  return {
    name: 'encode_failed',
    props: { kind: outcome.kind === 'smooth' || outcome.kind === 'addon' ? 'ffmpeg' : outcome.kind, preset: presetProp(meta.presetId), codec: settings.codec, encoder_choice: settings.encoder, encoders: encodersProp(encoders) }
  }
}
