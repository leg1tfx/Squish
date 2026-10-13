# Frame-Interpolation (RIFE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pyno's Squish can optionally raise a video's frame rate to 60 or 120 fps with RIFE (rife-ncnn-vulkan), using an add-on that is downloaded on first use.

**Architecture:** A pure planner decides whether and how to interpolate (`Plan.interpolation`). The main process runs a three-stage pipeline: ffmpeg exports PNG frames at output resolution, RIFE interpolates them to an exact frame count, and the existing encode loop (encoders, target-size retries, GPU fallback) encodes from the interpolated frames with audio taken from the source. A small installer downloads a self-hosted, SHA-256-pinned RIFE pack into `userData\rife`. The renderer gets one new setting row, a download dialog, a three-phase progress label and messages.

**Tech Stack:** Electron 44, TypeScript 5.9, React 19, Zustand 5, Motion 13, Vitest 5, FFmpeg (bundled), rife-ncnn-vulkan 20221029 with model `rife-v4.6` (MIT).

**Spec:** `docs/superpowers/specs/2026-10-09-frame-interpolation-design.md` (read it first). The existing app is described in `docs/superpowers/specs/2026-09-24-squish-design.md`.

## Global Constraints

- Windows 10/11 x64 only. Paths are `win32` style. No Unix-only commands in scripts (use Node, not bash, in `scripts/`).
- UI copy is English, brand `Pyno's Squish` (with apostrophe), identifiers and file names use `pynos-squish`. **No em dashes in UI copy.**
- Interpolation is **off by default** and must not change any behaviour when `interpolate` is `'off'`.
- Targets are exactly `60` and `120` fps. Interpolation only runs when the source is slower than the target by more than 0.5 fps.
- Network: exactly one HTTPS download of `RIFE_PACK.url`, only after the user clicks Download. No other new network access.
- Renderer security stays: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer only uses `window.squish`.
- Telemetry allowlist does not change. Smooth-motion failures are reported as the existing `ffmpeg` failure kind.
- Existing tests must keep passing. `npm run typecheck` and `npm test` must be green at the end of every task.
- Commit messages are English, end with the attribution trailer the session requires. Commit only the files the task lists. The working tree has unrelated uncommitted changes (`src/renderer/src/screens/DropScreen.tsx`, `build-exe.bat`, `start.bat`): never stage them.
- Do all work on a new branch `feat/frame-interpolation` created from the current HEAD (`git switch -c feat/frame-interpolation`). Ask the user first if they want a different base.

## Review Focus

1. **Path with apostrophe, space and umlaut for the temp folder** (`...\Pyno's ä work\frames-out`): RIFE and ffmpeg must both read and write there. Pinned in Task 11.
2. **Odd or portrait sources (1081×1921, 2160×3840 rotated)**: exported frames must use the planner's even output size. Pinned in Task 4.
3. **Fractional frame rates (29.97 → 60, 59.94 → 120)**: frame target uses the exact duration, export uses the exact source fraction. Pinned in Tasks 3 and 4.
4. **Clips with fewer than 2 source frames**: RIFE cannot interpolate them, so the plan must not request interpolation. Pinned in Task 3.
5. **Colour fidelity through the PNG round trip** (RGB frames re-encoded as BT.709): first frame PSNR against the source must stay high. Pinned in Task 11.

Cancel and disk-full cleanup are pinned in Tasks 5 and 7.

---

## File Structure

```
scripts/build-rife-pack.mjs            (new)  builds the slim pack zip + prints hash
scripts/rife-spike.mjs                 (new)  feasibility check for -n with non-integer factors
src/shared/types.ts                    (mod)  InterpolateChoice, Settings.interpolate, Interpolation, Plan.interpolation, EncodePhase, EncodeProgress.phase, EncodeErrorKind, RifeStatus
src/shared/interpolation.ts            (new)  targets, disabled options, disk estimate, progress weights, messages
src/shared/rifePack.ts                 (new)  RIFE_PACK constants + rifePackReady()
src/shared/planner.ts                  (mod)  interpolation in buildPlan/changes
src/shared/presets.ts                  (mod)  built-ins get interpolate: 'off'
src/shared/ffmpegArgs.ts               (mod)  buildFrameExportArgs, frames option in buildArgs
src/shared/api.ts                      (mod)  rife API, outcome kinds
src/shared/telemetry.ts                (mod)  map new failure kinds to 'ffmpeg'
src/main/store/presetStore.ts          (mod)  accept/migrate interpolate
src/main/encode/errors.ts              (new)  EncodeError, DISK_FULL
src/main/encode/interpolate.ts         (new)  prepareFrames pipeline stage
src/main/encode/runEncode.ts           (mod)  frames stage + phase progress
src/main/encode/preview.ts             (mod)  preview never interpolates
src/main/rife/installer.ts             (new)  download, verify, unpack, status
src/main/rife/extract.ts               (new)  tar.exe unzip
src/main/rife/runRife.ts               (new)  rife args + run with frame counting
src/main/rife/gpu.ts                   (new)  Vulkan probe with a 2-frame run
src/main/ipc.ts, src/main/index.ts, src/preload/index.ts   (mod) wiring
src/renderer/src/state/logic.ts, store.ts                  (mod) copy helpers, rife state, add-on flow
src/renderer/src/components/AddonDialog.tsx                (new)
src/renderer/src/screens/SettingsScreen.tsx, EncodingScreen.tsx, CompareScreen.tsx, DoneScreen.tsx, src/renderer/src/App.tsx, components/AboutDialog.tsx (mod)
tests/integration/interpolate.int.test.ts                  (new)
.gitignore                                                 (mod)
```

---

### Task 1: Pack builder and feasibility spike (gate)

**Files:**
- Create: `scripts/build-rife-pack.mjs`, `scripts/rife-spike.mjs`
- Modify: `.gitignore`, `docs/superpowers/specs/2026-10-09-frame-interpolation-design.md`

**Interfaces:**
- Consumes: `resources\bin\ffmpeg.exe` (exists after `npm run fetch-ffmpeg`).
- Produces: `resources\rife-pack\rife-pack-1.zip` containing `rife-ncnn-vulkan.exe`, its DLLs, folder `rife-v4.6\`, `LICENSE.txt` at the zip root; the printed `{ version, sha256, sizeBytes }` used in Task 12; a PASS/FAIL verdict for `-n` with non-integer factors.

This task is a spike, not TDD. If the verdict is FAIL, **stop and report to the user**. The pipeline in Tasks 4 to 7 assumes RIFE can produce exactly `-n` evenly spaced frames.

- [x] **Step 1: Create the branch**

```bash
git switch -c feat/frame-interpolation
```

- [x] **Step 2: Ignore the pack output**

Append to `.gitignore`:

```
resources/rife-pack/
```

- [x] **Step 3: Write the pack builder**

Create `scripts/build-rife-pack.mjs`:

```js
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const OFFICIAL = 'https://github.com/nihui/rife-ncnn-vulkan/releases/download/20221029/rife-ncnn-vulkan-20221029-windows.zip'
const LICENSE_URL = 'https://raw.githubusercontent.com/nihui/rife-ncnn-vulkan/master/LICENSE'
const MODEL = 'rife-v4.6'
const VERSION = 'rife-pack-1'
// Explicit path: Git Bash puts GNU tar first on PATH, which cannot read zip files.
const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')

const work = await mkdtemp(join(tmpdir(), 'squish-rife-pack-'))
try {
  const official = join(work, 'official.zip')
  console.log('Downloading the official package (about 431 MB)...')
  const res = await fetch(OFFICIAL)
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(official))

  const src = join(work, 'official')
  await mkdir(src)
  execFileSync(tar, ['-xf', official, '-C', src])
  const top = await readdir(src, { withFileTypes: true })
  const root = top.length === 1 && top[0].isDirectory() ? join(src, top[0].name) : src
  console.log('Official package contains:', (await readdir(root)).join(', '))

  const stage = join(work, 'stage')
  await mkdir(stage)
  await copyFile(join(root, 'rife-ncnn-vulkan.exe'), join(stage, 'rife-ncnn-vulkan.exe'))
  for (const f of await readdir(root)) if (f.toLowerCase().endsWith('.dll')) await copyFile(join(root, f), join(stage, f))
  await cp(join(root, MODEL), join(stage, MODEL), { recursive: true })
  const lic = await fetch(LICENSE_URL)
  if (!lic.ok) throw new Error(`License download failed: ${lic.status}`)
  await writeFile(join(stage, 'LICENSE.txt'), await lic.text())

  const out = join(process.cwd(), 'resources', 'rife-pack')
  await mkdir(out, { recursive: true })
  const zip = join(out, `${VERSION}.zip`)
  await rm(zip, { force: true })
  execFileSync(tar, ['-a', '-c', '-f', zip, '-C', stage, '.'])

  const hash = createHash('sha256')
  for await (const chunk of createReadStream(zip)) hash.update(chunk)
  console.log('Pack ready:', zip)
  console.log(JSON.stringify({ version: VERSION, sha256: hash.digest('hex'), sizeBytes: (await stat(zip)).size }, null, 2))
  console.log('Upload exactly this file. Any rebuild changes the hash.')
} finally {
  await rm(work, { recursive: true, force: true })
}
```

- [x] **Step 4: Build the pack**

Run: `node scripts/build-rife-pack.mjs`
Expected: prints the official package contents, then `Pack ready: ...rife-pack-1.zip` and a JSON block with a 64-character `sha256` and `sizeBytes`. Write both values down for Task 12. If the model folder is not called `rife-v4.6`, the script throws: stop and report the real folder names.

- [x] **Step 5: Write the spike script**

Create `scripts/rife-spike.mjs`:

```js
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
  const r = spawnSync(ffmpeg, ['-hide_banner', '-y', '-filter_complex', fc, '-frames:v', String(fps * seconds), join(dir, '%08d.png')], { encoding: 'utf8' })
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
  const inDir = join(work, `in-${tag}`), outDir = join(work, `out-${tag}`)
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
  const ok = files.length === n && residual <= 2 && startErr <= 3 && endErr <= 3
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
```

- [x] **Step 6: Run the spike**

Run: `node scripts/rife-spike.mjs`
Expected: four lines ending in `PASS`, a passing vulkan probe, and `SPIKE RESULT: PASS`. Output frames are named `00000001.png` and so on.
If any line says FAIL, or RIFE reports no Vulkan device: **stop, paste the output to the user, and do not continue.** (A FAIL on frame count or residual means `-n` cannot be used as designed; the user must decide between rounding to an integer factor plus an ffmpeg `fps` trim, or a different model.)

- [x] **Step 7: Sync the spec with what the plan now knows**

Apply these three replacements in `docs/superpowers/specs/2026-10-09-frame-interpolation-design.md`:

1. Old: `Ist keine Vulkan-GPU vorhanden, ist die Option gesperrt und zeigt den Grund als Tooltip und Hilfetext.`
   New: `Ob eine Vulkan-GPU vorhanden ist, lässt sich erst nach der Installation prüfen (kleiner Testlauf mit zwei Frames). Bis dahin ist die Option wählbar. Zeigt der Test keine GPU, wird sie gesperrt und der Grund als Hilfetext angezeigt.`
2. Old: `` - `gpu.ts`: `detectVulkan()` startet die exe mit `-h`/Vulkan-Probe-Aufruf (der genaue Aufruf ergibt sich aus Task 1) und wertet aus, ob ein Gerät gefunden wurde. Das Ergebnis wird einmal pro App-Start gecacht. ``
   New: `` - `gpu.ts`: `probeVulkan()` erzeugt zwei 64×64-Frames, lässt RIFE daraus 3 Frames berechnen und wertet Exit-Code und Frame-Anzahl aus. Das Ergebnis wird einmal pro App-Start gecacht. ``
3. Old: `Beispiel: 1080p, 30 s, 30 → 120 fps ergibt etwa 3600 Ausgabeframes und rund 11 GB.`
   New: `Beispiel: 1080p, 30 s, 30 → 120 fps ergibt 900 Eingabe- plus 3600 Ausgabeframes, also rund 17 GB inklusive Reserve.`
4. Old: `Die Schätzung wird in Task 1 an echtem Material kalibriert.`
   New: `Die Schätzung (1,5 Byte pro Pixel) ist ein Richtwert und wird in Task 12 an einem echten Clip gegengeprüft. Ein Fehler kann nur zu früh oder zu spät warnen, nie Daten beschädigen.`

Then append at the end of the spec:

```markdown

## Anhang: Spike-Ergebnis (Task 1)

