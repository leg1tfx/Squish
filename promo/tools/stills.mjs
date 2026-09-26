// One still per scene, ~70 % into it, for the visual check (spec 7).
// Scene frames come from out/scene-frames.json (written by src/timeline.frames.test.ts).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'

const frames = JSON.parse(readFileSync('out/scene-frames.json', 'utf8'))
const only = process.argv[2]
mkdirSync('out/stills', { recursive: true })
for (const { id, from, durationInFrames } of frames) {
  if (only && id !== only) continue
  const frame = from + Math.round(durationInFrames * 0.7)
  execFileSync('npx', ['remotion', 'still', 'src/index.ts', 'Promo', `out/stills/${id}.png`, `--frame=${frame}`], { shell: true, stdio: 'inherit' })
}
console.log('stills in out/stills')
