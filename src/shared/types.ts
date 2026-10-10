export type ResChoice = 'best' | '1440' | '1080' | '720'
export type FpsChoice = 'best' | '60' | '30'
export type AudioChoice = 'best' | 'high' | 'standard'
export type InterpolateChoice = 'off' | '60' | '120'
export type Codec = 'h264' | 'h265' | 'prores'
export type EncoderId = 'nvenc' | 'amf' | 'qsv' | 'cpu'
export type EncoderChoice = 'auto' | EncoderId

export interface Settings {
  res: ResChoice
  fps: FpsChoice
  /** Optional frame interpolation (RIFE). 'off' keeps the source timing. */
  interpolate: InterpolateChoice
  audio: AudioChoice
  codec: Codec
  /** null = Auto (constant quality). Number = max size in MB (1 MB = 1e6 bytes). */
  maxMB: number | null
  /** null = automatic. Number = manual video bitrate in kbit/s (ignored when maxMB is set). */
  bitrateKbps: number | null
  encoder: EncoderChoice
}

export type PresetSettings = Omit<Settings, 'encoder'>

export interface Preset {
  id: string
  label: string
  builtIn: boolean
  settings: PresetSettings
}

export interface VideoInfo {
  path: string
  sizeBytes: number
  durationSec: number
  /** Display dimensions (rotation already applied). */
  width: number
  height: number
  fps: number
  /** Exact source rate as ffmpeg fraction, e.g. "60000/1001". */
  fpsFraction: string
  videoCodec: string
  videoKbps: number
  hasAudio: boolean
  audioCodec: string
  audioKbps: number
  hdr: boolean
  /** Bits per channel of the source, capped at 12 (the most HEVC can carry). */
  bitDepth: 8 | 10 | 12
  /** Source is 4:4:4 or RGB; ProRes then uses the 4444 profile. */
  is444?: boolean
  /** ProRes sources only: 0 Proxy, 1 LT, 2 Standard, 3 HQ, 4 4444, 5 4444 XQ. */
  proresProfile?: number
  /** Colour tags of the source, used to keep HDR. */
  colorTags?: { primaries: string; trc: string; space: string }
}

export type PlanMode = 'quality' | 'target' | 'bitrate'

export interface PlanWarning { text: string; suggest: ResChoice }

export type EncodeErrorKind = 'aborted' | 'disk' | 'ffmpeg' | 'size' | 'smooth' | 'addon'

export interface EncodeProgress {
  fraction: number; pass: number; passes: number; speed: number | null; remainingSec: number | null; encoder: EncoderId
  /** Which stage is running. Without smooth motion it is always 'encode'. */
  phase: EncodePhase
}
export interface EncodeResult { output: string; bytes: number; encoder: EncoderId; fellBack: boolean; attempts: number }

export interface Change {
  label: 'RESOLUTION' | 'FRAME RATE' | 'AUDIO' | 'VIDEO' | 'HDR' | 'COLOR'
  from: string
  /** 'kept' means unchanged quality. */
  to: string
}

export interface StoreData {
  version: 1
  userPresets: Preset[]
  lastPresetId: string
  promoDismissed: boolean
  /** Anonymous stats. Opt-out: 'on' unless the user turned it off. */
  telemetry: 'on' | 'off'
  /** True once the first-run stats notice was answered (or the About switch was used). */
  telemetryNoticeSeen: boolean
}

export interface Plan {
  mode: PlanMode
  encoder: EncoderId
  codec: Codec
  width: number
  height: number
  fps: number
  /** Value for the ffmpeg fps filter, e.g. "60" or "60000/1001". */
  fpsExpr: string
  /** Non-null when frames are interpolated before encoding. */
  interpolation: Interpolation | null
  /** Output bits per channel. Follows the source automatically; above 8 only with HEVC. */
  bitDepth: 8 | 10 | 12
  /** Keep HDR (no tone mapping). Follows the source automatically; HEVC only. */
  hdr: boolean
  /** ProRes only: prores_ks profile 0-5 (see VideoInfo.proresProfile). Follows the source, else HQ or 4444. */
  proresProfile: number
  /** ProRes only: 4:4:4 (profiles 4444 and up) instead of 4:2:2. */
  chroma444: boolean
  /** null when the source has no audio. */
  audioKbps: number | null
  videoKbps: number
  passes: 1 | 2
  estimateBytes: number
  warning: PlanWarning | null
  changes: Change[]
}

export type EncodePhase = 'prepare' | 'interpolate' | 'encode'

export interface Interpolation {
  targetFps: 60 | 120
  sourceFps: number
  /** Number of frames RIFE must produce: round(duration * targetFps). */
  frames: number
}
export type RifeStatus = 'unavailable' | 'missing' | 'installed'