`-n` mit `rife-v4.6` liefert bei 30 → 60, 30 → 120, 24 → 120 und 25 → 60 genau die gewünschte Frameanzahl, gleichmäßige Abstände (Abweichung höchstens 2 px) und passende Start- und Endposition. Ausgabedateien heißen `00000001.png` und aufwärts. Der Vulkan-Test mit zwei 64×64-Frames funktioniert. (Messwerte stehen in der Ausgabe von `scripts/rife-spike.mjs`.)
```

- [x] **Step 8: Commit**

```bash
git add .gitignore scripts/build-rife-pack.mjs scripts/rife-spike.mjs docs/superpowers/specs/2026-10-09-frame-interpolation-design.md docs/superpowers/plans/2026-10-09-frame-interpolation.md
git commit -m "chore(smooth): rife pack builder, feasibility spike and spec"
```

---

### Task 2: Settings plumbing (`interpolate`)

**Files:**
- Modify: `src/shared/types.ts`, `src/shared/presets.ts`, `src/main/store/presetStore.ts`
- Modify (mechanical): `src/shared/ffmpegArgs.test.ts`, `src/shared/planner.test.ts`, `src/shared/telemetry.test.ts`, `src/main/encode/preview.test.ts`, `src/main/encode/runEncode.test.ts`, `src/main/store/presetStore.test.ts`, `src/renderer/src/state/logic.test.ts`, `tests/integration/encode.int.test.ts`
- Test: `src/main/store/presetStore.test.ts`

**Interfaces:**
- Produces: `type InterpolateChoice = 'off' | '60' | '120'`; `Settings.interpolate: InterpolateChoice` and therefore `PresetSettings.interpolate`. Old stored presets without the field load as `'off'`; unknown values are dropped.

- [x] **Step 1: Write the failing store test**

In `src/main/store/presetStore.test.ts`, change line 7 to include the new field:

```ts
const settings = { res: '1080', fps: 'best', audio: 'best', codec: 'h265', maxMB: null, bitrateKbps: null, interpolate: 'off' } as const
```

and add this test inside the `describe('presetStore', ...)` block (before its closing `})`):

```ts
  it('adds interpolate: off to presets saved before smooth motion existed and drops unknown values', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'squish-store-'))
    const file = join(dir, 'presets.json')
    const { interpolate: _drop, ...old } = settings
    await writeFile(file, JSON.stringify({
      version: 1,
      userPresets: [
        { id: 'user-1', label: 'Old', builtIn: false, settings: old },
        { id: 'user-2', label: 'Bad', builtIn: false, settings: { ...old, interpolate: '240' } },
        { id: 'user-3', label: 'New', builtIn: false, settings: { ...old, interpolate: '120' } }
      ],
      lastPresetId: 'tiktok', promoDismissed: false
    }))
    const d = await loadStore(file)
    expect(d.userPresets.map((p) => [p.id, p.settings.interpolate])).toEqual([['user-1', 'off'], ['user-3', '120']])
  })
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/main/store/presetStore.test.ts`
Expected: FAIL (`user-1` is dropped because the old settings lack nothing the validator knows, but `interpolate` comes back `undefined` and `user-2` is kept).

- [x] **Step 3: Update the types**

In `src/shared/types.ts`, add after the `AudioChoice` line:

```ts
export type InterpolateChoice = 'off' | '60' | '120'
```

and add to `Settings` right after `fps: FpsChoice`:

```ts
  /** Optional frame interpolation (RIFE). 'off' keeps the source timing. */
  interpolate: InterpolateChoice
```

- [x] **Step 4: Update built-in presets**

In `src/shared/presets.ts` replace the `base` line with:

```ts
const base = { res: 'best', fps: 'best', interpolate: 'off', bitrateKbps: null } as const
```

- [x] **Step 5: Accept and migrate the field in the store**

In `src/main/store/presetStore.ts` add below the `CODEC_VALUES` line:

```ts
const INTERPOLATE_VALUES = new Set(['off', '60', '120'])
```

In `isPresetSettings`, add this condition after the `fps` check (keep the `&&` chain):

```ts
    (s.interpolate === undefined || (typeof s.interpolate === 'string' && INTERPOLATE_VALUES.has(s.interpolate))) &&
```

In `loadStore`, replace `.map((p) => ({ ...p, builtIn: false }))` with:

```ts
        .map((p) => ({ ...p, builtIn: false, settings: { ...p.settings, interpolate: p.settings.interpolate ?? 'off' } }))
```

- [x] **Step 6: Fix every other Settings literal mechanically**

```bash
sed -i "s/bitrateKbps: null, encoder:/bitrateKbps: null, interpolate: 'off', encoder:/" src/shared/ffmpegArgs.test.ts src/shared/planner.test.ts src/shared/telemetry.test.ts src/main/encode/preview.test.ts src/main/encode/runEncode.test.ts tests/integration/encode.int.test.ts
sed -i "s/maxMB: null, bitrateKbps: null } }\]/maxMB: null, bitrateKbps: null, interpolate: 'off' } }]/" src/renderer/src/state/logic.test.ts
git diff --stat
```

Expected: the diff lists the 7 test files above plus the three source files. If `logic.test.ts` is not in the list, edit line 7 by hand so its `settings` object ends with `bitrateKbps: null, interpolate: 'off' }`.

- [x] **Step 7: Run typecheck and all tests**

Run: `npm run typecheck`
Expected: no errors. If the compiler reports another `Settings` literal, add `interpolate: 'off'` the same way.

Run: `npm test`
Expected: all PASS, including the new store test.

- [x] **Step 8: Commit**

```bash
git add src/shared/types.ts src/shared/presets.ts src/main/store/presetStore.ts src/main/store/presetStore.test.ts src/shared/ffmpegArgs.test.ts src/shared/planner.test.ts src/shared/telemetry.test.ts src/main/encode/preview.test.ts src/main/encode/runEncode.test.ts src/renderer/src/state/logic.test.ts tests/integration/encode.int.test.ts
git commit -m "feat(smooth): add interpolate setting with preset migration"
```

---

### Task 3: Planner, shared helpers, preview guard

**Files:**
- Create: `src/shared/interpolation.ts`, `src/shared/interpolation.test.ts`
- Modify: `src/shared/types.ts`, `src/shared/planner.ts`, `src/shared/planner.test.ts`, `src/main/encode/preview.ts`, `src/main/encode/preview.test.ts`

**Interfaces:**
- Produces in `types.ts`: `Interpolation { targetFps: 60 | 120; sourceFps: number; frames: number }`, `Plan.interpolation: Interpolation | null`, `EncodePhase = 'prepare' | 'interpolate' | 'encode'`.
- Produces in `interpolation.ts`: `INTERP_TARGETS`, `disabledInterpolate(info): InterpolateChoice[]`, `interpTarget(choice): 60 | 120 | null`, `sourceFrameCount(info): number`, `interpolationDiskBytes(info, plan): number`, `overallFraction(phase, within): number`, `NO_VULKAN_MESSAGE`.
- Consumes: `Settings.interpolate` from Task 2.

- [x] **Step 1: Write the failing helper tests**

Create `src/shared/interpolation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { disabledInterpolate, interpTarget, interpolationDiskBytes, overallFraction, sourceFrameCount } from './interpolation'
import { buildPlan } from './planner'
import type { Settings, VideoInfo } from './types'

const info = (p: Partial<VideoInfo> = {}): VideoInfo => ({
  path: 'C:\\v\\a.mp4', sizeBytes: 1e8, durationSec: 30, width: 1920, height: 1080, fps: 30, fpsFraction: '30/1',
  videoCodec: 'h264', videoKbps: 20_000, hasAudio: true, audioCodec: 'aac', audioKbps: 192, hdr: false, ...p
})
const s = (p: Partial<Settings> = {}): Settings => ({
  res: 'best', fps: 'best', interpolate: 'off', audio: 'best', codec: 'h265', maxMB: null, bitrateKbps: null, encoder: 'auto', ...p
})

describe('interpolation helpers', () => {
  it('maps choices to targets', () => {
    expect(interpTarget('off')).toBeNull()
    expect(interpTarget('60')).toBe(60)
    expect(interpTarget('120')).toBe(120)
  })
  it('disables targets the source already reaches (0.5 fps tolerance)', () => {
    expect(disabledInterpolate(info({ fps: 30 }))).toEqual([])
    expect(disabledInterpolate(info({ fps: 59.94 }))).toEqual(['60'])
    expect(disabledInterpolate(info({ fps: 60 }))).toEqual(['60'])
    expect(disabledInterpolate(info({ fps: 120 }))).toEqual(['60', '120'])
  })
  it('counts source frames', () => {
    expect(sourceFrameCount(info({ durationSec: 30, fps: 30 }))).toBe(900)
  })
  it('estimates peak disk use as input + output frames at 1.5 bytes per pixel plus 20% reserve', () => {
    const i = info()
    const plan = buildPlan(i, s({ interpolate: '120' }), ['cpu'])
    expect(interpolationDiskBytes(i, plan)).toBe(16_796_160_000)
  })
  it('needs no disk without interpolation', () => {
    const i = info()
    expect(interpolationDiskBytes(i, buildPlan(i, s(), ['cpu']))).toBe(0)
  })
  it('weights the phases 10 / 60 / 30 and clamps', () => {
    expect(overallFraction('prepare', 0.5)).toBeCloseTo(0.05)
    expect(overallFraction('interpolate', 0)).toBeCloseTo(0.1)
    expect(overallFraction('interpolate', 1)).toBeCloseTo(0.7)
    expect(overallFraction('encode', 0.5)).toBeCloseTo(0.85)
    expect(overallFraction('encode', 3)).toBeCloseTo(1)
    expect(overallFraction('prepare', -1)).toBe(0)
  })
})
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/interpolation.test.ts`
Expected: FAIL (module `./interpolation` not found).

- [x] **Step 3: Add the types**

In `src/shared/types.ts` append:

```ts
export type EncodePhase = 'prepare' | 'interpolate' | 'encode'

export interface Interpolation {
  targetFps: 60 | 120
  sourceFps: number
  /** Number of frames RIFE must produce: round(duration * targetFps). */
  frames: number
}
```

and add to `Plan` after `fpsExpr`:

```ts
  /** Non-null when frames are interpolated before encoding. */
  interpolation: Interpolation | null
```

- [x] **Step 4: Write the helpers**

Create `src/shared/interpolation.ts`:

```ts
import type { EncodePhase, InterpolateChoice, Plan, VideoInfo } from './types'

export const INTERP_TARGETS = [60, 120] as const
/** Same tolerance as disabledFps: 59.94 counts as 60. */
export const INTERP_TOLERANCE = 0.5
export const NO_VULKAN_MESSAGE = 'Smooth motion needs a graphics card with Vulkan support. None was found.'

const PNG_BYTES_PER_PIXEL = 1.5
const DISK_RESERVE = 1.2
const PHASE_START: Record<EncodePhase, number> = { prepare: 0, interpolate: 0.1, encode: 0.7 }
const PHASE_SPAN: Record<EncodePhase, number> = { prepare: 0.1, interpolate: 0.6, encode: 0.3 }

export function interpTarget(choice: InterpolateChoice): 60 | 120 | null {
  return choice === '60' ? 60 : choice === '120' ? 120 : null
}

export function disabledInterpolate(info: VideoInfo): InterpolateChoice[] {
  return INTERP_TARGETS.filter((t) => info.fps >= t - INTERP_TOLERANCE).map((t) => String(t) as InterpolateChoice)
}

export function sourceFrameCount(info: VideoInfo): number {
  return Math.ceil(info.durationSec * info.fps)
}

/** Peak temp disk use: input and output frames exist together while RIFE runs. */
export function interpolationDiskBytes(info: VideoInfo, plan: Plan): number {
  if (!plan.interpolation) return 0
  const perFrame = plan.width * plan.height * PNG_BYTES_PER_PIXEL
  return Math.round((sourceFrameCount(info) + plan.interpolation.frames) * perFrame * DISK_RESERVE)
}

export function overallFraction(phase: EncodePhase, within: number): number {
  const w = Math.min(1, Math.max(0, within))
  return PHASE_START[phase] + PHASE_SPAN[phase] * w
}
```

- [x] **Step 5: Write the failing planner tests**

In `src/shared/planner.test.ts` change the import line to add nothing new (it already imports `buildPlan`), then append this `describe` block at the end of the file:

```ts
describe('buildPlan: smooth motion', () => {
  const src30 = (p: Partial<VideoInfo> = {}): VideoInfo => info({ width: 1920, height: 1080, fps: 30, fpsFraction: '30/1', ...p })
  it('is off by default', () => {
    expect(buildPlan(src30(), s(), ['cpu']).interpolation).toBeNull()
  })
  it('raises 30 fps to 120 with an exact frame target', () => {
    const p = buildPlan(src30(), s({ interpolate: '120' }), ['cpu'])
    expect(p).toMatchObject({ fps: 120, fpsExpr: '120', interpolation: { targetFps: 120, sourceFps: 30, frames: 16_080 } })
  })
  it('interpolation wins over the fps choice', () => {
    expect(buildPlan(src30(), s({ interpolate: '60', fps: '30' }), ['cpu'])).toMatchObject({ fps: 60, interpolation: { targetFps: 60 } })
  })
  it('does not interpolate when the source already reaches the target', () => {
    expect(buildPlan(info({ fps: 60 }), s({ interpolate: '60' }), ['cpu']).interpolation).toBeNull()
    expect(buildPlan(info({ fps: 59.94, fpsFraction: '60000/1001' }), s({ interpolate: '60' }), ['cpu'])).toMatchObject({ interpolation: null, fpsExpr: '60000/1001' })
  })
  it('handles fractional source rates with the exact duration', () => {
    const p = buildPlan(src30({ fps: 29.97, fpsFraction: '30000/1001', durationSec: 10.01 }), s({ interpolate: '60' }), ['cpu'])
    expect(p.interpolation).toEqual({ targetFps: 60, sourceFps: 29.97, frames: 601 })
  })
  it('does not interpolate clips with fewer than 2 source frames', () => {
    expect(buildPlan(src30({ durationSec: 0.03 }), s({ interpolate: '120' }), ['cpu']).interpolation).toBeNull()
  })
  it('shows the interpolated rate in the changes table', () => {
    const rows = buildPlan(src30(), s({ interpolate: '120' }), ['cpu']).changes
    expect(rows.find((r) => r.label === 'FRAME RATE')).toEqual({ label: 'FRAME RATE', from: '30 fps', to: '120 fps (interpolated)' })
  })
  it('warns about a tight size limit using the interpolated rate', () => {
    const base = src30()
    expect(buildPlan(base, s({ maxMB: 60 }), ['cpu']).warning).toBeNull()
    expect(buildPlan(base, s({ maxMB: 60, interpolate: '120' }), ['cpu']).warning).toMatchObject({ suggest: '720' })
  })
})
```

- [x] **Step 6: Run to verify they fail**

Run: `npx vitest run src/shared/planner.test.ts src/shared/interpolation.test.ts`
Expected: planner tests FAIL (`interpolation` undefined); interpolation tests may fail on `plan.interpolation`.

- [x] **Step 7: Implement in the planner**

In `src/shared/planner.ts`:

1. Add the import: `import { interpTarget } from './interpolation'`
2. Replace the fps line inside `buildPlan`:

```ts
  const { fps, expr } = outputFps(info, s.fps)
