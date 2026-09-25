# Pyno's Squish Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send anonymous, opt-out usage, error and promo events from Pyno's Squish to Aptabase (EU) without ever sending file names, paths, log text or user-typed text.

**Architecture:** A pure module `src/shared/telemetry.ts` defines the event allowlist and turns app data into bucketed props. A small main-process client `src/main/telemetry.ts` posts events to the Aptabase ingestion API through an injected `fetch` (in the app: Electron `net.fetch`) and checks consent before every send. Consent lives in the existing `presets.json` store. All events are sent from the main process; the renderer can only ask for the three promo events through one allow-listed IPC channel.

**Tech Stack:** Electron 44 (`net.fetch`), TypeScript 5.9, React 19, Motion 13 (`motion/react`), Zustand 5, Vitest 5. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-telemetry-design.md` (read it first). The base app spec is `docs/superpowers/specs/2026-09-24-squish-design.md`.

## Global Constraints

- Aptabase App Key: `A-EU-6956588791`, stored as `APTABASE_APP_KEY` in `src/shared/links.ts`.
- Do **not** install `@aptabase/electron`. It calls `protocol.registerSchemesAsPrivileged` itself and can overwrite the `squish-media` scheme registration; it also opens IPC/protocol paths that bypass consent. Use the own client from Task 2.
- Never send file names, paths, FFmpeg args or logs, error message text, or preset labels. Numbers only as buckets. Bucket lower bounds are inclusive, upper bounds exclusive.
- Only a session ID, no persistent device or install ID.
- Consent: opt-out. `telemetry` defaults to `'on'`; `track()` checks consent on every event.
- Telemetry never blocks or breaks the app: `track()` returns a promise that never rejects, and callers never `await` it (`void telemetry.track(...)`).
- UI copy is English. Brand in UI copy is always `Pyno's Squish` (with apostrophe). No em dashes in UI copy.
- Renderer only uses `window.squish`. `contextIsolation`, `sandbox` stay on.
- Motion: use the springs from `src/renderer/src/motion.ts` (`snappy`, `smooth`, `bouncy`, `pressProps`). Gold is loud once per view: the Drop screen already has the gold "Choose file" button, so the notice card uses no gold button.

## Review Focus

1. **Offline, firewall or a slow network.** The encode and quit flow must behave exactly as before; a failing or hanging send must never reject or throw. Pinned in Task 2 (`track` resolves when `fetch` rejects, throws, or when `isEnabled` rejects; every request carries a timeout signal).
2. **Paths that look like extensions** (`C:\my.folder\video`, `notes.secretproject`). Only known video extensions may leave the machine. Pinned in Task 1 (`extProp`).
3. **User turns stats off mid-session** (About switch). The very next event must not be sent. Pinned in Task 2 (consent re-read per event).
4. **Existing users updating from 1.0.0** with a `presets.json` that lacks the new fields, and hand-edited junk values. Old file → on + notice unseen; junk → off. Pinned in Task 3.
5. **Zero-byte or zero-length inputs and NaN durations** (broken files that still probe). Buckets must not throw or produce `undefined`. Pinned in Task 1.

---

### Task 1: Shared event allowlist and bucket helpers

**Files:**
- Create: `src/shared/telemetry.ts`
- Create: `src/shared/telemetry.test.ts`
- Modify: `src/shared/api.ts` (add `EncodeMeta`)
- Modify: `src/main/ipc.ts:37` (file dialog uses `VIDEO_EXTENSIONS`)

**Interfaces:**
- Consumes: `EncodeOutcome` (`src/shared/api.ts`), `Settings`, `VideoInfo`, `EncoderId` (`src/shared/types.ts`), `BUILT_IN_PRESETS` (`src/shared/presets.ts`).
- Produces:
  - `export interface EncodeMeta { presetId: string; edited: boolean }` in `src/shared/api.ts`
  - `VIDEO_EXTENSIONS: readonly string[]`
  - `RENDERER_EVENTS`, `type RendererEventName = 'promo_shown' | 'promo_clicked' | 'promo_dismissed'`
  - `type TelemetryEvent` (union, see code)
  - `sizeBucket(bytes: number): string`, `ratioBucket(inBytes: number, outBytes: number): string`, `durationBucket(sec: number): string`, `progressBucket(fraction: number | null): string`
  - `presetProp(id: string): string`, `extProp(path: string): string`, `modeProp(s: Settings): Mode`, `encodersProp(list: readonly EncoderId[]): string`
  - `isRendererEvent(name: unknown): name is RendererEventName`
  - `encodeEvent(input: EncodeEventInput): TelemetryEvent`

- [ ] **Step 1: Write the failing tests**

