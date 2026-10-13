# Pyno's Squish Promo-Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein ca. 20 s langes Apple-Style-Typo-Promo-Video (1440×1080) für Pyno's Squish, gerendert mit Remotion, getaktet an einem lokal erzeugten AI-Voiceover und an „24K Magic“ als Guide-Spur.

**Architecture:** Ein eigenständiges Remotion-Projekt unter `promo/`. Python-Tools erzeugen das Voiceover (Kokoro) und die Wortzeiten (faster-whisper) als `src/words.json`. Eine reine TS-Funktion `buildTimeline()` leitet daraus Szenen, Wort-Frames, Voiceover-Abschnitte und Beat-gerastete Schnitte ab. Sechs Szenen-Komponenten rendern nur aus dieser Timeline. `Promo` ist die Upload-Version ohne Song, `PromoPreview` rendert den Song zum lokalen Ansehen mit.

**Tech Stack:** Remotion 4.0.x (`remotion`, `@remotion/cli`), React 19, TypeScript 5.9, Vitest, `@fontsource` (Inter, Fraunces, JetBrains Mono), Python 3.12 (kokoro 0.7.x, faster-whisper 1.2.x, soundfile, pytest), ffmpeg (im PATH).

**Spec:** `docs/superpowers/specs/2026-09-26-promo-video-design.md`

## Global Constraints

- Format 1440×1080, 30 fps, Ausgabe H.264 ca. 12 Mbit/s, AAC 192k, −14 LUFS integriert, True Peak ≤ −1 dBTP.
- Marke immer „Pyno's“ mit Apostroph in allem Sichtbaren. Identifier ohne Apostroph (`pynos-squish-promo`).
- Farben nur aus `src/renderer/src/styles/tokens.css`, kopiert nach `promo/src/theme.ts` mit Quellkommentar. Kein Import über die Projektgrenze.
- Gold (`#d4af37` bzw. `#e2bf55`) höchstens einmal pro Szene.
- Mindestens 120 px Abstand zwischen Text und Bildrand.
- Springs mit hoher Dämpfung (`damping: 200`), keine Standard-Ease-Fades.
- „24K Magic“ (`public/audio/guide.mp3`) darf nie ins Repo und nie in `Promo`/`out/promo-final.mp4`. Nur `PromoPreview` referenziert die Datei.
- `promo/` beeinflusst App-Build, App-Tests und `electron-builder` nicht.
- Skript-Wording exakt: „Forty-eight megabytes. Too big to send. / Meet Pyno's Squish. / Drop in your video. Choose where it's going. / Squish makes it fit. Every time. / Big video. Small file. Same resolution. / Free. Link in bio.“
- Plattform-Namen nur als Preset-Text („Discord · 10 MB“), keine fremden Logos oder Oberflächen.

## Review Focus

1. **Whisper schreibt Zahlen als Ziffern oder verschluckt ein Wort.** Trotzdem muss jedes Skript-Token eine Zeit bekommen, monoton steigend. Test: `test_align_digits_heard`, `test_align_missing_word_interpolated` (Task 2).
2. **`sceneShiftSec` schiebt eine Szene in die vorige.** Erwartet wird ein klarer Fehler statt überlappender Szenen oder abgeschnittener Wörter. Test: `throws when a shift makes scenes overlap` (Task 1).
3. **Der Beat-Snap würde einen Schnitt hinter das erste Wort der nächsten Szene legen.** Dann wird nicht gerastet. Test: `does not snap past the next scene's first word` (Task 1).
4. **Das Skript wurde bearbeitet, und `words.json` enthält eine Szene nicht mehr.** Erwartet wird ein Fehler, der die Szene nennt, statt einer leeren Szene. Test: `throws naming the scene when words.json lacks it` (Task 1).
5. **`guide.mp3` fehlt beim Upload-Render.** `Promo` muss trotzdem rendern, weil nur `PromoPreview` den Song lädt. Test: Render von `Promo` ohne `guide.mp3` und `ffprobe`-Check (Task 9).

---

## File Structure

```
promo/
├─ package.json, tsconfig.json, remotion.config.ts, vitest.config.ts, .gitignore
├─ script.txt                 Skript mit [szene]-Markern und {Anzeige|Gesprochen}
├─ requirements.txt
├─ tools/
│  ├─ scriptfile.py           parse_script(), spoken_lines()
│  ├─ align_core.py           align(tokens, heard) → Wortzeiten
│  ├─ tts.py                  Kokoro → public/audio/voiceover.wav (+ Proben)
│  ├─ align.py                faster-whisper → src/words.json
│  ├─ make-sfx.mjs            ffmpeg-Synthese → public/audio/sfx/*.wav
│  ├─ stills.mjs              ein Still pro Szene → out/stills/*.png
│  ├─ master.mjs              2-Pass-loudnorm → out/promo-final.mp4
│  └─ tests/test_scriptfile.py, tests/test_align_core.py
├─ public/audio/              voiceover.wav, samples/, sfx/, guide.mp3 (ignoriert)
└─ src/
   ├─ index.ts, Root.tsx      registerRoot, Kompositionen Promo + PromoPreview
   ├─ theme.ts                Farben, Fonts, Spring-Config, Layout-Konstanten
   ├─ fonts.ts                @fontsource-Imports + delayRender bis geladen
   ├─ music.ts                MUSIC-Config (offsetSec, bpm, firstBeatSec, sceneShiftSec)
   ├─ timeline.ts             buildTimeline(), snapToBeat(), Typen
   ├─ timeline.test.ts
   ├─ words.json              Wortzeiten (erst Platzhalter, später generiert)
   ├─ lib/format.ts           formatMb(), countdownValue()
   ├─ lib/format.test.ts
   ├─ components/             RevealWord, WordLine, SceneShell, AppWindow, SquishIcon
   ├─ scenes/                 Hook, Title, Hero, Countdown, Triplet, Endcard
   └─ Promo.tsx               Sequenzen, VO-Abschnitte, SFX, optional Song
```

---

### Task 1: Projektgerüst und Timeline-Logik

**Files:**
- Create: `promo/package.json`, `promo/tsconfig.json`, `promo/remotion.config.ts`, `promo/vitest.config.ts`, `promo/.gitignore`
- Create: `promo/src/music.ts`, `promo/src/timeline.ts`, `promo/src/timeline.test.ts`, `promo/src/words.json`

**Interfaces:**
- Produces:
  - `type SceneId = 'hook' | 'title' | 'hero' | 'countdown' | 'triplet' | 'endcard'`
  - `const SCENES: readonly SceneId[]` in dieser Reihenfolge
  - `type Word = { word: string; start: number; end: number; scene: SceneId }`, Zeiten in Sekunden, bezogen auf die Voiceover-Datei
  - `type MusicConfig = { offsetSec: number; bpm: number; firstBeatSec: number; sceneShiftSec: Partial<Record<SceneId, number>> }`
  - `type TimedWord = { text: string; from: number; to: number }`, Frames relativ zum Szenenstart
  - `type VoClip = { at: number; trimBefore: number; durationInFrames?: number }`, alles in Frames, `at` absolut
  - `type SceneTiming = { id: SceneId; from: number; durationInFrames: number; words: TimedWord[]; vo: VoClip }`
  - `type Timeline = { fps: number; durationInFrames: number; scenes: SceneTiming[] }`
  - `function buildTimeline(words: Word[], music: MusicConfig, fps: number): Timeline`
  - `function snapToBeat(t: number, music: MusicConfig): number`, gibt den nächsten Beat zurück
  - `const MUSIC: MusicConfig` in `music.ts`

- [x] **Step 1: Gerüst anlegen**

`promo/package.json`:

```json
{
  "name": "pynos-squish-promo",
  "private": true,
  "type": "module",
  "scripts": {
    "studio": "remotion studio src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "sfx": "node tools/make-sfx.mjs",
    "stills": "vitest run src/timeline.frames.test.ts && node tools/stills.mjs",
    "render": "remotion render src/index.ts Promo out/promo.mp4 --codec=h264 --video-bitrate=12M --audio-bitrate=192k && node tools/master.mjs",
    "render:preview": "remotion render src/index.ts PromoPreview out/promo-preview-with-song.mp4 --codec=h264 --video-bitrate=12M --audio-bitrate=192k"
  },
  "dependencies": {
    "@fontsource/fraunces": "^5.3.0",
    "@fontsource/inter": "^5.3.0",
    "@fontsource/jetbrains-mono": "^5.3.0",
    "@remotion/cli": "4.0.529",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "remotion": "4.0.529"
  },
  "devDependencies": {
    "@types/node": "^24.13.6",
    "@types/react": "^19.3.0",
    "typescript": "~5.9.3",
    "vitest": "^5.0.1"
  }
}
```

`promo/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

`promo/remotion.config.ts`:

```ts
import { Config } from '@remotion/cli/config'

Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)
```

`promo/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['src/**/*.test.ts'], environment: 'node' } })
```

`promo/.gitignore`:

```
node_modules/
out/
.venv/
__pycache__/
public/audio/guide.mp3
public/audio/samples/
public/audio/voiceover.wav
public/audio/sfx/
```

`promo/src/music.ts`:

```ts
import type { MusicConfig } from './timeline'