```

with:

```ts
  const target = interpTarget(s.interpolate)
  // Needs at least 2 source frames and a source clearly slower than the target.
  const interp = target !== null && info.fps < target - INTERP_TOLERANCE && info.durationSec * info.fps >= 2 ? target : null
  const { fps, expr } = interp !== null ? { fps: interp, expr: String(interp) } : outputFps(info, s.fps)
```

3. Add `INTERP_TOLERANCE` to the import: `import { INTERP_TOLERANCE, interpTarget } from './interpolation'`.
4. In the `base` object add after `fpsExpr: expr,`:

```ts
    interpolation: interp !== null
      ? { targetFps: interp, sourceFps: info.fps, frames: Math.round(info.durationSec * interp) }
      : null,
```

5. In `changesFor`, replace the `FRAME RATE` row line with:

```ts
  rows.push({
    label: 'FRAME RATE', from: formatFps(info.fps),
    to: p.interpolation ? `${formatFps(p.fps)} (interpolated)` : Math.abs(p.fps - info.fps) < 0.01 ? 'kept' : formatFps(p.fps)
  })
```

- [x] **Step 8: Make the preview ignore interpolation**

In `src/main/encode/preview.ts` replace the `base` line in `encodeAfter`:

```ts
    const base = buildPlan(info, req.settings, req.available, encoder ? { encoder } : {})
```

with:

```ts
    // The 5 s sample never interpolates; the Compare screen says so.
    const base = buildPlan(info, { ...req.settings, interpolate: 'off' }, req.available, encoder ? { encoder } : {})
```

Add this test inside `describe('makePreview', ...)` in `src/main/encode/preview.test.ts`:

```ts
  it('ignores smooth motion so the sample keeps the source frame rate', async () => {
    const calls: string[][] = []
    const run: Runner = async (a) => { calls.push(a); return { code: 0, stderrTail: '', aborted: false } }
    await makePreview(run, { info: info(134), settings: { ...s, interpolate: '120' }, available: ['cpu'] }, 'C:\\p')
    const vf = calls[1][calls[1].indexOf('-vf') + 1]
    expect(vf).toContain('fps=30')
    expect(vf).not.toContain('fps=120')
  })
```

- [x] **Step 9: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: all PASS. If a test file constructs a `Plan` literal and fails typecheck, add `interpolation: null` to it.

- [x] **Step 10: Commit**

```bash
git add src/shared/interpolation.ts src/shared/interpolation.test.ts src/shared/types.ts src/shared/planner.ts src/shared/planner.test.ts src/main/encode/preview.ts src/main/encode/preview.test.ts
git commit -m "feat(smooth): plan interpolation targets, disk estimate and progress weights"
```

---

### Task 4: ffmpeg arguments for the frame pipeline

**Files:**
- Modify: `src/shared/ffmpegArgs.ts`, `src/shared/ffmpegArgs.test.ts`

**Interfaces:**
- Consumes: `Plan.interpolation`, `Plan.width/height` from Task 3.
- Produces: `buildFrameExportArgs(info, plan, o: { input: string; dir: string }): string[]` and `ArgsOptions.frames?: { dir: string; fps: number }` on `buildArgs`. Frames are read as `<dir>\%08d.png`.

- [x] **Step 1: Write the failing tests**

In `src/shared/ffmpegArgs.test.ts` change the import to `import { buildArgs, buildFrameExportArgs, videoFilter } from './ffmpegArgs'` and append:

```ts
describe('frame pipeline args', () => {
  const src = { ...info, width: 1920, height: 1080, fps: 30, fpsFraction: '30/1', durationSec: 10 }
  const plan = buildPlan(src, s({ interpolate: '120' }), ['cpu'])
  const out = 'C:\\out\\a_squish.mp4'

  it('exports PNG frames at output size with the exact source rate', () => {
    const a = buildFrameExportArgs(src, plan, { input: src.path, dir: 'C:\\w\\frames-in' })
    expect(pick(a, '-i')).toBe(src.path)
    expect(pick(a, '-vf')).toBe('fps=30,format=rgb24')
    expect(a.at(-1)).toBe('C:\\w\\frames-in\\%08d.png')
    expect(pick(a, '-progress')).toBe('pipe:1')
  })
  it('keeps the fractional source rate and tonemaps HDR before scaling', () => {
    const hdr = { ...src, hdr: true, fps: 29.97, fpsFraction: '30000/1001', width: 3840, height: 2160 }
    const p = buildPlan(hdr, s({ interpolate: '60', res: '1080' }), ['cpu'])
    const vf = pick(buildFrameExportArgs(hdr, p, { input: hdr.path, dir: 'D:\\f' }), '-vf')!
    expect(vf.startsWith('zscale=t=linear:npl=100')).toBe(true)
    expect(vf).toContain('scale=1920:1080:flags=lanczos')
    expect(vf.endsWith('fps=30000/1001,format=rgb24')).toBe(true)
  })
  it('uses the even output size for odd and portrait sources', () => {
    const odd = { ...src, width: 1081, height: 1921 }
    const vf = pick(buildFrameExportArgs(odd, buildPlan(odd, s({ interpolate: '60' }), ['cpu']), { input: odd.path, dir: 'D:\\f' }), '-vf')!
    expect(vf).toContain('scale=1082:1922:flags=lanczos')
    const portrait = { ...src, width: 2160, height: 3840 }
    const vf2 = pick(buildFrameExportArgs(portrait, buildPlan(portrait, s({ interpolate: '60', res: '1080' }), ['cpu']), { input: portrait.path, dir: 'D:\\f' }), '-vf')!
    expect(vf2).toContain('scale=1080:1920:flags=lanczos')
  })
  it('encodes from frames with audio from the source and BT.709 tags', () => {
    const a = buildArgs(src, plan, { input: src.path, output: out, frames: { dir: 'C:\\w\\frames-out', fps: 120 } })
    const i = a.indexOf('-framerate')
    expect(a.slice(i, i + 4)).toEqual(['-framerate', '120', '-i', 'C:\\w\\frames-out\\%08d.png'])
    expect(a.filter((x) => x === '-i')).toHaveLength(2)
    expect(a.lastIndexOf('-i')).toBeGreaterThan(i)
    expect(a[a.lastIndexOf('-i') + 1]).toBe(src.path)
    expect(a).toContain('1:a:0')
    expect(a).not.toContain('0:a:0')
    expect(pick(a, '-vf')).toBe('scale=out_color_matrix=bt709,format=yuv420p')
    expect(pick(a, '-colorspace')).toBe('bt709')
    expect(a.at(-1)).toBe(out)
  })
  it('uses nv12 for QSV and has a single input for silent sources and pass 1', () => {
    const qsv = buildArgs(src, buildPlan(src, s({ interpolate: '60' }), ['qsv', 'cpu']), { input: src.path, output: out, frames: { dir: 'F', fps: 60 } })
    expect(pick(qsv, '-vf')).toBe('scale=out_color_matrix=bt709,format=nv12')
    const silent = { ...src, hasAudio: false, audioKbps: 0, audioCodec: '' }
    const a = buildArgs(silent, buildPlan(silent, s({ interpolate: '60' }), ['cpu']), { input: silent.path, output: out, frames: { dir: 'F', fps: 60 } })
    expect(a.filter((x) => x === '-i')).toHaveLength(1)
    expect(a).toContain('-an')
    const t = buildPlan(src, s({ interpolate: '60', maxMB: 10 }), ['cpu'])
    const p1 = buildArgs(src, t, { input: src.path, output: out, pass: 1, passLogName: 'squish2pass', frames: { dir: 'F', fps: 60 } })
    expect(p1.filter((x) => x === '-i')).toHaveLength(1)
    expect(p1.slice(-3)).toEqual(['-f', 'null', 'NUL'])
  })
  it('leaves the normal path untouched', () => {
    const a = buildArgs(src, buildPlan(src, s(), ['cpu']), { input: src.path, output: out })
    expect(a).not.toContain('-framerate')
    expect(pick(a, '-vf')).toBe('fps=30,format=yuv420p')
  })
})
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run src/shared/ffmpegArgs.test.ts`
Expected: FAIL (`buildFrameExportArgs` is not exported).

- [x] **Step 3: Implement**

In `src/shared/ffmpegArgs.ts`:

1. Add to `ArgsOptions`:

```ts
  /** Read interpolated PNG frames instead of the source video. Audio still comes from `input`. */
  frames?: { dir: string; fps: number }
```

2. Add below `videoFilter`:

```ts
export function framesFilter(plan: Plan): string {
  return `scale=out_color_matrix=bt709,format=${plan.encoder === 'qsv' ? 'nv12' : 'yuv420p'}`
}

