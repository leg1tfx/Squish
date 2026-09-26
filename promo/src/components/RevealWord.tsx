import type { CSSProperties } from 'react'
import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { SPRING, sec } from '../theme'

export function RevealWord({ text, from, style }: { text: string; from: number; style?: CSSProperties }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = spring({ frame: frame - from, fps, config: SPRING, durationInFrames: sec(0.45, fps) })
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: p,
        filter: `blur(${12 * (1 - p)}px)`,
        transform: `translateY(${16 * (1 - p)}px)`,
        ...style
      }}
    >
      {text}
    </span>
  )
}
