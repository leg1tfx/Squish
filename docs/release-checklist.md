# Release checklist

## Shipping an update to customers

Installed copies check for updates at start and every 6 hours, download in the background,
and install on the next quit (or right away via "Update ready · Restart" in the title bar).

One-time setup:
- Create the **public** repo `leg1tfx/squish-releases` on GitHub (empty; it only holds releases).
- Create a GitHub token with write access to that repo (fine-grained: Contents read/write).

Each update:
1. Raise `version` in `package.json` (e.g. `1.0.0` → `1.0.1`). Customers only get versions higher than theirs.
2. `set GH_TOKEN=<token>` (PowerShell: `$env:GH_TOKEN="<token>"`), then `npm run release`.
3. This uploads `Pynos-Squish-Setup-<version>.exe`, its `.blockmap` and `latest.yml` to a release on `squish-releases`. Do not delete or rename `latest.yml`; the apps read it.
4. Test: start an older installed version, wait a few seconds, check "Update ready · Restart" shows, click it, then check the About dialog shows the new version.

`npm run dist` still builds locally without publishing.

## Every release

- [ ] `PROMO_URL` in `src/shared/links.ts` points to Pyno's Payhip store (confirmed by Pyno).
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