/** Decode, tonemap and scale the source once, at output size, into numbered PNGs for RIFE. */
export function buildFrameExportArgs(info: VideoInfo, plan: Plan, o: { input: string; dir: string }): string[] {
  const parts: string[] = []
  if (info.hdr) parts.push(...TONEMAP_CHAIN)
  if (plan.width !== info.width || plan.height !== info.height) parts.push(`scale=${plan.width}:${plan.height}:flags=lanczos`)
  parts.push(`fps=${info.fpsFraction.replace(/\/1$/, '')}`, 'format=rgb24')
  return ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-nostats', '-i', o.input,
    '-map', '0:v:0', '-vf', parts.join(','), '-start_number', '1', `${o.dir}\\%08d.png`]
}
```

3. Replace the input section of `buildArgs` (from `if (o.sample) a.push('-ss'...` through `a.push('-vf', videoFilter(info, plan))` and the HDR tag line) with:

```ts
  const withAudio = plan.audioKbps !== null && o.pass !== 1
  if (o.frames) {
    a.push('-framerate', String(o.frames.fps), '-i', `${o.frames.dir}\\%08d.png`)
    if (withAudio) a.push('-i', o.input)
    a.push('-map', '0:v:0')
    if (withAudio) a.push('-map', '1:a:0')
    a.push('-vf', framesFilter(plan))
  } else {
    if (o.sample) a.push('-ss', String(o.sample.startSec))
    a.push('-i', o.input)
    if (o.sample) a.push('-t', String(o.sample.durationSec))
    a.push('-map', '0:v:0')
    if (withAudio) a.push('-map', '0:a:0')
    a.push('-vf', videoFilter(info, plan))
  }
  if (info.hdr || o.frames) a.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709')
```

and delete the old `const withAudio = ...` line and the old duplicated lines that this block replaces (the `-ss`, `-i`, `-t`, `-map` lines and the old HDR tag line), so each appears exactly once.

- [x] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/shared/ffmpegArgs.test.ts && npm run typecheck`
Expected: PASS (the old `buildArgs` tests stay green).

- [x] **Step 5: Commit**

```bash
git add src/shared/ffmpegArgs.ts src/shared/ffmpegArgs.test.ts
git commit -m "feat(smooth): ffmpeg args for frame export and encode from frames"
```

---

### Task 5: Pack constants and installer

**Files:**
- Create: `src/shared/rifePack.ts`, `src/main/rife/installer.ts`, `src/main/rife/extract.ts`
- Test: `src/main/rife/installer.test.ts`
- Modify: `src/shared/types.ts`

**Interfaces:**
- Produces: `RIFE_PACK`, `rifePackReady(pack?)`, `type RifePack`; `type RifeStatus = 'unavailable' | 'missing' | 'installed'` (in `types.ts`); `createInstaller(deps): Installer` with `status()`, `install({ onProgress, signal })`, `dir()`; `InstallError` with `kind: 'network' | 'hash' | 'extract' | 'disk' | 'aborted'`; `RIFE_EXE`, `RIFE_MODEL`; `extractZip(zip, dest)`.

- [x] **Step 1: Add the status type and the constants**

Append to `src/shared/types.ts`:

```ts
export type RifeStatus = 'unavailable' | 'missing' | 'installed'
```

Create `src/shared/rifePack.ts`:

```ts
export interface RifePack { version: string; url: string; sha256: string; sizeBytes: number }

/**
 * The slim pack built by scripts/build-rife-pack.mjs and uploaded as a release asset.
 * While sha256 is empty the feature is hidden and nothing is ever downloaded (Task 12 fills it in).
 */
export const RIFE_PACK: RifePack = {
  version: 'rife-pack-1',
  url: 'https://github.com/leg1tfx/Squish/releases/download/rife-pack-1/rife-pack-1.zip',
  sha256: '',
  sizeBytes: 0
}

export function rifePackReady(pack: RifePack = RIFE_PACK): boolean {
  return /^[0-9a-f]{64}$/.test(pack.sha256) && pack.sizeBytes > 0
}
```

- [x] **Step 2: Write the failing installer tests**

Create `src/main/rife/installer.test.ts`:

```ts
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RifePack } from '@shared/rifePack'
import { createInstaller, InstallError, RIFE_EXE, RIFE_MODEL, type InstallerDeps } from './installer'

const payload = Buffer.from('pretend this is a zip')
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
const pack: RifePack = { version: 'rife-pack-1', url: 'https://example.invalid/p.zip', sha256: sha(payload), sizeBytes: payload.length }
const okFetch: InstallerDeps['fetch'] = async () => new Response(payload, { headers: { 'content-length': String(payload.length) } })
const goodExtract: InstallerDeps['extract'] = async (_zip, dest) => {
  await writeFile(join(dest, RIFE_EXE), 'x')
  await mkdir(join(dest, RIFE_MODEL))
  await writeFile(join(dest, RIFE_MODEL, 'flownet.bin'), 'y')
}

let root = ''
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'squish-rife-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const make = (p: Partial<InstallerDeps> = {}) => createInstaller({ root, pack, fetch: okFetch, extract: goodExtract, ...p })

describe('rife installer', () => {
  it('is unavailable while the pack hash is not filled in', async () => {
    expect(await make({ pack: { ...pack, sha256: '' } }).status()).toBe('unavailable')
  })
  it('installs, reports progress and leaves no temp files', async () => {
    const seen: number[] = []
    const inst = make()
    expect(await inst.status()).toBe('missing')
    await inst.install({ onProgress: (done, total) => { seen.push(done); expect(total).toBe(payload.length) } })
    expect(seen.at(-1)).toBe(payload.length)
    expect(await inst.status()).toBe('installed')
    expect((await readdir(root)).sort()).toEqual(['rife-pack-1'])
    expect(inst.dir()).toBe(join(root, 'rife-pack-1'))
  })
  it('rejects a wrong hash and deletes everything', async () => {
    const inst = make({ fetch: async () => new Response(Buffer.from('tampered')) })
    await expect(inst.install({})).rejects.toMatchObject({ kind: 'hash' })
    expect(await readdir(root)).toEqual([])
    expect(await inst.status()).toBe('missing')
  })
  it('maps HTTP errors and network failures to network', async () => {
    await expect(make({ fetch: async () => new Response('no', { status: 404 }) }).install({})).rejects.toMatchObject({ kind: 'network' })
    await expect(make({ fetch: async () => { throw new TypeError('fetch failed') } }).install({})).rejects.toMatchObject({ kind: 'network' })
    expect(await readdir(root)).toEqual([])
  })
  it('aborts mid-download and cleans up', async () => {
    const hang: InstallerDeps['fetch'] = async (_u, init) => new Response(new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([1, 2, 3]))
        init.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')))
      }
    }))
    const ac = new AbortController()
    const p = make({ fetch: hang }).install({ signal: ac.signal, onProgress: () => ac.abort() })
    await expect(p).rejects.toBeInstanceOf(InstallError)
    await expect(p).rejects.toMatchObject({ kind: 'aborted' })
    expect(await readdir(root)).toEqual([])
  })
  it('reports unpack failures and incomplete packs', async () => {
    await expect(make({ extract: async () => { throw new Error('tar failed') } }).install({})).rejects.toMatchObject({ kind: 'extract' })
    await expect(make({ extract: async () => {} }).install({})).rejects.toMatchObject({ kind: 'extract' })
    expect(await readdir(root)).toEqual([])
  })
  it('treats a marker with another hash as missing and replaces it', async () => {
    const stale = join(root, 'rife-pack-1')
    await mkdir(stale, { recursive: true })
    await writeFile(join(stale, 'ok.json'), JSON.stringify({ sha256: 'old' }))
    const inst = make()
    expect(await inst.status()).toBe('missing')
    await inst.install({})
    expect(await inst.status()).toBe('installed')
  })
})
```

- [x] **Step 3: Run to verify they fail**

Run: `npx vitest run src/main/rife/installer.test.ts`
Expected: FAIL (module `./installer` not found).

- [x] **Step 4: Implement the installer**

Create `src/main/rife/installer.ts`:

```ts
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import type { ReadableStream as WebStream } from 'node:stream/web'
import { rifePackReady, type RifePack } from '@shared/rifePack'
import type { RifeStatus } from '@shared/types'

export const RIFE_EXE = 'rife-ncnn-vulkan.exe'
export const RIFE_MODEL = 'rife-v4.6'
const MARKER = 'ok.json'
const NETWORK_MESSAGE = 'Could not download the add-on. Check your connection and try again.'

export type InstallErrorKind = 'network' | 'hash' | 'extract' | 'disk' | 'aborted'
export class InstallError extends Error {
  constructor(public kind: InstallErrorKind, message: string) { super(message) }
}

export interface InstallerDeps {
  /** Folder that holds all installed versions, e.g. userData\rife. */
  root: string
  pack: RifePack
  fetch: (url: string, init: { signal?: AbortSignal }) => Promise<Response>
  extract: (zipFile: string, destDir: string) => Promise<void>
}
export interface InstallOptions { onProgress?: (done: number, total: number) => void; signal?: AbortSignal }
export interface Installer {
  status(): Promise<RifeStatus>
  install(opts: InstallOptions): Promise<void>
  /** Folder with the exe and the model. Only valid when status() is 'installed'. */
  dir(): string
}

const exists = (p: string): Promise<boolean> => stat(p).then(() => true, () => false)
const wipe = async (p: string): Promise<void> => { await rm(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }

function failure(e: unknown, signal?: AbortSignal): InstallError {
  if (signal?.aborted) return new InstallError('aborted', 'Cancelled')
  if ((e as NodeJS.ErrnoException)?.code === 'ENOSPC') return new InstallError('disk', 'Not enough disk space to download the add-on.')
  return new InstallError('network', NETWORK_MESSAGE)
}

export function createInstaller(deps: InstallerDeps): Installer {
  const { root, pack } = deps
  const finalDir = join(root, pack.version)
  const part = join(root, '.download.part')
  const staging = join(root, '.staging')

  async function download(onProgress: InstallOptions['onProgress'], signal?: AbortSignal): Promise<void> {
    let res: Response
    try { res = await deps.fetch(pack.url, { signal }) } catch (e) { throw failure(e, signal) }
    if (!res.ok || !res.body) throw new InstallError('network', NETWORK_MESSAGE)
    const total = Number(res.headers.get('content-length')) || pack.sizeBytes
    const hash = createHash('sha256')
    const out = createWriteStream(part)
    let done = 0
    try {
      for await (const chunk of Readable.fromWeb(res.body as unknown as WebStream)) {
        hash.update(chunk)
        if (!out.write(chunk)) await once(out, 'drain')
        done += chunk.length
        onProgress?.(done, total)
      }
      out.end()
      await finished(out)
    } catch (e) {
      out.destroy()
      throw failure(e, signal)
    }
    if (hash.digest('hex') !== pack.sha256) throw new InstallError('hash', 'The download was damaged and was deleted. Try again.')
  }

  return {
    dir: () => finalDir,

    async status() {
      if (!rifePackReady(pack)) return 'unavailable'
      try {
        const marker = JSON.parse(await readFile(join(finalDir, MARKER), 'utf8')) as { sha256?: string }
        if (marker.sha256 !== pack.sha256) return 'missing'
        return (await exists(join(finalDir, RIFE_EXE))) && (await exists(join(finalDir, RIFE_MODEL))) ? 'installed' : 'missing'
      } catch {
        return 'missing'
      }
    },

    async install({ onProgress, signal } = {}) {
      await mkdir(root, { recursive: true })
      await wipe(part); await wipe(staging)
      try {
        await download(onProgress, signal)
        await mkdir(staging, { recursive: true })
        try { await deps.extract(part, staging) } catch { throw new InstallError('extract', 'The add-on could not be unpacked. Try again.') }
        if (!(await exists(join(staging, RIFE_EXE))) || !(await exists(join(staging, RIFE_MODEL)))) {
          throw new InstallError('extract', 'The add-on is incomplete. Try again.')
        }
        await writeFile(join(staging, MARKER), JSON.stringify({ sha256: pack.sha256 }))
        await wipe(finalDir)
        await rename(staging, finalDir)
      } finally {
        await wipe(part); await wipe(staging)
      }
    }
  }
}
```

Create `src/main/rife/extract.ts`:

```ts
import { execFile } from 'node:child_process'
import { join } from 'node:path'

/** Windows ships bsdtar as tar.exe, which reads zip. Explicit path: Git Bash's GNU tar cannot. */
export function extractZip(zipFile: string, destDir: string): Promise<void> {
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  return new Promise((resolve, reject) => {
    execFile(tar, ['-xf', zipFile, '-C', destDir], { windowsHide: true }, (e) => (e ? reject(e) : resolve()))
  })
}
```

- [x] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/main/rife/installer.test.ts && npm run typecheck`
Expected: all 7 installer tests PASS.

- [x] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/rifePack.ts src/main/rife/installer.ts src/main/rife/installer.test.ts src/main/rife/extract.ts
git commit -m "feat(smooth): verified add-on installer"
```

---

### Task 6: RIFE runner and Vulkan probe

**Files:**
- Create: `src/main/rife/runRife.ts`, `src/main/rife/runRife.test.ts`, `src/main/rife/gpu.ts`, `src/main/rife/gpu.test.ts`

**Interfaces:**
- Consumes: `Runner`, `RunOptions` from `../ffmpeg/runner`.
- Produces: `rifeArgs(o): string[]`; `runRife(deps: RifeRunDeps, o: RifeRunOptions): Promise<RifeRunResult>` where `RifeRunDeps = { run: Runner; cwd: string; count(dir): Promise<number>; pollMs?: number }`, `RifeRunOptions = { inDir; outDir; frames; modelDir; signal?; onFrames?(n); onLog?(line) }`, `RifeRunResult = { ok: boolean; aborted: boolean; log: string }`; `probeVulkan(deps): Promise<{ ok: true } | { ok: false; log: string }>`.

- [x] **Step 1: Write the failing runner tests**

Create `src/main/rife/runRife.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Runner } from '../ffmpeg/runner'
import { rifeArgs, runRife } from './runRife'

const o = { inDir: 'C:\\w\\frames-in', outDir: 'C:\\w\\frames-out', frames: 600, modelDir: 'C:\\rife\\rife-v4.6' }

describe('rifeArgs', () => {
  it('passes directories, exact frame count and model', () => {
    expect(rifeArgs(o)).toEqual(['-i', 'C:\\w\\frames-in', '-o', 'C:\\w\\frames-out', '-n', '600', '-m', 'C:\\rife\\rife-v4.6'])
  })
})

describe('runRife', () => {
  const slowOk: Runner = async () => { await new Promise((r) => setTimeout(r, 40)); return { code: 0, stderrTail: '', aborted: false } }

  it('reports the number of written frames while running', async () => {
    let n = 0
    const seen: number[] = []
    const r = await runRife({ run: slowOk, cwd: 'C:\\rife', count: async () => ++n, pollMs: 5 }, { ...o, onFrames: (c) => seen.push(c) })
    expect(r).toEqual({ ok: true, aborted: false, log: '' })
    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
  })
  it('runs in the rife folder and forwards the abort signal', async () => {
    let cwd: string | undefined
    let sig: AbortSignal | undefined
    const run: Runner = async (_a, opts) => { cwd = opts?.cwd; sig = opts?.signal; return { code: null, stderrTail: 'killed', aborted: true } }
    const ac = new AbortController()
    const r = await runRife({ run, cwd: 'C:\\rife', count: async () => 0, pollMs: 1000 }, { ...o, signal: ac.signal })
    expect(cwd).toBe('C:\\rife')
    expect(sig).toBe(ac.signal)
    expect(r).toMatchObject({ ok: false, aborted: true })
  })
  it('returns the log when RIFE fails', async () => {
    const run: Runner = async () => ({ code: 3, stderrTail: 'vkCreateDevice failed', aborted: false })
    const r = await runRife({ run, cwd: 'C:\\rife', count: async () => 0, pollMs: 1000 }, o)
    expect(r).toEqual({ ok: false, aborted: false, log: 'vkCreateDevice failed' })
  })
})
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run src/main/rife/runRife.test.ts`
Expected: FAIL (module not found).

- [x] **Step 3: Implement the runner**

Create `src/main/rife/runRife.ts`:

```ts
import type { Runner } from '../ffmpeg/runner'

export interface RifeRunDeps {
  /** A runner bound to rife-ncnn-vulkan.exe. */
  run: Runner
  /** The exe's own folder: it loads its DLLs from there. */
  cwd: string
  count(dir: string): Promise<number>
  pollMs?: number
}
export interface RifeRunOptions {
  inDir: string
  outDir: string
  frames: number
  modelDir: string
  signal?: AbortSignal
  onFrames?: (written: number) => void
  onLog?: (line: string) => void
}
export interface RifeRunResult { ok: boolean; aborted: boolean; log: string }

export function rifeArgs(o: Pick<RifeRunOptions, 'inDir' | 'outDir' | 'frames' | 'modelDir'>): string[] {
  return ['-i', o.inDir, '-o', o.outDir, '-n', String(o.frames), '-m', o.modelDir]
}

/** RIFE prints no usable percentage, so progress is the number of finished frames in the output folder. */
export async function runRife(deps: RifeRunDeps, o: RifeRunOptions): Promise<RifeRunResult> {
  const poll = setInterval(() => {
    void deps.count(o.outDir).then((n) => o.onFrames?.(n)).catch(() => {})
  }, deps.pollMs ?? 500)
  try {
    const r = await deps.run(rifeArgs(o), { cwd: deps.cwd, signal: o.signal, onErrLine: o.onLog })
    return { ok: r.code === 0 && !r.aborted, aborted: r.aborted || o.signal?.aborted === true, log: r.stderrTail }
  } finally {
    clearInterval(poll)
  }
}
```

- [x] **Step 4: Write the failing probe tests**

Create `src/main/rife/gpu.test.ts`:

```ts
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Runner } from '../ffmpeg/runner'
import { probeVulkan } from './gpu'

let work = ''
beforeEach(async () => { work = await mkdtemp(join(tmpdir(), 'squish-gpu-')) })
afterEach(async () => { await rm(work, { recursive: true, force: true }) })

const ok: Runner = async () => ({ code: 0, stderrTail: '', aborted: false })
const base = () => ({ ffmpeg: ok, rife: ok, rifeCwd: 'C:\\rife', modelDir: 'C:\\rife\\rife-v4.6', workDir: work, count: async () => 3 })

describe('probeVulkan', () => {
  it('passes when RIFE turns 2 tiny frames into 3', async () => {
    const calls: string[][] = []
    const rife: Runner = async (a) => { calls.push(a); return { code: 0, stderrTail: '', aborted: false } }
    expect(await probeVulkan({ ...base(), rife })).toEqual({ ok: true })
    expect(calls[0][calls[0].indexOf('-n') + 1]).toBe('3')
    expect(await readdir(work)).toEqual([])
  })
  it('fails with the RIFE log when it cannot start', async () => {
    const rife: Runner = async () => ({ code: 1, stderrTail: 'invalid gpu device', aborted: false })
    expect(await probeVulkan({ ...base(), rife })).toEqual({ ok: false, log: 'invalid gpu device' })
    expect(await readdir(work)).toEqual([])
  })
  it('fails when RIFE exits 0 but writes the wrong number of frames', async () => {
    expect(await probeVulkan({ ...base(), count: async () => 0 })).toMatchObject({ ok: false })
  })
  it('fails when the test frames cannot be created', async () => {
    const ffmpeg: Runner = async () => ({ code: 1, stderrTail: 'no lavfi', aborted: false })
    expect(await probeVulkan({ ...base(), ffmpeg })).toEqual({ ok: false, log: 'no lavfi' })
  })
})
```

- [x] **Step 5: Run to verify they fail**

Run: `npx vitest run src/main/rife/gpu.test.ts`
Expected: FAIL (module not found).

- [x] **Step 6: Implement the probe**

Create `src/main/rife/gpu.ts`:

```ts
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Runner } from '../ffmpeg/runner'
import { rifeArgs } from './runRife'

export interface GpuProbeDeps {
  ffmpeg: Runner
  rife: Runner
  rifeCwd: string
  modelDir: string
  workDir: string
  count(dir: string): Promise<number>
}
export type GpuProbe = { ok: true } | { ok: false; log: string }

/** Definitive Vulkan check: RIFE must really turn two 64x64 frames into three. Run once per app start. */
export async function probeVulkan(d: GpuProbeDeps): Promise<GpuProbe> {
  const inDir = join(d.workDir, 'gpu-probe-in')
  const outDir = join(d.workDir, 'gpu-probe-out')
  const wipe = async (): Promise<void> => {
    await rm(inDir, { recursive: true, force: true }); await rm(outDir, { recursive: true, force: true })
  }
  await wipe()
  await mkdir(inDir, { recursive: true }); await mkdir(outDir, { recursive: true })
  try {
    const g = await d.ffmpeg(['-hide_banner', '-nostdin', '-y', '-f', 'lavfi', '-i', 'testsrc=s=64x64:r=2', '-frames:v', '2', join(inDir, '%08d.png')])
    if (g.code !== 0) return { ok: false, log: g.stderrTail }
    const r = await d.rife(rifeArgs({ inDir, outDir, frames: 3, modelDir: d.modelDir }), { cwd: d.rifeCwd })
    if (r.code === 0 && (await d.count(outDir)) === 3) return { ok: true }
    return { ok: false, log: r.stderrTail }
  } finally {
    await wipe()
  }
}
```

- [x] **Step 7: Run tests and typecheck**

Run: `npx vitest run src/main/rife && npm run typecheck`
Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add src/main/rife/runRife.ts src/main/rife/runRife.test.ts src/main/rife/gpu.ts src/main/rife/gpu.test.ts
git commit -m "feat(smooth): rife runner and vulkan probe"
```

---

### Task 7: Pipeline stage and encode integration

**Files:**
- Create: `src/main/encode/errors.ts`, `src/main/encode/interpolate.ts`, `src/main/encode/interpolate.test.ts`
- Modify: `src/main/encode/runEncode.ts`, `src/main/encode/runEncode.test.ts`, `src/shared/types.ts`, `src/shared/api.ts`, `src/shared/telemetry.ts`, `src/shared/telemetry.test.ts`

**Interfaces:**
- Consumes: `buildFrameExportArgs`, `buildArgs(..., { frames })` (Task 4); `interpolationDiskBytes`, `overallFraction` (Task 3); `runRife` (Task 6).
- Produces: `EncodeErrorKind = 'aborted' | 'disk' | 'ffmpeg' | 'size' | 'smooth' | 'addon'` (in `types.ts`); `EncodeProgress.phase: EncodePhase`; `InterpolateDeps`; `prepareFrames(req, deps, on, signal): Promise<Frames>` with `Frames = { dir: string; fps: number; cleanup(): Promise<void> }`; `EncodeDeps.interpolate?: InterpolateDeps` and `EncodeDeps.now?: () => number`.

- [x] **Step 1: Types and error module**

In `src/shared/types.ts` add:

```ts
export type EncodeErrorKind = 'aborted' | 'disk' | 'ffmpeg' | 'size' | 'smooth' | 'addon'
```

and replace the `EncodeProgress` interface with:

```ts
export interface EncodeProgress {
  fraction: number; pass: number; passes: number; speed: number | null; remainingSec: number | null; encoder: EncoderId
  /** Which stage is running. Without smooth motion it is always 'encode'. */
  phase: EncodePhase
}
```

In `src/shared/api.ts` change the import line to add `EncodeErrorKind` and the failure outcome to:

```ts
  | { ok: false; kind: EncodeErrorKind; message: string; log: string }
```

In `src/shared/telemetry.ts` replace the `kind: outcome.kind,` in the failed branch with:

```ts
kind: outcome.kind === 'smooth' || outcome.kind === 'addon' ? 'ffmpeg' : outcome.kind,
```

Create `src/main/encode/errors.ts`:

```ts
import type { EncodeErrorKind } from '@shared/types'

export class EncodeError extends Error {
  constructor(public kind: EncodeErrorKind, message: string, public log = '') { super(message) }
}

export const DISK_FULL = /No space left on device|There is not enough space on the disk/i
```

- [x] **Step 2: Write the failing telemetry test**

In `src/shared/telemetry.test.ts` make sure `encodeEvent` is imported from `./telemetry`, then add inside an existing `describe` (or a new one at the end):

```ts
describe('encodeEvent: smooth motion failures', () => {
  it('reports them as plain ffmpeg failures so the event schema stays unchanged', () => {
    for (const kind of ['smooth', 'addon'] as const) {
      const e = encodeEvent({
        outcome: { ok: false, kind, message: 'm', log: '' }, info: { sizeBytes: 1e6, durationSec: 10 }, settings,
        meta: { presetId: 'tiktok', edited: false }, encoders: ['cpu'], lastFraction: 0.5
      })
      expect(e).toMatchObject({ name: 'encode_failed', props: { kind: 'ffmpeg' } })
    }
  })
})
```

Run: `npx vitest run src/shared/telemetry.test.ts`
Expected: PASS after the change in Step 1 (it fails before it with a type error / `smooth`).

- [x] **Step 3: Write the failing stage tests**

Create `src/main/encode/interpolate.test.ts`:

```ts
import { win32 } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPlan } from '@shared/planner'
import type { Settings, VideoInfo } from '@shared/types'
import type { Runner } from '../ffmpeg/runner'
import { prepareFrames, type InterpolateDeps } from './interpolate'

