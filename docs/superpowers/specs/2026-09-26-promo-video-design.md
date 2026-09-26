# Pyno's Squish: Promo-Video Design Spec

**Datum:** 2026-09-26
**Status:** Entwurf zur Freigabe
**Bezug:** [Squish Design Spec](2026-09-24-squish-design.md), Design-System Pyno ("Wappen & Schnittpult")

## 1. Ziel

Ein etwa 20 Sekunden langes Werbevideo für TikTok, das Pyno's Squish im Apple-Stil mit Typografie in Bewegung zeigt. Es soll Creator dazu bringen, Squish kostenlos auf Payhip zu laden.

- **Zielgruppe:** Creator und Editoren, keine Technik-Profis.
- **Kernbotschaft:** Ein zu großes Video wird mit Squish passend, und die Auflösung bleibt erhalten.
- **Erfolg:** Der Hook ist nach 1,5 s klar. Das Video ist auch stumm verständlich, weil jedes gesprochene Wort als Typo im Bild steht. Am Ende weiß der Zuschauer, dass es gratis ist und wo es das gibt.

## 2. Rahmen

| Punkt | Entscheidung |
|---|---|
| Format | 4:3 quer, 1440×1080, 30 fps. Bewusste Wahl, TikTok zeigt es mit Balken |
| Länge | ca. 20 s, ergibt sich aus der Voiceover-Länge (siehe 5.3) |
| Stil | Apple-Style: viel Leere, eine Aussage pro Frame, Blur-to-sharp-Reveals, Springs mit wenig Bounce, ein Produkt-Hero-Shot |
| Sprache | Englisch (Voiceover und Typo) |
| Stimme | AI-Voiceover, lokal erzeugt (Kokoro) oder als beliebige eigene MP3 |
| Werkzeug | Remotion (React), eigenes Projekt unter `promo/` |
| Musik | „24K Magic“ ab ca. 0:23, nur als lokale Guide-Spur. Der Song wird beim Posten in TikTok hinzugefügt (siehe 5.2) |
| Ausgabe | MP4, H.264, ca. 12 Mbit/s, AAC 192k, nur Stimme und SFX, Lautheit −14 LUFS |

**Nicht im Umfang:** 9:16- oder andere Varianten, weitere Sprachen, separate Untertitel-Dateien, Posting und Veröffentlichung.

## 3. Skript und Storyboard

Das Voiceover ist ruhig, tief und selbstbewusst (Keynote-Sprecher). Die Zeiten sind Richtwerte, maßgeblich sind die Wortzeiten aus `words.json` (siehe 5.3).

| Szene | Zeit | Bild | Voiceover |
|---|---|---|---|
| **Hook** | 0–2.5 | Petrol-Grund. `48 MB.` in Inter Semibold, mittelgroß, zentriert, blurt scharf rein. Darunter in `--ink-3`: `Too big to send.` | “Forty-eight megabytes. Too big to send.” |
| **Title** | 2.5–5 | Die Zahl schrumpft sanft weg. **Pyno's Squish** baut sich Buchstabe für Buchstabe auf, in Fraunces, Gold nur auf „Squish“ | “Meet Pyno's Squish.” |
| **Hero** | 5–9.5 | Das App-Fenster schwebt leicht gekippt herein (CSS-3D-Perspektive, weicher Glanz, Schatten). Eine Datei-Karte gleitet in die Drop-Zone, der Chip `Discord · 10 MB` wird gold | “Drop in your video. Choose where it's going.” |
| **Countdown** | 9.5–13.5 | Das Fenster fährt weg. Zentral zählt `48 MB` ruhig auf **`9.7 MB`** runter. Die Zahl zieht sich dabei leicht zusammen (subtiles Squash, kein Cartoon) | “Squish makes it fit. Every time.” |
| **Triplet** | 13.5–17 | `Big video.` · `Small file.` · `Same resolution.` Jede Zeile einzeln zentriert, dann weg | “Big video. Small file. Same resolution.” |
| **Endcard** | 17–20 | Das Squish-Icon baut sich auf: Die zwei Chevrons drücken per Spring von außen gegen den goldenen Rahmen, der kurz nachgibt. Daneben **Pyno's Squish**, darunter `Free on Payhip.` in JetBrains Mono. Danach etwa 2 s nur Musik-Ausklang | “Free. Link in bio.” |

**Wording:**

- „Same resolution“ statt „Same quality“, denn Squish reduziert die Auflösung nie von sich aus, die Bildqualität beim Komprimieren aber zwangsläufig.
- „Every time“ bezieht sich auf die garantierte Einhaltung des Größenlimits im Modus Max size (Squish-Spec 4.3).

**Plattform-Namen:** „Discord“ erscheint nur als Preset-Text, wie in der App. Es gibt keine fremden Logos und keine nachgebaute fremde Oberfläche.

## 4. Look und Bewegung

