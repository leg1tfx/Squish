# Pyno's Squish: Telemetrie – Design Spec

**Datum:** 2026-09-25
**Status:** Entwurf zur Freigabe
**Ändert:** [2026-09-24-squish-design.md](2026-09-24-squish-design.md), Abschnitt 2 („Netzwerk: Keins“, „Telemetrie: Keine“)

## 1. Ziel

Pyno's Squish sendet anonyme Nutzungs- und Fehlerstatistiken, damit drei Fragen beantwortbar werden:

1. **Fehler:** Wo und warum scheitern Encodes (GPU-Encoder, Fallback, Plattenplatz, Größenlimit, unlesbare Dateien)?
2. **Nutzung:** Wie viele Sessions, welche App-Versionen, welche Presets, Codecs und Encoder werden genutzt?
3. **Marketing:** Wird die Pyno's-Promo auf dem Done-Screen gesehen, geklickt oder weggeklickt?

**Erfolg:** Die Fragen lassen sich im Aptabase-Dashboard beantworten, ohne dass je ein Dateiname, Pfad, Log-Text oder frei eingegebener Text die Maschine verlässt, und ohne dass die Telemetrie die App jemals verlangsamt oder stört.

## 2. Rahmen

| Punkt | Entscheidung |
|---|---|
| Dienst | Aptabase Cloud, Region EU, über einen eigenen schlanken Client (kein SDK, siehe 4.2) |
| Kennungen | Nur eine Session-ID (neu bei jedem Start und nach 1 h Inaktivität). Keine dauerhafte Geräte- oder Install-ID |
| Einwilligung | Opt-out: standardmäßig an, Hinweis beim ersten Start, jederzeit im About-Dialog abschaltbar |
| Automatische Systemdaten | OS-Name/-Version, Locale, Chromium-Version, App-Version, Client-Version, Debug-Flag |
| Netzwerk | Einzige neue Verbindung: Aptabase-Ingestion. Der Pyno's-Link bleibt wie bisher |

**Nicht im Umfang:** Crash-Reporting mit Stacktraces (Sentry o. Ä.), eigenes Backend, exakte Zählung von Installationen, Übersetzungen.

## 3. Events

Event-Namen und Props sind eine feste, getypte Allowlist in `src/shared/telemetry.ts`. Nur dort definierte Events können gesendet werden.

| Event | Auslöser | Props |
|---|---|---|
| `app_started` | Encoder-Erkennung abgeschlossen (nach Start) | `encoders`: kommagetrennte, sortierte Liste, z. B. `"cpu,nvenc"` |
| `encode_done` | Encode erfolgreich | `preset`, `edited`, `codec`, `res`, `fps`, `mode`, `encoder`, `gpu_fallback`, `attempts`, `input_mb`, `ratio`, `duration` |
| `encode_failed` | Encode-Fehler außer Abbruch | `kind` (`ffmpeg` / `disk` / `size`), `preset`, `codec`, `encoder_choice`, `encoders` |
| `encode_cancelled` | Abbruch durch Nutzer | `progress` |
| `probe_failed` | Datei nicht lesbar | `ext` |
| `promo_shown` | Promo-Karte auf Done-Screen sichtbar | – |
| `promo_clicked` | „See them →“ geklickt | – |
| `promo_dismissed` | Promo per × ausgeblendet | – |

**Prop-Werte:**

- `preset`: ID eines eingebauten Presets (`tiktok`, `reels`, …, `email`). Eigene Presets und alles Unbekannte werden zu `"custom"`. Preset-Namen werden nie gesendet.
- `edited`: `true`, wenn die Einstellungen vom gewählten Preset abweichen.
- `codec`, `res`, `fps`: die Werte aus `Settings` (`h264`/`h265`, `best`/`1440`/…).
- `mode`: `quality` (kein Limit, keine Bitrate), `target` (`maxMB` gesetzt) oder `bitrate`.
- `encoder`: tatsächlich benutzter Encoder aus `EncodeResult`. `encoder_choice`: `settings.encoder` (`auto`, `nvenc`, …).
- `gpu_fallback`: `EncodeResult.fellBack`. `attempts`: `EncodeResult.attempts`.
- `input_mb`: Bucket der Eingabegröße: `<10`, `10-50`, `50-100`, `100-500`, `500-2000`, `>=2000`.
- `ratio`: Ausgabe/Eingabe in Prozent als Bucket: `<10%`, `10-30%`, `30-50%`, `50-70%`, `70-90%`, `>=90%`.
- `duration`: Videolänge in Sekunden als Bucket: `<15`, `15-60`, `60-300`, `300-1200`, `>=1200`.
- `progress`: Fortschritt beim Abbruch: `0-25%`, `25-50%`, `50-75%`, `75-100%`.
- `ext`: Dateiendung klein geschrieben, nur wenn sie in der Liste des Datei-Dialogs steht (`mp4`, `mov`, `mkv`, `webm`, `avi`, `m4v`, `mts`, `m2ts`, `wmv`), sonst `"other"`.