const info: VideoInfo = {
  path: 'C:\\in.mp4', sizeBytes: 5e8, durationSec: 10, width: 1920, height: 1080, fps: 30, fpsFraction: '30/1',
  videoCodec: 'h264', videoKbps: 20_000, hasAudio: true, audioCodec: 'aac', audioKbps: 192, hdr: false
}
const settings: Settings = { res: 'best', fps: 'best', interpolate: '60', audio: 'high', codec: 'h264', maxMB: null, bitrateKbps: null, encoder: 'auto' }
const plan = buildPlan(info, settings, ['cpu'])
const IN = win32.join('C:\\tmp', 'frames-in')
const OUT = win32.join('C:\\tmp', 'frames-out')
const OK = { code: 0, stderrTail: '', aborted: false }

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
    expect(h.removed).not.toContain(OUT)
    await f.cleanup()
    expect(h.removed).toContain(OUT)
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
```

- [x] **Step 4: Run to verify they fail**

Run: `npx vitest run src/main/encode/interpolate.test.ts`
Expected: FAIL (module `./interpolate` not found).

- [x] **Step 5: Implement the stage**

Create `src/main/encode/interpolate.ts`:

```ts
import { win32 } from 'node:path'
import { buildFrameExportArgs } from '@shared/ffmpegArgs'
import { formatBytes } from '@shared/format'
import { interpolationDiskBytes } from '@shared/interpolation'
import type { EncodePhase, Plan, VideoInfo } from '@shared/types'
import type { Runner } from '../ffmpeg/runner'
import { runRife } from '../rife/runRife'
import { DISK_FULL, EncodeError } from './errors'
import { applyProgressLine, type ProgressState } from './progress'

export const FRAMES_IN = 'frames-in'
export const FRAMES_OUT = 'frames-out'

export interface InterpolateDeps {
  ffmpeg: Runner
  /** A runner bound to rife-ncnn-vulkan.exe. */
  rife: Runner
  rifeCwd: string
  modelDir: string
  tmpDir: string
  freeBytes(dir: string): Promise<number>
  countFiles(dir: string): Promise<number>
  makeDir(path: string): Promise<void>
  removeDir(path: string): Promise<void>
  pollMs?: number
}
export interface Frames { dir: string; fps: number; cleanup(): Promise<void> }
export type StepFn = (phase: EncodePhase, within: number) => void

function exportFailure(log: string): EncodeError {
  return DISK_FULL.test(log)
    ? new EncodeError('disk', 'Not enough disk space to prepare the frames.', log)
    : new EncodeError('ffmpeg', 'FFmpeg stopped with an error.', log)
}

