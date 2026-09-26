import { describe, expect, it } from 'vitest'
import { buildTimeline, snapToBeat, SCENES, type MusicConfig, type SceneId, type Word } from './timeline'

const FPS = 30
// One word per scene at the given [start, end], second word 0.2 s later.
function wordsAt(times: Record<SceneId, [number, number]>): Word[] {
  return SCENES.flatMap((scene) => {
    const [s, e] = times[scene]
    return [
      { word: `${scene}-a`, start: s, end: s + 0.2, scene },
      { word: `${scene}-b`, start: e - 0.2, end: e, scene }
    ]
  })
}
const TIMES: Record<SceneId, [number, number]> = {
  hook: [0.2, 1.0], title: [1.6, 2.4], hero: [3.4, 4.2],
  countdown: [5.0, 5.8], triplet: [6.8, 7.6], endcard: [8.6, 9.4]
}
// Beats every 1 s at .5 → 0.5, 1.5, 2.5 ...
const MUSIC: MusicConfig = { offsetSec: 23, bpm: 60, firstBeatSec: 0.5, sceneShiftSec: {} }
// No beat within reach of any cut.
const FAR: MusicConfig = { offsetSec: 23, bpm: 1, firstBeatSec: 100, sceneShiftSec: {} }

describe('snapToBeat', () => {
  it('returns the nearest beat', () => {
    expect(snapToBeat(1.3, MUSIC)).toBeCloseTo(1.5)
    expect(snapToBeat(0.9, MUSIC)).toBeCloseTo(0.5)
  })
})

describe('buildTimeline', () => {
  it('starts the first scene at 0 and orders scenes as SCENES', () => {
    const t = buildTimeline(wordsAt(TIMES), FAR, FPS)
    expect(t.scenes.map((s) => s.id)).toEqual([...SCENES])
    expect(t.scenes[0].from).toBe(0)
  })

  it('cuts 0.3 s before the next scene when no beat is near', () => {
    const t = buildTimeline(wordsAt(TIMES), FAR, FPS)
    expect(t.scenes[1].from).toBe(Math.round(1.3 * FPS))
  })

  it('snaps a cut to a beat within 0.25 s', () => {
    const t = buildTimeline(wordsAt(TIMES), MUSIC, FPS)
    // desired 1.3, beat 1.5, next word at 1.6 → snapped to 1.5
    expect(t.scenes[1].from).toBe(Math.round(1.5 * FPS))
  })

  it("does not snap past the next scene's first word", () => {
    const times = { ...TIMES, title: [1.5, 2.4] as [number, number] }
    const t = buildTimeline(wordsAt(times), MUSIC, FPS)
    // desired 1.2, beat 1.5 would sit on the word → stays 1.2
    expect(t.scenes[1].from).toBe(Math.round(1.2 * FPS))
  })

  it('does not snap when the nearest beat is more than 0.25 s away', () => {
    const music = { ...MUSIC, firstBeatSec: 0.0 } // beats 1.0, 2.0
    const times = { ...TIMES, hook: [0.2, 0.6] as [number, number], title: [1.8, 2.4] as [number, number] }
    const t = buildTimeline(wordsAt(times), music, FPS)
    expect(t.scenes[1].from).toBe(Math.round(1.5 * FPS))
  })

  it('makes scenes contiguous and ends 2.4 s after the last word', () => {
    const t = buildTimeline(wordsAt(TIMES), FAR, FPS)
    for (let i = 1; i < t.scenes.length; i++) {
      expect(t.scenes[i].from).toBe(t.scenes[i - 1].from + t.scenes[i - 1].durationInFrames)
    }
    const last = t.scenes[t.scenes.length - 1]
    expect(last.from + last.durationInFrames).toBe(t.durationInFrames)
    expect(t.durationInFrames).toBe(Math.round((9.4 + 0.4 + 2.0) * FPS))
  })

  it('keeps every word inside its scene', () => {
    const t = buildTimeline(wordsAt(TIMES), MUSIC, FPS)
    for (const s of t.scenes) {
      for (const w of s.words) {
        expect(w.from).toBeGreaterThanOrEqual(0)
        expect(w.to).toBeLessThanOrEqual(s.durationInFrames)
      }
    }
  })

  it('applies sceneShiftSec to words and voiceover clip', () => {
    const music = { ...FAR, sceneShiftSec: { hero: 0.3 } }
    const t = buildTimeline(wordsAt(TIMES), music, FPS)
    const hero = t.scenes[2]
    expect(hero.from + hero.words[0].from).toBe(Math.round(3.7 * FPS))
    expect(hero.vo.at - hero.vo.trimBefore).toBe(Math.round(0.3 * FPS))
  })

  it('plays the voiceover seamlessly when nothing is shifted', () => {
    const t = buildTimeline(wordsAt(TIMES), FAR, FPS)
    t.scenes.forEach((s, i) => {
      expect(s.vo.at).toBe(s.vo.trimBefore)
      const next = t.scenes[i + 1]
      if (next) expect(s.vo.trimBefore + (s.vo.durationInFrames ?? 0)).toBe(next.vo.trimBefore)
      else expect(s.vo.durationInFrames).toBeUndefined()
    })
  })

  it('throws when a shift makes scenes overlap', () => {
    const music = { ...FAR, sceneShiftSec: { title: -1.0 } }
    expect(() => buildTimeline(wordsAt(TIMES), music, FPS)).toThrow(/title.*overlaps/)
  })

  it('throws naming the scene when words.json lacks it', () => {
    const words = wordsAt(TIMES).filter((w) => w.scene !== 'triplet')
    expect(() => buildTimeline(words, FAR, FPS)).toThrow(/"triplet"/)
  })
})
