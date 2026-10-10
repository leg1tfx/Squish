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
    expect(info.tenBit).toBe(true)
    const out = join(dir, 'ten-out.mp4')
    await runEncode({ info, settings: s({ codec: 'h265' }), available: ['cpu'], output: out }, deps(), {})
    expect((await probeFile(ffprobe, out)).tenBit).toBe(true)
    const out8 = join(dir, 'ten-out8.mp4')
    await runEncode({ info, settings: s({ codec: 'h264' }), available: ['cpu'], output: out8 }, deps(), {})
    expect((await probeFile(ffprobe, out8)).tenBit).toBe(false)
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
