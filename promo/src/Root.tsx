import { Composition } from 'remotion'
import { Promo, TIMELINE } from './Promo'
import { FPS, H, W } from './theme'

export function Root() {
  const common = { component: Promo, durationInFrames: TIMELINE.durationInFrames, fps: FPS, width: W, height: H }
  return (
    <>
      {/* Upload version: never contains the song. */}
      <Composition id="Promo" {...common} defaultProps={{ withSong: false }} />
      {/* Local viewing only: "24K Magic" from public/audio/guide.mp3. Never upload. */}
      <Composition id="PromoPreview" {...common} defaultProps={{ withSong: true }} />
    </>
  )
}
