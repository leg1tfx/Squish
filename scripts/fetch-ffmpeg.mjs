import { mkdir, readdir, copyFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const api = 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/latest'
const rel = await (await fetch(api, { headers: { 'User-Agent': 'pynos-squish' } })).json()
const re = /^ffmpeg-n(\d+)\.(\d+)-latest-win64-gpl-\d+\.\d+\.zip$/
const asset = rel.assets
  .filter((a) => re.test(a.name))
  .sort((a, b) => {
    const [, am, an] = a.name.match(re); const [, bm, bn] = b.name.match(re)
    return (Number(bm) - Number(am)) || (Number(bn) - Number(an))
  })[0]
if (!asset) throw new Error('No win64 gpl release asset found')
console.log('Downloading', asset.name)
const work = join(tmpdir(), `squish-ffmpeg-${Date.now()}`)
await mkdir(work, { recursive: true })
const zip = join(work, asset.name)
await writeFile(zip, Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()))
execFileSync('tar', ['-xf', zip, '-C', work])
const dir = (await readdir(work, { withFileTypes: true })).find((d) => d.isDirectory()).name
const out = join(process.cwd(), 'resources', 'bin')
await mkdir(out, { recursive: true })
for (const f of ['ffmpeg.exe', 'ffprobe.exe']) await copyFile(join(work, dir, 'bin', f), join(out, f))
await copyFile(join(work, dir, 'LICENSE.txt'), join(out, 'LICENSE.txt'))
await rm(work, { recursive: true, force: true })
console.log('FFmpeg ready in', out)
