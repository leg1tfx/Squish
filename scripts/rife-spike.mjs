// Throwaway feasibility check. Verdict only; nothing here ships.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const W = 320, H = 240, TRAVEL = 200, SIZE = 20
const pack = join(process.cwd(), 'resources', 'rife-pack', 'rife-pack-1.zip')
const ffmpeg = join(process.cwd(), 'resources', 'bin', 'ffmpeg.exe')
const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
const work = await mkdtemp(join(tmpdir(), 'squish-rife-spike-'))
const rifeDir = join(work, 'rife')
mkdirSync(rifeDir)
execFileSync(tar, ['-xf', pack, '-C', rifeDir])
const exe = join(rifeDir, 'rife-ncnn-vulkan.exe')
const model = join(rifeDir, 'rife-v4.6')

function makeFrames(fps, seconds, dir) {
  mkdirSync(dir)
  const px = TRAVEL / (fps * seconds - 1)
  const fc = `color=black:s=${W}x${H}:r=${fps}:d=${seconds}[bg];color=white:s=${SIZE}x${SIZE}:r=${fps}:d=${seconds}[sq];[bg][sq]overlay=x='n*${px}':y=100:eval=frame`
  const r = spawnSync(ffmpeg, ['-hide_banner', '-y', '-filter_complex', fc, '-pix_fmt', 'rgb24', '-frames:v', String(fps * seconds), join(dir, '%08d.png')], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}

function positions(dir) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', join(dir, '%08d.png'), '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 29 })
  if (r.status !== 0) throw new Error(String(r.stderr))
  const buf = r.stdout
  const out = []
  for (let f = 0; f < buf.length / (W * H); f++) {
    let sum = 0, n = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (buf[f * W * H + y * W + x] > 128) { sum += x; n++ }
    out.push(n ? sum / n : NaN)
  }
  return out
}

function rife(inDir, outDir, n) {
  mkdirSync(outDir)
  const t0 = Date.now()
  const r = spawnSync(exe, ['-i', inDir, '-o', outDir, '-n', String(n), '-m', model], { cwd: rifeDir, encoding: 'utf8' })
  return { code: r.status, log: r.stderr, ms: Date.now() - t0 }
}

let failed = false
const cases = [{ fps: 30, sec: 2, target: 60 }, { fps: 30, sec: 2, target: 120 }, { fps: 24, sec: 2, target: 120 }, { fps: 25, sec: 2, target: 60 }]
for (const c of cases) {
  const tag = `${c.fps}->${c.target}`
  const inDir = join(work, `in-${c.fps}to${c.target}`), outDir = join(work, `out-${c.fps}to${c.target}`)
  makeFrames(c.fps, c.sec, inDir)
  const n = Math.round(c.sec * c.target)
  const r = rife(inDir, outDir, n)
  if (r.code !== 0) { console.log(tag, 'RIFE FAILED', r.log); failed = true; continue }
  const files = (await readdir(outDir)).sort()
  const inPos = positions(inDir), outPos = positions(outDir)
  const mean = outPos.reduce((a, b) => a + b, 0) / outPos.length
  const idxMean = (outPos.length - 1) / 2
  let num = 0, den = 0
  outPos.forEach((p, i) => { num += (i - idxMean) * (p - mean); den += (i - idxMean) ** 2 })
  const slope = num / den
  const residual = Math.max(...outPos.map((p, i) => Math.abs(p - (mean + slope * (i - idxMean)))))
  const startErr = Math.abs(outPos[0] - inPos[0]), endErr = Math.abs(outPos.at(-1) - inPos.at(-1))
  const ok = files.length === n && residual <= 3 && startErr <= 3 && endErr <= 3
  if (!ok) failed = true
  console.log(`${tag}: want ${n} frames, got ${files.length} (first ${files[0]}), residual ${residual.toFixed(2)} px, start err ${startErr.toFixed(2)}, end err ${endErr.toFixed(2)}, ${r.ms} ms -> ${ok ? 'PASS' : 'FAIL'}`)
}

const probeIn = join(work, 'probe-in'), probeOut = join(work, 'probe-out')
mkdirSync(probeIn)
spawnSync(ffmpeg, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc=s=64x64:r=2', '-frames:v', '2', join(probeIn, '%08d.png')])
const p = rife(probeIn, probeOut, 3)
const probeCount = p.code === 0 ? (await readdir(probeOut)).length : 0
console.log(`vulkan probe (2 frames of 64x64 -> 3): code ${p.code}, ${probeCount} frames -> ${probeCount === 3 ? 'PASS' : 'FAIL'}`)
if (probeCount !== 3) failed = true

await rm(work, { recursive: true, force: true })
console.log(failed ? 'SPIKE RESULT: FAIL' : 'SPIKE RESULT: PASS')
process.exit(failed ? 1 : 0)
