export type ResChoice = 'best' | '1440' | '1080' | '720'
export type FpsChoice = 'best' | '60' | '30'
export type AudioChoice = 'best' | 'high' | 'standard'
export type InterpolateChoice = 'off' | '60' | '120'
export type Codec = 'h264' | 'h265'
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
}

export type PlanMode = 'quality' | 'target' | 'bitrate'

export interface PlanWarning { text: string; suggest: ResChoice }

export interface EncodeProgress {
  fraction: number; pass: number; passes: number; speed: number | null; remainingSec: number | null; encoder: EncoderId
}
export interface EncodeResult { output: string; bytes: number; encoder: EncoderId; fellBack: boolean; attempts: number }

export interface Change {
  label: 'RESOLUTION' | 'FRAME RATE' | 'AUDIO' | 'VIDEO' | 'HDR'
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
  /** null when the source has no audio. */
  audioKbps: number | null
  videoKbps: number
  passes: 1 | 2
  estimateBytes: number
  warning: PlanWarning | null
  changes: Change[]
}
