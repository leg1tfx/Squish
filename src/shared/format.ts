export function formatBytes(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`
}

export function resLabel(shortSide: number): string {
  return shortSide >= 2160 ? '4K' : `${shortSide}p`
}

export function codecLabel(name: string): string {
  const map: Record<string, string> = { h264: 'H.264', hevc: 'H.265', h265: 'H.265', av1: 'AV1', vp9: 'VP9' }
  return map[name] ?? name.toUpperCase()
}

export function formatFps(fps: number): string {
  return `${Number(fps.toFixed(2))} fps`
}
