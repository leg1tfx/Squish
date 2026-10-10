import { win32 } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPlan } from '@shared/planner'
import type { Settings, VideoInfo } from '@shared/types'
import type { Runner } from '../ffmpeg/runner'
import { prepareFrames, type InterpolateDeps } from './interpolate'

const info: VideoInfo = {
  path: 'C:\\in.mp4', sizeBytes: 5e8, durationSec: 10, width: 1920, height: 1080, fps: 30, fpsFraction: '30/1',
  videoCodec: 'h264', videoKbps: 20_000, hasAudio: true, audioCodec: 'aac', audioKbps: 192, hdr: false, tenBit: false
}
const settings: Settings = { res: 'best', fps: 'best', interpolate: '60', audio: 'high', codec: 'h264', maxMB: null, bitrateKbps: null, encoder: 'auto' }
const plan = buildPlan(info, settings, ['cpu'])
const IN = win32.join('C:\\tmp', 'frames-in')
const OUT = win32.join('C:\\tmp', 'frames-out')

function harness(o: { free?: number; exportCode?: number; exportLog?: string; rifeCode?: number; produced?: number; hang?: 'ffmpeg' | 'rife' } = {}) {
  const counts: Record<string, number> = {}
  const removed: string[] = []
  const made: string[] = []
  const calls: string[] = []
  const hang = (opts?: { signal?: AbortSignal }): Promise<{ code: null; stderrTail: string; aborted: true }> =>
    new Promise((r) => opts?.signal?.addEventListener('abort', () => r({ code: null, stderrTail: '', aborted: true })))
  const ffmpeg: Runner = async (_a, opts) => {
    calls.push('export')
    if (o.hang === 'ffmpeg') return hang(opts)
    opts?.onLine?.('out_time_us=5000000')
    counts[IN] = 300
    return { code: o.exportCode ?? 0, stderrTail: o.exportLog ?? '', aborted: false }
  }
  const rife: Runner = async (_a, opts) => {
    calls.push('rife')
    if (o.hang === 'rife') return hang(opts)
    counts[OUT] = o.produced ?? 600
    return { code: o.rifeCode ?? 0, stderrTail: o.rifeCode ? 'vk error' : '', aborted: false }
  }
  const deps: InterpolateDeps = {
    ffmpeg, rife, rifeCwd: 'C:\\rife', modelDir: 'C:\\rife\\rife-v4.6', tmpDir: 'C:\\tmp',
    freeBytes: async () => o.free ?? 1e12, countFiles: async (d) => counts[d] ?? 0,
    makeDir: async (p) => { made.push(p) }, removeDir: async (p) => { removed.push(p) }, pollMs: 60_000
  }
  return { deps, removed, made, calls }
}
const req = { info, plan, input: info.path }

describe('prepareFrames', () => {
  it('exports, interpolates, frees the input frames and returns the output folder', async () => {
    const h = harness()
    const steps: string[] = []
    const f = await prepareFrames(req, h.deps, { step: (p) => { if (steps.at(-1) !== p) steps.push(p) } })
    expect(f).toMatchObject({ dir: OUT, fps: 60 })
    expect(h.calls).toEqual(['export', 'rife'])
    expect(steps).toEqual(['prepare', 'interpolate'])
    expect(h.removed.filter((p) => p === IN).length).toBeGreaterThanOrEqual(1)
    // The output folder is wiped once up front (crash leftovers) and must survive until cleanup().
    expect(h.removed.filter((p) => p === OUT)).toHaveLength(1)
    await f.cleanup()
    expect(h.removed.filter((p) => p === OUT)).toHaveLength(2)
  })
  it('refuses to start when the disk is too small and writes nothing', async () => {
    const h = harness({ free: 1e9 })
    await expect(prepareFrames(req, h.deps, {})).rejects.toMatchObject({ kind: 'disk' })
    await expect(prepareFrames(req, h.deps, {})).rejects.toThrow(/Not enough free space for smooth motion/)
    expect(h.calls).toEqual([])
    expect(h.made).toEqual([])
  })
  it('turns an ffmpeg export failure into an ffmpeg error and cleans up', async () => {
    const h = harness({ exportCode: 1, exportLog: 'Invalid data' })
    await expect(prepareFrames(req, h.deps, {})).rejects.toMatchObject({ kind: 'ffmpeg', log: 'Invalid data' })
    expect(h.removed).toEqual(expect.arrayContaining([IN, OUT]))
  })
  it('reports a full disk during export as disk', async () => {
    const h = harness({ exportCode: 1, exportLog: 'No space left on device' })
    await expect(prepareFrames(req, h.deps, {})).rejects.toMatchObject({ kind: 'disk' })
  })
  it('turns a RIFE failure into a smooth error with the log and cleans up', async () => {
    const h = harness({ rifeCode: 3 })
    await expect(prepareFrames(req, h.deps, {})).rejects.toMatchObject({ kind: 'smooth', log: 'vk error' })
    expect(h.removed).toEqual(expect.arrayContaining([IN, OUT]))
  })
  it('fails when RIFE writes fewer frames than requested', async () => {
    const h = harness({ produced: 599 })
    await expect(prepareFrames(req, h.deps, {})).rejects.toMatchObject({ kind: 'smooth' })
  })
  it('cancels during export or interpolation and removes both folders', async () => {
    for (const hang of ['ffmpeg', 'rife'] as const) {
      const h = harness({ hang })
      const ac = new AbortController()
      const p = prepareFrames(req, h.deps, {}, ac.signal)
      setTimeout(() => ac.abort(), 10)
      await expect(p).rejects.toMatchObject({ kind: 'aborted' })
      expect(h.removed).toEqual(expect.arrayContaining([IN, OUT]))
    }
  })
})
