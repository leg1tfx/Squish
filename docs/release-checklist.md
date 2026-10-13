# Release checklist

## Shipping an update to customers

Installed copies check for updates at start, at most once every 30 days, download in the background,
and install on the next quit (or right away via "Update ready · Restart" in the title bar).

Use the release dashboard: double-click `Update-Dashboard.bat` (or `npm run dashboard`). It shows the version customers have,
and walks through three buttons: new version number → build installer → publish. It fetches FFmpeg first if `resources/bin` is empty.

One-time Cloudflare R2 setup: see [Cloudflare-R2-Anleitung.md](Cloudflare-R2-Anleitung.md) (German, step by step).

After publishing, test once: start an older installed version, wait a few seconds, check "Update ready · Restart" shows, click it, then check the About dialog shows the new version.

Manual fallback without the dashboard: raise `version` in `package.json`, `npm run dist`, then upload `Pynos-Squish-Setup-<version>.exe`, its `.blockmap` and `latest.yml` (last) from `release/` into the bucket's `squish/` folder.

## Every release

- [ ] `PROMO_URL` in `src/shared/links.ts` points to Pyno's Payhip store (confirmed by Pyno).
- [ ] `APTABASE_APP_KEY` in `src/shared/links.ts` is the Pyno's Squish key. A packaged build shows up in the Aptabase dashboard under release data (not Debug).
- [ ] The Payhip product page says the app sends anonymous usage and error stats, and that they can be turned off in About.
- [ ] `npm run fetch-ffmpeg` run for this release; `resources/bin/LICENSE.txt` present.
- [ ] `npm run dist` green.
- [ ] Test PCs, each with: iPhone HDR clip, portrait phone clip, 120 fps clip, silent screen recording, 20-minute 4K file.
  - [ ] NVIDIA (NVENC listed, Auto uses NVENC)
  - [ ] AMD (AMF)
  - [ ] Intel iGPU (QSV)
  - [ ] No GPU / VM (CPU only, Discord preset does 2 passes)
- [ ] Discord 10 MB result is ≤ 10,000,000 bytes on every machine.
- [ ] Cancel mid-encode leaves no `_squish.mp4` and no `squish2pass*` in `%TEMP%\pynos-squish`.
- [ ] Reduced motion (Windows Settings > Accessibility > Visual effects > Animation effects off): no movement, only fades.
- [ ] About dialog shows the version and opens the FFmpeg source link.

## Manual checks before first release

- [ ] Install the setup. Start the app from the Start menu. The encoder dropdown lists the GPU.
- [ ] Encode "Pyno's clip ä.mp4" from Videos.
- [ ] presets.json appears in %APPDATA%\Pyno's Squish after you save a preset.
- [ ] Quit during an encode: no half file is left, and the temp folder is cleaned.
- [ ] Keyboard: Tab and arrow keys in the settings segments. Shift+F10 on a user preset chip opens Rename/Delete, and the menu stays open.
- [ ] Compare screen: drag the split with the mouse and with the arrow keys.
- [ ] Visual pass over all 5 screens in light of the spec (springs feel lively, nothing janky).
- [ ] Fresh install: the stats notice shows under the drop zone. "Got it" hides it for good (restart to check). "Turn off" hides it and the About switch shows off.
- [ ] About switch toggles with mouse, Tab + Space, and a screen reader announces it as a switch.
- [ ] Offline (network off or app blocked in the firewall): encode and quit work normally, with no delay.