Create `src/shared/telemetry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { EncodeOutcome } from './api'
import type { EncoderId, Settings, VideoInfo } from './types'
import {
  durationBucket, encodeEvent, encodersProp, extProp, isRendererEvent, modeProp, presetProp, progressBucket, ratioBucket, sizeBucket
} from './telemetry'

const settings: Settings = { res: '1080', fps: 'best', audio: 'high', codec: 'h264', maxMB: 10, bitrateKbps: null, encoder: 'auto' }
const info = { path: 'C:\\Users\\Lou\\Videos\\secret client.mp4', sizeBytes: 120_000_000, durationSec: 42 } as VideoInfo
const encoders: EncoderId[] = ['nvenc', 'cpu']
const base = { info, settings, meta: { presetId: 'discord', edited: false }, encoders, lastFraction: 0.6 }

describe('buckets', () => {
  it('sizeBucket uses MB (1e6 bytes) with inclusive lower bounds', () => {
    expect(sizeBucket(9_999_999)).toBe('<10')
    expect(sizeBucket(10_000_000)).toBe('10-50')
    expect(sizeBucket(499_999_999)).toBe('100-500')
    expect(sizeBucket(2_000_000_000)).toBe('>=2000')
  })
  it('ratioBucket handles normal, bigger-than-source and zero-byte inputs', () => {
    expect(ratioBucket(100, 9)).toBe('<10%')
    expect(ratioBucket(100, 30)).toBe('30-50%')
    expect(ratioBucket(100, 150)).toBe('>=90%')
    expect(ratioBucket(0, 5)).toBe('>=90%')
  })
  it('durationBucket and progressBucket, including NaN and null', () => {
    expect(durationBucket(14.9)).toBe('<15')
    expect(durationBucket(60)).toBe('60-300')
    expect(durationBucket(1200)).toBe('>=1200')
    expect(durationBucket(Number.NaN)).toBe('<15')
    expect(sizeBucket(Number.NaN)).toBe('<10')
    expect(progressBucket(null)).toBe('0-25%')
    expect(progressBucket(0.5)).toBe('50-75%')
    expect(progressBucket(1)).toBe('75-100%')
  })
})

describe('props', () => {
  it('presetProp keeps built-in ids and hides user presets', () => {
    expect(presetProp('discord')).toBe('discord')
    expect(presetProp('user-1700000000000')).toBe('custom')
    expect(presetProp('')).toBe('custom')
  })
  it('extProp only reveals known video extensions', () => {
    expect(extProp('C:\\a\\Clip.MOV')).toBe('mov')
    expect(extProp('C:\\a\\archive.tar.mkv')).toBe('mkv')
    expect(extProp('C:\\my.folder\\video')).toBe('other')
    expect(extProp('C:\\a\\notes.secretproject')).toBe('other')
    expect(extProp('')).toBe('other')
  })
  it('modeProp and encodersProp', () => {
    expect(modeProp(settings)).toBe('target')
    expect(modeProp({ ...settings, maxMB: null, bitrateKbps: 8000 })).toBe('bitrate')
    expect(modeProp({ ...settings, maxMB: null })).toBe('quality')
    expect(encodersProp(['nvenc', 'cpu'])).toBe('cpu,nvenc')
  })
  it('isRendererEvent accepts only the promo events', () => {
    expect(isRendererEvent('promo_clicked')).toBe(true)
    expect(isRendererEvent('encode_done')).toBe(false)
    expect(isRendererEvent({ name: 'promo_clicked' })).toBe(false)
  })
})

describe('encodeEvent', () => {
  it('maps a success to encode_done without any path', () => {
    const outcome: EncodeOutcome = {
      ok: true,
      result: { output: 'C:\\Users\\Lou\\Videos\\secret client_squish.mp4', bytes: 9_500_000, encoder: 'nvenc', fellBack: false, attempts: 2 }
    }
    const e = encodeEvent({ ...base, outcome })
    expect(e).toEqual({
      name: 'encode_done',
      props: {
        preset: 'discord', edited: false, codec: 'h264', res: '1080', fps: 'best', mode: 'target', encoder: 'nvenc',
        gpu_fallback: false, attempts: 2, input_mb: '100-500', ratio: '<10%', duration: '15-60'
      }
    })
    expect(JSON.stringify(e)).not.toMatch(/secret|Lou|\\/)
  })
  it('maps an abort to encode_cancelled with a progress bucket', () => {
    const outcome: EncodeOutcome = { ok: false, kind: 'aborted', message: 'Cancelled', log: '' }
    expect(encodeEvent({ ...base, outcome })).toEqual({ name: 'encode_cancelled', props: { progress: '50-75%' } })
  })
  it('maps failures to encode_failed and drops message and log', () => {
    const outcome: EncodeOutcome = { ok: false, kind: 'disk', message: 'Not enough disk space to write C:\\Users\\Lou\\x.mp4', log: 'C:\\Users\\Lou' }
    const e = encodeEvent({ ...base, meta: { presetId: 'user-5', edited: true }, outcome })
    expect(e).toEqual({ name: 'encode_failed', props: { kind: 'disk', preset: 'custom', codec: 'h264', encoder_choice: 'auto', encoders: 'cpu,nvenc' } })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shared/telemetry.test.ts`
Expected: FAIL, cannot resolve `./telemetry`.

- [ ] **Step 3: Add `EncodeMeta` to `src/shared/api.ts`**

Add below the `EncodeOutcome` type:

```ts
/** What the renderer knows about an encode that main does not: which preset is picked and whether it was edited. */
export interface EncodeMeta { presetId: string; edited: boolean }
```

- [ ] **Step 4: Implement `src/shared/telemetry.ts`**

