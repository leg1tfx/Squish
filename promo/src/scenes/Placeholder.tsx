import { SceneShell } from '../components/SceneShell'
import { WordLine } from '../components/WordLine'
import type { SceneProps } from '.'

export function Placeholder({ t }: SceneProps) {
  return (
    <SceneShell durationInFrames={t.durationInFrames}>
      <WordLine words={t.words} size={64} />
    </SceneShell>
  )
}
