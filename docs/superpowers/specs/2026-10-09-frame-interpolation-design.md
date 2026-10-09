# Pyno's Squish: Frame-Interpolation (RIFE) Design

**Stand:** 2026-10-09 · **Status:** Entwurf zur Prüfung

## 1. Ziel und Abgrenzung

Squish kann optional die Bildrate eines Videos per KI-Interpolation auf **60 oder 120 fps** erhöhen, damit Bewegung flüssiger wirkt. Die Interpolation ist **standardmäßig aus**.

Nicht Teil dieser Spec (YAGNI): Slow-Motion, Modellauswahl, Fallback auf ffmpeg `minterpolate`, Interpolation auf andere Zielwerte als 60/120, Batch-Optimierung, macOS/Linux.

Erfolgskriterien:
- Ein 30-fps-Video lässt sich auf 60 oder 120 fps interpolieren und als MP4 ausgeben, mit unverändertem Audio-Verhalten.
- Ohne Zusatzmodul oder ohne Vulkan-GPU gibt es nie einen stillen Fallback, sondern eine klare Meldung.
- Abbrechen stoppt alle Prozesse und hinterlässt keine Temp-Dateien.
- Alles Bestehende (Presets, Zielgröße, Encoder-Fallback, Preview) verhält sich mit `interpolate: 'off'` exakt wie vorher.

## 2. Entscheidungen

| Thema | Entscheidung |
|---|---|
| Engine | `rife-ncnn-vulkan` (MIT), Modell `rife-v4.6`. Läuft über Vulkan auf NVIDIA, AMD und Intel, ohne Python und CUDA. |
| Auslieferung | Zusatzmodul wird beim ersten Gebrauch geladen, nicht gebündelt. |
| Paket | **Schlankes, selbst gehostetes Paket** (nur exe, benötigte DLLs, Modell `rife-v4.6`, MIT-Lizenz). Das offizielle Windows-ZIP ist 431 MB groß und hat keinen Hash, deshalb wird es nicht direkt geladen. |
| Hosting | GitHub-Release-Asset im Repo `leg1tfx/Squish`, Tag `rife-pack-1`. URL, SHA-256 und Größe stehen als Konstanten in `src/shared/rifePack.ts`. |
| Zielwerte | `interpolate: 'off' \| '60' \| '120'`. |
| Netzwerk | Die Regel "kein Netzwerkzugriff außer zwei Links" im ursprünglichen Plan gilt nicht mehr. Neu erlaubt: genau ein HTTPS-Download der Konstante `RIFE_PACK.url`, nur auf ausdrücklichen Klick des Nutzers. |

## 3. Einstellung und Planer (rein, `src/shared`)

- `types.ts`: `InterpolateChoice = 'off' | '60' | '120'`. `Settings` und `PresetSettings` bekommen `interpolate: InterpolateChoice`. `loadStore` setzt fehlende Werte in gespeicherten Presets auf `'off'`. Eingebaute Presets bekommen `'off'`.
- `planner.ts`:
  - Ist `interpolate !== 'off'` und die Quelle langsamer als das Ziel, gilt die Ausgabe-fps als Ziel (60 oder 120) und der bestehende `MAX_FPS = 60`-Deckel greift für diesen Fall nicht. Ist die Quelle bereits so schnell wie das Ziel oder schneller, wird nicht interpoliert (`plan.interpolation = null`) und die bisherige fps-Logik gilt.
  - `Plan` bekommt `interpolation: { targetFps: 60 | 120; frames: number } | null`. `frames = round(durationSec * targetFps)`.
  - `disabledInterpolate(info): InterpolateChoice[]` sperrt Ziele, die nicht über der Quell-fps liegen (Toleranz 0,5 fps wie bei `disabledFps`).
  - `changesFor`: Zeile `FRAME RATE`, z. B. `30 FPS → 120 FPS (interpoliert)`.
  - Die Bitrate im Qualitätsmodus nutzt weiter `width * height * fps * QUALITY_BPP`. Die Warnung für knappe Zielgröße nutzt die Ausgabe-fps, sodass 120 fps früher warnt.
  - `estimateBytes` ist unverändert formelbasiert.
- Der Fps-Wert für die Interpolation ist immer ganzzahlig (60 oder 120), also entfällt die Bruch-Schreibweise `fpsExpr` für diesen Pfad.

## 4. UI

- `SettingsScreen.tsx`: neues `Segmented<InterpolateChoice>`-Feld "Smooth motion" direkt unter "Frame rate", Optionen `Off · 60 · 120`. Gesperrte Optionen nutzen dieselbe Disabled-Mechanik wie `disabledFps`.
- Ist das Zusatzmodul nicht installiert, bleibt die Option wählbar. Der Klick auf "Squish" startet dann den Download-Dialog (Abschnitt 7). Ob eine Vulkan-GPU vorhanden ist, lässt sich erst nach der Installation prüfen (kleiner Testlauf mit zwei Frames). Bis dahin ist die Option wählbar. Zeigt der Test keine GPU, wird sie gesperrt und der Grund als Hilfetext angezeigt.
- Der Fortschritt zeigt bei aktiver Interpolation zwei Phasen: "Preparing frames", "Smoothing motion", "Encoding". Bestehende Springs und `reducedMotion` bleiben.
- Copy: Englisch, kein Gedankenstrich, Markenname "Pyno's Squish".

