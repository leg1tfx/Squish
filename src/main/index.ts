import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

app.setName("Pyno's Squish")
app.setAppUserModelId('com.pynos.squish')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1120, height: 720, minWidth: 960, minHeight: 640,
    frame: false, backgroundColor: '#0b1416', show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
