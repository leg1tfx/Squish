import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { SceneShell } from '../components/SceneShell'
import { RevealWord } from '../components/RevealWord'
import { C, FONT, SPRING, sec } from '../theme'
import type { SceneProps } from '.'

function Letters({ text, from, color }: { text: string; from: number; color: string }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <span style={{ color, whiteSpace: 'pre' }}>
      {[...text].map((ch, i) => {
        const p = spring({ frame: frame - from - i * sec(0.066, fps), fps, config: SPRING, durationInFrames: sec(0.4, fps) })
        return (
          <span key={i} style={{ display: 'inline-block', opacity: p, filter: `blur(${10 * (1 - p)}px)`, transform: `translateY(${20 * (1 - p)}px)` }}>
            {ch}
          </span>
        )
      })}
    </span>
  )
}

export function Title({ t }: SceneProps) {
  const [meet, pynos, squish] = t.words
  return (
    <SceneShell durationInFrames={t.durationInFrames}>
      <RevealWord text={meet.text} from={meet.from} style={{ fontFamily: FONT.body, fontSize: 44, color: C.ink2 }} />
      <div style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 132, letterSpacing: '-0.02em', lineHeight: 1 }}>
        <Letters text={`${pynos.text} `} from={pynos.from} color={C.ink} />
        <Letters text={squish.text} from={squish.from} color={C.gold} />
      </div>
    </SceneShell>
  )
}
