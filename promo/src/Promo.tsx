import './fonts'
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from 'remotion'
import { MUSIC } from './music'
import { SCENE_COMPONENTS } from './scenes'
import { C, FPS } from './theme'
import { buildTimeline, type Word } from './timeline'
import words from './words.json'

export const TIMELINE = buildTimeline(words as Word[], MUSIC, FPS)

export function Promo({ withSong }: { withSong: boolean }) {
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      {TIMELINE.scenes.map((s) => {
        const Scene = SCENE_COMPONENTS[s.id]
        return (
          <Sequence key={s.id} from={s.from} durationInFrames={s.durationInFrames} name={s.id}>
            <Scene t={s} />
          </Sequence>
        )
      })}
      {TIMELINE.scenes.map((s) => (
        <Sequence key={`vo-${s.id}`} from={s.vo.at} durationInFrames={s.vo.durationInFrames} name={`vo-${s.id}`}>
          <Html5Audio src={staticFile('audio/voiceover.wav')} trimBefore={s.vo.trimBefore} />
        </Sequence>
      ))}
      {withSong && (
        <Html5Audio
          src={staticFile('audio/guide.mp3')}
          trimBefore={Math.round(MUSIC.offsetSec * FPS)}
          volume={0.35}
        />
      )}
    </AbsoluteFill>
  )
}
