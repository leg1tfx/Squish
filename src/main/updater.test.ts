import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '@shared/api'
import { startUpdater, type UpdaterLike } from './updater'

function fake() {
  const e = new EventEmitter()
  return Object.assign(e, {
    autoDownload: false, autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(async () => null), quitAndInstall: vi.fn()
  }) as unknown as UpdaterLike & EventEmitter & { checkForUpdates: ReturnType<typeof vi.fn>; quitAndInstall: ReturnType<typeof vi.fn> }
}

afterEach(() => { vi.useRealTimers() })

describe('startUpdater', () => {
  it('checks at start, downloads in the background and installs on quit', () => {
    const u = fake()
    const h = startUpdater(u, () => {})
    expect(u.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(u.autoDownload).toBe(true)
    expect(u.autoInstallOnAppQuit).toBe(true)
    h.dispose()
  })
  it('reports progress, then ready, and only installs when ready', () => {
    const u = fake()
    const seen: UpdateStatus[] = []
    const h = startUpdater(u, (s) => seen.push(s))
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
    h.dispose()
  })
  it('stays quiet on errors and retries on the next interval', () => {
    vi.useFakeTimers()
    const u = fake()
    const seen: UpdateStatus[] = []
    const h = startUpdater(u, (s) => seen.push(s), 1000)
    u.emit('update-available', { version: '1.1.0' })
    u.emit('error', new Error('offline'))
    expect(h.status()).toEqual({ state: 'none' })
    vi.advanceTimersByTime(1000)
    expect(u.checkForUpdates).toHaveBeenCalledTimes(2)
    h.dispose()
  })
  it('does not check again once an update is ready', () => {
    vi.useFakeTimers()
    const u = fake()
    const h = startUpdater(u, () => {}, 1000)
    u.emit('update-downloaded', { version: '1.1.0' })
    vi.advanceTimersByTime(3000)
    expect(u.checkForUpdates).toHaveBeenCalledTimes(1)
    h.dispose()
  })
})
