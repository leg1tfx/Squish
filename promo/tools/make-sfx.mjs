// Synthesizes the three quiet SFX with ffmpeg. No third-party samples, no licensing.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const dir = 'public/audio/sfx'
mkdirSync(dir, { recursive: true })
const run = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' })

// Soft air whoosh: pink noise, band-passed, swelling in and out over 0.6 s.
run(['-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=0.6:amplitude=0.5', '-af',
  "bandpass=f=1800:width_type=o:w=2,volume='sin(PI*t/0.6)':eval=frame,volume=-14dB", `${dir}/whoosh.wav`])
// Fine click: 2 kHz blip, 25 ms, fast decay.
run(['-f', 'lavfi', '-i', "aevalsrc='sin(2*PI*2000*t)*exp(-t*180)':d=0.025", '-af', 'volume=-12dB', `${dir}/click.wav`])
// Low warm thud: 70 Hz sine with a short pitch drop and decay.
run(['-f', 'lavfi', '-i', "aevalsrc='sin(2*PI*(70+60*exp(-t*30))*t)*exp(-t*7)':d=0.7", '-af', 'volume=-6dB', `${dir}/thud.wav`])
console.log('sfx written to', dir)
