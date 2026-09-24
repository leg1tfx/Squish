# Pyno's Squish: Design Spec

**Datum:** 2026-09-24
**Status:** Entwurf zur Freigabe
**UI-Mockups:** https://claude.ai/artifact/U1pJfNHxoPFwjWkYA4douF (Richtung A, Boards A1 bis A5)
**Design-System:** Pyno ("Wappen & Schnittpult"), https://claude.ai/artifact/CtKQtuKuMfFte1r1PRanCK

## 1. Ziel

Pyno's Squish ist eine Windows-Desktop-App, die Videos für Social Media komprimiert. Nutzer ziehen ein Video rein, wählen ein Preset (Plattform oder Größenlimit), passen es bei Bedarf an, vergleichen vorher/nachher und exportieren.

- **Vertrieb:** kostenlos auf Payhip, als Lead-Magnet der Marke Pyno's.
- **Zielgruppe:** Creator und Editoren, keine Technik-Profis.
- **Erfolg:** Ein Laie kommt in unter 30 Sekunden vom Reinziehen zur fertigen Datei. Ein gesetztes Größenlimit wird garantiert eingehalten. Squish verschlechtert Auflösung, Bildrate oder Audio nie von sich aus.

## 2. Rahmen

| Punkt | Entscheidung |
|---|---|
| Plattform | Nur Windows 10/11 (x64) |
| UI-Sprache | Englisch, keine Übersetzungs-Infrastruktur |
| Dateien | Eine Datei nach der anderen |
| Netzwerk | Keins. Einzige Ausnahme: Der Pyno's-Link öffnet den Standardbrowser |
| Konto, Lizenz, Telemetrie | Keine |
| Ausgabe | MP4, Video H.264 oder H.265 (Tag `hvc1`), Audio AAC, `+faststart` |
| Speicherort | Neben dem Original als `<name>_squish.mp4`. Existiert die Datei, dann `<name>_squish (2).mp4` usw. Es wird nie überschrieben |

**Nicht im Umfang (v1):** Batch, Trimmen, Seitenverhältnis ändern, macOS, Auto-Update, weitere Sprachen.

## 3. Ablauf und Screens

Die Screens entsprechen den Mockup-Boards. Das Styling folgt dem Pyno-System (Theme Nacht, Fraunces, Inter und JetBrains Mono, Gold einmal laut pro Ansicht).

1. **Drop (A1):** Eine große Drop-Zone mit „Drop your video here.“ und dem Button „Choose file“. Klick auf die Zone oder Ctrl+O öffnet den Dateidialog.
2. **Settings (A2):**
   - **Links:** Vorschaubild, Dateiname, Länge und Größe, dazu die Tabelle „what changes“ (Resolution, Frame rate, Audio, Video). Unveränderte Werte stehen dort als „kept“.
   - **Rechts:** Preset-Chips, darunter die Einstellungen (siehe 4.2), die Warnung (siehe 4.4), die geschätzte Größe mit Balken sowie die Buttons „Compare“ und „Squish it“.
   - Sobald eine Einstellung vom Preset abweicht, zeigt der Chip „· edited“, und „+ Save as preset“ erscheint.
3. **Compare (A3):** Ein 5-Sekunden-Ausschnitt läuft in Schleife mit Vorher/Nachher-Trennlinie. Zoom „Fit“ oder „100%“, Buttons „Back“ und „Squish it“.
4. **Encoding (A4):** Timeline-Loader mit Playhead, Prozentzahl, Durchgangsanzeige und Restzeit. Das FFmpeg-Protokoll klappt über „Show log“ auf. Außerdem „Cancel“.
5. **Done (A5):** Stempel-Animation und „Done. X MB.“ mit einem Satz dazu (Limit eingehalten, wie viel kleiner). Buttons „Show in folder“ und „Squish another“. Unten steht eine wegklickbare Pyno's-Zeile mit Payhip-Link. Das Wegklicken wird dauerhaft gespeichert.

## 4. Kompressionslogik

### 4.1 Grundsatz

Squish rechnet nie hoch und reduziert nichts ohne ausdrückliche Wahl des Nutzers. „Best“ heißt immer: wie das Original, höchstens bis zur jeweiligen Obergrenze.

### 4.2 Einstellungen

| Einstellung | Optionen (UI) | Bedeutung |
|---|---|---|
| Resolution | Best · 1440p · 1080p · 720p | Best = Original, höchstens 4K (kürzere Seite 2160). Optionen über dem Original sind deaktiviert. Das Seitenverhältnis bleibt immer erhalten |
| Frame rate | Best · 60 · 30 | Best = Original, höchstens 60 fps. „60“ ist deaktiviert, wenn das Original darunter liegt |
| Audio | Best · High · Standard | AAC mit 320k, 192k oder 128k, jeweils nie über der Bitrate des Originals. Bei Videos ohne Ton ist die Zeile ausgeblendet |
| Codec | H.264 · H.265 | |
| Size | Auto · Max size [__ MB] | Auto = konstante Qualität, Max = Zielgröße |
| Encoder | Auto · NVIDIA NVENC · AMD AMF · Intel QSV · CPU | Auto = der erste funktionierende in dieser Reihenfolge |
| Bitrate | Anzeige, z. B. „29.9 Mbit/s · auto“ | Ändert der Nutzer den Wert von Hand, gilt „edited“ und Squish encodiert mit fester Bitrate (VBR, Obergrenze 1,5× Ziel) |

