import { create } from 'zustand'
import { buildPlan } from '@shared/planner'
import { BUILT_IN_PRESETS, DEFAULT_PRESET_ID } from '@shared/presets'
import type { EncodeProgress, EncodeResult, EncoderId, Plan, Settings, StoreData, VideoInfo } from '@shared/types'
import { allPresets, settingsFromPreset } from './logic'

export type Screen = 'drop' | 'settings' | 'compare' | 'encoding' | 'done'

interface State {
  screen: Screen
  info: VideoInfo | null
  thumbUrl: string | null
  available: EncoderId[] | null
  data: StoreData | null
  presetId: string
  settings: Settings
  edited: boolean
  plan: Plan | null
  dropError: string | null
  dropNonce: number
  progress: EncodeProgress | null
  log: string[]
  result: EncodeResult | null
  encodeError: { kind: string; message: string; log: string } | null
  preview: { beforeUrl: string; afterUrl: string } | null
  previewError: string | null
  init(): Promise<void>
  openFile(path: string): Promise<void>
  pickPreset(id: string): void
  edit(patch: Partial<Settings>): void
  savePreset(label: string): Promise<void>
  renamePreset(id: string, label: string): Promise<void>
  deletePreset(id: string): Promise<void>
  loadPreview(): Promise<void>
  startEncode(): Promise<void>
  cancelEncode(): Promise<void>
  backToSettings(): void
  reset(): void
  dismissPromo(): Promise<void>
  setTelemetry(on: boolean): Promise<void>
  acknowledgeTelemetryNotice(): Promise<void>
}

const api = (): Window['squish'] => window.squish
const initialSettings = settingsFromPreset(BUILT_IN_PRESETS[0], 'auto')

export const useSquish = create<State>((set, get) => {
  const replan = (settings: Settings): Plan | null => {
    const { info, available } = get()
    return info ? buildPlan(info, settings, available ?? ['cpu']) : null
  }
  const applyPreset = (id: string, data: StoreData): void => {
    const p = allPresets(data).find((x) => x.id === id) ?? BUILT_IN_PRESETS[0]
    const settings = settingsFromPreset(p, get().settings.encoder)
    set({ presetId: p.id, settings, edited: false, plan: replan(settings) })
  }

  return {
    screen: 'drop', info: null, thumbUrl: null, available: null, data: null,
    presetId: DEFAULT_PRESET_ID, settings: initialSettings, edited: false, plan: null,
    dropError: null, dropNonce: 0, progress: null, log: [], result: null, encodeError: null,
    preview: null, previewError: null,

    async init() {
      const data = await api().store.get()
      set({ data })
      applyPreset(data.lastPresetId, data)
      api().encoders().then((available) => set({ available, plan: replan(get().settings) }))
      api().onProgress((progress) => set({ progress }))
      api().onLog((line) => set((s) => ({ log: [...s.log.slice(-299), line] })))
    },

    async openFile(path) {
      const r = await api().probe(path)
      if (!r.ok) { set((s) => ({ dropError: r.message, dropNonce: s.dropNonce + 1 })); return }
      set({ info: r.info, thumbUrl: r.thumbUrl, dropError: null, preview: null, screen: 'settings' })
      set({ plan: replan(get().settings) })
    },

    pickPreset(id) {
      const data = get().data
      if (!data) return
      applyPreset(id, data)
      api().store.setLastPreset(id).then((d) => set({ data: d }))
    },

    edit(patch) {
      const settings = { ...get().settings, ...patch }
      set({ settings, edited: true, plan: replan(settings), preview: null })
    },

    async savePreset(label) {
      const { encoder: _encoder, ...rest } = get().settings
      const data = await api().store.addPreset(label, rest)
      set({ data, presetId: data.lastPresetId, edited: false })
    },
    async renamePreset(id, label) { set({ data: await api().store.renamePreset(id, label) }) },
    async deletePreset(id) {
      const data = await api().store.deletePreset(id)
      set({ data })
      if (get().presetId === id) applyPreset(data.lastPresetId, data)
    },

    async loadPreview() {
      set({ screen: 'compare', preview: null, previewError: null })
      const r = await api().preview(get().settings)
      if (r.ok) set({ preview: { beforeUrl: r.beforeUrl, afterUrl: r.afterUrl } })
      else set({ previewError: r.message })
    },

    async startEncode() {
      set({ screen: 'encoding', progress: null, log: [], encodeError: null, result: null })
      const { settings, presetId, edited } = get()
      const r = await api().encode(settings, { presetId, edited })
      if (r.ok) set({ result: r.result, screen: 'done' })
      else if (r.kind === 'aborted') set({ screen: 'settings' })
      else set({ encodeError: { kind: r.kind, message: r.message, log: r.log } })
    },
    async cancelEncode() { await api().cancel() },
    backToSettings() { set({ screen: 'settings', encodeError: null }) },
    reset() { set({ screen: 'drop', info: null, thumbUrl: null, result: null, preview: null, progress: null }) },
    async dismissPromo() { set({ data: await api().store.dismissPromo() }) },
    async setTelemetry(on) { set({ data: await api().store.setTelemetry(on) }) },
    async acknowledgeTelemetryNotice() { set({ data: await api().store.telemetryNoticeSeen() }) }
  }
})
