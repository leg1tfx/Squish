import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { RevealWord } from '../components/RevealWord'
import { SceneShell } from '../components/SceneShell'
import { SquishIcon } from '../components/SquishIcon'
import { WordLine } from '../components/WordLine'
import { C, FONT, sec } from '../theme'
import type { SceneProps } from '.'

// Seconds into the endcard at which the chevrons land (Promo places the thud SFX here).
export const ENDCARD_THUD_SEC = 0.4

export function Endcard({ t }: SceneProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const start = sec(0.066, fps)
  // Slight bounce allowed here only: the chevrons "press".
  const squeeze = spring({ frame: frame - start, fps, config: { damping: 14, stiffness: 180 }, durationInFrames: sec(ENDCARD_THUD_SEC, fps) - start })
  return (
    <SceneShell durationInFrames={t.durationInFrames + fps}>
      <WordLine words={t.words} size={40} weight={400} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
        <SquishIcon size={220} squeeze={squeeze} />
        <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RevealWord text="Pyno's Squish" from={sec(0.27, fps)} style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 92, color: C.ink, letterSpacing: '-0.02em' }} />
          <RevealWord text="Free on Payhip." from={sec(0.53, fps)} style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 30, color: C.ink2 }} />
        </div>
      </div>
    </SceneShell>
  )
}
