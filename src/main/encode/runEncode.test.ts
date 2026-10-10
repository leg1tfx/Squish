import { describe, expect, it } from 'vitest'
import { EncodeError, runEncode, type EncodeDeps } from './runEncode'
import type { Runner } from '../ffmpeg/runner'
import type { InterpolateDeps } from './interpolate'
import type { EncoderId, Settings, VideoInfo } from '@shared/types'

const info: VideoInfo = {
  path: 'C:\\in.mp4', sizeBytes: 5e8, durationSec: 10, width: 1920, height: 1080, fps: 60, fpsFraction: '60/1',
  videoCodec: 'h264', videoKbps: 40_000, hasAudio: true, audioCodec: 'aac', audioKbps: 192, hdr: false, bitDepth: 8
}
const settings = (p: Partial<Settings> = {}): Settings => ({
  res: 'best', fps: 'best', audio: 'high', codec: 'h264', maxMB: null, bitrateKbps: null, interpolate: 'off', encoder: 'auto', ...p
})

function harness(opts: { failEncoders?: string[]; sizes?: number[]; hang?: boolean; stderr?: string }) {
  const calls: string[][] = []
  const removed: string[] = []
  const sizes = [...(opts.sizes ?? [1_000_000])]
  const run: Runner = async (args, o) => {
    calls.push(args)
    if (opts.hang) {
      await new Promise((r) => o?.signal?.addEventListener('abort', r))
      return { code: null, stderrTail: '', aborted: true }
    }
    o?.onLine?.('out_time_us=5000000'); o?.onLine?.('speed=2x'); o?.onLine?.('progress=end')
    const enc = args[args.indexOf('-c:v') + 1]
    if (opts.failEncoders?.includes(enc)) return { code: 1, stderrTail: opts.stderr ?? 'encoder init failed', aborted: false }
    if (opts.stderr) return { code: 1, stderrTail: opts.stderr, aborted: false }
    return { code: 0, stderrTail: '', aborted: false }
  }
  const deps: EncodeDeps = {
    run, tmpDir: 'C:\\tmp',
    fileSize: async () => sizes.length > 1 ? sizes.shift()! : sizes[0],
    remove: async (p) => { removed.push(p) }
  }
  return { calls, removed, deps }
}
const req = (s: Settings, available: readonly EncoderId[] = ['nvenc', 'cpu']) => ({ info, settings: s, available: [...available], output: 'C:\\out.mp4' })

describe('runEncode', () => {
  it('encodes once in quality mode and reports progress', async () => {
    const h = harness({})
    const seen: number[] = []
    const r = await runEncode(req(settings()), h.deps, { progress: (p) => seen.push(p.fraction) })
    expect(h.calls).toHaveLength(1)
    expect(r).toMatchObject({ encoder: 'nvenc', fellBack: false, bytes: 1_000_000, attempts: 1 })
    expect(seen.at(-1)).toBeCloseTo(0.5)
  })
  it('runs two passes on CPU target mode with cwd-relative passlog and cleans passlogs', async () => {
    const h = harness({ sizes: [9_000_000] })
    await runEncode(req(settings({ maxMB: 10 }), ['cpu']), h.deps, {})
    expect(h.calls.map((a) => a[a.indexOf('-pass') + 1])).toEqual(['1', '2'])
    expect(h.removed).toContain('C:\\tmp\\squish2pass-0.log')
  })
  it('falls back to CPU when the GPU encoder fails, and removes the partial file', async () => {
    const h = harness({ failEncoders: ['h264_nvenc'] })
    const r = await runEncode(req(settings()), h.deps, {})
    expect(r).toMatchObject({ encoder: 'cpu', fellBack: true })
    expect(h.removed).toContain('C:\\out.mp4')
  })
  it('re-encodes with a lower bitrate when the file is over the limit', async () => {
    const h = harness({ sizes: [10_400_000, 9_800_000] })
    const r = await runEncode(req(settings({ maxMB: 10 })), h.deps, {})
    expect(r.attempts).toBe(2)
    const [first, second] = h.calls.map((a) => Number(a[a.indexOf('-b:v') + 1].replace('k', '')))
    expect(second).toBe(Math.floor(first * (10_000_000 / 10_400_000) * 0.98))
  })
  it('switches to CPU 2-pass after two GPU retries still miss the limit', async () => {
    const h = harness({ sizes: [10_500_000, 10_300_000, 10_200_000, 9_900_000] })
    const r = await runEncode(req(settings({ maxMB: 10 })), h.deps, {})
    expect(r.encoder).toBe('cpu')
    expect(r.fellBack).toBe(false)
  })
  it('throws size error and removes output when CPU cannot get under the limit', async () => {
    const h = harness({ sizes: [11e6] })
    await expect(runEncode(req(settings({ maxMB: 10 }), ['cpu']), h.deps, {})).rejects.toMatchObject({ kind: 'size' })
    expect(h.removed).toContain('C:\\out.mp4')
  })
  it('cancel during pass 1 removes output and passlogs', async () => {
    const h = harness({ hang: true })
    const ac = new AbortController()
    const p = runEncode(req(settings({ maxMB: 10 }), ['cpu']), h.deps, {}, ac.signal)
    setTimeout(() => ac.abort(), 10)
    await expect(p).rejects.toMatchObject({ kind: 'aborted' })
    expect(h.removed).toEqual(expect.arrayContaining(['C:\\out.mp4', 'C:\\tmp\\squish2pass-0.log', 'C:\\tmp\\squish2pass.log']))
  })
  it('reports disk full', async () => {
    const h = harness({ stderr: 'av_interleaved_write_frame(): No space left on device' })
    await expect(runEncode(req(settings(), ['cpu']), h.deps, {})).rejects.toMatchObject({ kind: 'disk' })
  })
  it('reports other CPU failures as ffmpeg errors with log', async () => {
    const h = harness({ stderr: 'Invalid data found when processing input' })
    const e = await runEncode(req(settings(), ['cpu']), h.deps, {}).catch((x) => x)
    expect(e).toBeInstanceOf(EncodeError)
    expect(e.kind).toBe('ffmpeg')
    expect(e.log).toContain('Invalid data')
  })
})

