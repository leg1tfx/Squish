import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion'
import { SceneShell } from '../components/SceneShell'
import { WordLine } from '../components/WordLine'
import { sec } from '../theme'
import type { TimedWord } from '../timeline'
import type { SceneProps } from '.'

function sentences(words: TimedWord[]): TimedWord[][] {
  const out: TimedWord[][] = [[]]
  for (const w of words) {
    out[out.length - 1].push(w)
    if (/[.!?]$/.test(w.text)) out.push([])
  }
  return out.filter((s) => s.length > 0)
}

export function Triplet({ t }: SceneProps) {
  const { fps } = useVideoConfig()
  const lead = sec(0.133, fps)
  const parts = sentences(t.words)
  return (
    <AbsoluteFill>
      {parts.map((s, i) => {
        const from = Math.max(0, s[0].from - lead)
        const until = i + 1 < parts.length ? parts[i + 1][0].from - lead : t.durationInFrames
        const last = i === parts.length - 1
        const shifted = s.map((w) => ({ ...w, from: w.from - from, to: w.to - from }))
        return (
          <Sequence key={i} from={from} durationInFrames={until - from}>
            <SceneShell durationInFrames={until - from}>
              <WordLine words={shifted} size={96} tone={last ? 'gold' : 'ink'} />
            </SceneShell>
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
