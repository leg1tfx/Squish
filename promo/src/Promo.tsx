import './fonts'
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from 'remotion'
import { MUSIC } from './music'
import { SCENE_COMPONENTS } from './scenes'
import { ENDCARD_THUD_SEC } from './scenes/Endcard'
import { heroChipFrame } from './scenes/Hero'
import { C, FPS, sec } from './theme'
import { buildTimeline, type Word } from './timeline'
import words from './words.json'

export const TIMELINE = buildTimeline(words as Word[], MUSIC, FPS)

const hero = TIMELINE.scenes.find((s) => s.id === 'hero')!
const endcard = TIMELINE.scenes.find((s) => s.id === 'endcard')!
// Whoosh leads into each cut; click on the gold chip; thud when the chevrons land.
const SFX: { src: string; at: number }[] = [
  ...TIMELINE.scenes.slice(1).map((s) => ({ src: 'audio/sfx/whoosh.wav', at: Math.max(0, s.from - sec(0.066, FPS)) })),
  { src: 'audio/sfx/click.wav', at: hero.from + heroChipFrame(hero) },
  { src: 'audio/sfx/thud.wav', at: endcard.from + sec(ENDCARD_THUD_SEC, FPS) }
]

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
      {SFX.map((s, i) => (
        <Sequence key={`sfx-${i}`} from={s.at} durationInFrames={sec(0.8, FPS)} name={`sfx-${i}`}>
          <Html5Audio src={staticFile(s.src)} />
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
