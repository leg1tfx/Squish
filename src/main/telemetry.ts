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
