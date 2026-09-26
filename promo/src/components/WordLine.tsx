import type { CSSProperties } from 'react'
import { useCurrentFrame } from 'remotion'
import type { TimedWord } from '../timeline'
import { C, FONT } from '../theme'
import { RevealWord } from './RevealWord'

type Props = { words: TimedWord[]; size: number; weight?: number; font?: string; tone?: 'ink' | 'gold'; style?: CSSProperties }

// Spoken word in ink, already-said words step back to ink2 (spec 4). tone="gold" colors the whole line gold.
export function WordLine({ words, size, weight = 600, font = FONT.body, tone = 'ink', style }: Props) {
  const frame = useCurrentFrame()
  const activeIdx = words.reduce((acc, w, i) => (frame >= w.from ? i : acc), -1)
  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `0 ${size * 0.28}px`,
        fontFamily: font, fontSize: size, fontWeight: weight, letterSpacing: '-0.02em', lineHeight: 1.15,
        ...style
      }}
    >
      {words.map((w, i) => (
        <RevealWord key={i} text={w.text} from={w.from} style={{ color: tone === 'gold' ? C.gold : i === activeIdx ? C.ink : C.ink2 }} />
      ))}
    </div>
  )
}
