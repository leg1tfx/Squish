import type { UpdateStatus } from '@shared/api'

export const CHECK_GAP_MS = 30 * 24 * 60 * 60 * 1000

export interface CheckClock { last(): number; mark(t: number): void; now(): number }

export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: 'download-progress', cb: (p: { percent: number }) => void): unknown
  on(event: 'update-available' | 'update-downloaded', cb: (i: { version: string }) => void): unknown
  on(event: 'error', cb: (e: Error) => void): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdaterHandle { status(): UpdateStatus; install(): void }

// Looks for a new version at start, at most once per CHECK_GAP_MS (keeps R2 operations near zero).
// The update downloads in the background and installs on the next quit, or right away on "Restart".
// Errors (offline, no release yet) stay silent and do not count as a check, so the next start retries.
export function startUpdater(u: UpdaterLike, send: (s: UpdateStatus) => void, clock: CheckClock): UpdaterHandle {
  let status: UpdateStatus = { state: 'none' }
  const set = (s: UpdateStatus): void => { status = s; send(s) }
  u.autoDownload = true
  u.autoInstallOnAppQuit = true
  u.on('update-available', (i) => { if (status.state !== 'ready') set({ state: 'downloading', version: i.version, percent: 0 }) })
  u.on('download-progress', (p) => { if (status.state === 'downloading') set({ ...status, percent: Math.round(p.percent) }) })
  u.on('update-downloaded', (i) => set({ state: 'ready', version: i.version }))
  u.on('error', () => { if (status.state === 'downloading') set({ state: 'none' }) })
  if (clock.now() - clock.last() >= CHECK_GAP_MS) {
    const t = clock.now()
    u.checkForUpdates().then(() => clock.mark(t)).catch(() => {})
  }
  return {
    status: () => status,
    install: () => { if (status.state === 'ready') u.quitAndInstall(true, true) }
  }
}