/** Stages 1 and 2 of smooth motion: source -> PNG frames -> RIFE -> interpolated PNG frames. */
export async function prepareFrames(
  req: { info: VideoInfo; plan: Plan; input: string },
  deps: InterpolateDeps,
  on: { step?: StepFn; log?: (line: string) => void },
  signal?: AbortSignal
): Promise<Frames> {
  const { info, plan } = req
  const interp = plan.interpolation
  if (!interp) throw new Error('prepareFrames needs a plan with interpolation.')
  const inDir = win32.join(deps.tmpDir, FRAMES_IN)
  const outDir = win32.join(deps.tmpDir, FRAMES_OUT)
  const cleanup = async (): Promise<void> => { await deps.removeDir(inDir); await deps.removeDir(outDir) }

  const needed = interpolationDiskBytes(info, plan)
  const free = await deps.freeBytes(deps.tmpDir)
  if (free < needed) {
    const drive = win32.parse(deps.tmpDir).root.replace(/\\$/, '')
    throw new EncodeError('disk',
      `Not enough free space for smooth motion. About ${formatBytes(needed)} needed on drive ${drive}, ${formatBytes(free)} free. Try a lower resolution or turn smooth motion off.`)
  }

  try {
    await cleanup() // leftovers from a crashed run
    await deps.makeDir(inDir)
    await deps.makeDir(outDir)

    let st: ProgressState = { outTimeSec: 0, speed: null, ended: false }
    const args = buildFrameExportArgs(info, plan, { input: req.input, dir: inDir })
    on.log?.(`> ffmpeg ${args.join(' ')}`)
    const ex = await deps.ffmpeg(args, {
      signal, onErrLine: on.log,
      onLine: (line) => { st = applyProgressLine(st, line); on.step?.('prepare', st.outTimeSec / info.durationSec) }
    })
    if (ex.aborted || signal?.aborted) throw new EncodeError('aborted', 'Cancelled')
    if (ex.code !== 0) throw exportFailure(ex.stderrTail)

    on.step?.('interpolate', 0)
    const r = await runRife(
      { run: deps.rife, cwd: deps.rifeCwd, count: deps.countFiles, pollMs: deps.pollMs },
      { inDir, outDir, frames: interp.frames, modelDir: deps.modelDir, signal, onLog: on.log,
        onFrames: (n) => on.step?.('interpolate', n / interp.frames) }
    )
    if (r.aborted) throw new EncodeError('aborted', 'Cancelled')
    if (!r.ok || (await deps.countFiles(outDir)) < interp.frames) throw new EncodeError('smooth', 'Smooth motion stopped with an error.', r.log)

    await deps.removeDir(inDir) // the source frames are no longer needed; free the disk early
    return { dir: outDir, fps: interp.targetFps, cleanup }
  } catch (e) {
    await cleanup()
    throw e
  }
}
```

- [x] **Step 6: Run the stage tests**

Run: `npx vitest run src/main/encode/interpolate.test.ts`
Expected: all 7 PASS.

- [x] **Step 7: Write the failing runEncode tests**

In `src/main/encode/runEncode.test.ts` add the import `import type { InterpolateDeps } from './interpolate'` and append at the end of the file:

```ts
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
```

- [x] **Step 8: Run to verify they fail**

Run: `npx vitest run src/main/encode/runEncode.test.ts`
Expected: new tests FAIL (no frames stage yet); old tests still PASS.

- [x] **Step 9: Rewrite `runEncode.ts`**

Replace the whole file `src/main/encode/runEncode.ts` with:

```ts
import { win32 } from 'node:path'
import { buildArgs, PASSLOG_NAME } from '@shared/ffmpegArgs'
import { overallFraction } from '@shared/interpolation'
import { buildPlan, MIN_VIDEO_KBPS } from '@shared/planner'
import type { EncodeProgress, EncodeResult, EncoderId, Plan, Settings, VideoInfo } from '@shared/types'
import type { Runner } from '../ffmpeg/runner'
import { DISK_FULL, EncodeError } from './errors'
import { prepareFrames, type Frames, type InterpolateDeps, type StepFn } from './interpolate'
import { applyProgressLine, type ProgressState } from './progress'

export interface EncodeRequest { info: VideoInfo; settings: Settings; available: EncoderId[]; output: string }
export interface EncodeDeps {
  run: Runner
  tmpDir: string
  fileSize: (p: string) => Promise<number>
  remove: (p: string) => Promise<void>
  /** Present only when the smooth motion add-on is installed and a Vulkan GPU was found. */
  interpolate?: InterpolateDeps
  now?: () => number
}
export type { EncodeProgress, EncodeResult }
export { EncodeError }

const PASSLOGS = [
  `${PASSLOG_NAME}-0.log`, `${PASSLOG_NAME}-0.log.mbtree`, `${PASSLOG_NAME}.log`, `${PASSLOG_NAME}.log.cutree`,
  // x264 writes these while a pass is still running and renames them away on completion; a cancel mid-pass
  // leaves the .temp files behind, so they must be cleaned up too.
  `${PASSLOG_NAME}-0.log.temp`, `${PASSLOG_NAME}-0.log.mbtree.temp`, `${PASSLOG_NAME}.log.temp`, `${PASSLOG_NAME}.log.cutree.temp`
]

type Once = { ok: true } | { ok: false; log: string }

export async function runEncode(
  req: EncodeRequest,
  deps: EncodeDeps,
  on: { progress?: (p: EncodeProgress) => void; log?: (line: string) => void },
  signal?: AbortSignal
): Promise<EncodeResult> {
  const { info, settings, available, output } = req
  const now = deps.now ?? Date.now
  const startedAt = now()
  const first = buildPlan(info, settings, available)
  let encoder = first.encoder
  let frames: Frames | null = null

  const cleanPasslogs = async (): Promise<void> => {
    for (const f of PASSLOGS) await deps.remove(win32.join(deps.tmpDir, f))
  }

  // Before the encode starts the remaining time is extrapolated from the weighted overall fraction.
  const onStep: StepFn = (phase, within) => {
    const fraction = overallFraction(phase, within)
    const elapsedSec = (now() - startedAt) / 1000
    const remainingSec = fraction > 0.02 ? (elapsedSec * (1 - fraction)) / fraction : null
    on.progress?.({ fraction, pass: 1, passes: 1, speed: null, remainingSec, encoder, phase })
  }

  async function encodeOnce(plan: Plan): Promise<Once> {
    for (let pass = 1; pass <= plan.passes; pass++) {
      let st: ProgressState = { outTimeSec: 0, speed: null, ended: false }
      const args = buildArgs(info, plan, {
        input: info.path, output,
        pass: plan.passes === 2 ? (pass as 1 | 2) : undefined,
        passLogName: PASSLOG_NAME,
        frames: frames ? { dir: frames.dir, fps: frames.fps } : undefined
      })
      on.log?.(`> ffmpeg ${args.join(' ')}`)
      const r = await deps.run(args, {
        cwd: deps.tmpDir, signal, onErrLine: on.log,
        onLine: (line) => {
          st = applyProgressLine(st, line)
          const within = Math.min(1, st.outTimeSec / info.durationSec)
          const local = (pass - 1 + within) / plan.passes
          const fraction = frames ? overallFraction('encode', local) : local
          const remainingSec = st.speed ? ((1 - local) * info.durationSec * plan.passes) / st.speed : null
          on.progress?.({ fraction, pass, passes: plan.passes, speed: st.speed, remainingSec, encoder: plan.encoder, phase: 'encode' })
        }
      })
      if (r.aborted || signal?.aborted) {
        await deps.remove(output); await cleanPasslogs()
        throw new EncodeError('aborted', 'Cancelled')
      }
      if (r.code !== 0) {
        await deps.remove(output); await cleanPasslogs()
        if (DISK_FULL.test(r.stderrTail)) throw new EncodeError('disk', `Not enough disk space to write ${output}`, r.stderrTail)
        return { ok: false, log: r.stderrTail }
      }
    }
    await cleanPasslogs()
    return { ok: true }
  }

  if (first.interpolation) {
    if (!deps.interpolate) throw new EncodeError('addon', 'The smooth motion add-on is not installed.')
    frames = await prepareFrames({ info, plan: first, input: info.path }, deps.interpolate, { step: onStep, log: on.log }, signal)
  }

  try {
    let videoKbps: number | undefined
    let fellBack = false
    let retries = 0
    let attempts = 0
    const limit = settings.maxMB !== null ? settings.maxMB * 1e6 : Infinity

    for (;;) {
      const plan = buildPlan(info, settings, available, { encoder, videoKbps })
      attempts++
      const r = await encodeOnce(plan)
      if (!r.ok) {
        if (encoder !== 'cpu') { encoder = 'cpu'; fellBack = true; retries = 0; continue }
        throw new EncodeError('ffmpeg', 'FFmpeg stopped with an error.', r.log)
      }
      const bytes = await deps.fileSize(output)
      if (bytes <= limit) return { output, bytes, encoder, fellBack, attempts }
      const lower = Math.max(MIN_VIDEO_KBPS, Math.floor(plan.videoKbps * (limit / bytes) * 0.98))
      if (retries < 2) { retries++; videoKbps = lower; continue }
      if (encoder !== 'cpu') { encoder = 'cpu'; retries = 0; videoKbps = lower; continue }
      await deps.remove(output)
      throw new EncodeError('size', `Could not get this video under ${settings.maxMB} MB.`)
    }
  } finally {
    await frames?.cleanup()
  }
}
```

- [x] **Step 10: Run all tests and typecheck**

Run: `npm run typecheck && npm test`
Expected: all PASS, including the 9 old `runEncode` tests. If `ipc.ts` fails typecheck because `EncodeError` moved, confirm it still imports `EncodeError` from `./encode/runEncode` (re-exported).

- [x] **Step 11: Commit**

```bash
git add src/main/encode/errors.ts src/main/encode/interpolate.ts src/main/encode/interpolate.test.ts src/main/encode/runEncode.ts src/main/encode/runEncode.test.ts src/shared/types.ts src/shared/api.ts src/shared/telemetry.ts src/shared/telemetry.test.ts
git commit -m "feat(smooth): frame preparation stage and phased encode progress"
```

---

### Task 8: Main process wiring and API

**Files:**
- Modify: `src/shared/api.ts`, `src/shared/interpolation.ts` (no change needed if already exports `NO_VULKAN_MESSAGE`), `src/main/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts`

**Interfaces:**
- Consumes: `createInstaller`, `InstallError`, `RIFE_EXE`, `RIFE_MODEL` (Task 5); `probeVulkan` (Task 6); `InterpolateDeps` (Task 7); `NO_VULKAN_MESSAGE` (Task 3).
- Produces in `api.ts`: `RifeState = { status: RifeStatus; gpu: 'unknown' | 'ok' | 'none'; sizeBytes: number }`, `RifeInstallOutcome`, and `SquishApi.rife = { status(): Promise<RifeState>; install(): Promise<RifeInstallOutcome>; cancelInstall(): Promise<void>; onProgress(cb): () => void }`. IPC channels `rife:status`, `rife:install`, `rife:cancelInstall`, event `rife:progress` with `{ done, total }`.

There is no unit test for this wiring (it needs Electron). It is verified by `npm run typecheck`, the integration test in Task 11 and the manual smoke test in Task 12.

- [x] **Step 1: Extend the API types**

In `src/shared/api.ts` change the import on line 1 to also import `RifeStatus`, then add above `export interface SquishApi`:

```ts
export interface RifeState { status: RifeStatus; gpu: 'unknown' | 'ok' | 'none'; sizeBytes: number }
export type RifeInstallOutcome =
  | { ok: true }
  | { ok: false; kind: 'network' | 'hash' | 'extract' | 'disk' | 'aborted' | 'gpu'; message: string }
```

and add inside `SquishApi` after `onLog`:

```ts
  rife: {
    status(): Promise<RifeState>
    /** Downloads and verifies the add-on, then checks for a Vulkan GPU. Progress arrives through onProgress. */
    install(): Promise<RifeInstallOutcome>
    cancelInstall(): Promise<void>
    onProgress(cb: (p: { done: number; total: number }) => void): () => void
  }
```

- [x] **Step 2: Preload**

In `src/preload/index.ts` add after `onLog: on('encode:log'),`:

```ts
  rife: {
    status: () => ipcRenderer.invoke('rife:status'),
    install: () => ipcRenderer.invoke('rife:install'),
    cancelInstall: () => ipcRenderer.invoke('rife:cancelInstall'),
    onProgress: on('rife:progress')
  },
```

- [x] **Step 3: Env**

In `src/main/index.ts` add to the `env` object:

```ts
  rifeDir: join(app.getPath('userData'), 'rife'),
