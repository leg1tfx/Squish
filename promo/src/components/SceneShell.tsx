import type { ReactNode } from 'react'
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, MARGIN, SPRING, sec } from '../theme'

export function SceneShell({ durationInFrames, children }: { durationInFrames: number; children: ReactNode }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const exit = sec(0.33, fps)
  const out = spring({ frame: frame - (durationInFrames - exit), fps, config: SPRING, durationInFrames: exit })
  return (
    <AbsoluteFill
      style={{
        background: C.ground, padding: MARGIN, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 40, textAlign: 'center',
        opacity: 1 - out, filter: `blur(${8 * out}px)`, transform: `translateY(${-12 * out}px)`
      }}
    >
      {children}
    </AbsoluteFill>
  )
}
