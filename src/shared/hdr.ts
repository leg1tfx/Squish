import type { VideoInfo } from './types'

/** Manual HDR tag for files whose editor wrote HDR pixels without HDR tags. 'auto' trusts the file. */
export type HdrOverride = 'auto' | 'hlg' | 'pq'

const TRC: Record<Exclude<HdrOverride, 'auto'>, string> = { hlg: 'arib-std-b67', pq: 'smpte2084' }

export function applyHdrOverride(info: VideoInfo, mode: HdrOverride): VideoInfo {
  if (mode === 'auto') return info
  return { ...info, hdr: true, colorTags: { primaries: 'bt2020', trc: TRC[mode], space: 'bt2020nc' } }
}
