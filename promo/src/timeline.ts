export type SceneId = 'hook' | 'title' | 'hero' | 'countdown' | 'triplet' | 'endcard'
export const SCENES: readonly SceneId[] = ['hook', 'title', 'hero', 'countdown', 'triplet', 'endcard']

export type Word = { word: string; start: number; end: number; scene: SceneId }
export type MusicConfig = {
  offsetSec: number
  bpm: number
  firstBeatSec: number
  sceneShiftSec: Partial<Record<SceneId, number>>
}
export type TimedWord = { text: string; from: number; to: number }
export type VoClip = { at: number; trimBefore: number; durationInFrames?: number }
export type SceneTiming = { id: SceneId; from: number; durationInFrames: number; words: TimedWord[]; vo: VoClip }
export type Timeline = { fps: number; durationInFrames: number; scenes: SceneTiming[] }

const LEAD = 0.3 // scene starts this long before its first word
const TAIL = 0.4 // last word of a scene has at least this much air (spec 5.3)
const OUTRO = 2.0 // song-only ending after the last word
const SNAP = 0.25 // max distance a cut may move to reach a beat
const MIN_GAP = 0.1 // cut never closer than this to the previous scene's last word
const PRE_WORD = 0.05 // cut never closer than this before the next scene's first word

export function snapToBeat(t: number, music: MusicConfig): number {
  const beat = 60 / music.bpm
  return music.firstBeatSec + Math.round((t - music.firstBeatSec) / beat) * beat
}

export function buildTimeline(words: Word[], music: MusicConfig, fps: number): Timeline {
  const groups = SCENES.map((id) => {
    const ws = words.filter((w) => w.scene === id).sort((a, b) => a.start - b.start)
    if (ws.length === 0) throw new Error(`words.json has no words for scene "${id}". Re-run tools/align.py.`)
    const shift = music.sceneShiftSec[id] ?? 0
    return { id, ws, shift, first: ws[0].start + shift, last: ws[ws.length - 1].end + shift }
  })

  // Cut times in video seconds: cuts[i] is where scene i starts.
  const cuts = [0]
  for (let i = 1; i < groups.length; i++) {
    const prev = groups[i - 1]
    const cur = groups[i]
    const lower = prev.last + MIN_GAP
    const upper = cur.first - PRE_WORD
    if (lower > upper) {
      throw new Error(`scene "${cur.id}" overlaps scene "${prev.id}". Reduce sceneShiftSec in music.ts.`)
    }
    const cut = Math.min(Math.max(cur.first - LEAD, lower), upper)
    const snapped = snapToBeat(cut, music)
    cuts.push(Math.abs(snapped - cut) <= SNAP && snapped >= lower && snapped <= upper ? snapped : cut)
  }
  const endSec = groups[groups.length - 1].last + TAIL + OUTRO

  // Voiceover file boundaries: midpoint of the silence between scenes, unshifted.
  const fileCuts = [0]
  for (let i = 1; i < groups.length; i++) {
    const prevEnd = groups[i - 1].ws[groups[i - 1].ws.length - 1].end
    fileCuts.push((prevEnd + groups[i].ws[0].start) / 2)
  }

  const f = (s: number) => Math.round(s * fps)
  const scenes = groups.map((g, i): SceneTiming => {
    const from = f(cuts[i])
    const to = i + 1 < cuts.length ? f(cuts[i + 1]) : f(endSec)
    let at = f(fileCuts[i] + g.shift)
    let trimBefore = f(fileCuts[i])
    if (at < 0) {
      trimBefore -= at
      at = 0
    }
    const vo: VoClip = { at, trimBefore }
    if (i + 1 < fileCuts.length) vo.durationInFrames = f(fileCuts[i + 1]) - trimBefore
    return {
      id: g.id,
      from,
      durationInFrames: to - from,
      words: g.ws.map((w) => ({ text: w.word, from: f(w.start + g.shift) - from, to: f(w.end + g.shift) - from })),
      vo
    }
  })
  return { fps, durationInFrames: f(endSec), scenes }
}
