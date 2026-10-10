import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRunner, type Runner } from '../../src/main/ffmpeg/runner'
import { probeFile } from '../../src/main/ffmpeg/probe'
import { runEncode } from '../../src/main/encode/runEncode'
import type { Settings } from '../../src/shared/types'

const bin = join(process.cwd(), 'resources', 'bin')
const ffmpeg = join(bin, 'ffmpeg.exe')
const ffprobe = join(bin, 'ffprobe.exe')
const has = existsSync(ffmpeg)

describe.skipIf(!has)('encode integration', () => {
  let dir = ''
  let src = ''
  const run = createRunner(ffmpeg)
  const deps = () => ({ run, tmpDir: dir, fileSize: async (p: string) => (await stat(p)).size, remove: (p: string) => unlink(p).catch(() => {}) })
  const s = (p: Partial<Settings>): Settings => ({ res: 'best', fps: 'best', audio: 'high', codec: 'h264', maxMB: null, bitrateKbps: null, interpolate: 'off', encoder: 'cpu', ...p })

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'squish-int-'))
    src = join(dir, "Pyno's clip ä.mp4")
    const r = await run(['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=60:d=5', '-f', 'lavfi', '-i', 'sine=f=440:d=5',
      '-c:v', 'libx264', '-crf', '10', '-c:a', 'aac', '-b:a', '320k', '-shortest', src])
    expect(r.code).toBe(0)
  }, 120_000)
  afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

  it('meets a 1 MB limit with CPU 2-pass H.265 (apostrophe + umlaut path)', async () => {
    const info = await probeFile(ffprobe, src)
    const out = join(dir, 'limit.mp4')
    const r = await runEncode({ info, settings: s({ maxMB: 1, codec: 'h265' }), available: ['cpu'], output: out }, deps(), {})
    expect(r.bytes).toBeLessThanOrEqual(1_000_000)
    expect((await readdir(dir)).some((f) => f.startsWith('squish2pass'))).toBe(false)
  }, 120_000)

  it('keeps 10-bit automatically for a 10-bit source in H.265', async () => {
    const ten = join(dir, 'ten.mp4')
    const mk = await run(['-hide_banner', '-y', '-f', 'lavfi', '-i', 'gradients=s=640x360:r=30:d=2', '-pix_fmt', 'yuv420p10le', '-c:v', 'libx265', '-crf', '14', '-an', ten])
    expect(mk.code).toBe(0)
    const info = await probeFile(ffprobe, ten)
    expect(info.bitDepth).toBe(10)
    const out = join(dir, 'ten-out.mp4')
    await runEncode({ info, settings: s({ codec: 'h265' }), available: ['cpu'], output: out }, deps(), {})
    expect((await probeFile(ffprobe, out)).bitDepth).toBe(10)
    const out8 = join(dir, 'ten-out8.mp4')
    await runEncode({ info, settings: s({ codec: 'h264' }), available: ['cpu'], output: out8 }, deps(), {})
    expect((await probeFile(ffprobe, out8)).bitDepth).toBe(8)
  }, 120_000)

  it('keeps HDR (PQ, BT.2020) for H.265, tone maps to SDR for H.264', async () => {
    const hdr = join(dir, 'hdr.mp4')
    const mk = await run(['-hide_banner', '-y', '-f', 'lavfi', '-i', 'gradients=s=640x360:r=30:d=2', '-pix_fmt', 'yuv420p10le', '-c:v', 'libx265', '-crf', '14',
      '-x265-params', 'log-level=error:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400', '-an', hdr])
    expect(mk.code).toBe(0)
    const info = await probeFile(ffprobe, hdr)
    expect(info.hdr).toBe(true)
    const keep = join(dir, 'hdr-keep.mp4')
    await runEncode({ info, settings: s({ codec: 'h265' }), available: ['cpu'], output: keep }, deps(), {})
    const k = await probeFile(ffprobe, keep)
    expect([k.hdr, k.bitDepth, k.colorTags?.primaries]).toEqual([true, 10, 'bt2020'])
    const sd = join(dir, 'hdr-sdr.mp4')
    await runEncode({ info, settings: s({ codec: 'h264' }), available: ['cpu'], output: sd }, deps(), {})
    expect(await probeFile(ffprobe, sd)).toMatchObject({ hdr: false, bitDepth: 8 })
  }, 120_000)

  it('keeps 12-bit sources at 12-bit on the CPU', async () => {
    const src12 = join(dir, 'twelve.mp4')
    const mk = await run(['-hide_banner', '-y', '-f', 'lavfi', '-i', 'gradients=s=640x360:r=30:d=2', '-pix_fmt', 'yuv420p12le', '-c:v', 'libx265', '-crf', '14', '-an', src12])
    expect(mk.code).toBe(0)
    const info = await probeFile(ffprobe, src12)
    expect(info.bitDepth).toBe(12)
    const out = join(dir, 'twelve-out.mp4')
    const r = await runEncode({ info, settings: s({ codec: 'h265', encoder: 'auto' }), available: ['nvenc', 'cpu'], output: out }, deps(), {})
    expect(r.encoder).toBe('cpu')
    expect((await probeFile(ffprobe, out)).bitDepth).toBe(12)
  }, 120_000)

  it('falls back to CPU when the GPU encoder name is broken', async () => {
    const info = await probeFile(ffprobe, src)
    const broken: Runner = (args, o) => run(args.map((a) => (a === 'h264_nvenc' ? 'h264_doesnotexist' : a)), o)
    const r = await runEncode({ info, settings: s({ encoder: 'auto' }), available: ['nvenc', 'cpu'], output: join(dir, 'fb.mp4') },
      { ...deps(), run: broken }, {})
    expect(r).toMatchObject({ encoder: 'cpu', fellBack: true })
  }, 120_000)

  it('cancel removes the partial file', async () => {
    const info = await probeFile(ffprobe, src)
    const out = join(dir, 'cancel.mp4')
    const ac = new AbortController()
    const p = runEncode({ info, settings: s({ maxMB: 1 }), available: ['cpu'], output: out }, deps(), { progress: () => ac.abort() }, ac.signal)
    await expect(p).rejects.toMatchObject({ kind: 'aborted' })
    expect(existsSync(out)).toBe(false)
    expect((await readdir(dir)).some((f) => f.startsWith('squish2pass'))).toBe(false)
  }, 120_000)
})
