import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { AppWindow } from '../components/AppWindow'
import { SceneShell } from '../components/SceneShell'
import { WordLine } from '../components/WordLine'
import { SPRING, sec } from '../theme'
import type { SceneTiming } from '../timeline'
import type { SceneProps } from '.'

const wordFrame = (t: SceneTiming, text: string) => t.words.find((w) => w.text === text)?.from ?? 0
export const heroChipFrame = (t: SceneTiming) => wordFrame(t, 'going.')

export function Hero({ t }: SceneProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame: frame - sec(0.066, fps), fps, config: SPRING, durationInFrames: sec(0.8, fps) })
  const fileIn = spring({ frame: frame - wordFrame(t, 'video.'), fps, config: SPRING, durationInFrames: sec(0.6, fps) })
  const chipOn = spring({ frame: frame - heroChipFrame(t), fps, config: SPRING, durationInFrames: sec(0.4, fps) })
  return (
    <SceneShell durationInFrames={t.durationInFrames}>
      <WordLine words={t.words} size={44} />
      <div style={{ perspective: 1600 }}>
        <div
          style={{
            opacity: enter,
            transform: `translateY(${80 * (1 - enter)}px) rotateX(${14 - 4 * enter}deg) rotateY(${-12 + 4 * enter}deg)`,
            transformStyle: 'preserve-3d'
          }}
        >
          <AppWindow fileIn={fileIn} chipOn={chipOn} />
        </div>
      </div>
    </SceneShell>
  )
}
