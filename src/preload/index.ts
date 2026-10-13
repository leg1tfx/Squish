import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { SquishApi } from '@shared/api'

const on = <T>(ch: string) => (cb: (v: T) => void): (() => void) => {
  const h = (_e: unknown, v: T): void => cb(v)
  ipcRenderer.on(ch, h)
  return () => ipcRenderer.removeListener(ch, h)
}

const api: SquishApi = {
  version: ipcRenderer.sendSync('app:version') as string,
  pathForFile: (file) => webUtils.getPathForFile(file),
  openFileDialog: () => ipcRenderer.invoke('file:open'),
  probe: (p) => ipcRenderer.invoke('probe', p),
  setHdrOverride: (m) => ipcRenderer.invoke('hdr:set', m),
  encoders: () => ipcRenderer.invoke('encoders'),
  preview: (s) => ipcRenderer.invoke('preview', s),
  encode: (s, meta) => ipcRenderer.invoke('encode', s, meta),
  cancel: () => ipcRenderer.invoke('cancel'),
  onProgress: on('encode:progress'),
  onLog: on('encode:log'),
  rife: {
    status: () => ipcRenderer.invoke('rife:status'),
    install: () => ipcRenderer.invoke('rife:install'),
    cancelInstall: () => ipcRenderer.invoke('rife:cancelInstall'),
    onProgress: on('rife:progress')
  },
  store: {
    get: () => ipcRenderer.invoke('store:get'),
    addPreset: (l, s) => ipcRenderer.invoke('store:add', l, s),
    renamePreset: (id, l) => ipcRenderer.invoke('store:rename', id, l),
    deletePreset: (id) => ipcRenderer.invoke('store:delete', id),
    setLastPreset: (id) => ipcRenderer.invoke('store:last', id),
    dismissPromo: () => ipcRenderer.invoke('store:dismissPromo'),
    setTelemetry: (on) => ipcRenderer.invoke('store:setTelemetry', on),
    telemetryNoticeSeen: () => ipcRenderer.invoke('store:telemetryNoticeSeen')
  },
  revealInFolder: (p) => ipcRenderer.invoke('reveal', p),
  openPromo: () => ipcRenderer.invoke('open:promo'),
  openFfmpegSource: () => ipcRenderer.invoke('open:ffmpeg'),
  track: (name) => ipcRenderer.send('telemetry:track', name),
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    onStatus: on('update:status'),
    install: () => ipcRenderer.invoke('update:install')
  },
  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggleMaximize'),
    close: () => ipcRenderer.send('win:close')
  }
}

contextBridge.exposeInMainWorld('squish', api)
