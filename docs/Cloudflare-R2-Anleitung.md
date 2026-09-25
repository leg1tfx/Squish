# Updates einrichten: Cloudflare R2

Diese Anleitung machst du **nur einmal**. Danach veröffentlichst du jedes Update mit drei Klicks im Update-Dashboard.

**Dauer:** ca. 15 Minuten
**Kosten:** normalerweise 0 €. Der Gratis-Umfang von R2 sind 10 GB Speicher im Monat, und Downloads kosten bei R2 nie etwas. Ein Squish-Installer hat etwa 100–150 MB.

---

## Worum geht es?

Die Squish-App deiner Kunden schaut bei jedem Start unter dieser Adresse nach, ob es eine neue Version gibt:

```
https://updates.pynos-ae-suite.de/squish/latest.yml
```

Damit diese Adresse funktioniert, brauchst du drei Dinge bei Cloudflare:

1. **Einen Bucket.** Das ist ein Online-Ordner für die Update-Dateien.
2. **Eine Subdomain.** `updates.pynos-ae-suite.de` zeigt auf diesen Ordner.
3. **Einen Schlüssel.** Damit darf das Dashboard Dateien in den Ordner hochladen.

Einen Server brauchst du nicht.

> Die Menüs bei Cloudflare ändern sich ab und zu ein bisschen. Wenn ein Button anders heißt, such nach einem ähnlichen Namen. Die Reihenfolge der Schritte bleibt gleich.

---

## Schritt 1: R2 aktivieren