**Harte Regeln:**

- Niemals Dateinamen, Pfade, FFmpeg-Argumente oder -Logs, Fehlermeldungstexte oder Preset-Namen senden.
- Zahlen nur als Bucket, nie exakt.
- Bucket-Grenzen: untere Grenze inklusiv, obere exklusiv.

## 4. Architektur

Alle Events werden im Main-Prozess gesendet. Der Renderer spricht Aptabase nie direkt an.

### 4.1 `src/shared/telemetry.ts` (neu, rein)

- Typ `TelemetryEvent` als Union aller Events aus Abschnitt 3 mit ihren Props.
- Reine Funktionen: `sizeBucket(bytes)`, `ratioBucket(inBytes, outBytes)`, `durationBucket(sec)`, `progressBucket(fraction)`, `presetProp(id)`, `extProp(path)`, `modeProp(settings)`.
- Konstante `RENDERER_EVENTS = ['promo_shown', 'promo_clicked', 'promo_dismissed']`.

### 4.2 `src/main/telemetry.ts` (neu)

Eigener Client statt `@aptabase/electron`. Das SDK ruft intern selbst `protocol.registerSchemesAsPrivileged` auf, was die Registrierung des `squish-media`-Schemes überschreiben kann (Vorschau und Compare wären kaputt). Außerdem öffnet es einen IPC-Kanal und ein `aptabase-ipc://`-Protokoll, über die Events am Consent-Check vorbei gesendet werden könnten. Die Aptabase-Ingestion-API ist dokumentiert und klein, ein eigener Client sind rund 60 Zeilen.

- `endpointFor(appKey)`: parst `A-<REGION>-<id>` zu `https://eu.aptabase.com/api/v0/event` bzw. `us`. Ungültiger oder leerer Key: `null`, Telemetrie ist dann ein No-op.
- `createTelemetry({ appKey, system, isEnabled, fetch })` liefert `{ track(event): Promise<void> }`.
  - `track` prüft zuerst `isEnabled()`, sendet dann genau ein Event als JSON-POST mit Header `App-Key`, Timeout 10 s.
  - Das Promise wird nie abgelehnt: alle Fehler (Netz, Timeout, `isEnabled` wirft) werden verschluckt. Aufrufer rufen es mit `void` auf.
  - Session-ID: Epoch-Sekunden plus 8 Zufallsziffern, neu nach 1 h ohne Event.
- `fetch` wird injiziert (in der App `net.fetch`), damit Tests ohne Netzwerk laufen.

### 4.3 Einbindung

- **`src/main/index.ts`:** baut die Telemetrie in `app.whenReady()` (dort sind `app.getLocale()` und `net.fetch` verfügbar) und reicht eine Factory an `registerIpc` weiter, die den Consent-Check aus dem Store bekommt.
- **`src/main/ipc.ts`:**
  - `app_started`, sobald `encodersP` aufgelöst ist.
  - `probe_failed` im `catch` des `probe`-Handlers.
  - In `doEncode`: `encode_done` bei Erfolg, `encode_cancelled` bei `kind === 'aborted'` (mit zuletzt gemeldetem Fortschritt), sonst `encode_failed`.
  - Neuer Kanal `telemetry:track`: akzeptiert nur Namen aus `RENDERER_EVENTS`, alles andere wird ignoriert.
  - Neuer Kanal `store:setTelemetry(on: boolean)` und `store:telemetryNoticeSeen()`.
