// Two-pass loudnorm to -14 LUFS / -1 dBTP, video stream copied (spec 2, 7).
import { execFileSync, spawnSync } from 'node:child_process'

const IN = 'out/promo.mp4'
const OUT = 'out/promo-final.mp4'
const target = 'I=-14:TP=-1:LRA=11'

const pass1 = spawnSync('ffmpeg', ['-hide_banner', '-i', IN, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' })
const json = JSON.parse(pass1.stderr.slice(pass1.stderr.lastIndexOf('{'), pass1.stderr.lastIndexOf('}') + 1))
const measured = `measured_I=${json.input_i}:measured_TP=${json.input_tp}:measured_LRA=${json.input_lra}:measured_thresh=${json.input_thresh}:offset=${json.target_offset}:linear=true`
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', IN, '-c:v', 'copy', '-af', `loudnorm=${target}:${measured}`, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT], { stdio: 'inherit' })
console.log(`mastered → ${OUT}`)