### 4.3 Modi

**Auto (konstante Qualität):**

| Encoder | H.264 | H.265 |
|---|---|---|
| CPU | libx264 `-crf 20 -preset medium` | libx265 `-crf 23 -preset medium` |
| NVENC | `-rc vbr -cq 23 -preset p5` | `-rc vbr -cq 25 -preset p5` |
| AMF | `-rc qvbr -qvbr_quality_level 23` | `-rc qvbr -qvbr_quality_level 25` |
| QSV | `-global_quality 23` (ICQ) | `-global_quality 25` (ICQ) |

Die Größenschätzung im UI rechnet mit Bits pro Pixel und Frame: H.264 0,10 und H.265 0,06, also `Pixel × fps × bpp` plus Audio. Die Anzeige sagt deshalb „~“. Die Werte werden bei der Umsetzung an echten Clips nachkalibriert.

**Max size (Zielgröße):**
1. Budget = Limit in Dezimal-MB (1 MB = 1.000.000 Bytes) × 0,97.
2. `video_bps = Budget × 8 / Dauer − audio_bps`, Minimum 50 kbit/s.
3. Encodiert wird so:
   - CPU: echtes 2-Pass-Verfahren.
   - NVENC: `-multipass fullres -rc vbr`.
   - AMF und QSV: 1-Pass-VBR.
   - Für alle gilt `-maxrate` = 1,5 × Ziel.
4. **Nachprüfen:** Liegt die fertige Datei über dem Limit, wird mit `video_bps × (Limit ÷ Ist) × 0,98` neu encodiert, höchstens zweimal. Liegt sie danach immer noch darüber, schaltet Squish auf die CPU mit 2-Pass um.

### 4.4 Warnung bei knappem Limit

Die Warnung erscheint nur im Modus „Max size“, wenn `video_bps ÷ (Pixel × fps)` unter dem Schwellwert liegt: H.264 0,035, H.265 0,022.

- **Text:** „<N> MB is tight for <Auflösung>. <Vorschlag> will look cleaner.“
- **Vorschlag:** die größte niedrigere Auflösung, die den Schwellwert erreicht. Erreicht keine ihn, wird 720p vorgeschlagen. Schon bei 720p gibt es keine Warnung mehr.
- **Button:** „Use <Vorschlag>“ setzt die Auflösung. Squish ändert nie selbst etwas.

### 4.5 Presets

| Preset | Resolution | fps | Audio | Codec | Size |
|---|---|---|---|---|---|
| TikTok | Best | Best | Best | H.265 | Auto |
| Reels | Best | Best | High | H.265 | Auto |
| Shorts | Best | Best | Best | H.265 | Auto |
| YouTube | Best | Best | Best | H.265 | Auto |
| X | Best | Best | High | H.264 | Auto |
| Discord · 10 MB | Best | Best | High | H.264 | Max 10 |
| WhatsApp · 16 MB | Best | Best | High | H.264 | Max 16 |
| Email · 25 MB | Best | Best | High | H.264 | Max 25 |

Eigene Presets speichern alle Einstellungen außer dem Encoder, der gerätespezifisch ist. Sie stehen hinter den eingebauten, mit ★ davor, und lassen sich umbenennen und löschen (Rechtsklick auf den Chip). Beim Start ist das zuletzt benutzte Preset aktiv.

### 4.6 Sonderfälle

- **Über 60 fps:** Das Video wird auf 60 fps gebracht, auch bei „Best“.
- **HDR (HLG/PQ):** Squish rechnet in SDR um (Tonemapping über `zscale` + `tonemap=hable`) und zeigt unter „what changes“ die Zeile „HDR → SDR“.
- **Variable Bildrate:** Die Ausgabe hat eine konstante Bildrate.
- **Hochkant-Video:** „1080p“ und die anderen Stufen beziehen sich immer auf die kürzere Seite.

### 4.7 Vorschau

Squish nimmt 5 Sekunden ab der Mitte des Videos und encodiert sie mit denselben Einstellungen. Im Modus „Max size“ läuft das als 1-Pass mit der berechneten Bitrate. Die Vorschau startet erst beim Klick auf „Compare“.

## 5. Architektur

**Stack:** Electron, electron-vite, React 19 und TypeScript. Animationen kommen von Motion (`motion/react`), das Styling von CSS-Variablen aus den Pyno-Tokens. Paketiert wird mit electron-builder als NSIS-Installer „Pyno's Squish Setup.exe“. Das Projekt wird neu aufgesetzt, ohne Vorlage aus einer anderen App.

### 5.1 Main-Prozess

