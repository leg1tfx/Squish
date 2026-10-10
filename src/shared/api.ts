import type { EncodeErrorKind, EncodeProgress, EncodeResult, EncoderId, PresetSettings, RifeStatus, Settings, StoreData, VideoInfo } from './types'
import type { HdrOverride } from './hdr'
import type { RendererEventName } from './telemetry'

export type ProbeResult = { ok: true; info: VideoInfo; thumbUrl: string | null } | { ok: false; message: string }
export type PreviewResult = { ok: true; beforeUrl: string; afterUrl: string } | { ok: false; message: string }
export type EncodeOutcome =
  | { ok: true; result: EncodeResult }
  | { ok: false; kind: EncodeErrorKind; message: string; log: string }
export interface RifeState { status: RifeStatus; gpu: 'unknown' | 'ok' | 'none'; sizeBytes: number }
export type RifeInstallOutcome =
  | { ok: true }
  | { ok: false; kind: 'network' | 'hash' | 'extract' | 'disk' | 'aborted' | 'gpu'; message: string }
/** What the renderer knows about an encode that main does not: which preset is picked and whether it was edited. */
export interface EncodeMeta { presetId: string; edited: boolean }
export interface SquishApi {
  version: string
  pathForFile(file: File): string
  openFileDialog(): Promise<string | null>
  probe(path: string): Promise<ProbeResult>
  /** Tags the loaded file as HLG or PQ HDR (or back to auto) and returns the file info to plan with. */
  setHdrOverride(mode: HdrOverride): Promise<VideoInfo | null>
  encoders(): Promise<EncoderId[]>
  preview(settings: Settings): Promise<PreviewResult>
  encode(settings: Settings, meta: EncodeMeta): Promise<EncodeOutcome>
  cancel(): Promise<void>
  onProgress(cb: (p: EncodeProgress) => void): () => void
  onLog(cb: (line: string) => void): () => void
  rife: {
    status(): Promise<RifeState>
    /** Downloads and verifies the add-on, then checks for a Vulkan GPU. Progress arrives through onProgress. */
    install(): Promise<RifeInstallOutcome>
    cancelInstall(): Promise<void>
    onProgress(cb: (p: { done: number; total: number }) => void): () => void
  }
  store: {
    get(): Promise<StoreData>
    addPreset(label: string, settings: PresetSettings): Promise<StoreData>
    renamePreset(id: string, label: string): Promise<StoreData>
    deletePreset(id: string): Promise<StoreData>
    setLastPreset(id: string): Promise<StoreData>
    dismissPromo(): Promise<StoreData>
    setTelemetry(on: boolean): Promise<StoreData>
    telemetryNoticeSeen(): Promise<StoreData>
  }
  revealInFolder(path: string): Promise<void>
  openPromo(): Promise<void>
  openFfmpegSource(): Promise<void>
  /** Anonymous stats for the promo card. Main ignores any other name and checks consent. */
  track(name: RendererEventName): void
  window: { minimize(): void; toggleMaximize(): void; close(): void }
}