## 5. RIFE-Modul (`src/main/rife/`)

Jede Einheit ist einzeln testbar und bekommt ihre Abhängigkeiten injiziert.

- `pack.ts` (Konstanten in `src/shared/rifePack.ts`): `RIFE_PACK = { version, url, sha256, sizeBytes }`.
- `installer.ts`: `status()` liefert `installed | missing | corrupt`. `install({ onProgress, signal })` lädt per `fetch` in `userData\rife\.download.part`, streamt und hasht dabei mit SHA-256, vergleicht mit `RIFE_PACK.sha256`, entpackt in `userData\rife\.staging` und benennt erst nach Erfolg zu `userData\rife\<version>\` um. Bei Hash-Fehler, Abbruch oder Entpack-Fehler werden `.part` und `.staging` gelöscht. Ein Marker `ok.json` mit Version und Hash der exe zeigt "installed" an.
- `gpu.ts`: `probeVulkan()` erzeugt zwei 64×64-Frames, lässt RIFE daraus 3 Frames berechnen und wertet Exit-Code und Frame-Anzahl aus. Das Ergebnis wird einmal pro App-Start gecacht.
- `runRife.ts`: baut die Argumente (`-i`, `-o`, `-n`, `-m`, `-g`, `-j`), startet den Prozess über den bestehenden `createRunner`-Stil (Abbruch per `AbortSignal`) und liefert Fortschritt, indem es die geschriebenen Frames im Ausgabeordner zählt (RIFE meldet keinen verlässlichen Prozentwert).
- `ipc.ts`: neue Kanäle `rife:status`, `rife:install`, `rife:cancelInstall`, `rife:gpu`. Der Preload exponiert sie typisiert unter `window.squish.rife`.

## 6. Pipeline (`src/main/encode/`)

`runEncode` bleibt der einzige Einstieg. Ist `plan.interpolation === null`, läuft der Code unverändert.

Mit Interpolation:
1. **Vorprüfung:** Vulkan vorhanden, Modul installiert, freier Platz ausreichend (Abschnitt 8). Sonst Abbruch mit Meldung, bevor etwas geschrieben wird.
2. **Frames vorbereiten:** ffmpeg schreibt `tmpDir\frames-in\%08d.png` mit der bestehenden Filterkette ohne `fps`/`format`-Ende: Tonemapping bei HDR, Skalierung auf Ausgabeauflösung, `fps=<Quell-fps>` (macht VFR-Quellen zu CFR). RIFE rechnet dadurch schon in Ausgabeauflösung.
3. **Interpolieren:** `rife-ncnn-vulkan -i frames-in -o frames-out -n <plan.interpolation.frames> -m rife-v4.6`. Danach wird `frames-in` sofort gelöscht, um Platz zu sparen.
4. **Encodieren:** `buildArgs` bekommt `frames?: { dir: string; fps: number }`. Der Input wird `-framerate <fps> -i frames-out\%08d.png`, das Audio kommt zusätzlich aus dem Originalfile (`-i <source> -map 1:a:0`). Der Videofilter besteht nur noch aus `format=...`. Encoder, Bitraten, Passlogs, Zielgrößen-Retry und GPU-Fallback bleiben unverändert. Schritte 2 und 3 laufen nur einmal, alle Retries nutzen `frames-out`.
5. **Aufräumen:** `frames-in`, `frames-out` und Passlogs werden in einem `finally` entfernt, bei Erfolg, Fehler und Abbruch.

Fortschritt: `EncodeProgress` bekommt `phase: 'prepare' | 'interpolate' | 'encode'`. Die Anteile sind 10 % prepare, 60 % interpolate, 30 % encode und werden pro Phase aus Frame-Zählern bzw. dem ffmpeg-Fortschritt berechnet. Die Restzeit wird erst nach den ersten Interpolations-Frames aus der gemessenen Rate geschätzt.

Preview (Compare-Screen): Die Vorschau interpoliert nicht. Bei aktiver Interpolation steht im Compare-Screen ein Hinweis "Preview shows the original frame rate".

## 7. Meldungen

| Situation | Meldung |
|---|---|
| Modul fehlt, Nutzer startet | Dialog: "Smooth motion needs a small add-on (about X MB). Download now?" mit Download und Cancel. X kommt aus `RIFE_PACK.sizeBytes`. |
| Download läuft | Fortschrittsbalken mit MB, abbrechbar. |
| Download fertig | "Add-on installed. Starting your video." und der Encode startet automatisch. |
| Offline / Server nicht erreichbar | "Could not download the add-on. Check your connection and try again." |
| Hash stimmt nicht | "The download was damaged and was deleted. Try again." (Datei wird gelöscht.) |
| Keine Vulkan-GPU | Option gesperrt, Text: "Smooth motion needs a graphics card with Vulkan support. None was found." |
| Zu wenig Platz | "Not enough free space for smooth motion. About N GB needed on drive X, M GB free. Try a lower resolution or turn smooth motion off." |
| Hohe Laufzeit | Vor dem Start: "Smoothing this video can take a while." Nach den ersten Frames: Restzeit-Schätzung im Fortschritt. |
| RIFE abgestürzt | "Smooth motion stopped with an error." mit dem bestehenden Log-Dialog. Kein Fallback auf Original-fps. |
| Fertig | Die Done-Zusammenfassung nennt "Frame rate: 30 to 120 FPS (smoothed)". |

## 8. Plattenbedarf

PNG-Zwischenframes sind der größte Risikopunkt. Schätzung pro Frame: `width * height * 1,5` Bytes. Bedarf = Frames-in + Frames-out + 20 % Reserve. Beispiel: 1080p, 30 s, 30 → 120 fps ergibt 900 Eingabe- plus 3600 Ausgabeframes, also rund 17 GB inklusive Reserve. Die Vorprüfung vergleicht mit dem freien Platz auf dem Laufwerk von `tmpDir` und bricht mit der Meldung aus Abschnitt 7 ab. Die Schätzung (1,5 Byte pro Pixel) ist ein Richtwert und wird in Task 12 an einem echten Clip gegengeprüft. Ein Fehler kann nur zu früh oder zu spät warnen, nie Daten beschädigen.

## 9. Telemetrie

Keine neuen Ereignisse, keine Nutzerdaten. Falls später gewünscht, wäre ein Event `interpolation_used` eine eigene Änderung der Telemetrie-Allowlist.

## 10. Paket-Build (`scripts/build-rife-pack.mjs`)

Ein Node-Skript, das einmalig vom Entwickler läuft: lädt das offizielle ZIP `rife-ncnn-vulkan-20221029-windows.zip` in ein neues leeres Verzeichnis, entpackt es, kopiert nur exe, benötigte DLLs, `rife-v4.6` und die Lizenz in `rife-pack-1.zip`, und gibt SHA-256 und Größe aus. Der Entwickler lädt `rife-pack-1.zip` als Release-Asset `rife-pack-1` im Repo hoch und trägt die Werte in `src/shared/rifePack.ts` ein. Bis dahin ist `RIFE_PACK.sha256` leer, und die UI blendet "Smooth motion" aus (Feature-Flag aus Konstante, kein Netzwerkaufruf).

## 11. Tests

- **Reine Logik (Vitest):** Planer (Zielwahl, gesperrte Optionen, Frames, Warnung, Changes), `buildArgs` mit `frames` (kein `scale`/`fps` im Filter, Audio aus Input 1), Store-Migration (`interpolate` fehlt gespeichert → `'off'`), Plattenschätzung.
- **Modul-Tests mit Fakes:** Installer (Hash ok, Hash falsch, Abbruch mitten im Download, Entpackfehler, bereits installiert), `runRife` (Argumente, Abbruch, Frame-Zähler), `runEncode` mit Interpolation (Reihenfolge der Stufen, Aufräumen bei Erfolg, Fehler, Abbruch in jeder Phase, Retry nutzt dieselben Frames).
- **Integrationstest mit echtem RIFE** (übersprungen, wenn Modul oder Vulkan fehlt): 2 s Testclip, 30 → 60 und 24 → 120 fps, Prüfung der Frameanzahl und Dauer per ffprobe.
- **Task 1 (Machbarkeit, vor allem anderen):** Läuft `-n` mit `rife-v4.6` bei nicht ganzzahligem Faktor (24 → 120 ist ×5, 25 → 60 ist ×2,4) sauber und mit gleichmäßigen Zeitschritten? Falls nein, wird auf den nächsten ganzzahligen Faktor interpoliert und ffmpeg `fps` bringt auf den exakten Wert. Das Ergebnis ändert nur Schritt 3 der Pipeline, nicht die Schnittstellen.

## 12. Offene Risiken

1. `rife-v4.6` und nicht ganzzahlige Faktoren (siehe Task 1).
2. Plattenbedarf bei langen Clips in hoher Auflösung (siehe Abschnitt 8). Ein künftiger Ausweg wäre Segmentierung des Videos in Blöcke.
3. Das offizielle Release stammt von 2022. Es gibt dafür keine Updates, das Paket ist aber eingefroren und gehasht.
4. Das Hosting liegt beim Entwickler. Fällt das GitHub-Asset weg, schlägt der Download mit der Offline-Meldung fehl.

## Anhang: Spike-Ergebnis (Task 1)

`-n` mit `rife-v4.6` liefert bei 30 → 60, 30 → 120, 24 → 120 und 25 → 60 genau die gewünschte Frameanzahl, gleichmäßige Abstände (Abweichung höchstens 3 px bei 200 px Weg) und passende Start- und Endposition (Fehler 0). Ausgabedateien heißen `00000001.png` und aufwärts. Der Vulkan-Test mit zwei 64×64-Frames funktioniert. Wichtig: Eingabe-PNGs müssen `rgb24` sein, sonst liefert RIFE verzerrte Bilder (die Exportstufe erzwingt `format=rgb24`). Messwerte stehen in der Ausgabe von `scripts/rife-spike.mjs`.
