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