```

- [x] **Step 4: IPC**

In `src/main/ipc.ts`:

1. Change the first import to `import { app, BrowserWindow, dialog, ipcMain, net, shell } from 'electron'`, the `node:fs/promises` import to `import { mkdir, readdir, rm, stat, statfs, unlink } from 'node:fs/promises'`.
2. Add imports:

```ts
import { NO_VULKAN_MESSAGE } from '@shared/interpolation'
import { buildPlan } from '@shared/planner'
import { RIFE_PACK } from '@shared/rifePack'
import type { RifeInstallOutcome, RifeState } from '@shared/api'
import type { Runner } from './ffmpeg/runner'
import type { InterpolateDeps } from './encode/interpolate'
import { extractZip } from './rife/extract'
import { probeVulkan } from './rife/gpu'
import { createInstaller, InstallError, RIFE_EXE, RIFE_MODEL } from './rife/installer'
```

(Merge `RifeInstallOutcome, RifeState` into the existing `@shared/api` import instead of a second line, and import `Runner` together with `createRunner` from `./ffmpeg/runner`.)

3. Add `rifeDir: string` to `IpcEnv`.
4. Inside `registerIpc`, after the `telemetry` lines, add:

```ts
  const installer = createInstaller({ root: env.rifeDir, pack: RIFE_PACK, extract: extractZip, fetch: (url, init) => net.fetch(url, init) })
  let gpu: RifeState['gpu'] = 'unknown'
  let installJob: AbortController | null = null
  const countFiles = async (dir: string): Promise<number> => (await readdir(dir)).length
  const freeBytes = async (dir: string): Promise<number> => { const s = await statfs(dir); return Number(s.bavail) * Number(s.bsize) }
  const rifeRunner = (): Runner => createRunner(join(installer.dir(), RIFE_EXE))
  async function ensureGpu(): Promise<boolean> {
    if (gpu === 'unknown') {
      await mkdir(env.tmpDir, { recursive: true })
      const r = await probeVulkan({
        ffmpeg: run, rife: rifeRunner(), rifeCwd: installer.dir(), modelDir: join(installer.dir(), RIFE_MODEL),
        workDir: env.tmpDir, count: countFiles
      })
      gpu = r.ok ? 'ok' : 'none'
    }
    return gpu === 'ok'
  }

  ipcMain.handle('rife:status', async (): Promise<RifeState> => ({ status: await installer.status(), gpu, sizeBytes: RIFE_PACK.sizeBytes }))
  ipcMain.handle('rife:install', async (): Promise<RifeInstallOutcome> => {
    if (installJob) return { ok: false, kind: 'network', message: 'The add-on is already downloading.' }
    installJob = new AbortController()
    try {
      await installer.install({ signal: installJob.signal, onProgress: (done, total) => send('rife:progress', { done, total }) })
      if (!(await ensureGpu())) return { ok: false, kind: 'gpu', message: NO_VULKAN_MESSAGE }
      return { ok: true }
    } catch (e) {
      if (e instanceof InstallError) return { ok: false, kind: e.kind, message: e.message }
      return { ok: false, kind: 'network', message: (e as Error).message }
    } finally {
      installJob = null
    }
  })
  ipcMain.handle('rife:cancelInstall', () => { installJob?.abort() })