| Modul | Aufgabe | Abhängigkeiten |
|---|---|---|
| `probe.ts` | ffprobe (JSON) → `VideoInfo` (Dauer, Breite, Höhe, fps, Codec, Video- und Audio-Bitrate, hasAudio, HDR) | ffprobe |
| `encoders.ts` | Bei jedem Start im Hintergrund pro Hardware-Encoder ein Testencode (`-f lavfi -i color -t 0.1 -f null -`, zusammen etwa 1 s). Bis das Ergebnis da ist, zeigt der Encoder „Detecting…“ | ffmpeg |
| `plan.ts` | **Reine Funktionen:** `buildPlan(info, settings, encoders) → { args[], passes, estimateBytes, bitrate, warning, changes[] }` | keine |
| `encode.ts` | Startet FFmpeg und liest den Fortschritt über `-progress pipe:1`. Kümmert sich um Abbrechen (Prozess beenden, halbe Datei löschen), 2-Pass, das Nachprüfen der Größe und den Rückfall auf die CPU | ffmpeg, plan |
| `preview.ts` | Erzeugt den 5-Sekunden-Ausschnitt als Original und als Ergebnis in einem temporären Ordner | ffmpeg, plan |
| `presets.ts` | Eingebaute Presets plus `%APPDATA%\Pyno's Squish\presets.json` | fs |
| `ipc.ts` | Die typisierte Schnittstelle: `probe`, `plan`, `preview`, `encode`, `cancel`, `presets.*`, `revealInFolder`, `openExternal` | alle |

### 5.2 Renderer

Es gibt fünf Screens (`DropScreen`, `SettingsScreen`, `CompareScreen`, `EncodingScreen`, `DoneScreen`) und gemeinsame Bausteine (`Segmented`, `PresetChips`, `SizeReadout`, `TimelineLoader`, `Seal`). Der Zustand liegt in einem kleinen Store pro Sitzung. `plan.ts` liegt in `src/shared/` und läuft sowohl im Renderer (sofortige Anzeige bei jeder Änderung) als auch im Main-Prozess (Encoding). Main und Renderer nutzen also exakt dieselbe Rechnung.

### 5.3 Sicherheit

`contextIsolation: true`, `nodeIntegration: false` und `sandbox: true` für den Renderer. Der Renderer bekommt nur die API aus `preload.ts`. `openExternal` akzeptiert ausschließlich die fest eingetragene Payhip-URL.

### 5.4 FFmpeg

Mitgeliefert wird ein aktueller Windows-Build (GPL, mit libx264, libx265, NVENC, AMF, QSV und zscale) unter `resources/bin/`. Squish ruft ihn als eigenes Programm auf. Unter „About“ stehen der GPL-Hinweis und der Link zum Quellcode des verwendeten Builds.

## 6. Bewegung

Es gilt der Abschnitt „Bewegung“ im Pyno-System:
- **Federn:** `snappy` für Auswahl, Hover und Tippen, `smooth` für Einblenden und Zahlen, `bouncy` nur für den Stempel und das erste Erscheinen des Primär-Buttons.
- **Muster:** Auswahl-Marker per `layoutId`, Wechsel per `AnimatePresence`, zählende Größenanzeige per `useSpring`.
- **Reduced motion:** Bei `useReducedMotion` gibt es nur Deckkraft.

## 7. Fehlerbehandlung

| Fall | Verhalten |
|---|---|
| Datei nicht lesbar oder ohne Videospur | Die Drop-Zone schüttelt, dazu „Can't read this file.“ |
| Hardware-Encoder bricht ab | Automatischer Neustart mit der CPU, Hinweis „Your GPU encoder failed, finished on CPU.“ |
| Größe über dem Limit | Nachkorrektur wie in 4.3. Das Limit wird garantiert eingehalten |
| Abbrechen | FFmpeg wird beendet, die halbe Datei gelöscht, zurück zu Settings |
| Festplatte voll oder Schreibfehler | Meldung mit Pfad, die halbe Datei wird gelöscht |
| FFmpeg-Absturz aus anderem Grund | Meldung plus „Show log“. Das Protokoll lässt sich kopieren |

## 8. Tests

- **Unit-Tests (Vitest) für `plan.ts`:**
  - Argumente je Encoder, Codec und Modus
  - Budget-Rechnung und Warnschwellen mit Vorschlag
  - die „Best“-Regeln (nie hochrechnen, Deckel bei 60 fps und 4K)
  - Hochkant-Videos, kein Ton, HDR, über 60 fps
  - 10 Minuten auf 10 MB
- **Integrationstests** mit dem mitgelieferten FFmpeg und per `testsrc2` erzeugten 5-Sekunden-Clips:
  - Das Limit wird eingehalten.
  - Die Nachkorrektur greift, erzwungen über eine künstlich knappe Marge.
  - Der Rückfall auf die CPU funktioniert, erzwungen über einen ungültigen Encoder.
  - Abbrechen räumt auf.
- **Manuelle Release-Checkliste:** je ein PC mit NVIDIA, AMD, Intel und nur CPU. Dazu jeweils ein iPhone-HDR-Clip, ein Hochkant-Clip und ein 120-fps-Clip.