- **Farben:** Die Farben aus `src/renderer/src/styles/tokens.css`. Der Grund ist `--ground` (`#0b1416`), Text in `--ink` und abgestuft `--ink-2`/`--ink-3`. Gold (`--gold`) kommt pro Szene höchstens einmal vor.
- **Schriften:** Fraunces (Marke, Titel), Inter (Aussagen), JetBrains Mono (Zahlen, kleine Labels), über `@fontsource` wie in der App.
- **Satz:** Der Text ist zentriert, mit viel Rand. Es gibt keine bildfüllende Typo. Zwischen Text und Bildrand bleiben mindestens 120 px.
- **Reveals:** Wörter kommen mit Blur 12 px → 0, Opazität 0 → 1 und y +16 px → 0 rein. Sie gehen per Opazität und Blur raus, leicht nach oben.
- **Springs:** Remotion `spring()` mit hoher Dämpfung, also minimalem Überschwingen. Weiche Fades mit Standard-Ease werden nicht verwendet.
- **Timing der Typo:** Jedes Wort erscheint zu seiner Startzeit laut `words.json`. Das Wort, das gerade gesprochen wird, steht in `--ink`, die bereits gesagten treten auf `--ink-2` zurück.
- **Hero-Fenster:** Ein vereinfachtes Nachbild der Squish-UI in React: Titelleiste, Drop-Zone, Preset-Chips. Es ist kein Screenshot und bleibt deshalb bei jeder Größe scharf.

## 5. Audio

### 5.1 Voiceover

- **Quelle der Wahrheit:** `promo/script.txt`, das Skript aus Abschnitt 3.
- **Standardweg:** `tools/tts.py` erzeugt mit Kokoro-82M (Apache-2.0) lokal `public/audio/voiceover.wav`. Zur Auswahl werden 2 bis 3 ruhige englische Stimmen gerendert, der Nutzer wählt eine.
- **Eigene Datei:** Legt der Nutzer eine eigene Datei als `public/audio/voiceover.wav` (andere Formate vorher per ffmpeg umwandeln) ab, gilt diese. Die Pipeline danach ist identisch.
- **Aussprache:** Wird „Pyno's“ falsch gesprochen, bekommt nur der TTS-Input eine phonetische Schreibweise. `script.txt` und die Typo bleiben unverändert.

### 5.2 Musik und SFX

- **Song:** „24K Magic“ (Bruno Mars), ab dem punchigen Teil bei etwa 0:23. Der Song ist kommerziell lizenziert. Er wird deshalb **nicht ins MP4 gerendert und nicht committet**.
- **Guide-Spur:** Der Nutzer legt seine lokale Kopie als `public/audio/guide.mp3` ab (in `.gitignore`). `src/music.ts` hält `offsetSec` (Einstieg im Song, Start 23,0), `bpm` (107) und `firstBeatSec` (erster Beat nach dem Einstieg, relativ zum Videostart). Die genauen Werte stimmt der Nutzer in Remotion Studio nach Gehör ab.
- **Zwei Kompositionen:** `Promo` enthält nie den Song, sie ist die Upload-Version. `PromoPreview` rendert den Song immer mit (ab `offsetSec`, Lautstärke ca. 35 %) und dient nur zum lokalen Ansehen, als `out/promo-preview-with-song.mp4`. Beide sind in Remotion Studio abspielbar.
- **Posten:** Der Nutzer fügt den Song in TikTok über „Sound hinzufügen“ hinzu, setzt den Startpunkt auf denselben Offset und regelt die Songlautstärke so, dass die Stimme verständlich bleibt. Der Song hat Gesang, deshalb eher leise, etwa 30 bis 40 %. Das funktioniert nur mit einem privaten bzw. Creator-Account. Business-Accounts und Ads haben keinen Zugriff auf den Song.
- **SFX (lizenzfrei, leise):** weicher Luftzug bei Reveals, feiner Klick beim gold werdenden Chip, tiefer warmer Ton auf dem Endcard. Die SFX sitzen auf Beats.
- **Mix im MP4:** nur Stimme und SFX. Die letzten ca. 2 s sind ohne Stimme, dort trägt in TikTok der Song.

### 5.3 Wortzeiten und Timing

- **Wortzeiten:** `tools/align.py` transkribiert die Voiceover-Datei lokal mit faster-whisper (GPU, `word_timestamps=True`). Die Wörter werden gegen `script.txt` abgeglichen, damit die Schreibweise stimmt (etwa „48 MB“ statt „forty-eight“). Das Ergebnis landet in `src/words.json`.
- **Format:** `[{ "word": "Too", "start": 1.12, "end": 1.30, "scene": "hook" }, …]`
- **Szenenzuordnung:** Die Zuordnung Wort → Szene steht in `script.txt` über Szenen-Marker, zum Beispiel `[hook]`.
- **Szenenlängen:** Jede Szene beginnt etwa 0,3 s vor ihrem ersten Wort und endet etwa 0,4 s nach ihrem letzten. Die Gesamtdauer der Komposition ergibt sich daraus plus 2 s Ausklang. Es gibt keine fest eingetragenen Frame-Zahlen.
- **Beat-Raster:** Szenenwechsel rasten auf den nächsten Beat aus `music.ts` ein (bei 107 BPM ca. 0,56 s), sofern die Verschiebung höchstens 0,25 s beträgt. Sonst bleibt der Wechsel an der Sprachzeit. Wort-Reveals folgen immer der Stimme und nie dem Beat.
- **Stimme auf dem Beat:** Die Voiceover-Datei lässt sich pro Szene verschieben, per `sceneShiftSec` in `music.ts`. Der Player spielt sie dazu als Abschnitte pro Szene ab. So landen Satzblöcke auf Beats, ohne die Stimme neu zu erzeugen.
- **Neue Stimme:** Wird die Stimme getauscht, reicht es, `align.py` neu laufen zu lassen, das Video passt sich an.

