import type { UpdateStatus } from '@shared/api'

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: 'download-progress', cb: (p: { percent: number }) => void): unknown
  on(event: 'update-available' | 'update-downloaded', cb: (i: { version: string }) => void): unknown
  on(event: 'error', cb: (e: Error) => void): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdaterHandle { status(): UpdateStatus; install(): void; dispose(): void }

// Downloads new versions in the background. The update installs on the next quit,
// or right away when the user clicks "Restart". Errors (offline, no release yet) stay silent.
export function startUpdater(u: UpdaterLike, send: (s: UpdateStatus) => void, intervalMs = CHECK_INTERVAL_MS): UpdaterHandle {
  let status: UpdateStatus = { state: 'none' }
  const set = (s: UpdateStatus): void => { status = s; send(s) }
  u.autoDownload = true
  u.autoInstallOnAppQuit = true
  u.on('update-available', (i) => { if (status.state !== 'ready') set({ state: 'downloading', version: i.version, percent: 0 }) })
  u.on('download-progress', (p) => { if (status.state === 'downloading') set({ ...status, percent: Math.round(p.percent) }) })
  u.on('update-downloaded', (i) => set({ state: 'ready', version: i.version }))
  u.on('error', () => { if (status.state === 'downloading') set({ state: 'none' }) })
  const check = (): void => { if (status.state === 'none') u.checkForUpdates().catch(() => {}) }
  check()
  const timer = setInterval(check, intervalMs)
  return {
    status: () => status,
    install: () => { if (status.state === 'ready') u.quitAndInstall(true, true) },
    dispose: () => clearInterval(timer)
  }
}