// Guide track: "24K Magic" from the punchy part. Local only, see spec 5.2.
// offsetSec/firstBeatSec are tuned by ear in Remotion Studio.
export const MUSIC: MusicConfig = {
  offsetSec: 23.0,
  bpm: 107,
  firstBeatSec: 0.0,
  sceneShiftSec: {}
}
```

Run: `cd promo && npm install`
Expected: Installiert ohne Fehler.

- [x] **Step 2: Failing Tests für `buildTimeline` schreiben**

`promo/src/timeline.test.ts`:

```ts
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

  it('does not snap past the next scene\'s first word', () => {
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
```

- [x] **Step 3: Tests laufen lassen, sie müssen fehlschlagen**

Run: `cd promo && npx vitest run src/timeline.test.ts`
Expected: FAIL mit „Failed to resolve import ./timeline“.

- [x] **Step 4: `timeline.ts` implementieren**

`promo/src/timeline.ts`:

```ts
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
```

- [x] **Step 5: Tests laufen lassen, sie müssen grün sein**

Run: `cd promo && npx vitest run src/timeline.test.ts`
Expected: PASS, 12 Tests.

- [x] **Step 6: Platzhalter-`words.json` anlegen**

`promo/src/words.json` enthält handgeschätzte Zeiten nach Storyboard und wird in Task 3 überschrieben:

```json
[
  { "word": "48 MB.", "start": 0.20, "end": 1.30, "scene": "hook" },
  { "word": "Too", "start": 1.45, "end": 1.62, "scene": "hook" },
  { "word": "big", "start": 1.62, "end": 1.80, "scene": "hook" },
  { "word": "to", "start": 1.80, "end": 1.90, "scene": "hook" },
  { "word": "send.", "start": 1.90, "end": 2.20, "scene": "hook" },
  { "word": "Meet", "start": 2.80, "end": 3.05, "scene": "title" },
  { "word": "Pyno's", "start": 3.10, "end": 3.50, "scene": "title" },
  { "word": "Squish.", "start": 3.50, "end": 4.10, "scene": "title" },
  { "word": "Drop", "start": 5.00, "end": 5.20, "scene": "hero" },
  { "word": "in", "start": 5.20, "end": 5.30, "scene": "hero" },
  { "word": "your", "start": 5.30, "end": 5.45, "scene": "hero" },
  { "word": "video.", "start": 5.45, "end": 5.95, "scene": "hero" },
  { "word": "Choose", "start": 6.40, "end": 6.70, "scene": "hero" },
  { "word": "where", "start": 6.70, "end": 6.90, "scene": "hero" },
  { "word": "it's", "start": 6.90, "end": 7.05, "scene": "hero" },
  { "word": "going.", "start": 7.05, "end": 7.60, "scene": "hero" },
  { "word": "Squish", "start": 9.60, "end": 9.95, "scene": "countdown" },
  { "word": "makes", "start": 9.95, "end": 10.20, "scene": "countdown" },
  { "word": "it", "start": 10.20, "end": 10.30, "scene": "countdown" },
  { "word": "fit.", "start": 10.30, "end": 10.80, "scene": "countdown" },
  { "word": "Every", "start": 11.30, "end": 11.60, "scene": "countdown" },
  { "word": "time.", "start": 11.60, "end": 12.20, "scene": "countdown" },
  { "word": "Big", "start": 13.60, "end": 13.85, "scene": "triplet" },
  { "word": "video.", "start": 13.85, "end": 14.30, "scene": "triplet" },
  { "word": "Small", "start": 14.70, "end": 15.00, "scene": "triplet" },
  { "word": "file.", "start": 15.00, "end": 15.40, "scene": "triplet" },
  { "word": "Same", "start": 15.80, "end": 16.05, "scene": "triplet" },
  { "word": "resolution.", "start": 16.05, "end": 16.80, "scene": "triplet" },
  { "word": "Free.", "start": 17.40, "end": 17.90, "scene": "endcard" },
  { "word": "Link", "start": 18.30, "end": 18.50, "scene": "endcard" },
  { "word": "in", "start": 18.50, "end": 18.60, "scene": "endcard" },
  { "word": "bio.", "start": 18.60, "end": 19.00, "scene": "endcard" }
]
```

- [x] **Step 7: Typecheck und Commit**

Run: `cd promo && npm run typecheck && npm test`
Expected: keine Fehler, Tests grün.

```bash
git add promo/package.json promo/package-lock.json promo/tsconfig.json promo/remotion.config.ts promo/vitest.config.ts promo/.gitignore promo/src/music.ts promo/src/timeline.ts promo/src/timeline.test.ts promo/src/words.json
git commit -m "feat(promo): remotion scaffold and beat-snapped timeline"
```

---

### Task 2: Skriptdatei und Wort-Alignment (Python, rein)

**Files:**
- Create: `promo/script.txt`, `promo/requirements.txt`
- Create: `promo/tools/scriptfile.py`, `promo/tools/align_core.py`
- Test: `promo/tools/tests/test_scriptfile.py`, `promo/tools/tests/test_align_core.py`

**Interfaces:**
- Produces:
  - `Token = NamedTuple(display: str, spoken: str, scene: str)`
  - `parse_script(text: str) -> list[Token]`
  - `spoken_lines(tokens: list[Token]) -> list[str]`, eine Zeile pro Szene, für TTS
  - `align(tokens: list[Token], heard: list[tuple[str, float, float]]) -> list[dict]`, Dicts mit `word, start, end, scene` im `words.json`-Format aus Task 1
  - `AlignmentError(Exception)`

- [x] **Step 1: Python-Umgebung**

`promo/requirements.txt`:

```
kokoro==0.7.16
faster-whisper==1.2.1
soundfile>=0.12
numpy>=1.26
pytest>=8
```

Run: `cd promo && py -3.12 -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt`
Expected: Installation erfolgreich. kokoro zieht torch (CPU) und misaki mit.

- [x] **Step 2: `script.txt` anlegen**

Syntax: `[szene]` startet eine Szene. `{Anzeige|Gesprochen}` ist ein Token, das im Video als „Anzeige“ erscheint und als „Gesprochen“ an die TTS geht. Alle anderen Wörter sind je ein Token.

`promo/script.txt`:

```
[hook]
{48 MB.|Forty-eight megabytes.} Too big to send.
[title]
Meet Pyno's Squish.
[hero]
Drop in your video. Choose where it's going.
[countdown]
Squish makes it fit. Every time.
[triplet]
Big video. Small file. Same resolution.
[endcard]
Free. Link in bio.
```

- [x] **Step 3: Failing Tests schreiben**

`promo/tools/tests/test_scriptfile.py`:

```python
import pytest
from scriptfile import Token, parse_script, spoken_lines

SRC = "[hook]\n{48 MB.|Forty-eight megabytes.} Too big.\n[title]\nMeet Pyno's Squish.\n"


def test_parse_tokens_and_scenes():
    toks = parse_script(SRC)
    assert toks[0] == Token("48 MB.", "Forty-eight megabytes.", "hook")
    assert toks[1] == Token("Too", "Too", "hook")
    assert [t.display for t in toks if t.scene == "title"] == ["Meet", "Pyno's", "Squish."]


def test_spoken_lines_one_per_scene():
    assert spoken_lines(parse_script(SRC)) == [
        "Forty-eight megabytes. Too big.",
        "Meet Pyno's Squish.",
    ]


def test_text_before_first_scene_is_an_error():
    with pytest.raises(ValueError, match="scene marker"):
        parse_script("Hello\n[hook]\nHi.")
```

`promo/tools/tests/test_align_core.py`:

```python
import pytest
from align_core import AlignmentError, align
from scriptfile import parse_script

SRC = "[hook]\n{48 MB.|Forty-eight megabytes.} Too big to send.\n[title]\nMeet Pyno's Squish.\n"


def heard_exact():
    return [
        ("Forty-eight", 0.20, 0.70), ("megabytes.", 0.70, 1.30), ("Too", 1.45, 1.62),
        ("big", 1.62, 1.80), ("to", 1.80, 1.90), ("send.", 1.90, 2.20),
        ("Meet", 2.80, 3.05), ("Pyno's", 3.10, 3.50), ("Squish.", 3.50, 4.10),
    ]


def test_align_exact():
    out = align(parse_script(SRC), heard_exact())
    assert out[0] == {"word": "48 MB.", "start": 0.20, "end": 1.30, "scene": "hook"}
    assert out[-1] == {"word": "Squish.", "start": 3.50, "end": 4.10, "scene": "title"}
    assert len(out) == 8


def test_align_digits_heard():
    heard = [("48", 0.20, 0.70), ("megabytes.", 0.70, 1.30)] + heard_exact()[2:]
    out = align(parse_script(SRC), heard)
    assert out[0]["word"] == "48 MB."
    assert out[0]["start"] == pytest.approx(0.20)
    assert out[0]["end"] == pytest.approx(1.30)


def test_align_missing_word_interpolated():
    heard = [h for h in heard_exact() if h[0] != "to"]
    out = align(parse_script(SRC), heard)
    to = next(w for w in out if w["word"] == "to")
    assert 1.80 <= to["start"] < to["end"] <= 1.90
    starts = [w["start"] for w in out]
    assert starts == sorted(starts)


def test_align_nothing_matches_raises():
    with pytest.raises(AlignmentError):
        align(parse_script(SRC), [("banana", 0.0, 1.0)])
```

`promo/tools/tests/conftest.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
```

- [x] **Step 4: Tests laufen lassen, sie müssen fehlschlagen**

Run: `cd promo && .venv/Scripts/python -m pytest tools/tests -q`
Expected: FAIL mit `ModuleNotFoundError: No module named 'scriptfile'`.

- [x] **Step 5: `scriptfile.py` implementieren**

`promo/tools/scriptfile.py`:

```python
"""Parses promo/script.txt: [scene] markers and {display|spoken} tokens."""
import re
from typing import NamedTuple


class Token(NamedTuple):
    display: str
    spoken: str
    scene: str


_TOKEN = re.compile(r"\{([^|}]+)\|([^}]+)\}|(\S+)")


def parse_script(text: str) -> list[Token]:
    tokens: list[Token] = []
    scene: str | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.fullmatch(r"\[([a-z]+)\]", line)
        if m:
            scene = m.group(1)
            continue
        if scene is None:
            raise ValueError(f"text before the first scene marker: {line!r}")
        for t in _TOKEN.finditer(line):
            if t.group(3):
                tokens.append(Token(t.group(3), t.group(3), scene))
            else:
                tokens.append(Token(t.group(1).strip(), t.group(2).strip(), scene))
    return tokens


def spoken_lines(tokens: list[Token]) -> list[str]:
    lines: list[str] = []
    scene = None
    for t in tokens:
        if t.scene != scene:
            lines.append(t.spoken)
            scene = t.scene
        else:
            lines[-1] += " " + t.spoken
    return lines
```

- [x] **Step 6: `align_core.py` implementieren**

`promo/tools/align_core.py`:

```python
"""Maps whisper word timings onto script tokens (display text keeps its spelling)."""
import re
from difflib import SequenceMatcher

from scriptfile import Token


class AlignmentError(Exception):
    pass


_ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def _num_words(n: int) -> list[str]:
    if n < 20:
        return [_ONES[n]]
    if n < 100:
        return [_TENS[n // 10]] + ([_ONES[n % 10]] if n % 10 else [])
    if n < 1000:
        rest = n % 100
        return [_ONES[n // 100], "hundred"] + (_num_words(rest) if rest else [])
    return [str(n)]


def _norm(text: str) -> list[str]:
    out: list[str] = []
    for part in re.split(r"[\s\-]+", text.lower()):
        part = re.sub(r"[^a-z0-9']", "", part).replace("'", "")
        if not part:
            continue
        out.extend(_num_words(int(part)) if part.isdigit() else [part])
    return out


def align(tokens: list[Token], heard: list[tuple[str, float, float]]) -> list[dict]:
    # Script side: normalized sub-words, each remembering its token.
    spoken: list[str] = []
    owner: list[int] = []
    for i, t in enumerate(tokens):
        for w in _norm(t.spoken):
            spoken.append(w)
            owner.append(i)

    # Heard side: split multi-word entries (e.g. "48" → forty eight) evenly in time.
    words: list[str] = []
    times: list[tuple[float, float]] = []
    for text, start, end in heard:
        parts = _norm(text)
        step = (end - start) / max(len(parts), 1)
        for k, p in enumerate(parts):
            words.append(p)
            times.append((start + k * step, start + (k + 1) * step))

    t: list[tuple[float, float] | None] = [None] * len(spoken)
    for block in SequenceMatcher(a=spoken, b=words, autojunk=False).get_matching_blocks():
        for k in range(block.size):
            t[block.a + k] = times[block.b + k]
    if all(x is None for x in t):
        raise AlignmentError("no script word was found in the transcription")

    # Fill gaps: spread unmatched sub-words between the neighboring anchors by length.
    i = 0
    while i < len(t):
        if t[i] is not None:
            i += 1
            continue
        j = i
        while j < len(t) and t[j] is None:
            j += 1
        left = t[i - 1][1] if i > 0 else next(x for x in t if x is not None)[0]
        right = t[j][0] if j < len(t) else left + 0.3 * (j - i)
        weights = [len(spoken[k]) for k in range(i, j)]
        total = sum(weights)
        pos = left
        for k, w in zip(range(i, j), weights):
            nxt = pos + (right - left) * w / total
            t[k] = (pos, nxt)
            pos = nxt
        i = j

    out: list[dict] = []
    for i, tok in enumerate(tokens):
        spans = [t[k] for k in range(len(spoken)) if owner[k] == i]
        out.append({
            "word": tok.display,
            "start": round(min(s for s, _ in spans), 3),
            "end": round(max(e for _, e in spans), 3),
            "scene": tok.scene,
        })
    return out
```

- [x] **Step 7: Tests laufen lassen, sie müssen grün sein**

Run: `cd promo && .venv/Scripts/python -m pytest tools/tests -q`
Expected: PASS, 7 Tests.

- [x] **Step 8: Commit**

```bash
git add promo/script.txt promo/requirements.txt promo/tools/scriptfile.py promo/tools/align_core.py promo/tools/tests
git commit -m "feat(promo): script parser and whisper-to-script word alignment"
```

---

### Task 3: Voiceover erzeugen und Wortzeiten schreiben (CLI)

**Files:**
- Create: `promo/tools/tts.py`, `promo/tools/align.py`
- Modify: `promo/src/words.json` (generiert)

**Interfaces:**
- Consumes: `parse_script`, `spoken_lines` (Task 2), `align`, `AlignmentError` (Task 2)
- Produces: `public/audio/voiceover.wav` (24 kHz mono) und `src/words.json` im Format `Word[]` aus Task 1

- [x] **Step 1: `tts.py` schreiben**

`promo/tools/tts.py`:

```python
"""Kokoro TTS: script.txt → public/audio/voiceover.wav, or voice samples to choose from.

  .venv/Scripts/python tools/tts.py --samples          → public/audio/samples/<voice>.wav
  .venv/Scripts/python tools/tts.py --voice am_onyx    → public/audio/voiceover.wav
"""
import argparse
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

from scriptfile import parse_script, spoken_lines

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_VOICES = ["am_michael", "am_onyx", "bm_george"]
RATE = 24_000
SCENE_GAP = 0.45  # silence between scenes, seconds


def synth(voice: str, speed: float) -> np.ndarray:
    lines = spoken_lines(parse_script((ROOT / "script.txt").read_text(encoding="utf-8")))
    pipe = KPipeline(lang_code="b" if voice.startswith("b") else "a")
    gap = np.zeros(int(RATE * SCENE_GAP), dtype=np.float32)
    parts: list[np.ndarray] = [gap[: RATE // 5]]
    for line in lines:
        for result in pipe(line, voice=voice, speed=speed, split_pattern=None):
            parts.append(np.asarray(result.audio, dtype=np.float32))
        parts.append(gap)
    return np.concatenate(parts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", action="store_true")
    ap.add_argument("--voice", default="am_onyx")
    ap.add_argument("--speed", type=float, default=0.95)
    a = ap.parse_args()
    if a.samples:
        out_dir = ROOT / "public/audio/samples"
        out_dir.mkdir(parents=True, exist_ok=True)
        for v in SAMPLE_VOICES:
            sf.write(out_dir / f"{v}.wav", synth(v, a.speed), RATE)
            print(f"wrote {out_dir / f'{v}.wav'}")
        return
    out = ROOT / "public/audio/voiceover.wav"
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out, synth(a.voice, a.speed), RATE)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
```

- [x] **Step 2: Proben erzeugen**

Run: `cd promo && .venv/Scripts/python tools/tts.py --samples`
Expected: drei WAVs unter `public/audio/samples/`, jeweils ca. 15 bis 19 s. Falls misaki beim ersten Lauf das spaCy-Modell nachlädt, ist das normal.

- [x] **Step 3: CHECKPOINT Stimmwahl durch den Nutzer**

Die drei Proben an den Nutzer schicken (SendUserFile). Er wählt eine Stimme und prüft, ob „Pyno's“ richtig ausgesprochen wird. Klingt es falsch, wird in `script.txt` `Pyno's` durch `{Pyno's|<phonetisch>}` ersetzt (z. B. `{Pyno's|Pie-no's}`) und die Proben werden neu erzeugt. Weiter geht es erst nach der Wahl.

Run (mit gewählter Stimme, z. B. am_onyx): `cd promo && .venv/Scripts/python tools/tts.py --voice am_onyx`
Expected: `public/audio/voiceover.wav`.

- [x] **Step 4: `align.py` schreiben**

`promo/tools/align.py`:

```python
"""faster-whisper word timestamps on the voiceover → src/words.json.

  .venv/Scripts/python tools/align.py [--model small.en] [--device cpu|cuda]
"""
import argparse
import json
from pathlib import Path

from faster_whisper import WhisperModel

from align_core import align
from scriptfile import parse_script

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", default=str(ROOT / "public/audio/voiceover.wav"))
    ap.add_argument("--model", default="small.en")
    ap.add_argument("--device", default="cpu")
    a = ap.parse_args()

    tokens = parse_script((ROOT / "script.txt").read_text(encoding="utf-8"))
    model = WhisperModel(a.model, device=a.device, compute_type="int8" if a.device == "cpu" else "float16")
    prompt = " ".join(t.spoken for t in tokens)
    segments, _ = model.transcribe(a.audio, language="en", word_timestamps=True, initial_prompt=prompt)
    heard = [(w.word.strip(), w.start, w.end) for s in segments for w in (s.words or [])]

    words = align(tokens, heard)
    out = ROOT / "src/words.json"
    out.write_text(json.dumps(words, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    matched = len(heard)
    print(f"wrote {out}: {len(words)} tokens from {matched} heard words")


if __name__ == "__main__":
    main()
```

- [x] **Step 5: Wortzeiten erzeugen und prüfen**

Run: `cd promo && .venv/Scripts/python tools/align.py`
Expected: „wrote …/src/words.json: 32 tokens from ~33 heard words“. In `words.json` steigen die Startzeiten monoton, der erste Eintrag ist `"48 MB."`.

Run: `cd promo && npm test`
Expected: PASS. Die Tests hängen nicht an `words.json`, das hier ist nur ein Sanity-Check nach dem Überschreiben.

- [x] **Step 6: Commit**

```bash
git add promo/tools/tts.py promo/tools/align.py promo/src/words.json promo/script.txt
git commit -m "feat(promo): kokoro voiceover and whisper word timings"
```

---

### Task 4: Theme, Fonts, Grund-Komponenten und Kompositionen

**Files:**
- Create: `promo/src/theme.ts`, `promo/src/fonts.ts`
- Create: `promo/src/components/RevealWord.tsx`, `promo/src/components/WordLine.tsx`, `promo/src/components/SceneShell.tsx`
- Create: `promo/src/Promo.tsx`, `promo/src/Root.tsx`, `promo/src/index.ts`
- Create: `promo/src/scenes/index.ts`, `promo/src/scenes/Placeholder.tsx` (vorläufig: jede Szene rendert nur ihre `WordLine`)
- Create: `promo/src/timeline.frames.test.ts`, `promo/tools/stills.mjs`

**Interfaces:**
- Consumes: `buildTimeline`, `SceneTiming`, `TimedWord`, `SceneId` (Task 1), `MUSIC` (Task 1), `words.json`
- Produces:
  - `theme.ts`: `C` (Farbobjekt), `FONT` (`display`, `body`, `mono`), `SPRING = { damping: 200 }`, `MARGIN = 120`, `W = 1440`, `H = 1080`, `FPS = 30`
  - `<RevealWord text from style? />`: blendet ab dem Szenen-Frame `from` ein (Blur 12→0, y 16→0, Opazität 0→1)
  - `<WordLine words size weight? font? tone? style? />`: Wörter nebeneinander. Aktives Wort in `C.ink`, bereits gesagte in `C.ink2`. Mit `tone="gold"` ist die ganze Zeile gold
  - `<SceneShell durationInFrames>`: zentrierter Vollbild-Container, spring-basierter Exit in den letzten 10 Frames
  - `type SceneProps = { t: SceneTiming }`, `SCENE_COMPONENTS: Record<SceneId, React.FC<SceneProps>>`
  - `<Promo withSong: boolean />`, Kompositionen `Promo` (`withSong: false`) und `PromoPreview` (`withSong: true`)
  - `TIMELINE` in `Promo.tsx` exportiert (für Root und `stills.mjs`-Frame-Berechnung)

- [x] **Step 1: `theme.ts` und `fonts.ts`**

`promo/src/theme.ts`:

```ts
// Copied from src/renderer/src/styles/tokens.css (app). Keep in sync by hand.
export const C = {
  ground: '#0b1416', surface: '#111d20', surfaceRaised: '#172629', surfaceSunken: '#081012',
  hairline: '#22363b', rule: '#587479',
  ink: '#eef2ee', ink2: '#bccaca', ink3: '#8fa3a6',
  gold: '#d4af37', goldHover: '#f0d27a', goldText: '#e2bf55', onGold: '#16120a',
  goldWash: 'rgba(212, 175, 55, 0.14)', circuit: '#4fd6c0', negative: '#ff8a70'
} as const

export const FONT = {
  display: "'Fraunces', Georgia, serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', Consolas, monospace"
} as const

export const SPRING = { damping: 200 } as const
export const MARGIN = 120
export const W = 1440
export const H = 1080
export const FPS = 30
```

`promo/src/fonts.ts`:

```ts
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/jetbrains-mono/500.css'
import { continueRender, delayRender } from 'remotion'

const handle = delayRender('Loading fonts')
Promise.all([
  document.fonts.load("400 48px 'Inter'"),
  document.fonts.load("600 48px 'Inter'"),
  document.fonts.load("600 48px 'Fraunces'"),
  document.fonts.load("500 48px 'JetBrains Mono'")
]).then(() => continueRender(handle))
```

- [x] **Step 2: Grund-Komponenten**

`promo/src/components/RevealWord.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { SPRING } from '../theme'

export function RevealWord({ text, from, style }: { text: string; from: number; style?: CSSProperties }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = spring({ frame: frame - from, fps, config: SPRING, durationInFrames: 14 })
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
```

`promo/src/components/WordLine.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { useCurrentFrame } from 'remotion'
import type { TimedWord } from '../timeline'
import { C, FONT } from '../theme'
import { RevealWord } from './RevealWord'

type Props = { words: TimedWord[]; size: number; weight?: number; font?: string; tone?: 'ink' | 'gold'; style?: CSSProperties }

// Spoken word in ink, already-said words step back to ink2 (spec 4). tone="gold" colors the whole line gold.
export function WordLine({ words, size, weight = 600, font = FONT.body, tone = 'ink', style }: Props) {
  const frame = useCurrentFrame()
  const activeIdx = words.reduce((acc, w, i) => (frame >= w.from ? i : acc), -1)
  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `0 ${size * 0.28}px`,
        fontFamily: font, fontSize: size, fontWeight: weight, letterSpacing: '-0.02em', lineHeight: 1.15,
        ...style
      }}
    >
      {words.map((w, i) => (
        <RevealWord key={i} text={w.text} from={w.from} style={{ color: tone === 'gold' ? C.gold : i === activeIdx ? C.ink : C.ink2 }} />
      ))}
    </div>
  )
}
```

`promo/src/components/SceneShell.tsx`:

```tsx
import type { ReactNode } from 'react'
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, MARGIN, SPRING } from '../theme'

export function SceneShell({ durationInFrames, children }: { durationInFrames: number; children: ReactNode }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const out = spring({ frame: frame - (durationInFrames - 10), fps, config: SPRING, durationInFrames: 10 })
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
```

- [x] **Step 3: Vorläufige Szenen, `Promo`, `Root`, `index`**

`promo/src/scenes/index.ts`:

```ts
import type { FC } from 'react'
import type { SceneId, SceneTiming } from '../timeline'
import { Placeholder } from './Placeholder'

export type SceneProps = { t: SceneTiming }

// Tasks 5–8 replace each entry with its real scene.
export const SCENE_COMPONENTS: Record<SceneId, FC<SceneProps>> = {
  hook: Placeholder, title: Placeholder, hero: Placeholder,
  countdown: Placeholder, triplet: Placeholder, endcard: Placeholder
}
```

`promo/src/scenes/Placeholder.tsx`:

```tsx
import { SceneShell } from '../components/SceneShell'
import { WordLine } from '../components/WordLine'
import type { SceneProps } from '.'

export function Placeholder({ t }: SceneProps) {
  return (
    <SceneShell durationInFrames={t.durationInFrames}>
      <WordLine words={t.words} size={64} />
    </SceneShell>
  )
}
```

`promo/src/Promo.tsx`:

```tsx
import './fonts'
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from 'remotion'
import { MUSIC } from './music'
import { SCENE_COMPONENTS } from './scenes'
import { C, FPS } from './theme'
import { buildTimeline, type Word } from './timeline'
import words from './words.json'

export const TIMELINE = buildTimeline(words as Word[], MUSIC, FPS)

export function Promo({ withSong }: { withSong: boolean }) {
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      {TIMELINE.scenes.map((s) => {
        const Scene = SCENE_COMPONENTS[s.id]
        return (
          <Sequence key={s.id} from={s.from} durationInFrames={s.durationInFrames} name={s.id}>
            <Scene t={s} />
          </Sequence>
        )
      })}
      {TIMELINE.scenes.map((s) => (
        <Sequence key={`vo-${s.id}`} from={s.vo.at} durationInFrames={s.vo.durationInFrames} name={`vo-${s.id}`}>
          <Html5Audio src={staticFile('audio/voiceover.wav')} trimBefore={s.vo.trimBefore} />
        </Sequence>
      ))}
      {withSong && (
        <Html5Audio
          src={staticFile('audio/guide.mp3')}
          trimBefore={Math.round(MUSIC.offsetSec * FPS)}
          volume={0.35}
        />
      )}
    </AbsoluteFill>
  )
}
```

`promo/src/Root.tsx`:

```tsx
import { Composition } from 'remotion'
import { Promo, TIMELINE } from './Promo'
import { FPS, H, W } from './theme'

export function Root() {
  const common = { component: Promo, durationInFrames: TIMELINE.durationInFrames, fps: FPS, width: W, height: H }
  return (
    <>
      {/* Upload version: never contains the song. */}
      <Composition id="Promo" {...common} defaultProps={{ withSong: false }} />
      {/* Local viewing only: "24K Magic" from public/audio/guide.mp3. Never upload. */}
      <Composition id="PromoPreview" {...common} defaultProps={{ withSong: true }} />
    </>
  )
}
```

`promo/src/index.ts`:

```ts
import { registerRoot } from 'remotion'
import { Root } from './Root'

registerRoot(Root)
```

- [x] **Step 4: Kompositionen prüfen**

Run: `cd promo && npm run typecheck && npx remotion compositions src/index.ts`
Expected: Liste mit `Promo` und `PromoPreview`, 1440x1080, 30 fps, Dauer ca. 20 s.

- [x] **Step 5: Stills-Werkzeug**

Die Szenengrenzen schreibt ein Vitest-Lauf aus der echten `words.json`, damit kein zusätzlicher TS-Runner nötig ist. Er prüft nebenbei, dass die echte `words.json` eine gültige Timeline ergibt.

`promo/src/timeline.frames.test.ts`:

```ts
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
```

`promo/tools/stills.mjs`:

```js
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
```

Run: `cd promo && npm run stills`
Expected: sechs PNGs in `out/stills/`. Jedes zeigt die Wörter seiner Szene in Inter (nicht in der Fallback-Schrift). Mit dem Read-Tool ansehen. Einzelne Szene: `npm run stills -- hero`.

- [x] **Step 6: Commit**

```bash
git add promo/src promo/tools/stills.mjs
git commit -m "feat(promo): theme, fonts, reveal words and Promo/PromoPreview compositions"
```

---

### Task 5: Szenen Hook und Title

**Files:**
- Create: `promo/src/scenes/Hook.tsx`, `promo/src/scenes/Title.tsx`
- Modify: `promo/src/scenes/index.ts` (Einträge `hook`, `title`)

**Interfaces:**
- Consumes: `SceneShell`, `WordLine`, `RevealWord` (Task 4), `C`, `FONT`, `SPRING` (Task 4), `SceneProps`

- [x] **Step 1: Hook**

Storyboard: `48 MB.` groß in Inter 600 zentriert, darunter „Too big to send.“ klein in `ink3`. Kein Gold.

`promo/src/scenes/Hook.tsx`:

```tsx
import { SceneShell } from '../components/SceneShell'
import { RevealWord } from '../components/RevealWord'
import { WordLine } from '../components/WordLine'
import { C, FONT } from '../theme'
import type { SceneProps } from '.'

export function Hook({ t }: SceneProps) {
  const [big, ...rest] = t.words
  return (
    <SceneShell durationInFrames={t.durationInFrames}>
      <RevealWord
        text={big.text}
        from={big.from}
        style={{ fontFamily: FONT.body, fontWeight: 600, fontSize: 200, letterSpacing: '-0.04em', color: C.ink }}
      />
      <WordLine words={rest} size={52} weight={400} style={{ color: C.ink3 }} />
    </SceneShell>
  )
}
```

- [x] **Step 2: Title**

Storyboard: „Meet“ klein, dann baut sich „Pyno's Squish.“ Buchstabe für Buchstabe in Fraunces auf. Gold nur auf „Squish.“.

`promo/src/scenes/Title.tsx`:

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { SceneShell } from '../components/SceneShell'
import { RevealWord } from '../components/RevealWord'
import { C, FONT, SPRING } from '../theme'
import type { SceneProps } from '.'

function Letters({ text, from, color }: { text: string; from: number; color: string }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <span style={{ color, whiteSpace: 'pre' }}>
      {[...text].map((ch, i) => {
        const p = spring({ frame: frame - from - i * 2, fps, config: SPRING, durationInFrames: 12 })
        return (
          <span key={i} style={{ display: 'inline-block', opacity: p, filter: `blur(${10 * (1 - p)}px)`, transform: `translateY(${20 * (1 - p)}px)` }}>
            {ch}
          </span>
        )
      })}
    </span>
  )
}

export function Title({ t }: SceneProps) {
  const [meet, pynos, squish] = t.words
  return (
    <SceneShell durationInFrames={t.durationInFrames}>
      <RevealWord text={meet.text} from={meet.from} style={{ fontFamily: FONT.body, fontSize: 44, color: C.ink2 }} />
      <div style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 132, letterSpacing: '-0.02em', lineHeight: 1 }}>
        <Letters text={`${pynos.text} `} from={pynos.from} color={C.ink} />
        <Letters text={squish.text} from={squish.from} color={C.gold} />
      </div>
    </SceneShell>
  )
}
```

- [x] **Step 3: Registrieren**

In `promo/src/scenes/index.ts` die Imports ergänzen und `hook: Hook, title: Title` setzen:

```ts
import { Hook } from './Hook'
import { Title } from './Title'
// …
  hook: Hook, title: Title, hero: Placeholder,
```

- [x] **Step 4: Stills prüfen**

Run: `cd promo && npm run typecheck && npm run stills -- hook && npm run stills -- title`

Expected: Hook zeigt „48 MB.“ groß und „Too big to send.“ darunter, ohne Gold. Title zeigt „Meet“ und „Pyno's Squish.“, nur „Squish.“ ist gold. Überall mindestens 120 px Rand. Mit dem Read-Tool prüfen.

- [x] **Step 5: Commit**

```bash
git add promo/src/scenes
git commit -m "feat(promo): hook and title scenes"
```

---

### Task 6: AppWindow und Hero-Szene

**Files:**
- Create: `promo/src/components/AppWindow.tsx`, `promo/src/scenes/Hero.tsx`
- Modify: `promo/src/scenes/index.ts` (`hero: Hero`)

**Interfaces:**
- Consumes: `SceneShell`, `WordLine`, `C`, `FONT`, `SPRING`
- Produces: `<AppWindow fileIn: number chipOn: number />`. `fileIn` läuft von 0 bis 1 (Datei-Karte gleitet in die Drop-Zone), `chipOn` von 0 bis 1 (Chip „Discord · 10 MB“ wird gold).
- Produces: `heroChipFrame(t: SceneTiming): number`, der Szenen-Frame, an dem der Chip gold wird (Wort „going.“). Wird in Task 9 für den Klick-SFX genutzt.

- [x] **Step 1: AppWindow**

Das Fenster ist ein vereinfachtes Nachbild der Squish-UI (Board A1/A2): Titelleiste mit „Pyno's Squish“, gestrichelte Drop-Zone, Preset-Chips. Es ist kein Screenshot.

`promo/src/components/AppWindow.tsx`:

```tsx
import { interpolate } from 'remotion'
import { C, FONT } from '../theme'

const CHIPS = ['TikTok', 'Reels', 'Discord · 10 MB', 'WhatsApp · 16 MB']
const ACTIVE = 2

export function AppWindow({ fileIn, chipOn }: { fileIn: number; chipOn: number }) {
  return (
    <div
      style={{
        width: 900, height: 540, borderRadius: 16, background: C.surface, border: `1px solid ${C.hairline}`,
        boxShadow: '0 60px 120px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', textAlign: 'left'
      }}
    >
      <div style={{ height: 52, display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: `1px solid ${C.hairline}`, fontFamily: FONT.display, fontWeight: 600, fontSize: 18, color: C.ink }}>
        Pyno's Squish
      </div>
      <div style={{ flex: 1, padding: 28, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ flex: 1, borderRadius: 12, border: `2px dashed ${C.rule}`, display: 'grid', placeItems: 'center', position: 'relative' }}>
          <span style={{ fontFamily: FONT.body, fontSize: 22, color: C.ink3, opacity: 1 - fileIn }}>Drop your video here.</span>
          <div
            style={{
              position: 'absolute', padding: '14px 20px', borderRadius: 10, background: C.surfaceRaised,
              border: `1px solid ${C.hairline}`, fontFamily: FONT.mono, fontSize: 20, color: C.ink,
              opacity: fileIn, transform: `translateY(${interpolate(fileIn, [0, 1], [-220, 0])}px) scale(${interpolate(fileIn, [0, 1], [1.08, 1])})`
            }}
          >
            clip.mp4 · 48 MB
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {CHIPS.map((label, i) => {
            const on = i === ACTIVE ? chipOn : 0
            return (
              <div
                key={label}
                style={{
                  padding: '10px 16px', borderRadius: 999, fontFamily: FONT.mono, fontSize: 17, fontWeight: 500,
                  border: `1px solid ${on > 0.5 ? C.gold : C.hairline}`,
                  background: `rgba(212, 175, 55, ${0.9 * on})`,
                  color: on > 0.5 ? C.onGold : C.ink2,
                  transform: `scale(${1 + 0.06 * Math.sin(Math.PI * on)})`
                }}
              >
                {label}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [x] **Step 2: Hero**

Der Satz steht oben, das Fenster schwebt gekippt herein. Die Datei gleitet beim Wort „video.“ hinein, der Chip wird bei „going.“ gold. Das ist das einzige Gold der Szene.

`promo/src/scenes/Hero.tsx`:

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { AppWindow } from '../components/AppWindow'
import { SceneShell } from '../components/SceneShell'
import { WordLine } from '../components/WordLine'
import { SPRING } from '../theme'
import type { SceneTiming } from '../timeline'
import type { SceneProps } from '.'

const wordFrame = (t: SceneTiming, text: string) => t.words.find((w) => w.text === text)?.from ?? 0
export const heroChipFrame = (t: SceneTiming) => wordFrame(t, 'going.')

export function Hero({ t }: SceneProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame: frame - 2, fps, config: SPRING, durationInFrames: 24 })
  const fileIn = spring({ frame: frame - wordFrame(t, 'video.'), fps, config: SPRING, durationInFrames: 18 })
  const chipOn = spring({ frame: frame - heroChipFrame(t), fps, config: SPRING, durationInFrames: 12 })
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
```

- [x] **Step 3: Registrieren**

In `promo/src/scenes/index.ts` `import { Hero } from './Hero'` ergänzen und `hero: Hero` setzen.

- [x] **Step 4: Stills prüfen**

Run: `cd promo && npm run typecheck && npm run stills -- hero`. Das Still liegt bei 70 % der Szene, also nach „going.“.
Expected: Fenster gekippt mit Schatten, Datei-Karte in der Drop-Zone, nur „Discord · 10 MB“ gold. Satz oben lesbar, Rand mindestens 120 px. Mit dem Read-Tool prüfen.

- [x] **Step 5: Commit**

```bash
git add promo/src/components/AppWindow.tsx promo/src/scenes
git commit -m "feat(promo): hero scene with tilted app window"
```

---

### Task 7: Countdown und Triplet

**Files:**
- Create: `promo/src/lib/format.ts`, `promo/src/lib/format.test.ts`
- Create: `promo/src/scenes/Countdown.tsx`, `promo/src/scenes/Triplet.tsx`
- Modify: `promo/src/scenes/index.ts`

**Interfaces:**
- Produces: `formatMb(mb: number): string`, `countdownValue(p: number, from?: number, to?: number): number`

- [x] **Step 1: Failing Test**

`promo/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { countdownValue, formatMb } from './format'

describe('formatMb', () => {
  it('shows whole MB from 10 up and one decimal below', () => {
    expect(formatMb(48)).toBe('48 MB')
    expect(formatMb(10.04)).toBe('10 MB')
    expect(formatMb(9.7)).toBe('9.7 MB')
    expect(formatMb(9.96)).toBe('10 MB')
  })
})

describe('countdownValue', () => {
  it('runs from 48 to 9.7 and clamps', () => {
    expect(countdownValue(0)).toBe(48)
    expect(countdownValue(1)).toBeCloseTo(9.7)
    expect(countdownValue(1.2)).toBeCloseTo(9.7)
    expect(countdownValue(-0.1)).toBe(48)
  })
})
```

Run: `cd promo && npx vitest run src/lib/format.test.ts`
Expected: FAIL, Modul fehlt.

- [x] **Step 2: Implementieren**

`promo/src/lib/format.ts`:

```ts
export function formatMb(mb: number): string {
  const r = Math.round(mb * 10) / 10
  return r >= 10 ? `${Math.round(r)} MB` : `${r.toFixed(1)} MB`
}

export function countdownValue(p: number, from = 48, to = 9.7): number {
  const c = Math.min(1, Math.max(0, p))
  return from + (to - from) * c
}
```

Run: `cd promo && npx vitest run src/lib/format.test.ts`
Expected: PASS.

- [x] **Step 3: Countdown**

Die Zahl zählt ruhig herunter, mit leichtem horizontalem Squash in der Mitte der Bewegung. Die Endzahl wird gold, das ist das einzige Gold. Der gesprochene Satz steht darunter.

`promo/src/scenes/Countdown.tsx`:

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { SceneShell } from '../components/SceneShell'
import { WordLine } from '../components/WordLine'
import { countdownValue, formatMb } from '../lib/format'
import { C, FONT, SPRING } from '../theme'
import type { SceneProps } from '.'

export function Countdown({ t }: SceneProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const start = t.words[0]?.from ?? 0
  const p = spring({ frame: frame - start, fps, config: SPRING, durationInFrames: 45 })
  const squash = Math.sin(Math.PI * p)
  const done = p > 0.995
  return (
    <SceneShell durationInFrames={t.durationInFrames}>
      <div
        style={{
          fontFamily: FONT.body, fontWeight: 600, fontSize: 200, letterSpacing: '-0.04em',
          fontVariantNumeric: 'tabular-nums', color: done ? C.gold : C.ink,
          transform: `scale(${1 - 0.08 * squash}, ${1 + 0.03 * squash})`
        }}
      >
        {formatMb(countdownValue(p))}
      </div>
      <WordLine words={t.words} size={44} />
    </SceneShell>
  )
}
```

- [x] **Step 4: Triplet**

Drei Sätze, jeder einzeln. Ein Satz ist sichtbar ab seinem ersten Wort und bis zum ersten Wort des nächsten Satzes. „Same resolution.“ ist gold.

`promo/src/scenes/Triplet.tsx`:

```tsx
import { AbsoluteFill, Sequence } from 'remotion'
import { SceneShell } from '../components/SceneShell'
import { WordLine } from '../components/WordLine'
import type { TimedWord } from '../timeline'
import type { SceneProps } from '.'

function sentences(words: TimedWord[]): TimedWord[][] {
  const out: TimedWord[][] = [[]]
  for (const w of words) {
    out[out.length - 1].push(w)
    if (/[.!?]$/.test(w.text)) out.push([])
  }
  return out.filter((s) => s.length > 0)
}

export function Triplet({ t }: SceneProps) {
  const parts = sentences(t.words)
  return (
    <AbsoluteFill>
      {parts.map((s, i) => {
        const from = Math.max(0, s[0].from - 4)
        const until = i + 1 < parts.length ? parts[i + 1][0].from - 4 : t.durationInFrames
        const last = i === parts.length - 1
        const shifted = s.map((w) => ({ ...w, from: w.from - from, to: w.to - from }))
        return (
          <Sequence key={i} from={from} durationInFrames={until - from}>
            <SceneShell durationInFrames={until - from}>
              <WordLine words={shifted} size={96} tone={last ? 'gold' : 'ink'} />
            </SceneShell>
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
```

- [x] **Step 5: Registrieren, prüfen, committen**

In `promo/src/scenes/index.ts` `Countdown` und `Triplet` importieren und eintragen.

Run: `cd promo && npm run typecheck && npm test`
Expected: grün.

Run: `cd promo && npm run stills -- countdown && npm run stills -- triplet`
Expected: Countdown zeigt die gold „9.7 MB“, Triplet zeigt „Same resolution.“ allein und gold. Mit dem Read-Tool ansehen.

```bash
git add promo/src/lib promo/src/scenes
git commit -m "feat(promo): countdown and triplet scenes"
```

---

### Task 8: SquishIcon und Endcard

**Files:**
- Create: `promo/src/components/SquishIcon.tsx`, `promo/src/scenes/Endcard.tsx`
- Modify: `promo/src/scenes/index.ts` (`endcard: Endcard`, der Placeholder-Import und `Placeholder.tsx` entfallen)

**Interfaces:**
- Produces: `<SquishIcon size: number squeeze: number />`. `squeeze` läuft von 0 bis 1: Die Chevrons starten 70 Einheiten außen und landen bei 1 auf ihrer Icon-Position, dabei staucht sich der Rahmen kurz.
- Produces: `ENDCARD_THUD_FRAME = 10`, der Szenen-Frame, an dem die Chevrons landen (für den SFX in Task 9).

- [x] **Step 1: SquishIcon**

Pfade und Farben sind 1:1 aus `scripts/make-icon.mjs` übernommen.

`promo/src/components/SquishIcon.tsx`:

```tsx
export function SquishIcon({ size, squeeze }: { size: number; squeeze: number }) {
  const off = 70 * (1 - squeeze)
  // Frame gives a little as the chevrons land: peaks at squeeze≈0.85, settles to 1.
  const give = Math.max(0, 1 - Math.abs(squeeze - 0.85) / 0.15)
  const sx = 1 - 0.1 * give
  return (
    <svg width={size} height={size} viewBox="0 0 512 512">
      <defs>
        <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#172629" /><stop offset="1" stopColor="#0b1416" />
        </linearGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0d27a" /><stop offset="1" stopColor="#d4af37" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#tile)" stroke="#22363b" strokeWidth="4" />
      <g transform={`translate(256 256) scale(${sx} ${1 + (1 - sx) * 0.4}) translate(-256 -256)`}>
        <rect x="180" y="140" width="152" height="232" rx="36" fill="url(#gold)" />
        <path d="M232 210 L232 302 L296 256 Z" fill="#0b1416" stroke="#0b1416" strokeWidth="14" strokeLinejoin="round" />
      </g>
      <g fill="none" stroke="#4fd6c0" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round">
        <path d="M86 196 L138 256 L86 316" transform={`translate(${-off} 0)`} />
        <path d="M426 196 L374 256 L426 316" transform={`translate(${off} 0)`} />
      </g>
    </svg>
  )
}
```

- [x] **Step 2: Endcard**

Oben „Free. Link in bio.“ als gesprochene Zeile, darunter das Icon neben „Pyno's Squish“ und „Free on Payhip.“ in Mono. Gold kommt hier nur im Icon vor, der Text bleibt in Ink-Tönen.

`promo/src/scenes/Endcard.tsx`:

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { RevealWord } from '../components/RevealWord'
import { SceneShell } from '../components/SceneShell'
import { SquishIcon } from '../components/SquishIcon'
import { WordLine } from '../components/WordLine'
import { C, FONT } from '../theme'
import type { SceneProps } from '.'

export const ENDCARD_THUD_FRAME = 10

export function Endcard({ t }: SceneProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  // Slight bounce allowed here only: the chevrons "press".
  const squeeze = spring({ frame: frame - 2, fps, config: { damping: 14, stiffness: 180 }, durationInFrames: ENDCARD_THUD_FRAME })
  return (
    <SceneShell durationInFrames={t.durationInFrames + 30}>
      <WordLine words={t.words} size={40} weight={400} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
        <SquishIcon size={220} squeeze={squeeze} />
        <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RevealWord text="Pyno's Squish" from={8} style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 92, color: C.ink, letterSpacing: '-0.02em' }} />
          <RevealWord text="Free on Payhip." from={16} style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 30, color: C.ink2 }} />
        </div>
      </div>
    </SceneShell>
  )
}
```

`durationInFrames + 30` sorgt dafür, dass der Exit-Spring der Shell nie greift. Das Endcard bleibt bis zum Ende stehen.

- [x] **Step 3: Registrieren und Placeholder entfernen**

`promo/src/scenes/index.ts` final:

```ts
import type { FC } from 'react'
import type { SceneId, SceneTiming } from '../timeline'
import { Countdown } from './Countdown'
import { Endcard } from './Endcard'
import { Hero } from './Hero'
import { Hook } from './Hook'
import { Title } from './Title'
import { Triplet } from './Triplet'

export type SceneProps = { t: SceneTiming }

export const SCENE_COMPONENTS: Record<SceneId, FC<SceneProps>> = {
  hook: Hook, title: Title, hero: Hero, countdown: Countdown, triplet: Triplet, endcard: Endcard
}
```

Run: `git rm promo/src/scenes/Placeholder.tsx`

- [x] **Step 4: Prüfen und committen**

Run: `cd promo && npm run typecheck && npm run stills -- endcard`
Danach alle sechs mit `npm run stills` neu erzeugen und gemeinsam prüfen (Gold höchstens einmal pro Szene).
Expected: Icon mit anliegenden Chevrons, „Pyno's Squish“ und „Free on Payhip.“, darüber „Free. Link in bio.“. Rand mindestens 120 px.

```bash
git add promo/src
git commit -m "feat(promo): animated squish icon endcard"
```

---

### Task 9: SFX, Mastering und Render

**Files:**
- Create: `promo/tools/make-sfx.mjs`, `promo/tools/master.mjs`
- Modify: `promo/src/Promo.tsx` (SFX-Sequenzen)

**Interfaces:**
- Consumes: `TIMELINE` (Task 4), `heroChipFrame` (Task 6), `ENDCARD_THUD_FRAME` (Task 8)
- Produces: `public/audio/sfx/{whoosh,click,thud}.wav`, `out/promo-final.mp4`, `out/promo-preview-with-song.mp4`

- [x] **Step 1: SFX synthetisieren (lizenzfrei, deterministisch)**

`promo/tools/make-sfx.mjs`:

```js
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
```

Run: `cd promo && npm run sfx`
Expected: drei WAVs unter `public/audio/sfx/`.

- [x] **Step 2: SFX in `Promo.tsx` einsetzen**

Ein Whoosh sitzt auf jedem Szenenwechsel ab Szene 2, zwei Frames davor, damit er in den Schnitt hineinläuft. Der Klick sitzt auf dem Chip-Frame der Hero-Szene, das Thud auf dem Landepunkt im Endcard. Ergänzen in `promo/src/Promo.tsx`:

```tsx
import { heroChipFrame } from './scenes/Hero'
import { ENDCARD_THUD_FRAME } from './scenes/Endcard'

const hero = TIMELINE.scenes.find((s) => s.id === 'hero')!
const endcard = TIMELINE.scenes.find((s) => s.id === 'endcard')!
const SFX: { src: string; at: number }[] = [
  ...TIMELINE.scenes.slice(1).map((s) => ({ src: 'audio/sfx/whoosh.wav', at: Math.max(0, s.from - 2) })),
  { src: 'audio/sfx/click.wav', at: hero.from + heroChipFrame(hero) },
  { src: 'audio/sfx/thud.wav', at: endcard.from + 2 + ENDCARD_THUD_FRAME }
]
```

Im JSX nach den VO-Sequenzen:

```tsx
      {SFX.map((s, i) => (
        <Sequence key={`sfx-${i}`} from={s.at} durationInFrames={Math.round(FPS * 0.8)} name={`sfx-${i}`}>
          <Html5Audio src={staticFile(s.src)} />
        </Sequence>
      ))}
```

- [x] **Step 3: Mastering**

`promo/tools/master.mjs`:

```js
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
```

- [x] **Step 4: Upload-Version ohne `guide.mp3` rendern (Review Focus 5)**

Run: `cd promo && mv public/audio/guide.mp3 public/audio/guide.mp3.bak 2>/dev/null; npm run render; mv public/audio/guide.mp3.bak public/audio/guide.mp3 2>/dev/null; true`
Expected: `out/promo-final.mp4` wird erstellt, auch wenn `guide.mp3` fehlt.

Run: `ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate -of csv=p=0 promo/out/promo-final.mp4`
Expected: genau eine `video,1440,1080,30/1`- und genau eine `audio`-Zeile.

Run: `ffmpeg -hide_banner -i promo/out/promo-final.mp4 -af ebur128=peak=true -f null - 2>&1 | tail -12`
Expected: `I:` zwischen −15,0 und −13,0 LUFS, `Peak:` höchstens −1,0 dBFS.

- [x] **Step 5: CHECKPOINT Guide-Spur durch den Nutzer**

Der Nutzer legt „24K Magic“ als `promo/public/audio/guide.mp3` ab. In `npm run studio` die Komposition `PromoPreview` abspielen, dabei `MUSIC.offsetSec` (Einstieg um 23 s) und `MUSIC.firstBeatSec` (erster Beat nach dem Einstieg) nach Gehör einstellen. Bei Bedarf wird `sceneShiftSec` gesetzt, damit Satzanfänge auf Beats liegen. Das Studio lädt bei jeder Änderung neu.

Run: `cd promo && npm test`
Expected: grün. `timeline.frames.test.ts` wirft, falls ein Shift Szenen überlappen lässt.

- [x] **Step 6: Vorschau mit Song rendern**

Run: `cd promo && npm run render:preview`
Expected: `out/promo-preview-with-song.mp4`, nur lokal (liegt in `out/`, ist ignoriert). An den Nutzer schicken (SendUserFile).

Run: `cd promo && npm run render`
Expected: `out/promo-final.mp4` mit den final abgestimmten Werten. An den Nutzer schicken.

- [x] **Step 7: Commit**

```bash
git add promo/tools/make-sfx.mjs promo/tools/master.mjs promo/src/Promo.tsx promo/src/music.ts
git status --short promo   # guide.mp3, out/, voiceover.wav dürfen NICHT auftauchen
git commit -m "feat(promo): sfx, stills, loudness mastering and final renders"
```

Abnahme: Der Nutzer gibt `out/promo-final.mp4` frei und prüft mit `out/promo-preview-with-song.mp4`, ob die Schnitte auf dem Song sitzen.
