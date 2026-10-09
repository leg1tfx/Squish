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
