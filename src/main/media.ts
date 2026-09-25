import { win32 } from 'node:path'

export const MEDIA_SCHEME = 'squish-media'

export function mediaUrl(fileName: string): string {
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(fileName)}`
}

export function mediaFileFor(url: string, dir: string): string | null {
  const u = new URL(url)
  const name = decodeURIComponent(u.pathname.replace(/^\//, ''))
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes('..')) return null
  return win32.join(dir, name)
}