```

5. In `doEncode`, replace the block from `await mkdir(env.tmpDir, { recursive: true })` through the `runEncode(...)` call with:

```ts
      await mkdir(env.tmpDir, { recursive: true })
      const output = uniqueOutputPath(current.path, existsSync)
      const available = await encodersP
      let interpolate: InterpolateDeps | undefined
      if (buildPlan(current, settings, available).interpolation) {
        const st = await installer.status()
        if (st !== 'installed') {
          throw new EncodeError('addon', st === 'unavailable' ? 'Smooth motion is not available in this version.' : 'The smooth motion add-on is not installed.')
        }
        if (!(await ensureGpu())) throw new EncodeError('smooth', NO_VULKAN_MESSAGE)
        interpolate = {
          ffmpeg: run, rife: rifeRunner(), rifeCwd: installer.dir(), modelDir: join(installer.dir(), RIFE_MODEL), tmpDir: env.tmpDir,
          freeBytes, countFiles,
          makeDir: async (p) => { await mkdir(p, { recursive: true }) },
          removeDir: (p) => rm(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        }
      }
      const result = await runEncode(
        { info: current, settings, available, output },
        { run, tmpDir: env.tmpDir, fileSize: async (p) => (await stat(p)).size, remove: (p) => unlink(p).catch(() => {}), interpolate },
        {
          progress: (p) => { lastFraction = p.fraction; send('encode:progress', p) },
          log: (l) => send('encode:log', l)
        },
        job.signal
      )
```

6. In `shutdown()` add `installJob?.abort()` as the first line after `job?.abort()`.

- [x] **Step 5: Typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: no errors, all tests PASS.

- [x] **Step 6: Commit**

```bash
git add src/shared/api.ts src/main/ipc.ts src/main/index.ts src/preload/index.ts
git commit -m "feat(smooth): wire add-on install, gpu check and pipeline into the main process"
```

---

### Task 9: Renderer copy helpers and state

**Files:**
- Modify: `src/renderer/src/state/logic.ts`, `src/renderer/src/state/logic.test.ts`, `src/renderer/src/state/store.ts`

**Interfaces:**
- Consumes: `RifeState`, `RifeInstallOutcome` (Task 8), `Plan.interpolation`, `EncodeProgress.phase`.
- Produces in `logic.ts`: `addonQuestion(sizeBytes)`, `downloadLabel(done, total)`, `smoothHint(needBytes)`, `smoothDone(plan, info): string | null`, `phaseLabel(progress): string`. In the store: `rife: RifeState | null`, `addon: AddonState`, `notice: string | null`, `refreshRife()`, `confirmAddon()`, `cancelAddon()`, and a gated `startEncode()`.

- [x] **Step 1: Write the failing helper tests**

In `src/renderer/src/state/logic.test.ts` change the first import to also bring in the new helpers and add the types:

```ts
import { addonQuestion, allPresets, doneSummary, downloadLabel, nextPresetName, phaseLabel, settingsFromPreset, smoothDone, smoothHint } from './logic'
import type { EncodeProgress, Plan, StoreData, VideoInfo } from '@shared/types'
```

and append inside the `describe('logic', ...)` block:

```ts
  it('asks for the add-on download with its size', () => {
    expect(addonQuestion(31_000_000)).toBe('Smooth motion needs a small add-on (about 31.0 MB). Download now?')
  })
  it('formats download progress', () => {
    expect(downloadLabel(12_300_000, 31_000_000)).toBe('12.3 MB of 31.0 MB')
  })
  it('warns about time and disk before the run', () => {
    expect(smoothHint(16_796_160_000)).toBe('Smoothing can take a while and needs about 16.80 GB of free disk space.')
  })
  it('summarises a smoothed result and stays silent otherwise', () => {
    const plan = { interpolation: { targetFps: 120, sourceFps: 30, frames: 1 } } as Plan
    expect(smoothDone(plan, { fps: 30 } as VideoInfo)).toBe('Frame rate smoothed from 30 fps to 120 fps.')
    expect(smoothDone({ interpolation: null } as Plan, { fps: 30 } as VideoInfo)).toBeNull()
  })
  it('labels each phase of the progress screen', () => {
    const p = (o: Partial<EncodeProgress>): EncodeProgress => ({ fraction: 0, pass: 1, passes: 1, speed: null, remainingSec: null, encoder: 'cpu', phase: 'encode', ...o })
    expect(phaseLabel(null)).toBe('STARTING')
    expect(phaseLabel(p({ phase: 'prepare' }))).toBe('PREPARING FRAMES')
    expect(phaseLabel(p({ phase: 'interpolate' }))).toBe('SMOOTHING MOTION')
    expect(phaseLabel(p({}))).toBe('ENCODING')
    expect(phaseLabel(p({ passes: 2, pass: 1 }))).toBe('PASS 1 OF 2 · ANALYSING')
    expect(phaseLabel(p({ passes: 2, pass: 2 }))).toBe('PASS 2 OF 2 · ENCODING')
  })
```

Run: `npx vitest run src/renderer/src/state/logic.test.ts`
Expected: FAIL (helpers not exported).

- [x] **Step 2: Implement the helpers**

In `src/renderer/src/state/logic.ts` change the imports and append:

```ts
import { formatBytes, formatFps } from '@shared/format'
import type { EncodeProgress, EncoderChoice, Plan, Preset, Settings, StoreData, VideoInfo } from '@shared/types'
```

```ts
export function addonQuestion(sizeBytes: number): string {
  return `Smooth motion needs a small add-on (about ${formatBytes(sizeBytes)}). Download now?`
}

export function downloadLabel(done: number, total: number): string {
  return `${formatBytes(done)} of ${formatBytes(total)}`
}

export function smoothHint(needBytes: number): string {
  return `Smoothing can take a while and needs about ${formatBytes(needBytes)} of free disk space.`
}

export function smoothDone(plan: Plan, info: VideoInfo): string | null {
  return plan.interpolation ? `Frame rate smoothed from ${formatFps(info.fps)} to ${plan.interpolation.targetFps} fps.` : null
}

export function phaseLabel(p: EncodeProgress | null): string {
  if (!p) return 'STARTING'
  if (p.phase === 'prepare') return 'PREPARING FRAMES'
  if (p.phase === 'interpolate') return 'SMOOTHING MOTION'
  return p.passes === 2 ? `PASS ${p.pass} OF 2 · ${p.pass === 1 ? 'ANALYSING' : 'ENCODING'}` : 'ENCODING'
}
```

(Keep the existing `import { BUILT_IN_PRESETS }` line; merge the type import with the existing `import type {...} from '@shared/types'`.)

Run: `npx vitest run src/renderer/src/state/logic.test.ts`
Expected: PASS.

- [x] **Step 3: Extend the store**

In `src/renderer/src/state/store.ts`:

1. Add `import type { RifeState } from '@shared/api'` (merge with `EncodeProgress...` import as separate line is fine).
2. Add above `interface State`:

```ts
export type AddonState =
  | null
  | { phase: 'ask' }
  | { phase: 'downloading'; done: number; total: number }
  | { phase: 'error'; message: string; retry: boolean }
```

3. Add to `State` (after `previewError`):

```ts
  rife: RifeState | null
  addon: AddonState
  /** One-line note shown on the progress screen, e.g. after the add-on was installed. */
  notice: string | null
  refreshRife(): Promise<void>
  confirmAddon(): Promise<void>
  cancelAddon(): void
```

4. Add to the initial values: `rife: null, addon: null, notice: null,` (after `preview: null, previewError: null,`).
5. In `init()` add after the `onLog` line:

```ts
      void get().refreshRife()
      api().rife.onProgress((p) => {
        if (get().addon?.phase === 'downloading') set({ addon: { phase: 'downloading', done: p.done, total: p.total } })
      })
```

6. Replace `startEncode` with a gate plus an inner `begin`. Add before `return {` in the `create` callback:

```ts
  const begin = async (notice: string | null = null): Promise<void> => {
    set({ screen: 'encoding', progress: null, log: [], encodeError: null, result: null, notice })
    const { settings, presetId, edited } = get()
    const r = await api().encode(settings, { presetId, edited })
    if (r.ok) set({ result: r.result, screen: 'done' })
    else if (r.kind === 'aborted') set({ screen: 'settings', notice: null })
    else set({ encodeError: { kind: r.kind, message: r.message, log: r.log } })
  }
```

and replace the old `async startEncode() {...}` with:

```ts
    async startEncode() {
      const { plan, rife } = get()
      if (plan?.interpolation) {
        if (rife === null || rife.status === 'unavailable') {
          set({ addon: { phase: 'error', message: 'Smooth motion is not available in this version.', retry: false } })
          return
        }
        if (rife.gpu === 'none') { set({ addon: { phase: 'error', message: NO_VULKAN_MESSAGE, retry: false } }); return }
        if (rife.status === 'missing') { set({ addon: { phase: 'ask' } }); return }
      }
      await begin()
    },

    async refreshRife() { set({ rife: await api().rife.status() }) },

    async confirmAddon() {
      set({ addon: { phase: 'downloading', done: 0, total: get().rife?.sizeBytes ?? 0 } })
      const r = await api().rife.install()
      await get().refreshRife()
      if (r.ok) { set({ addon: null }); await begin('Add-on installed. Starting your video.'); return }
      if (r.kind === 'aborted') { set({ addon: null }); return }
      set({ addon: { phase: 'error', message: r.message, retry: r.kind !== 'gpu' } })
    },

    cancelAddon() {
      if (get().addon?.phase === 'downloading') void api().rife.cancelInstall()
      else set({ addon: null })
    },
```

7. Add `import { NO_VULKAN_MESSAGE } from '@shared/interpolation'`.
8. In `reset()` add `notice: null` to the object.

- [x] **Step 4: Typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/state/logic.ts src/renderer/src/state/logic.test.ts src/renderer/src/state/store.ts
git commit -m "feat(smooth): renderer state and copy for the add-on flow"
```

---

### Task 10: Renderer UI

**Files:**
- Create: `src/renderer/src/components/AddonDialog.tsx`
- Modify: `src/renderer/src/screens/SettingsScreen.tsx`, `src/renderer/src/screens/EncodingScreen.tsx`, `src/renderer/src/screens/CompareScreen.tsx`, `src/renderer/src/screens/DoneScreen.tsx`, `src/renderer/src/components/AboutDialog.tsx`, `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: store fields and helpers from Task 9, `disabledInterpolate`, `interpolationDiskBytes`, `NO_VULKAN_MESSAGE` from `@shared/interpolation`.
- Produces: the visible feature. No unit tests (UI); verified by typecheck here and by the manual smoke test in Task 12.

- [x] **Step 1: Settings row**

In `src/renderer/src/screens/SettingsScreen.tsx`:

1. Replace the two import lines for planner and types and the logic import with:

```ts
import { disabledInterpolate, interpolationDiskBytes, NO_VULKAN_MESSAGE } from '@shared/interpolation'
import { disabledFps, disabledRes } from '@shared/planner'
import type { AudioChoice, Codec, EncoderChoice, FpsChoice, InterpolateChoice, ResChoice } from '@shared/types'
```

```ts
import { allPresets, nextPresetName, smoothHint } from '../state/logic'
```

2. After `const dFps = disabledFps(info)` add:

```ts
  const dSmooth = disabledInterpolate(info)
  const smoothOn = s.rife !== null && s.rife.status !== 'unavailable'
  const noGpu = s.rife?.gpu === 'none'
  const hint = { margin: '6px 0 0', fontSize: 12, lineHeight: '18px', color: 'var(--ink-3)' } as const
```

3. After the closing `</Row>` of the "Frame rate" row, add:

```tsx
          {smoothOn && (
            <>
              <Row label="Smooth motion">
                <Segmented<InterpolateChoice> id="smooth" label="Smooth motion" value={settings.interpolate} onChange={(v) => s.edit({ interpolate: v })}
                  options={[{ value: 'off', label: 'Off' }, ...(['60', '120'] as const).map((v) => ({ value: v, label: v, disabled: dSmooth.includes(v) || noGpu }))]} />
              </Row>
              {noGpu && <p className="mono" style={hint}>{NO_VULKAN_MESSAGE}</p>}
              {plan.interpolation && <p className="mono" style={hint}>{smoothHint(interpolationDiskBytes(info, plan))}</p>}
            </>
          )}
```

- [x] **Step 2: Add-on dialog**

Create `src/renderer/src/components/AddonDialog.tsx`:

```tsx
import { AnimatePresence, motion } from 'motion/react'
import { smooth } from '../motion'
import { addonQuestion, downloadLabel } from '../state/logic'
import { useSquish } from '../state/store'

export function AddonDialog() {
  const addon = useSquish((s) => s.addon)
  const rife = useSquish((s) => s.rife)
  const confirm = useSquish((s) => s.confirmAddon)
  const cancel = useSquish((s) => s.cancelAddon)
  const pct = addon?.phase === 'downloading' && addon.total > 0 ? Math.min(100, Math.floor((addon.done / addon.total) * 100)) : 0

  return (
    <AnimatePresence>
      {addon && (
        <motion.div role="dialog" aria-modal="true" aria-label="Smooth motion add-on"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'grid', placeItems: 'center', zIndex: 10 }}>
          <motion.div initial={{ y: 16, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 8, opacity: 0 }} transition={smooth}
            style={{ width: 440, padding: 24, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--gold-line)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kicker">Add-on</div>

            {addon.phase === 'ask' && (
              <>
                <div className="display" style={{ fontSize: 22 }}>Add smooth motion?</div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--ink-2)' }}>{addonQuestion(rife?.sizeBytes ?? 0)}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-ghost" style={{ height: 40 }} onClick={cancel}>Cancel</button>
                  <button className="btn btn-gold" style={{ height: 40 }} autoFocus onClick={() => void confirm()}>Download</button>
                </div>
              </>
            )}

            {addon.phase === 'downloading' && (
              <>
                <div className="display" style={{ fontSize: 22 }}>Downloading add-on</div>
                <div role="progressbar" aria-label="Download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
                  style={{ height: 6, borderRadius: 3, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--gold)', transition: 'width 200ms' }} />
                </div>
                <div className="mono" style={{ fontSize: 13, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>{downloadLabel(addon.done, addon.total)}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button className="btn btn-ghost" style={{ height: 40 }} autoFocus onClick={cancel}>Cancel</button>
                </div>
              </>
            )}

            {addon.phase === 'error' && (
              <>
                <div className="display" style={{ fontSize: 22 }}>Smooth motion isn't ready</div>
                <p role="alert" style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--ink-2)' }}>{addon.message}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-ghost" style={{ height: 40 }} autoFocus={!addon.retry} onClick={cancel}>Close</button>
                  {addon.retry && <button className="btn btn-gold" style={{ height: 40 }} autoFocus onClick={() => void confirm()}>Try again</button>}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

In `src/renderer/src/App.tsx` add `import { AddonDialog } from './components/AddonDialog'` and render `<AddonDialog />` right after `<AboutDialog ... />`.

- [x] **Step 3: Progress screen**

In `src/renderer/src/screens/EncodingScreen.tsx`:

1. Import: `import { phaseLabel } from '../state/logic'`.
2. Replace the `const { progress, log, encodeError, cancelEncode, backToSettings } = useSquish()` line with `const { progress, log, encodeError, notice, cancelEncode, backToSettings } = useSquish()`.
3. Replace the `const passLabel = ...` line with `const passLabel = phaseLabel(progress)`.
4. Replace the `const title = ...` line with:

```ts
    const title = encodeError.kind === 'disk' ? 'Not enough disk space.'
      : encodeError.kind === 'size' ? "Couldn't hit that size."
      : encodeError.kind === 'smooth' ? "Smooth motion didn't work."
      : encodeError.kind === 'addon' ? 'Add-on missing.'
      : 'Something went wrong.'
```

5. Directly after the `<h1 ...>Squishing.</h1>` line add:

```tsx
          {notice && <div role="status" className="mono" style={{ fontSize: 13, color: 'var(--ink-3)' }}>{notice}</div>}
```

- [x] **Step 4: Compare, Done, About**

In `src/renderer/src/screens/CompareScreen.tsx` replace the bottom button row opening line

```tsx
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
```

with

```tsx
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
        {plan.interpolation && <span className="mono" style={{ marginRight: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>Preview shows the original frame rate.</span>}
```

In `src/renderer/src/screens/DoneScreen.tsx`: change the store destructuring to `const { result, info, plan, settings, data, reset, dismissPromo } = useSquish()`, add `import { doneSummary, smoothDone } from '../state/logic'` (replacing the existing logic import), and after the `{result.fellBack && ...}` line add:

```tsx
          {plan && smoothDone(plan, info) && <p className="mono" style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>{smoothDone(plan, info)}</p>}
```

In `src/renderer/src/components/AboutDialog.tsx` replace

```tsx
              Squish uses FFmpeg, licensed under the GNU GPL v3. FFmpeg runs as a separate program bundled with this app. Its source code is available from the link below.
            </p>
```

with the same text followed by a second paragraph:

```tsx
              Squish uses FFmpeg, licensed under the GNU GPL v3. FFmpeg runs as a separate program bundled with this app. Its source code is available from the link below.
            </p>
            <p style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--ink-2)' }}>
              Smooth motion uses RIFE through rife-ncnn-vulkan (MIT license). It is an optional add-on that downloads when you first use it.
            </p>
```

- [x] **Step 5: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all PASS, build succeeds.

- [x] **Step 6: Commit**

```bash
git add src/renderer/src/components/AddonDialog.tsx src/renderer/src/screens/SettingsScreen.tsx src/renderer/src/screens/EncodingScreen.tsx src/renderer/src/screens/CompareScreen.tsx src/renderer/src/screens/DoneScreen.tsx src/renderer/src/components/AboutDialog.tsx src/renderer/src/App.tsx
git commit -m "feat(smooth): settings row, add-on dialog and progress messages"
```

---

### Task 11: Integration test with real RIFE

**Files:**
- Create: `tests/integration/interpolate.int.test.ts`

**Interfaces:**
- Consumes: `resources\rife-pack\rife-pack-1.zip` (Task 1), `resources\bin\ffmpeg.exe`, `extractZip` (Task 5), `probeVulkan` (Task 6), `runEncode` with `interpolate` deps (Task 7).
- Skips automatically when the pack, ffmpeg or a Vulkan GPU is missing.

- [x] **Step 1: Write the integration test**

Create `tests/integration/interpolate.int.test.ts`:

```ts
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
```

- [x] **Step 2: Run it**

Run: `npm run test:int -- interpolate`
Expected: PASS (4 tests) on a machine with a Vulkan GPU. Without Vulkan the tests are skipped and the run still exits 0; in that case say so in the report instead of claiming success. Do not call this task done unless the tests actually ran.

- [x] **Step 3: Run the whole suite**

Run: `npm run typecheck && npm test`
Expected: PASS (the integration file is excluded from nothing: `npm test` includes `tests/**`; with a Vulkan GPU it takes longer, up to a few minutes).

- [x] **Step 4: Commit**

```bash
git add tests/integration/interpolate.int.test.ts
git commit -m "test(smooth): integration test with real RIFE, odd paths and colour check"
```

---

### Task 12: Publish the pack, enable the feature, smoke test

**Files:**
- Modify: `src/shared/rifePack.ts`

**Interfaces:**
- Consumes: the zip, hash and size from Task 1 Step 4.
- Produces: the live feature. Until this task is done the Smooth motion row stays hidden.

This task includes an outward-facing action (uploading a release asset). **Ask the user before running the `gh` command in Step 2.**

- [x] **Step 1: Confirm the zip is unchanged**

Run: `node -e "const c=require('node:crypto'),f=require('node:fs');const h=c.createHash('sha256').update(f.readFileSync('resources/rife-pack/rife-pack-1.zip')).digest('hex');console.log(h, f.statSync('resources/rife-pack/rife-pack-1.zip').size)"`
Expected: the same hash and size that Task 1 Step 4 printed. If they differ, use the new values everywhere below (never mix values from two builds).

- [x] **Step 2: Upload the asset (ask the user first)**

With the user's OK:

```bash
gh release create rife-pack-1 resources/rife-pack/rife-pack-1.zip --repo leg1tfx/Squish --title "RIFE pack 1" --notes "rife-ncnn-vulkan 20221029 (MIT) with model rife-v4.6, repackaged for Pyno's Squish smooth motion."
```

Expected: a release with one asset named `rife-pack-1.zip`. Then verify the public URL answers: `curl -sIL https://github.com/leg1tfx/Squish/releases/download/rife-pack-1/rife-pack-1.zip | head -n 1` should show `HTTP/1.1 302` or `200`. If the repository is private, stop: the app cannot download from it without credentials; ask the user where to host the file instead and change `url` accordingly.

- [x] **Step 3: Fill in the constants**

In `src/shared/rifePack.ts` set `sha256` and `sizeBytes` to the values from Step 1 (exact digits, 64 lowercase hex characters).

- [x] **Step 4: Verify the pinned hash matches the hosted file**

Run: `node -e "const c=require('node:crypto');fetch('https://github.com/leg1tfx/Squish/releases/download/rife-pack-1/rife-pack-1.zip').then(r=>r.arrayBuffer()).then(b=>console.log(c.createHash('sha256').update(Buffer.from(b)).digest('hex'), b.byteLength))"`
Expected: the same hash and size as in `rifePack.ts`.

- [x] **Step 5: Full verification**

Run: `npm run typecheck && npm test && npm run build`
Expected: all PASS.

- [ ] **Step 6: Manual smoke test (about 10 minutes)**

Run `npm run dev`, then:
1. Drop a 30 fps clip. In Settings, "Smooth motion" shows Off / 60 / 120. Pick 120: the Changes table shows `30 fps → 120 fps (interpolated)` and a hint with the disk estimate.
2. Click "Squish it". The dialog "Add smooth motion?" shows the size. Click Cancel: nothing happens. Click again, choose Download, then press Cancel mid-download: the dialog closes and `userData\rife` contains no `.download.part`.
3. Download fully. The progress screen shows "Add-on installed. Starting your video.", then labels PREPARING FRAMES, SMOOTHING MOTION, ENCODING. The result plays at 120 fps (`ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate`).
4. While SMOOTHING MOTION runs, open `%TEMP%\pynos-squish\<pid>\work\frames-out` and note the size of one PNG. Compare with the estimate (width × height × 1.5 bytes). Report the real ratio to the user; a big gap means the constant in `src/shared/interpolation.ts` needs a change.
5. Cancel during SMOOTHING MOTION: the app returns to Settings and `frames-in` / `frames-out` are gone.
6. Compare screen with 120 selected shows "Preview shows the original frame rate."
7. Turn the network off, delete `userData\rife`, restart and try Download: the error says "Could not download the add-on. Check your connection and try again." and Try again works once the network is back.

- [x] **Step 7: Commit**

```bash
git add src/shared/rifePack.ts
git commit -m "feat(smooth): enable the add-on download with the pinned pack hash"
```

---

## Self-Review Notes

- **Spec coverage:** settings and UI (Tasks 2, 3, 10), planner and warnings (3), RIFE module (5, 6), pipeline and cleanup (4, 7), IPC and API (8), messages (3, 7, 9, 10, 5 error texts), disk estimate (3, 7), telemetry mapping (7), pack build and hosting (1, 12), tests (every task, real RIFE in 11), Task 1 spike gate as the spec demands.
- **Deliberate deviations from the spec text, already synced in Task 1 Step 7:** GPU gating happens after the first install (probe needs the exe), the probe method is the 2-frame run, the disk example is 17 GB, the estimate is cross-checked in Task 12 instead of Task 1.
- **Type consistency:** `InterpolateChoice`, `Interpolation`, `EncodePhase`, `EncodeErrorKind`, `RifeStatus` live in `types.ts`; `RifeState`/`RifeInstallOutcome` in `api.ts`; `InterpolateDeps`/`Frames`/`StepFn` in `interpolate.ts`; `Installer`/`InstallError` in `installer.ts`; helper names (`disabledInterpolate`, `interpolationDiskBytes`, `overallFraction`, `NO_VULKAN_MESSAGE`) are used identically across tasks.