describe('runEncode with smooth motion', () => {
  const info30: VideoInfo = { ...info, fps: 30, fpsFraction: '30/1' }
  const smooth = (p: Partial<Settings> = {}): Settings => settings({ interpolate: '60', ...p })
  const req30 = (s: Settings, available: readonly EncoderId[] = ['nvenc', 'cpu']) => ({ info: info30, settings: s, available: [...available], output: 'C:\\out.mp4' })
  const OK = { code: 0, stderrTail: '', aborted: false }

  function interp() {
    const steps: string[] = []
    const removedDirs: string[] = []
    const counts: Record<string, number> = {}
    const deps: InterpolateDeps = {
      ffmpeg: async () => { steps.push('export'); counts['C:\\tmp\\frames-in'] = 300; return OK },
      rife: async () => { steps.push('rife'); counts['C:\\tmp\\frames-out'] = 600; return OK },
      rifeCwd: 'C:\\rife', modelDir: 'C:\\rife\\rife-v4.6', tmpDir: 'C:\\tmp',
      freeBytes: async () => 1e12, countFiles: async (d) => counts[d] ?? 0,
      makeDir: async () => {}, removeDir: async (p) => { removedDirs.push(p) }, pollMs: 60_000
    }
    return { deps, steps, removedDirs }
  }

  it('interpolates first, then encodes from the frames with audio from the source', async () => {
    const h = harness({}); const i = interp()
    const phases: string[] = []
    const fractions: number[] = []
    await runEncode(req30(smooth()), { ...h.deps, interpolate: i.deps }, {
      progress: (p) => { if (phases.at(-1) !== p.phase) phases.push(p.phase); fractions.push(p.fraction) }
    })
    expect(i.steps).toEqual(['export', 'rife'])
    expect(phases).toEqual(['interpolate', 'encode'])
    expect(fractions.at(-1)).toBeCloseTo(0.85)
    const enc = h.calls[0]
    expect(enc[enc.indexOf('-framerate') + 1]).toBe('60')
    expect(enc).toContain('1:a:0')
    expect(i.removedDirs).toContain('C:\\tmp\\frames-out')
  })
  it('refuses to run without the add-on', async () => {
    const h = harness({})
    await expect(runEncode(req30(smooth()), h.deps, {})).rejects.toMatchObject({ kind: 'addon' })
    expect(h.calls).toHaveLength(0)
  })
  it('reuses the frames when the size retry encodes again', async () => {
    const h = harness({ sizes: [10_400_000, 9_800_000] }); const i = interp()
    const r = await runEncode(req30(smooth({ maxMB: 10 })), { ...h.deps, interpolate: i.deps }, {})
    expect(r.attempts).toBe(2)
    expect(h.calls).toHaveLength(2)
    expect(i.steps).toEqual(['export', 'rife'])
  })
  it('cancelling the encode removes the output and the frames', async () => {
    const h = harness({ hang: true }); const i = interp()
    const ac = new AbortController()
    const p = runEncode(req30(smooth()), { ...h.deps, interpolate: i.deps }, {}, ac.signal)
    setTimeout(() => ac.abort(), 10)
    await expect(p).rejects.toMatchObject({ kind: 'aborted' })
    expect(h.removed).toContain('C:\\out.mp4')
    expect(i.removedDirs).toContain('C:\\tmp\\frames-out')
  })
  it('never touches the add-on when smooth motion is off', async () => {
    const h = harness({}); const i = interp()
    await runEncode(req30(settings()), { ...h.deps, interpolate: i.deps }, {})
    expect(i.steps).toEqual([])
  })
})