```ts
import type { EncodeMeta, EncodeOutcome } from './api'
import { BUILT_IN_PRESETS } from './presets'
import type { EncoderId, Settings, VideoInfo } from './types'

export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mts', 'm2ts', 'wmv'] as const
export const RENDERER_EVENTS = ['promo_shown', 'promo_clicked', 'promo_dismissed'] as const
export type RendererEventName = (typeof RENDERER_EVENTS)[number]
export type Mode = 'quality' | 'target' | 'bitrate'

export type TelemetryEvent =
  | { name: 'app_started'; props: { encoders: string } }
  | {
      name: 'encode_done'
      props: {
        preset: string; edited: boolean; codec: string; res: string; fps: string; mode: Mode; encoder: EncoderId
        gpu_fallback: boolean; attempts: number; input_mb: string; ratio: string; duration: string
      }
    }
  | { name: 'encode_failed'; props: { kind: 'ffmpeg' | 'disk' | 'size'; preset: string; codec: string; encoder_choice: string; encoders: string } }
  | { name: 'encode_cancelled'; props: { progress: string } }
  | { name: 'probe_failed'; props: { ext: string } }
  | { name: RendererEventName }

/** Lower bound inclusive, upper bound exclusive. Non-finite values count as 0. */
function bucket(value: number, edges: number[], labels: string[]): string {
  const v = Number.isFinite(value) ? value : 0
  const i = edges.findIndex((e) => v < e)
  return labels[i === -1 ? edges.length : i]
}

export const sizeBucket = (bytes: number): string =>
  bucket(bytes / 1e6, [10, 50, 100, 500, 2000], ['<10', '10-50', '50-100', '100-500', '500-2000', '>=2000'])

const RATIO_LABELS = ['<10%', '10-30%', '30-50%', '50-70%', '70-90%', '>=90%']
export const ratioBucket = (inBytes: number, outBytes: number): string =>
  inBytes > 0 ? bucket((outBytes / inBytes) * 100, [10, 30, 50, 70, 90], RATIO_LABELS) : RATIO_LABELS[RATIO_LABELS.length - 1]

export const durationBucket = (sec: number): string =>
  bucket(sec, [15, 60, 300, 1200], ['<15', '15-60', '60-300', '300-1200', '>=1200'])

export const progressBucket = (fraction: number | null): string =>
  bucket((fraction ?? 0) * 100, [25, 50, 75], ['0-25%', '25-50%', '50-75%', '75-100%'])

export const presetProp = (id: string): string => (BUILT_IN_PRESETS.some((p) => p.id === id) ? id : 'custom')

export function extProp(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? ''
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase()
  return ext && (VIDEO_EXTENSIONS as readonly string[]).includes(ext) ? ext : 'other'
}

export const modeProp = (s: Settings): Mode => (s.maxMB !== null ? 'target' : s.bitrateKbps !== null ? 'bitrate' : 'quality')

export const encodersProp = (list: readonly EncoderId[]): string => [...list].sort().join(',')

export const isRendererEvent = (name: unknown): name is RendererEventName =>
  typeof name === 'string' && (RENDERER_EVENTS as readonly string[]).includes(name)

export interface EncodeEventInput {
  outcome: EncodeOutcome
  info: Pick<VideoInfo, 'sizeBytes' | 'durationSec'>
  settings: Settings
  meta: EncodeMeta
  encoders: readonly EncoderId[]
  /** Last progress fraction reported before the encode ended, or null if none. */
  lastFraction: number | null
}

export function encodeEvent({ outcome, info, settings, meta, encoders, lastFraction }: EncodeEventInput): TelemetryEvent {
  if (outcome.ok) {
    const r = outcome.result
    return {
      name: 'encode_done',
      props: {
        preset: presetProp(meta.presetId), edited: meta.edited, codec: settings.codec, res: settings.res, fps: settings.fps,
        mode: modeProp(settings), encoder: r.encoder, gpu_fallback: r.fellBack, attempts: r.attempts,
        input_mb: sizeBucket(info.sizeBytes), ratio: ratioBucket(info.sizeBytes, r.bytes), duration: durationBucket(info.durationSec)
      }
    }
  }
  if (outcome.kind === 'aborted') return { name: 'encode_cancelled', props: { progress: progressBucket(lastFraction) } }
  return {
    name: 'encode_failed',
    props: { kind: outcome.kind, preset: presetProp(meta.presetId), codec: settings.codec, encoder_choice: settings.encoder, encoders: encodersProp(encoders) }
  }
}
```

- [ ] **Step 5: Use `VIDEO_EXTENSIONS` in the file dialog**

In `src/main/ipc.ts`, add `import { VIDEO_EXTENSIONS } from '@shared/telemetry'` and replace the inline extension array in the `file:open` handler:

```ts
const r = await dialog.showOpenDialog(w!, { properties: ['openFile'], filters: [{ name: 'Video', extensions: [...VIDEO_EXTENSIONS] }] })
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run src/shared/telemetry.test.ts` → Expected: PASS (all tests).
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/telemetry.ts src/shared/telemetry.test.ts src/shared/api.ts src/main/ipc.ts
git commit -m "feat: telemetry event allowlist and bucket helpers"
```

---

### Task 2: Aptabase client in the main process

**Files:**
- Create: `src/main/telemetry.ts`
- Create: `src/main/telemetry.test.ts`
- Modify: `src/shared/links.ts` (add `APTABASE_APP_KEY`)

**Interfaces:**
- Consumes: `TelemetryEvent` from `@shared/telemetry` (Task 1).
- Produces:
  - `export const APTABASE_APP_KEY = 'A-EU-6956588791'` in `src/shared/links.ts`
  - `interface SystemInfo { isDebug: boolean; locale: string; osName: string; osVersion: string; engineName: string; engineVersion: string; appVersion: string }`
  - `type FetchLike = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<unknown>`
  - `interface Telemetry { track(event: TelemetryEvent): Promise<void> }`
  - `createTelemetry(deps: { appKey: string; system: SystemInfo; isEnabled: () => Promise<boolean>; fetch: FetchLike; now?: () => number; random?: () => number }): Telemetry`
  - `endpointFor(appKey: string): string | null`, `newSessionId(nowMs: number, random: number): string`, `SDK_VERSION`

- [ ] **Step 1: Write the failing tests**

Create `src/main/telemetry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { TelemetryEvent } from '@shared/telemetry'
import { createTelemetry, endpointFor, newSessionId, SDK_VERSION, type FetchLike, type SystemInfo } from './telemetry'

const KEY = 'A-EU-6956588791'
const T0 = Date.UTC(2026, 8, 25, 12, 0, 0)
const system: SystemInfo = {
  isDebug: false, locale: 'de-DE', osName: 'Windows', osVersion: '10.0.26200', engineName: 'Chromium', engineVersion: '140.0.0.0', appVersion: '1.0.0'
}
const started: TelemetryEvent = { name: 'app_started', props: { encoders: 'cpu,nvenc' } }

