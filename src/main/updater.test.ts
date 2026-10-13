import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '@shared/api'
import { startUpdater, type UpdaterLike } from './updater'

function fake() {
  const e = new EventEmitter()
  return Object.assign(e, {
    autoDownload: false, autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(async () => null), quitAndInstall: vi.fn()
  }) as unknown as UpdaterLike & EventEmitter & { checkForUpdates: ReturnType<typeof vi.fn>; quitAndInstall: ReturnType<typeof vi.fn> }
}

const DAY = 24 * 60 * 60 * 1000
function clock(last: number, now = 100 * DAY) {
  return { now: () => now, last: () => last, mark: vi.fn() }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('startUpdater', () => {
  it('checks at start when never checked, downloads in the background and installs on quit', async () => {
    const u = fake()
    const c = clock(0)
    startUpdater(u, () => {}, c)
    expect(u.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(u.autoDownload).toBe(true)
    expect(u.autoInstallOnAppQuit).toBe(true)
    await flush()
    expect(c.mark).toHaveBeenCalledWith(100 * DAY)
  })
  it('skips the check when the last one is under 30 days old', () => {
    const u = fake()
    startUpdater(u, () => {}, clock(80 * DAY))
    expect(u.checkForUpdates).not.toHaveBeenCalled()
  })
  it('checks again once 30 days have passed', () => {
    const u = fake()
    startUpdater(u, () => {}, clock(70 * DAY))
    expect(u.checkForUpdates).toHaveBeenCalledTimes(1)
  })
  it('does not record a failed check, so the next start retries', async () => {
    const u = fake()
    u.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    const c = clock(0)
    startUpdater(u, () => {}, c)
    await flush()
    expect(c.mark).not.toHaveBeenCalled()
  })
  it('reports progress, then ready, and only installs when ready', () => {
    const u = fake()
    const seen: UpdateStatus[] = []
    const h = startUpdater(u, (s) => seen.push(s), clock(0))
    h.install()
    expect(u.quitAndInstall).not.toHaveBeenCalled()
    u.emit('update-available', { version: '1.1.0' })
    u.emit('download-progress', { percent: 41.6 })
    u.emit('update-downloaded', { version: '1.1.0' })
    expect(seen).toEqual([
      { state: 'downloading', version: '1.1.0', percent: 0 },
      { state: 'downloading', version: '1.1.0', percent: 42 },
      { state: 'ready', version: '1.1.0' }
    ])
    expect(h.status()).toEqual({ state: 'ready', version: '1.1.0' })
    h.install()
    expect(u.quitAndInstall).toHaveBeenCalledWith(true, true)
  })
  it('stays quiet on download errors', () => {
    const u = fake()
    const h = startUpdater(u, () => {}, clock(0))
    u.emit('update-available', { version: '1.1.0' })
    u.emit('error', new Error('offline'))
    expect(h.status()).toEqual({ state: 'none' })
  })
})
