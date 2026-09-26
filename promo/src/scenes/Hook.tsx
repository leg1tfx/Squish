import { SceneShell } from '../components/SceneShell'
import { RevealWord } from '../components/RevealWord'
import { WordLine } from '../components/WordLine'
import { C, FONT } from '../theme'
import type { SceneProps } from '.'

export function Hook({ t }: SceneProps) {
  const [big, ...rest] = t.words
  return (
    <SceneShell durationInFrames={t.durationInFrames}>
      <RevealWord
        text={big.text}
        from={big.from}
        style={{ fontFamily: FONT.body, fontWeight: 600, fontSize: 200, letterSpacing: '-0.04em', color: C.ink }}
      />
      <WordLine words={rest} size={52} weight={400} style={{ color: C.ink3 }} />
    </SceneShell>
  )
}