- **Encode-API:** `encode(settings, meta)` bekommt ein zweites Argument `meta: { presetId: string; edited: boolean }`. Der Renderer kennt Preset und Bearbeitungsstatus bereits. Main wandelt `presetId` per `presetProp` um.
- **App-Key:** Konstante `APTABASE_APP_KEY` in `src/shared/links.ts`. Der Key ist öffentlich und darf in der exe stehen.

### 4.4 Store

`StoreData` bekommt zwei Felder:

```ts
telemetry: 'on' | 'off'        // Standard 'on'
telemetryNoticeSeen: boolean   // Standard false
```

`loadStore` setzt fehlende Felder auf die Standards. Ein vorhandener, aber ungültiger `telemetry`-Wert wird als `'off'` gelesen (im Zweifel nicht senden). `store:setTelemetry` setzt zusätzlich `telemetryNoticeSeen = true`, damit der Hinweis nicht mehr „shares“ sagt, nachdem jemand im About-Dialog abgeschaltet hat. `version` bleibt `1`. Der Enabled-Check in `ipc.ts` liest den gecachten Store: `(await getStore()).telemetry === 'on'`. `app_started` wird erst gesendet, nachdem der Store geladen ist, damit ein `'off'` auch beim Start greift.

### 4.5 UI

- **Hinweis-Karte (Drop-Screen):** erscheint, solange `telemetryNoticeSeen === false`. Spring-Einblendung passend zum bestehenden Motion-System, respektiert Reduced Motion.
  - Text: „Pyno's Squish shares anonymous usage and error stats to help improve the app. No file names, no personal data.“
  - Buttons: **Got it** (setzt nur `telemetryNoticeSeen`), **Turn off** (setzt `telemetry = 'off'` und `telemetryNoticeSeen`).
  - Link „What's sent?“ klappt eine kurze Liste auf: App-Version und OS, genutzte Presets und Einstellungen, grobe Dateigrößen-Bereiche, Fehlerarten, Promo-Klicks.
  - Die Karte blockiert nichts. Drop und Dateiauswahl funktionieren weiter.
- **About-Dialog:** Schalter „Share anonymous stats“, gebunden an `telemetry`. Tastaturbedienbar, mit korrekter ARIA-Rolle (`switch`).
- **Done-Screen:** `promo_shown` beim Einblenden der Promo-Karte (einmal pro Done-Screen), `promo_clicked` und `promo_dismissed` an den bestehenden Buttons.

## 5. Fehlerverhalten

- Offline, DNS-Fehler, Timeout oder blockierte Firewall: Events gehen verloren, keine Fehlermeldung, kein Retry.
- Kein Code-Pfad (Encode, Preview, Quit) wartet auf die Telemetrie. Der `before-quit`-Ablauf bleibt unverändert.
- Dev-Builds senden `isDebug: true` (`!app.isPackaged`) und erscheinen im Dashboard getrennt von Release-Daten.

## 6. Tests

- **`src/shared/telemetry.test.ts`:** alle Bucket-Funktionen inklusive Grenzwerte, `presetProp` (eingebaut, eigen, unbekannt), `extProp` (bekannt, Großschreibung, unbekannt, ohne Endung), `modeProp`.
- **`src/main/telemetry.test.ts`:** mit gemocktem `fetch`: Key-Parsing, Payload-Form, sendet nicht bei `'off'`, verschluckt Netz- und Consent-Fehler, No-op bei ungültigem Key, Session-Wechsel nach 1 h.
- **`src/main/store/presetStore.test.ts`:** alte Store-Datei ohne die neuen Felder lädt mit `'on'`/`false`, ungültige Werte fallen auf Standards zurück.
- **Renderer-IPC-Allowlist:** `telemetry:track` mit einem Nicht-Promo-Namen sendet nichts.

## 7. Setup und Release

- Nutzer legt ein Aptabase-Konto an (Region EU), erstellt die App „Pyno's Squish“ und trägt den App-Key ein.
- `docs/release-checklist.md` bekommt zwei Punkte:
  - `APTABASE_APP_KEY` gesetzt und ein Release-Build erscheint im Dashboard (nicht als Debug).
  - Die Payhip-Produktseite erwähnt, dass die App anonyme Nutzungs- und Fehlerstatistiken sendet und wie man sie abschaltet.
- Die Ursprungs-Spec wird in Abschnitt 2 angepasst: „Netzwerk“ nennt Aptabase, „Telemetrie“ verweist auf diese Spec.
