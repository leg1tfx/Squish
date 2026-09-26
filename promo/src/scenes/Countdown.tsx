import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { SceneShell } from '../components/SceneShell'
import { WordLine } from '../components/WordLine'
import { countdownValue, formatMb } from '../lib/format'
import { C, FONT, SPRING, sec } from '../theme'
import type { SceneProps } from '.'

export function Countdown({ t }: SceneProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const start = t.words[0]?.from ?? 0
  const p = spring({ frame: frame - start, fps, config: SPRING, durationInFrames: sec(1.5, fps) })
  const squash = Math.sin(Math.PI * p)
  const done = p > 0.995
  return (
    <SceneShell durationInFrames={t.durationInFrames}>
      <div
        style={{
          fontFamily: FONT.body, fontWeight: 600, fontSize: 200, letterSpacing: '-0.04em',
          fontVariantNumeric: 'tabular-nums', color: done ? C.gold : C.ink,
          transform: `scale(${1 - 0.08 * squash}, ${1 + 0.03 * squash})`
        }}
      >
        {formatMb(countdownValue(p))}
      </div>
      <WordLine words={t.words} size={44} />
    </SceneShell>
  )
}
