import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, stat, statfs, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Settings } from '../../src/shared/types'
import { runEncode } from '../../src/main/encode/runEncode'
import type { InterpolateDeps } from '../../src/main/encode/interpolate'
import { createRunner } from '../../src/main/ffmpeg/runner'
import { probeFile } from '../../src/main/ffmpeg/probe'
import { extractZip } from '../../src/main/rife/extract'
import { probeVulkan } from '../../src/main/rife/gpu'
import { RIFE_EXE, RIFE_MODEL } from '../../src/main/rife/installer'

const bin = join(process.cwd(), 'resources', 'bin')
const ffmpeg = join(bin, 'ffmpeg.exe')
const ffprobe = join(bin, 'ffprobe.exe')
const pack = join(process.cwd(), 'resources', 'rife-pack', 'rife-pack-1.zip')
const has = existsSync(ffmpeg) && existsSync(pack)

describe.skipIf(!has)('smooth motion integration', () => {
  let dir = ''
  let tmp = ''
  let rifeDir = ''
  let vulkan = false
  const run = createRunner(ffmpeg)
  const countFiles = async (d: string): Promise<number> => (await readdir(d)).length
  const s = (p: Partial<Settings>): Settings => ({ res: 'best', fps: 'best', interpolate: '60', audio: 'high', codec: 'h264', maxMB: null, bitrateKbps: null, encoder: 'cpu', ...p })
  const clip = (name: string) => join(dir, name)

  const deps = () => {
    const interpolate: InterpolateDeps = {
      ffmpeg: run, rife: createRunner(join(rifeDir, RIFE_EXE)), rifeCwd: rifeDir, modelDir: join(rifeDir, RIFE_MODEL), tmpDir: tmp,
      freeBytes: async (d) => { const f = await statfs(d); return Number(f.bavail) * Number(f.bsize) },
      countFiles, makeDir: async (p) => { await mkdir(p, { recursive: true }) }, removeDir: (p) => rm(p, { recursive: true, force: true })
    }
    return { run, tmpDir: tmp, fileSize: async (p: string) => (await stat(p)).size, remove: (p: string) => unlink(p).catch(() => {}), interpolate }
  }

  async function makeClip(file: string, fps: number): Promise<void> {
    const r = await run(['-hide_banner', '-y', '-f', 'lavfi', '-i', `testsrc2=s=320x240:r=${fps}:d=2`, '-f', 'lavfi', '-i', 'sine=f=440:d=2',
      '-c:v', 'libx264', '-crf', '10', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', file])
    expect(r.code).toBe(0)
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'squish-smooth-'))
    // Apostrophe, space and umlaut on purpose (Review Focus 1).
    tmp = join(dir, "Pyno's ä work")
    await mkdir(tmp, { recursive: true })
    rifeDir = join(dir, 'rife')
    await mkdir(rifeDir)
    await extractZip(pack, rifeDir)
    await makeClip(clip('c30.mp4'), 30)
    await makeClip(clip('c25.mp4'), 25)
    vulkan = (await probeVulkan({ ffmpeg: run, rife: createRunner(join(rifeDir, RIFE_EXE)), rifeCwd: rifeDir, modelDir: join(rifeDir, RIFE_MODEL), workDir: tmp, count: countFiles })).ok
  }, 300_000)
  afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

  it('raises 30 fps to 60, keeps audio and duration, and leaves no frames behind', async (ctx) => {
    if (!vulkan) ctx.skip()
    const info = await probeFile(ffprobe, clip('c30.mp4'))
    const out = join(dir, 'out30.mp4')
    await runEncode({ info, settings: s({}), available: ['cpu'], output: out }, deps(), {})
    const o = await probeFile(ffprobe, out)
    expect(Math.round(o.fps)).toBe(60)
    expect(o.durationSec).toBeGreaterThan(1.85)
    expect(o.durationSec).toBeLessThan(2.15)
    expect(o.hasAudio).toBe(true)
    expect((await readdir(tmp)).filter((f) => f.startsWith('frames-'))).toEqual([])
  }, 300_000)

  it('handles a non-integer factor (25 to 60) with the exact frame count', async (ctx) => {
    if (!vulkan) ctx.skip()
    const info = await probeFile(ffprobe, clip('c25.mp4'))
    const out = join(dir, 'out25.mp4')
    await runEncode({ info, settings: s({}), available: ['cpu'], output: out }, deps(), {})
    const o = await probeFile(ffprobe, out)
    expect(Math.round(o.fps)).toBe(60)
    expect(o.durationSec).toBeGreaterThan(1.85)
    expect(o.durationSec).toBeLessThan(2.15)
  }, 300_000)

  it('keeps colours: first frame PSNR against the source stays above 35 dB', async (ctx) => {
    if (!vulkan) ctx.skip()
    const lines: string[] = []
    const r = await run(['-hide_banner', '-i', clip('c30.mp4'), '-i', join(dir, 'out30.mp4'), '-lavfi',
      '[0:v]scale=320:240,select=eq(n\\,0)[a];[1:v]scale=320:240,select=eq(n\\,0)[b];[a][b]psnr', '-f', 'null', '-'], { onErrLine: (l) => lines.push(l) })
    expect(r.code).toBe(0)
    const m = lines.join('\n').match(/average:(inf|[\d.]+)/)
    expect(m).not.toBeNull()
    const db = m![1] === 'inf' ? Infinity : Number(m![1])
    expect(db).toBeGreaterThan(35)
  }, 120_000)

  it('cancelling removes the frames and the partial output', async (ctx) => {
    if (!vulkan) ctx.skip()
    const info = await probeFile(ffprobe, clip('c30.mp4'))
    const out = join(dir, 'cancel.mp4')
    const ac = new AbortController()
    const p = runEncode({ info, settings: s({}), available: ['cpu'], output: out }, deps(), { progress: (pr) => { if (pr.phase === 'interpolate') ac.abort() } }, ac.signal)
    await expect(p).rejects.toMatchObject({ kind: 'aborted' })
    expect(existsSync(out)).toBe(false)
    expect((await readdir(tmp)).filter((f) => f.startsWith('frames-'))).toEqual([])
  }, 300_000)
})
