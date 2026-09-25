import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, rm, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { FFMPEG_SOURCE_URL, PROMO_URL } from '@shared/links'
import type { EncodeOutcome, PreviewResult, ProbeResult } from '@shared/api'
import type { EncoderId, PresetSettings, Settings, StoreData, VideoInfo } from '@shared/types'
import { detectEncoders } from './ffmpeg/encoders'
import { probeFile } from './ffmpeg/probe'
import { createRunner } from './ffmpeg/runner'
import { uniqueOutputPath } from './encode/output'
import { makePreview, makeThumbnail } from './encode/preview'
import { EncodeError, runEncode } from './encode/runEncode'
import { mediaUrl } from './media'
import { addPreset, deletePreset, loadStore, renamePreset, saveStore } from './store/presetStore'

export interface IpcEnv { ffmpeg: string; ffprobe: string; tmpDir: string; mediaDir: string; storeFile: string }

export function registerIpc(env: IpcEnv, getWindow: () => BrowserWindow | null): void {
  const run = createRunner(env.ffmpeg)
  const encodersP: Promise<EncoderId[]> = detectEncoders(run).catch(() => ['cpu'])
  let info: VideoInfo | null = null
  let job: AbortController | null = null
  let store: StoreData | null = null
  const getStore = async (): Promise<StoreData> => (store ??= await loadStore(env.storeFile))
  const setStore = async (d: StoreData): Promise<StoreData> => { store = d; await saveStore(env.storeFile, d); return d }
  const send = (ch: string, payload: unknown): void => getWindow()?.webContents.send(ch, payload)

  ipcMain.handle('file:open', async () => {
    const w = getWindow()
    const r = await dialog.showOpenDialog(w!, { properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mts', 'm2ts', 'wmv'] }] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('probe', async (_e, path: string): Promise<ProbeResult> => {
    try {
      info = await probeFile(env.ffprobe, path)
      await mkdir(env.mediaDir, { recursive: true })
      const thumb = `thumb-${Date.now()}.jpg`
      const ok = await makeThumbnail(run, info, join(env.mediaDir, thumb))
      return { ok: true, info, thumbUrl: ok ? mediaUrl(thumb) : null }
    } catch {
      info = null
      return { ok: false, message: "Can't read this file." }
    }
  })

  ipcMain.handle('encoders', () => encodersP)

  ipcMain.handle('preview', async (_e, settings: Settings): Promise<PreviewResult> => {
    if (!info) return { ok: false, message: 'No video loaded.' }
    try {
      await mkdir(env.mediaDir, { recursive: true })
      const r = await makePreview(run, { info, settings, available: await encodersP }, env.mediaDir)
      return { ok: true, beforeUrl: mediaUrl(r.before), afterUrl: mediaUrl(r.after) }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  })

  ipcMain.handle('encode', async (_e, settings: Settings): Promise<EncodeOutcome> => {
    if (!info) return { ok: false, kind: 'ffmpeg', message: 'No video loaded.', log: '' }
    job = new AbortController()
    await mkdir(env.tmpDir, { recursive: true })
    const output = uniqueOutputPath(info.path, existsSync)
    try {
      const result = await runEncode(
        { info, settings, available: await encodersP, output },
        { run, tmpDir: env.tmpDir, fileSize: async (p) => (await stat(p)).size, remove: (p) => unlink(p).catch(() => {}) },
        { progress: (p) => send('encode:progress', p), log: (l) => send('encode:log', l) },
        job.signal
      )
      return { ok: true, result }
    } catch (e) {
      if (e instanceof EncodeError) return { ok: false, kind: e.kind, message: e.message, log: e.log }
      return { ok: false, kind: 'ffmpeg', message: (e as Error).message, log: '' }
    } finally {
      job = null
    }
  })

  ipcMain.handle('cancel', () => { job?.abort() })

  ipcMain.handle('store:get', () => getStore())
  ipcMain.handle('store:add', async (_e, label: string, s: PresetSettings) => setStore(addPreset(await getStore(), label, s, Date.now()).data))
  ipcMain.handle('store:rename', async (_e, id: string, label: string) => setStore(renamePreset(await getStore(), id, label)))
  ipcMain.handle('store:delete', async (_e, id: string) => setStore(deletePreset(await getStore(), id)))
  ipcMain.handle('store:last', async (_e, id: string) => setStore({ ...(await getStore()), lastPresetId: id }))
  ipcMain.handle('store:dismissPromo', async () => setStore({ ...(await getStore()), promoDismissed: true }))

  ipcMain.handle('reveal', (_e, p: string) => { shell.showItemInFolder(p) })
  ipcMain.handle('open:promo', () => shell.openExternal(PROMO_URL))
  ipcMain.handle('open:ffmpeg', () => shell.openExternal(FFMPEG_SOURCE_URL))

  ipcMain.on('app:version', (e) => { e.returnValue = app.getVersion() })
  ipcMain.on('win:minimize', () => getWindow()?.minimize())
  ipcMain.on('win:toggleMaximize', () => { const w = getWindow(); if (w) w.isMaximized() ? w.unmaximize() : w.maximize() })
  ipcMain.on('win:close', () => getWindow()?.close())
}

export async function cleanupTemp(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}