function setup(over: { appKey?: string; isEnabled?: () => Promise<boolean>; fetch?: FetchLike } = {}) {
  const fetch = vi.fn<FetchLike>(async () => undefined)
  let t = T0
  const tel = createTelemetry({
    appKey: KEY, system, isEnabled: async () => true, fetch, now: () => t, random: () => 0.5, ...over
  })
  return { fetch, tel, advance: (ms: number) => { t += ms } }
}
const body = (f: ReturnType<typeof vi.fn<FetchLike>>, i = 0) => JSON.parse(f.mock.calls[i][1].body)

describe('endpointFor', () => {
  it('maps EU and US keys and rejects everything else', () => {
    expect(endpointFor(KEY)).toBe('https://eu.aptabase.com/api/v0/event')
    expect(endpointFor('A-US-1')).toBe('https://us.aptabase.com/api/v0/event')
    for (const bad of ['', 'A-XX-1', 'A-SH-1', 'B-EU-1', 'A-EU', 'A-EU-1-2', 'A-toString-1']) expect(endpointFor(bad)).toBeNull()
  })
})

describe('newSessionId', () => {
  it('is epoch seconds plus 8 random digits', () => {
    expect(newSessionId(T0, 0.5)).toBe(`${T0 / 1000}50000000`)
    expect(newSessionId(T0, 0)).toBe(`${T0 / 1000}00000000`)
  })
})

