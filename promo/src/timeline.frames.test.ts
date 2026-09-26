import { mkdirSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { MUSIC } from './music'
import { FPS } from './theme'
import { buildTimeline, type Word } from './timeline'
import words from './words.json'

it('writes out/scene-frames.json from the real words.json', () => {
  const t = buildTimeline(words as Word[], MUSIC, FPS)
  mkdirSync('out', { recursive: true })
  writeFileSync('out/scene-frames.json', JSON.stringify(t.scenes.map(({ id, from, durationInFrames }) => ({ id, from, durationInFrames }))))
})
