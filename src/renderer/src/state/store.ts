import { create } from 'zustand'
import type { RifeState } from '@shared/api'
import { NO_VULKAN_MESSAGE } from '@shared/interpolation'
import { buildPlan } from '@shared/planner'
import { BUILT_IN_PRESETS, DEFAULT_PRESET_ID } from '@shared/presets'
import type { EncodeProgress, EncodeResult, EncoderId, Plan, Settings, StoreData, VideoInfo } from '@shared/types'
import { allPresets, settingsFromPreset } from './logic'

export type Screen = 'drop' | 'settings' | 'compare' | 'encoding' | 'done'

export type AddonState =
  | null
  | { phase: 'ask' }
  | { phase: 'downloading'; done: number; total: number }
  | { phase: 'error'; message: string; retry: boolean }

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
  rife: RifeState | null
  addon: AddonState
  /** One-line note shown on the progress screen, e.g. after the add-on was installed. */
  notice: string | null
  refreshRife(): Promise<void>
  confirmAddon(): Promise<void>
  cancelAddon(): void
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

  const begin = async (notice: string | null = null): Promise<void> => {
    set({ screen: 'encoding', progress: null, log: [], encodeError: null, result: null, notice })
    const { settings, presetId, edited } = get()
    const r = await api().encode(settings, { presetId, edited })
    if (r.ok) set({ result: r.result, screen: 'done' })
    else if (r.kind === 'aborted') set({ screen: 'settings', notice: null })
    else set({ encodeError: { kind: r.kind, message: r.message, log: r.log } })
  }

  return {
    screen: 'drop', info: null, thumbUrl: null, available: null, data: null,
    presetId: DEFAULT_PRESET_ID, settings: initialSettings, edited: false, plan: null,
    dropError: null, dropNonce: 0, progress: null, log: [], result: null, encodeError: null,
    preview: null, previewError: null, rife: null, addon: null, notice: null,

    async init() {
      const data = await api().store.get()
      set({ data })
      applyPreset(data.lastPresetId, data)
      api().encoders().then((available) => set({ available, plan: replan(get().settings) }))
      api().onProgress((progress) => set({ progress }))
      api().onLog((line) => set((s) => ({ log: [...s.log.slice(-299), line] })))
      void get().refreshRife()
      api().rife.onProgress((p) => {
        if (get().addon?.phase === 'downloading') set({ addon: { phase: 'downloading', done: p.done, total: p.total } })
      })
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
      const { plan, rife } = get()
      if (plan?.interpolation) {
        if (rife === null || rife.status === 'unavailable') {
          set({ addon: { phase: 'error', message: 'Smooth motion is not available in this version.', retry: false } })
          return
        }
        if (rife.gpu === 'none') { set({ addon: { phase: 'error', message: NO_VULKAN_MESSAGE, retry: false } }); return }
        if (rife.status === 'missing') { set({ addon: { phase: 'ask' } }); return }
      }
      await begin()
    },

    async refreshRife() { set({ rife: await api().rife.status() }) },

    async confirmAddon() {
      set({ addon: { phase: 'downloading', done: 0, total: get().rife?.sizeBytes ?? 0 } })
      const r = await api().rife.install()
      await get().refreshRife()
      if (r.ok) { set({ addon: null }); await begin('Add-on installed. Starting your video.'); return }
      if (r.kind === 'aborted') { set({ addon: null }); return }
      set({ addon: { phase: 'error', message: r.message, retry: r.kind !== 'gpu' } })
    },

    cancelAddon() {
      if (get().addon?.phase === 'downloading') void api().rife.cancelInstall()
      else set({ addon: null })
    },

    async cancelEncode() { await api().cancel() },
    backToSettings() { set({ screen: 'settings', encodeError: null }) },
    reset() { set({ screen: 'drop', info: null, thumbUrl: null, result: null, preview: null, progress: null, notice: null }) },
    async dismissPromo() { set({ data: await api().store.dismissPromo() }) },
    async setTelemetry(on) { set({ data: await api().store.setTelemetry(on) }) },
    async acknowledgeTelemetryNotice() { set({ data: await api().store.telemetryNoticeSeen() }) }
  }
})