1. Melde dich auf [dash.cloudflare.com](https://dash.cloudflare.com) an.
2. Klick links im Menü auf **Storage & databases** → **R2 object storage**. In älteren Versionen heißt der Eintrag direkt **R2**.
3. Beim ersten Mal will Cloudflare eine **Zahlungsmethode** (Karte oder PayPal). Die ist Pflicht, auch wenn du nur den Gratis-Umfang nutzt. Abgebucht wird nur, wenn du über den Gratis-Umfang kommst, und das passiert bei Squish praktisch nie.
4. Bestätige den Plan. Er heißt meist **R2 Free** oder **Standard** mit Gratis-Kontingent.

---

## Schritt 2: Bucket anlegen

1. Auf der R2-Übersicht: **Create bucket**.
2. **Bucket name:** `pynos-updates`. Nur Kleinbuchstaben, Zahlen und Bindestriche.
3. **Location:** *Automatic* lassen.
4. **Default storage class:** *Standard* lassen.
5. **Create bucket** klicken.

Den Ordner `squish` im Bucket musst du **nicht** anlegen. Das erledigt das Dashboard beim ersten Hochladen.

---

## Schritt 3: Subdomain verbinden

Damit die Kunden-Apps die Dateien aus dem Bucket lesen können, bekommt er deine Subdomain.

1. Öffne den Bucket `pynos-updates`.
2. Oben auf den Reiter **Settings**.
3. Bei **Custom Domains** auf **+ Add** (oder **Connect Domain**) klicken.
4. Eintragen: `updates.pynos-ae-suite.de`
5. **Continue** → **Connect domain**.

Weil deine Domain schon bei Cloudflare liegt, legt Cloudflare den DNS-Eintrag selbst an. Der Status steht erst auf *Initializing* und nach ein paar Minuten auf **Active**.

**Wichtig:**
- Nimm genau `updates.pynos-ae-suite.de`. Diese Adresse ist fest in der App eingebaut.
- Den Schalter für die **R2.dev subdomain** / **Public Development URL** brauchst du nicht. Lass ihn aus.

---

## Schritt 4: Schlüssel für das Dashboard erstellen

1. Geh zurück zur **R2-Übersicht**.
2. Rechts (oder oben) bei **API Tokens** auf **Manage** klicken. Manchmal heißt es **Manage R2 API Tokens**.
3. **Create Account API token** klicken. Falls es nur **Create API token** gibt, nimm das.
4. Ausfüllen:
   - **Token name:** `Squish Dashboard`
   - **Permissions:** **Object Read & Write**
   - **Specify bucket(s):** *Apply to specific buckets only* → `pynos-updates`
   - **TTL:** *Forever*
5. **Create API Token** klicken.

Jetzt zeigt Cloudflare mehrere Werte an. **Lass die Seite offen**, denn den Secret Access Key siehst du nur dieses eine Mal. Du brauchst:

| Im Dashboard-Feld | Bei Cloudflare |
|---|---|
| **Access Key ID** | *Access Key ID* |
| **Secret Access Key** | *Secret Access Key* (der lange Wert) |
| **Account-ID** | Steht in der Endpoint-Adresse ganz vorne, z. B. `https://`**`a1b2c3…`**`.r2.cloudflarestorage.com`. Du findest sie auch auf der R2-Übersicht rechts bei *Account ID*. |
| **Bucket-Name** | `pynos-updates` |

Den *Token value* ganz oben brauchst du **nicht**.

---

## Schritt 5: Werte ins Dashboard eintragen

1. Doppelklick auf **`Update-Dashboard.bat`** im Squish-Ordner.
   - Beim allerersten Mal installiert es ein paar Minuten lang Pakete.
   - Falls die Meldung „Node.js ist nicht installiert“ kommt: [nodejs.org](https://nodejs.org) öffnen, die **LTS**-Version installieren und die `.bat` nochmal starten.
2. Der Browser öffnet das Dashboard. Unten bei **Einstellungen: Cloudflare R2** die vier Werte eintragen.
3. **Speichern & testen** klicken. Kommt „Verbindung klappt. Gespeichert.“, ist alles fertig.

Die Schlüssel werden nur auf deinem PC in der Datei `.release-secrets.json` gespeichert. Sie kommen nie ins Git-Repo und nie in die App. Gib diese Datei an niemanden weiter.

---

## Fertig! So veröffentlichst du ab jetzt ein Update

1. Doppelklick auf `Update-Dashboard.bat`.
2. **Schritt 1:** Versionsnummer wählen, z. B. „1.0.1 · Kleine Korrektur“.
3. **Schritt 2:** **Installer bauen** und warten, bis „fertig ✓“ erscheint.
4. **Schritt 3:** **Jetzt veröffentlichen**.

Oben bei **Bei den Kunden** steht danach die neue Nummer. Die Apps deiner Kunden laden das Update beim nächsten Start im Hintergrund. Danach erscheint bei ihnen oben „Update ready · Restart“.

**Einmal selbst testen:** Installier eine ältere Version auf deinem PC, veröffentliche eine neuere und starte die alte. Nach ein paar Sekunden sollte oben „Update ready · Restart“ erscheinen.

---

## Wenn etwas nicht klappt

| Meldung | Was tun |
|---|---|
| `InvalidAccessKeyId` oder `SignatureDoesNotMatch` | Access Key ID oder Secret ist falsch kopiert (oft fehlt ein Zeichen oder ein Leerzeichen ist dabei). Im Zweifel in Schritt 4 einen neuen Token erstellen und beide Werte neu eintragen. |
| `NoSuchBucket` | Bucket-Name im Dashboard stimmt nicht. Er muss genau `pynos-updates` heißen. |
| `AccessDenied` | Der Token hat nicht **Object Read & Write** oder gilt für einen anderen Bucket. Neuen Token erstellen (Schritt 4). |
| Oben steht „Nicht erreichbar“ | Die Subdomain ist noch nicht aktiv. In Schritt 3 prüfen, ob der Status **Active** ist. Kurz nach dem Verbinden einfach ein paar Minuten warten. |
| Oben steht „–“ / „noch nichts veröffentlicht“ | Ganz normal vor dem ersten Veröffentlichen. |
| „Hochgeladen, aber latest.yml zeigt noch …“ | Die Dateien sind oben, aber die Subdomain zeigt sie nicht. Prüfe in Schritt 3, ob `updates.pynos-ae-suite.de` beim **richtigen Bucket** steht und **Active** ist. |
| „Online ist schon 1.0.x“ | Du willst eine Nummer veröffentlichen, die es schon gibt. In Schritt 1 eine höhere Nummer wählen. |

**Aufräumen (optional):** Jedes Update legt einen neuen Installer in den Bucket. Alte Installer kannst du im Cloudflare-Dashboard im Bucket unter `squish/` löschen. Die Dateien der **aktuellen** Version und `latest.yml` dürfen nicht gelöscht werden. Bei 10 GB Gratis-Speicher ist das aber erst nach vielen Updates nötig.