describe('track', () => {
  it('posts one event in the Aptabase format', async () => {
    const { fetch, tel } = setup()
    await tel.track(started)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://eu.aptabase.com/api/v0/event')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'App-Key': KEY })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(body(fetch)).toEqual({
      timestamp: '2026-09-25T12:00:00.000Z',
      sessionId: newSessionId(T0, 0.5),
      eventName: 'app_started',
      systemProps: { ...system, sdkVersion: SDK_VERSION },
      props: { encoders: 'cpu,nvenc' }
    })
  })
  it('omits props for renderer events', async () => {
    const { fetch, tel } = setup()
    await tel.track({ name: 'promo_clicked' })
    expect(body(fetch)).not.toHaveProperty('props')
  })
  it('sends nothing when consent is off and re-reads consent for every event', async () => {
    let on = true
    const { fetch, tel } = setup({ isEnabled: async () => on })
    await tel.track(started)
    on = false
    await tel.track(started)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('is a no-op with an invalid key', async () => {
    const isEnabled = vi.fn(async () => true)
    const { fetch, tel } = setup({ appKey: '', isEnabled })
    await tel.track(started)
    expect(fetch).not.toHaveBeenCalled()
    expect(isEnabled).not.toHaveBeenCalled()
  })
  it('never rejects: network errors, sync throws and consent errors are swallowed', async () => {
    await expect(setup({ fetch: async () => { throw new Error('offline') } }).tel.track(started)).resolves.toBeUndefined()
    await expect(setup({ fetch: () => { throw new Error('sync') } }).tel.track(started)).resolves.toBeUndefined()
    await expect(setup({ isEnabled: async () => { throw new Error('store') } }).tel.track(started)).resolves.toBeUndefined()
  })
  it('keeps the session for up to 1 hour of inactivity, then starts a new one', async () => {
    const { fetch, tel, advance } = setup()
    await tel.track(started)
    advance(59 * 60_000)
    await tel.track(started)
    advance(61 * 60_000)
    await tel.track(started)
    expect(body(fetch, 1).sessionId).toBe(body(fetch, 0).sessionId)
    expect(body(fetch, 2).sessionId).not.toBe(body(fetch, 0).sessionId)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/telemetry.test.ts`
Expected: FAIL, cannot resolve `./telemetry`.

- [ ] **Step 3: Implement `src/main/telemetry.ts`**

```ts
import type { TelemetryEvent } from '@shared/telemetry'

export interface SystemInfo {
  isDebug: boolean; locale: string; osName: string; osVersion: string; engineName: string; engineVersion: string; appVersion: string
}
export type FetchLike = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }
) => Promise<unknown>
export interface TelemetryDeps {
  appKey: string
  system: SystemInfo
  /** Read before every event, so a switch in the About dialog applies to the very next event. */
  isEnabled: () => Promise<boolean>
  fetch: FetchLike
  now?: () => number
  random?: () => number
}
export interface Telemetry {
  /** Never rejects. Callers should not await it: `void telemetry.track(e)`. */
  track(event: TelemetryEvent): Promise<void>
}

export const SDK_VERSION = 'pynos-squish-telemetry@1'
const HOSTS = new Map([['EU', 'https://eu.aptabase.com'], ['US', 'https://us.aptabase.com']])
const SESSION_IDLE_MS = 60 * 60 * 1000
const SEND_TIMEOUT_MS = 10_000

/** App keys look like `A-EU-1234567890`. Anything else disables telemetry. */
export function endpointFor(appKey: string): string | null {
  const [prefix, region, id, ...rest] = appKey.split('-')
  const host = HOSTS.get(region ?? '')
  return prefix === 'A' && host && id && rest.length === 0 ? `${host}/api/v0/event` : null
}

/** Aptabase session id format: epoch seconds followed by 8 random digits. */
export function newSessionId(nowMs: number, random: number): string {
  return `${Math.floor(nowMs / 1000)}${Math.floor(random * 1e8).toString().padStart(8, '0')}`
}

export function createTelemetry(deps: TelemetryDeps): Telemetry {
  const url = endpointFor(deps.appKey)
  const now = deps.now ?? Date.now
  const random = deps.random ?? Math.random
  let sessionId = newSessionId(now(), random())
  let lastAt = now()

  async function send(event: TelemetryEvent): Promise<void> {
    if (!url || !(await deps.isEnabled())) return
    const t = now()
    if (t - lastAt > SESSION_IDLE_MS) sessionId = newSessionId(t, random())
    lastAt = t
    await deps.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'App-Key': deps.appKey },
      body: JSON.stringify({
        timestamp: new Date(t).toISOString(),
        sessionId,
        eventName: event.name,
        systemProps: { ...deps.system, sdkVersion: SDK_VERSION },
        props: 'props' in event ? event.props : undefined
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
    })
  }

  return { track: (event) => send(event).catch(() => {}) }
}
```

- [ ] **Step 4: Add the app key to `src/shared/links.ts`**

```ts
/** Aptabase (EU) app key. Public by design: it only allows sending events, not reading them. */
export const APTABASE_APP_KEY = 'A-EU-6956588791'
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run src/main/telemetry.test.ts` → Expected: PASS.
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/telemetry.ts src/main/telemetry.test.ts src/shared/links.ts
git commit -m "feat: minimal Aptabase client with per-event consent check"
```

---

### Task 3: Consent in the store

**Files:**
- Modify: `src/shared/types.ts:63-68` (`StoreData`)
- Modify: `src/main/store/presetStore.ts` (`defaultStore`, `loadStore`)
- Modify: `src/main/store/presetStore.test.ts`
- Modify: `src/renderer/src/state/logic.test.ts:5-8` (store literal)
- Modify: `src/main/ipc.ts` (two store handlers)
- Modify: `src/shared/api.ts` (`store` methods), `src/preload/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `StoreData.telemetry: 'on' | 'off'`, `StoreData.telemetryNoticeSeen: boolean`
  - `window.squish.store.setTelemetry(on: boolean): Promise<StoreData>`: sets `telemetry` and also `telemetryNoticeSeen = true`
  - `window.squish.store.telemetryNoticeSeen(): Promise<StoreData>`: sets only `telemetryNoticeSeen = true`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('presetStore', ...)` block in `src/main/store/presetStore.test.ts`:

```ts
  it('defaults stats on with the notice unseen, also for files from 1.0.0', async () => {
    expect(defaultStore()).toMatchObject({ telemetry: 'on', telemetryNoticeSeen: false })
    const dir = await mkdtemp(join(tmpdir(), 'squish-store-'))
    const file = join(dir, 'presets.json')
    await writeFile(file, JSON.stringify({ version: 1, userPresets: [], lastPresetId: 'reels', promoDismissed: true }), 'utf8')
    expect(await loadStore(file)).toEqual({
      version: 1, userPresets: [], lastPresetId: 'reels', promoDismissed: true, telemetry: 'on', telemetryNoticeSeen: false
    })
  })
  it('keeps a stored opt-out and reads junk values as off / unseen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'squish-store-'))
    const file = join(dir, 'presets.json')
    const stored = { version: 1, userPresets: [], lastPresetId: 'tiktok', promoDismissed: false }
    await writeFile(file, JSON.stringify({ ...stored, telemetry: 'off', telemetryNoticeSeen: true }), 'utf8')
    expect(await loadStore(file)).toMatchObject({ telemetry: 'off', telemetryNoticeSeen: true })
    await writeFile(file, JSON.stringify({ ...stored, telemetry: 'OFF', telemetryNoticeSeen: 'yes' }), 'utf8')
    expect(await loadStore(file)).toMatchObject({ telemetry: 'off', telemetryNoticeSeen: false })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/store/presetStore.test.ts`
Expected: FAIL on the two new tests (`telemetry` is undefined).

- [ ] **Step 3: Extend `StoreData` in `src/shared/types.ts`**

```ts
export interface StoreData {
  version: 1
  userPresets: Preset[]
  lastPresetId: string
  promoDismissed: boolean
  /** Anonymous stats. Opt-out: 'on' unless the user turned it off. */
  telemetry: 'on' | 'off'
  /** True once the first-run stats notice was answered (or the About switch was used). */
  telemetryNoticeSeen: boolean
}
```

- [ ] **Step 4: Update `defaultStore` and `loadStore` in `src/main/store/presetStore.ts`**

```ts
export function defaultStore(): StoreData {
  return { version: 1, userPresets: [], lastPresetId: DEFAULT_PRESET_ID, promoDismissed: false, telemetry: 'on', telemetryNoticeSeen: false }
}
```

In `loadStore`, add two fields to the returned object after `promoDismissed`:

```ts
      promoDismissed: d.promoDismissed === true,
      // Missing field (file from 1.0.0) means the default 'on'. A present but unknown value means 'off': when unsure, don't send.
      telemetry: d.telemetry === undefined || d.telemetry === 'on' ? 'on' : 'off',
      telemetryNoticeSeen: d.telemetryNoticeSeen === true
```

- [ ] **Step 5: Fix the store literal in `src/renderer/src/state/logic.test.ts`**

```ts
const store: StoreData = {
  version: 1, lastPresetId: 'tiktok', promoDismissed: false, telemetry: 'on', telemetryNoticeSeen: false,
  userPresets: [{ id: 'user-1', label: 'My preset 1', builtIn: false, settings: { res: '1080', fps: 'best', audio: 'best', codec: 'h265', maxMB: null, bitrateKbps: null } }]
}
```

- [ ] **Step 6: Add the store IPC handlers in `src/main/ipc.ts`**

Below the `store:dismissPromo` handler:

```ts
  ipcMain.handle('store:setTelemetry', async (_e, on: unknown) =>
    setStore({ ...(await getStore()), telemetry: on === true ? 'on' : 'off', telemetryNoticeSeen: true }))
  ipcMain.handle('store:telemetryNoticeSeen', async () => setStore({ ...(await getStore()), telemetryNoticeSeen: true }))
```

- [ ] **Step 7: Expose them in `src/shared/api.ts` and `src/preload/index.ts`**

In `SquishApi.store` (`src/shared/api.ts`):

```ts
    dismissPromo(): Promise<StoreData>
    setTelemetry(on: boolean): Promise<StoreData>
    telemetryNoticeSeen(): Promise<StoreData>
```

In the `store` object in `src/preload/index.ts`:

```ts
    dismissPromo: () => ipcRenderer.invoke('store:dismissPromo'),
    setTelemetry: (on) => ipcRenderer.invoke('store:setTelemetry', on),
    telemetryNoticeSeen: () => ipcRenderer.invoke('store:telemetryNoticeSeen')
```

- [ ] **Step 8: Run all tests and typecheck**

Run: `npm test` → Expected: PASS (all files).
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/shared/types.ts src/main/store/presetStore.ts src/main/store/presetStore.test.ts src/renderer/src/state/logic.test.ts src/main/ipc.ts src/shared/api.ts src/preload/index.ts
git commit -m "feat: store stats consent with opt-out default"
```

---

### Task 4: Send events from the main process

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc.ts` (`registerIpc` signature, `probe`, `doEncode`, `encode` handler, new `telemetry:track`)
- Modify: `src/shared/api.ts` (`encode` signature, `track`), `src/preload/index.ts`
- Modify: `src/renderer/src/state/store.ts` (`startEncode` passes meta)

**Interfaces:**
- Consumes: `createTelemetry`, `Telemetry`, `SystemInfo` (Task 2); `encodeEvent`, `extProp`, `encodersProp`, `isRendererEvent`, `RendererEventName` (Task 1); `EncodeMeta` (Task 1); `StoreData.telemetry` (Task 3); `APTABASE_APP_KEY` (Task 2).
- Produces:
  - `registerIpc(env: IpcEnv, getWindow: () => BrowserWindow | null, makeTelemetry: (isEnabled: () => Promise<boolean>) => Telemetry): IpcHandle`
  - `window.squish.encode(settings: Settings, meta: EncodeMeta): Promise<EncodeOutcome>`
  - `window.squish.track(name: RendererEventName): void`

- [ ] **Step 1: Change the API types in `src/shared/api.ts`**

Update the import line and two members of `SquishApi`:

```ts
import type { RendererEventName } from './telemetry'
```

```ts
  encode(settings: Settings, meta: EncodeMeta): Promise<EncodeOutcome>
```

```ts
  /** Anonymous stats for the promo card. Main ignores any other name and checks consent. */
  track(name: RendererEventName): void
```

- [ ] **Step 2: Update `src/preload/index.ts`**

```ts
  encode: (s, meta) => ipcRenderer.invoke('encode', s, meta),
```

and after `openFfmpegSource`:

```ts
  track: (name) => ipcRenderer.send('telemetry:track', name),
```

- [ ] **Step 3: Pass the meta from the renderer store (`src/renderer/src/state/store.ts`)**

In `startEncode`:

```ts
      const { settings, presetId, edited } = get()
      const r = await api().encode(settings, { presetId, edited })
```

(replacing `const r = await api().encode(get().settings)`).

- [ ] **Step 4: Wire telemetry into `src/main/ipc.ts`**

Imports:

```ts
import type { EncodeMeta, EncodeOutcome, PreviewResult, ProbeResult } from '@shared/api'
import { encodeEvent, encodersProp, extProp, isRendererEvent, VIDEO_EXTENSIONS } from '@shared/telemetry'
import type { Telemetry } from './telemetry'
```

Signature and setup (the store getter already exists; add the telemetry lines right after `send`):

```ts
export function registerIpc(
  env: IpcEnv,
  getWindow: () => BrowserWindow | null,
  makeTelemetry: (isEnabled: () => Promise<boolean>) => Telemetry
): IpcHandle {
  // ...existing lines up to and including `const send = ...`
  const telemetry = makeTelemetry(async () => (await getStore()).telemetry === 'on')
  void encodersP.then((list) => telemetry.track({ name: 'app_started', props: { encoders: encodersProp(list) } }))
```

In the `probe` handler's `catch`:

```ts
    } catch {
      info = null
      void telemetry.track({ name: 'probe_failed', props: { ext: extProp(path) } })
      return { ok: false, message: "Can't read this file." }
    }
```

Replace `doEncode` and the `encode` handler:

```ts
  async function doEncode(settings: Settings, meta: EncodeMeta): Promise<EncodeOutcome> {
    if (job) return { ok: false, kind: 'ffmpeg', message: 'An encode is already running.', log: '' }
    if (!info) return { ok: false, kind: 'ffmpeg', message: 'No video loaded.', log: '' }
    const current = info
    job = new AbortController()
    let lastFraction: number | null = null
    let outcome: EncodeOutcome
    try {
      await mkdir(env.tmpDir, { recursive: true })
      const output = uniqueOutputPath(current.path, existsSync)
      const result = await runEncode(
        { info: current, settings, available: await encodersP, output },
        { run, tmpDir: env.tmpDir, fileSize: async (p) => (await stat(p)).size, remove: (p) => unlink(p).catch(() => {}) },
        {
          progress: (p) => { lastFraction = p.fraction; send('encode:progress', p) },
          log: (l) => send('encode:log', l)
        },
        job.signal
      )
      outcome = { ok: true, result }
    } catch (e) {
      if (e instanceof EncodeError) outcome = { ok: false, kind: e.kind, message: e.message, log: e.log }
      else {
        const err = e as NodeJS.ErrnoException
        outcome = { ok: false, kind: err?.code === 'ENOSPC' ? 'disk' : 'ffmpeg', message: err.message, log: '' }
      }
    } finally {
      job = null
    }
    void telemetry.track(encodeEvent({ outcome, info: current, settings, meta, encoders: await encodersP, lastFraction }))
    return outcome
  }

  ipcMain.handle('encode', (_e, settings: Settings, meta: EncodeMeta) => {
    const p = doEncode(settings, meta)
    encodeInFlight = p
    void p.finally(() => { if (encodeInFlight === p) encodeInFlight = null })
    return p
  })
```

Below the store handlers:

```ts
  ipcMain.on('telemetry:track', (_e, name: unknown) => {
    if (isRendererEvent(name)) void telemetry.track({ name })
  })
```

Note: the two early returns ("already running", "No video loaded") intentionally send nothing; no encode ran.

- [ ] **Step 5: Build the client in `src/main/index.ts`**

Imports:

```ts
import { release } from 'node:os'
import { ALLOWED_EXTERNAL, APTABASE_APP_KEY } from '@shared/links'
import { createTelemetry } from './telemetry'
```

Replace `const ipc = registerIpc(env, () => win)` inside `app.whenReady().then(...)` (it must stay inside `whenReady`: `app.getLocale()` and `net.fetch` need a ready app):

```ts
  const ipc = registerIpc(env, () => win, (isEnabled) => createTelemetry({
    appKey: APTABASE_APP_KEY,
    system: {
      isDebug: !app.isPackaged,
      locale: app.getLocale().slice(0, 10),
      osName: 'Windows',
      osVersion: release(),
      engineName: 'Chromium',
      engineVersion: process.versions.chrome,
      appVersion: app.getVersion()
    },
    isEnabled,
    fetch: (url, init) => net.fetch(url, init)
  }))
```

- [ ] **Step 6: Run all tests and typecheck**

Run: `npm test` → Expected: PASS.
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 7: Smoke-run the app**

Run: `npm run dev`. Drop a video, encode with the Discord preset, cancel one encode, drop a `.txt` file renamed to `.mp4`. Expected: every flow behaves exactly as before, and no errors appear in the terminal. Then disconnect the network (or block the app in the firewall) and encode once more. Expected: encode and quit work normally, with no delay.

- [ ] **Step 8: Commit**

```bash
git add src/main/index.ts src/main/ipc.ts src/shared/api.ts src/preload/index.ts src/renderer/src/state/store.ts
git commit -m "feat: send anonymous start, encode, probe and promo events"
```

---

### Task 5: Notice card, About switch, promo events and docs

**Files:**
- Create: `src/renderer/src/components/TelemetryNotice.tsx`
- Modify: `src/renderer/src/state/store.ts` (two actions)
- Modify: `src/renderer/src/screens/DropScreen.tsx`
- Modify: `src/renderer/src/components/AboutDialog.tsx`
- Modify: `src/renderer/src/screens/DoneScreen.tsx`
- Modify: `docs/release-checklist.md`, `docs/superpowers/specs/2026-09-24-squish-design.md:22-24`

**Interfaces:**
- Consumes: `window.squish.store.setTelemetry`, `window.squish.store.telemetryNoticeSeen` (Task 3), `window.squish.track` (Task 4), `StoreData.telemetry`, `StoreData.telemetryNoticeSeen` (Task 3).
- Produces: store actions `setTelemetry(on: boolean): Promise<void>` and `acknowledgeTelemetryNotice(): Promise<void>`.

- [ ] **Step 1: Add store actions (`src/renderer/src/state/store.ts`)**

In the `State` interface, after `dismissPromo(): Promise<void>`:

```ts
  setTelemetry(on: boolean): Promise<void>
  acknowledgeTelemetryNotice(): Promise<void>
```

In the returned object, after `dismissPromo`:

```ts
    async dismissPromo() { set({ data: await api().store.dismissPromo() }) },
    async setTelemetry(on) { set({ data: await api().store.setTelemetry(on) }) },
    async acknowledgeTelemetryNotice() { set({ data: await api().store.telemetryNoticeSeen() }) }
```

- [ ] **Step 2: Create `src/renderer/src/components/TelemetryNotice.tsx`**

```tsx
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { bouncy, pressProps, smooth } from '../motion'
import { useSquish } from '../state/store'

const DETAILS = [
  'App version, Windows version and language',
  'Which presets, codecs and encoders you use',
  'Rough size and length ranges, never exact values',
  'Error types when an encode or file read fails',
  "Clicks on the Pyno's link after an encode",
  'Never: file names, folders, or anything you type'
]

export function TelemetryNotice() {
  const acknowledge = useSquish((s) => s.acknowledgeTelemetryNotice)
  const setTelemetry = useSquish((s) => s.setTelemetry)
  const [open, setOpen] = useState(false)

  return (
    <motion.aside aria-label="Anonymous stats" layout
      initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: { ...bouncy, delay: 0.4 } }} exit={{ y: 16, opacity: 0, transition: smooth }}
      style={{ flexShrink: 0, borderRadius: 12, border: '1px solid var(--gold-line)', background: 'var(--surface)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <p style={{ margin: 0, flex: 1, fontSize: 14, lineHeight: '22px', color: 'var(--ink-2)' }}>
          Pyno's Squish shares anonymous usage and error stats to help improve the app. No file names, no personal data.{' '}
          <button className="link-btn" aria-expanded={open} aria-controls="telemetry-details" onClick={() => setOpen((o) => !o)}>What's sent?</button>
        </p>
        <button className="link-btn" onClick={() => void setTelemetry(false)}>Turn off</button>
        <motion.button {...pressProps} className="btn btn-ghost" style={{ height: 40 }} onClick={() => void acknowledge()}>Got it</motion.button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul id="telemetry-details" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={smooth}
            style={{ margin: 0, paddingLeft: 18, overflow: 'hidden', fontSize: 13, lineHeight: '20px', color: 'var(--ink-3)' }}>
            {DETAILS.map((d) => <li key={d}>{d}</li>)}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}
```

- [ ] **Step 3: Show it on the Drop screen (`src/renderer/src/screens/DropScreen.tsx`)**

Imports:

```tsx
import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { TelemetryNotice } from '../components/TelemetryNotice'
```

In the component, next to the other selectors:

```tsx
  const showNotice = useSquish((s) => s.data !== null && !s.data.telemetryNoticeSeen)
```

Change the outer wrapper to a column so the card sits **below** the drop zone (not over it, so it never swallows a drop):

```tsx
    <div style={{ height: '100%', padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <motion.div /* existing drop zone: props and children unchanged */>
        …
      </motion.div>
      <AnimatePresence>{showNotice && <TelemetryNotice />}</AnimatePresence>
    </div>
```

- [ ] **Step 4: Add the switch to the About dialog (`src/renderer/src/components/AboutDialog.tsx`)**

Imports:

```tsx
import { bouncy, smooth } from '../motion'
import { useSquish } from '../state/store'
```

At the top of the component:

```tsx
  const data = useSquish((s) => s.data)
  const setTelemetry = useSquish((s) => s.setTelemetry)
  const statsOn = data?.telemetry !== 'off'
```

Insert between the FFmpeg paragraph and the button row:

```tsx
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
              <span id="stats-label" style={{ fontSize: 14, lineHeight: '22px', color: 'var(--ink-2)' }}>Share anonymous stats</span>
              <button role="switch" aria-checked={statsOn} aria-labelledby="stats-label" disabled={!data} onClick={() => void setTelemetry(!statsOn)}
                style={{ width: 44, height: 24, flexShrink: 0, borderRadius: 12, padding: 2, display: 'flex', justifyContent: statsOn ? 'flex-end' : 'flex-start', background: statsOn ? 'var(--gold)' : 'var(--rule)', transition: 'background-color 150ms' }}>
                <motion.span layout transition={bouncy} style={{ width: 20, height: 20, borderRadius: 10, background: statsOn ? 'var(--on-gold)' : 'var(--ink-2)' }} />
              </button>
            </div>
```

The dialog is a modal separate from the Drop screen, so the gold switch does not compete with the "Choose file" button.

- [ ] **Step 5: Promo events on the Done screen (`src/renderer/src/screens/DoneScreen.tsx`)**

After the existing count-up `useEffect` (before the `if (!result || !info)` early return):

```tsx
  const showPromo = data !== null && !data.promoDismissed
  // Once per finished encode; not again when the promo is dismissed.
  useEffect(() => { if (result && showPromo) window.squish.track('promo_shown') }, [result])
```

Replace `{data && !data.promoDismissed && (` with `{showPromo && (`, and the two buttons' handlers:

```tsx
<button className="link-btn" onClick={() => { window.squish.track('promo_clicked'); void window.squish.openPromo() }}>See them →</button>
```

```tsx
onClick={() => { window.squish.track('promo_dismissed'); void dismissPromo() }}
```

- [ ] **Step 6: Update the docs**

In `docs/release-checklist.md`, add after the `PROMO_URL` line:

```markdown
- [ ] `APTABASE_APP_KEY` in `src/shared/links.ts` is the Pyno's Squish key. A packaged build shows up in the Aptabase dashboard under release data (not Debug).
- [ ] The Payhip product page says the app sends anonymous usage and error stats, and that they can be turned off in About.
```

Add under "Manual checks before first release":

```markdown
- [ ] Fresh install: the stats notice shows under the drop zone. "Got it" hides it for good (restart to check). "Turn off" hides it and the About switch shows off.
- [ ] About switch toggles with mouse, Tab + Space, and a screen reader announces it as a switch.
```

In `docs/superpowers/specs/2026-09-24-squish-design.md`, change the two table rows in section 2:

```markdown
| Netzwerk | Der Pyno's-Link öffnet den Standardbrowser. Anonyme Statistiken an Aptabase (EU), siehe [Telemetrie-Spec](2026-09-25-telemetry-design.md) |
| Konto, Lizenz | Keine |
| Telemetrie | Anonym, Opt-out, siehe [Telemetrie-Spec](2026-09-25-telemetry-design.md) |
```

(replacing the `Netzwerk` row and the `Konto, Lizenz, Telemetrie` row).

- [ ] **Step 7: Run all tests, typecheck and check the UI**

Run: `npm test` → Expected: PASS.
Run: `npm run typecheck` → Expected: no errors.
Run: `npm run dev` and check:
- Delete `%APPDATA%\Pyno's Squish\presets.json` first (or rename it). The notice slides in under the drop zone with a spring. "What's sent?" expands the list. Dropping a video onto the zone still works while the notice is visible.
- "Got it" animates the card out. After a restart it stays hidden.
- Reset the file again, then "Turn off": card hides, About shows the switch off. Toggle it on and off with the mouse and with Tab + Space.
- Encode to the Done screen. The promo still shows, "See them →" opens the browser, × hides it.
- Windows reduced motion on: the card only fades.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/TelemetryNotice.tsx src/renderer/src/state/store.ts src/renderer/src/screens/DropScreen.tsx src/renderer/src/components/AboutDialog.tsx src/renderer/src/screens/DoneScreen.tsx docs/release-checklist.md docs/superpowers/specs/2026-09-24-squish-design.md
git commit -m "feat: stats notice, About switch and promo events"
```
