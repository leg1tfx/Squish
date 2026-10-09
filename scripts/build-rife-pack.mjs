import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const OFFICIAL = 'https://github.com/nihui/rife-ncnn-vulkan/releases/download/20221029/rife-ncnn-vulkan-20221029-windows.zip'
const LICENSE_URL = 'https://raw.githubusercontent.com/nihui/rife-ncnn-vulkan/master/LICENSE'
const MODEL = 'rife-v4.6'
const VERSION = 'rife-pack-1'
// Explicit path: Git Bash puts GNU tar first on PATH, which cannot read zip files.
const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')

const work = await mkdtemp(join(tmpdir(), 'squish-rife-pack-'))
try {
  const official = join(work, 'official.zip')
  console.log('Downloading the official package (about 431 MB)...')
  const res = await fetch(OFFICIAL)
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(official))

  const src = join(work, 'official')
  await mkdir(src)
  execFileSync(tar, ['-xf', official, '-C', src])
  const top = await readdir(src, { withFileTypes: true })
  const root = top.length === 1 && top[0].isDirectory() ? join(src, top[0].name) : src
  console.log('Official package contains:', (await readdir(root)).join(', '))

  const stage = join(work, 'stage')
  await mkdir(stage)
  await copyFile(join(root, 'rife-ncnn-vulkan.exe'), join(stage, 'rife-ncnn-vulkan.exe'))
  for (const f of await readdir(root)) if (f.toLowerCase().endsWith('.dll')) await copyFile(join(root, f), join(stage, f))
  await cp(join(root, MODEL), join(stage, MODEL), { recursive: true })
  const lic = await fetch(LICENSE_URL)
  if (!lic.ok) throw new Error(`License download failed: ${lic.status}`)
  await writeFile(join(stage, 'LICENSE.txt'), await lic.text())

  const out = join(process.cwd(), 'resources', 'rife-pack')
  await mkdir(out, { recursive: true })
  const zip = join(out, `${VERSION}.zip`)
  await rm(zip, { force: true })
  execFileSync(tar, ['-a', '-c', '-f', zip, '-C', stage, '.'])

  const hash = createHash('sha256')
  for await (const chunk of createReadStream(zip)) hash.update(chunk)
  console.log('Pack ready:', zip)
  console.log(JSON.stringify({ version: VERSION, sha256: hash.digest('hex'), sizeBytes: (await stat(zip)).size }, null, 2))
  console.log('Upload exactly this file. Any rebuild changes the hash.')
} finally {
  await rm(work, { recursive: true, force: true })
}