## 6. Technik

```
promo/
├─ package.json          Remotion und @fontsource, getrennt von der App
├─ script.txt            Skript mit Szenen-Markern
├─ requirements.txt      kokoro, faster-whisper, soundfile
├─ public/audio/         voiceover.wav, guide.mp3 (lokal, ignoriert), sfx/*.wav (per ffmpeg synthetisiert)
├─ tools/tts.py          Kokoro → audio/voiceover.wav
├─ tools/align.py        faster-whisper → src/words.json
├─ tools/master.mjs      ffmpeg loudnorm auf −14 LUFS
└─ src/
   ├─ theme.ts           Farben, Fonts, Spring-Configs
   ├─ music.ts           Guide-Spur: offsetSec, bpm, firstBeatSec, Satz-Offsets
   ├─ timing.ts          words.json + Beat-Raster → Szenen-Start/Dauer, Wort-Frames
   ├─ components/        RevealWord, AppWindow, SquishIcon, Counter
   ├─ scenes/            Hook, Title, Hero, Countdown, Triplet, Endcard
   └─ Promo.tsx          Komposition 1440×1080 @ 30 fps
```

**Grenzen:**

- `promo/` ist ein eigenständiges Projekt. App-Build, Tests und `electron-builder` bleiben unberührt.
- Die Farbwerte stehen als Kopie in `theme.ts`, mit einem Kommentar zur Quelle. Es gibt keinen Import quer über die Projektgrenze.
- `SquishIcon` baut das App-Icon als Inline-SVG nach, mit Pfaden und Farben aus `scripts/make-icon.mjs`. Chevrons und Rahmen sind einzeln animierbar.

**Python:**

- Lokal ist Python 3.14 installiert. Falls Kokoro oder torch darauf nicht laufen, bekommen die Tools ein eigenes venv mit Python 3.12 (`py -3.12 -m venv promo/.venv`).
- `.venv/` und alle generierten Audio-Dateien stehen in `.gitignore`.

**Lizenzen:**

- Remotion ist für Einzelpersonen und Firmen mit höchstens 3 Mitarbeitern kostenlos.
- Kokoro läuft unter Apache-2.0, faster-whisper unter MIT.
- SFX stammen nur aus lizenzfreien Quellen.
- „24K Magic“ dient nur als lokale Guide-Spur. Er gelangt weder ins Repo noch ins exportierte Video.

**Workflow:**

1. `py tools/tts.py` erzeugt die Stimmproben. Alternativ legt der Nutzer seine eigene Voiceover-Datei ab.
2. `py tools/align.py` erzeugt `src/words.json`.
3. `npx remotion studio` zeigt die Live-Vorschau im Browser.
4. `npx remotion render Promo out/promo.mp4` rendert das Video, anschließend bringt `node tools/master.mjs` es auf −14 LUFS und schreibt `out/promo-final.mp4`.

## 7. Prüfung und Abnahme

- **Timing:** `timing.ts` bekommt Unit-Tests. Aus einer Beispiel-`words.json` müssen die erwarteten Szenen-Starts und -Dauern entstehen, und kein Wort darf außerhalb seiner Szene liegen. Szenenwechsel rasten nur bei einer Verschiebung von höchstens 0,25 s auf den Beat ein.
- **Kein Song im Upload-Export:** `out/promo-final.mp4` hat genau eine Audiospur, die zur Stimme passt. Nur `PromoPreview` referenziert `guide.mp3`.
- **Bild:** Pro Szene wird ein Frame per `npx remotion still` gerendert. Geprüft werden Lesbarkeit, der Rand von 120 px und Gold höchstens einmal pro Szene.
- **Audio:** `ffmpeg -af ebur128` misst etwa −14 LUFS integriert und einen True Peak von höchstens −1 dBTP.
- **Abnahme:** Der Nutzer gibt am fertigen `out/promo-final.mp4` frei. Zusätzlich prüft er in Studio mit Guide-Spur, ob die Schnitte auf dem Song sitzen.

## 8. Offene Punkte vor der Umsetzung

- Stimmwahl: Der Nutzer wählt aus 2 bis 3 Kokoro-Proben oder liefert eine eigene Datei.
- Guide-Spur: Der Nutzer legt „24K Magic“ lokal als `public/audio/guide.mp3` ab und bestätigt in Remotion Studio den genauen Einstieg (`offsetSec`) und den ersten Beat.
