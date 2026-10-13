import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readFileSync, writeFileSync } from 'node:fs'
import { release } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ALLOWED_EXTERNAL, APTABASE_APP_KEY } from '@shared/links'
import { cleanupTemp, registerIpc } from './ipc'
import { MEDIA_SCHEME, mediaFileFor } from './media'
import { binPath } from './paths'
import { createTelemetry } from './telemetry'
import { startUpdater } from './updater'

app.setName("Pyno's Squish")
app.setAppUserModelId('com.pynos.squish')
protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }])

let win: BrowserWindow | null = null
let quitting = false
const tmpRoot = join(app.getPath('temp'), 'pynos-squish', String(process.pid))
const env = {
  ffmpeg: binPath('ffmpeg', { packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() }),
  ffprobe: binPath('ffprobe', { packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() }),
  tmpDir: join(tmpRoot, 'work'),
  mediaDir: join(tmpRoot, 'media'),
  storeFile: join(app.getPath('userData'), 'presets.json'),
  rifeDir: join(app.getPath('userData'), 'rife')
}

function updateClock() {
  const file = join(app.getPath('userData'), 'update-check.json')
  return {
    now: () => Date.now(),
    last: () => { try { return Number(JSON.parse(readFileSync(file, 'utf8')).last) || 0 } catch { return 0 } },
    mark: (t: number) => { try { writeFileSync(file, JSON.stringify({ last: t })) } catch { /* next start retries */ } }
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1120, height: 720, minWidth: 960, minHeight: 640,
    frame: false, backgroundColor: '#0b1416', show: false, title: "Pyno's Squish",
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if ((ALLOWED_EXTERNAL as readonly string[]).includes(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('closed', () => { win = null })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  protocol.handle(MEDIA_SCHEME, (req) => {
    const file = mediaFileFor(req.url, env.mediaDir)
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response('Not found', { status: 404 })
  })
  const ipc = registerIpc(env, () => win, (isEnabled) => createTelemetry({
    appKey: APTABASE_APP_KEY,
    system: {
      isDebug: !app.isPackaged,
      locale: app.getLocale().slice(0, 10),
      osName: 'Windows',
      osVersion: release(),
      engineName: 'Chromium',
      engineVersion: process.versions.chrome,
      appVersion: app.getVersion()
    },
    isEnabled,
    fetch: (url, init) => net.fetch(url, init)
  }))
  // Only installed builds update themselves; dev runs have no release feed.
  const updater = app.isPackaged ? startUpdater(autoUpdater, (s) => win?.webContents.send('update:status', s), updateClock()) : null
  ipcMain.handle('update:status', () => updater?.status() ?? { state: 'none' })
  ipcMain.handle('update:install', () => { updater?.install() })
  app.on('before-quit', (e) => {
    e.preventDefault()
    if (!quitting) {
      quitting = true
      void ipc.shutdown().then(() => cleanupTemp(tmpRoot)).finally(() => app.exit(0))
    }
  })
  createWindow()
})
app.on('window-all-closed', () => app.quit())
