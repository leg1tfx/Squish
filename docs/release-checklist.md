# Release checklist

## Shipping an update to customers

Installed copies check for updates at start and every 6 hours, download in the background,
and install on the next quit (or right away via "Update ready · Restart" in the title bar).

One-time setup (Cloudflare dashboard, no server needed):
1. R2 Object Storage → Create bucket, name it `pynos-updates`. R2 asks for a payment method once; the free tier (10 GB, no download fees) covers this easily.
2. Open the bucket → Settings → Custom Domains → Connect Domain → `updates.pynos-ae-suite.de`.
3. In the bucket, create a folder `squish`.

Each update:
1. Raise `version` in `package.json` (e.g. `1.0.0` → `1.0.1`). Customers only get versions higher than theirs.
2. `npm run dist`.
3. In the bucket's `squish` folder, upload these three files from `release/`: `Pynos-Squish-Setup-<version>.exe`, `Pynos-Squish-Setup-<version>.exe.blockmap` and `latest.yml`. Upload `latest.yml` **last**, and replace the old one. You can delete the previous .exe and .blockmap afterwards.
4. Check `https://updates.pynos-ae-suite.de/squish/latest.yml` in the browser shows the new version.
5. Test: start an older installed version, wait a few seconds, check "Update ready · Restart" shows, click it, then check the About dialog shows the new version.

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
