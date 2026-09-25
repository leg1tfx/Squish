import type { EncodeProgress, EncodeResult, EncoderId, PresetSettings, Settings, StoreData, VideoInfo } from './types'

export type ProbeResult = { ok: true; info: VideoInfo; thumbUrl: string | null } | { ok: false; message: string }
export type PreviewResult = { ok: true; beforeUrl: string; afterUrl: string } | { ok: false; message: string }
export type EncodeOutcome =
  | { ok: true; result: EncodeResult }
  | { ok: false; kind: 'aborted' | 'disk' | 'ffmpeg' | 'size'; message: string; log: string }
/** What the renderer knows about an encode that main does not: which preset is picked and whether it was edited. */
export interface EncodeMeta { presetId: string; edited: boolean }
export interface SquishApi {
  version: string
  pathForFile(file: File): string
  openFileDialog(): Promise<string | null>
  probe(path: string): Promise<ProbeResult>
  encoders(): Promise<EncoderId[]>
  preview(settings: Settings): Promise<PreviewResult>
  encode(settings: Settings): Promise<EncodeOutcome>
  cancel(): Promise<void>
  onProgress(cb: (p: EncodeProgress) => void): () => void
  onLog(cb: (line: string) => void): () => void
  store: {
    get(): Promise<StoreData>
    addPreset(label: string, settings: PresetSettings): Promise<StoreData>
    renamePreset(id: string, label: string): Promise<StoreData>
    deletePreset(id: string): Promise<StoreData>
    setLastPreset(id: string): Promise<StoreData>
    dismissPromo(): Promise<StoreData>
  }
  revealInFolder(path: string): Promise<void>
  openPromo(): Promise<void>
  openFfmpegSource(): Promise<void>
  window: { minimize(): void; toggleMaximize(): void; close(): void }
}
