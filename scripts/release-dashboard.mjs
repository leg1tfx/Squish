// Local release dashboard: `npm run dashboard`.
// Bumps the version, builds the installer and uploads it to the Cloudflare R2 update feed.
// Listens on 127.0.0.1 only. R2 keys live in .release-secrets.json (git-ignored).
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildInfo, compareVersions, feedPrefix, feedUrl, isVersion, releaseFiles, testConnection, uploadFile, ymlVersion
} from './release-lib.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 4318
const SECRETS = join(root, '.release-secrets.json')
const RELEASE_DIR = join(root, 'release')
const TOKEN = randomBytes(16).toString('hex')
const CONFIG_KEYS = ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket']

let job = null // { name, running, ok, log: string[] }

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'))
const localVersion = async () => (await readJson(join(root, 'package.json'))).version
const feed = async () => feedUrl(await readFile(join(root, 'electron-builder.yml'), 'utf8'))
const loadConfig = async () => (existsSync(SECRETS) ? readJson(SECRETS) : {})
const configured = (c) => CONFIG_KEYS.every((k) => typeof c[k] === 'string' && c[k].trim() !== '')

async function liveVersion(url) {
  try {
    const r = await fetch(`${url}/latest.yml?t=${Date.now()}`, { signal: AbortSignal.timeout(6000), cache: 'no-store' })
    if (r.status === 404) return { version: null }
    if (!r.ok) return { error: `HTTP ${r.status}` }
    return { version: ymlVersion(await r.text()) }
  } catch (e) {
    return { error: e.cause?.code || e.name || 'offline' }
  }
}

async function state() {
  const cfg = await loadConfig()
  const version = await localVersion()
  const url = await feed()
  return {
    version, feed: url, live: await liveVersion(url), build: await buildInfo(RELEASE_DIR, version),
    config: { configured: configured(cfg), accountId: cfg.accountId || '', accessKeyId: cfg.accessKeyId || '', bucket: cfg.bucket || '', hasSecret: !!cfg.secretAccessKey },
    job
  }
}

async function setVersion(next) {
  const pkgPath = join(root, 'package.json')
  const pkg = await readFile(pkgPath, 'utf8')
  await writeFile(pkgPath, pkg.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`))
  const lockPath = join(root, 'package-lock.json')
  if (existsSync(lockPath)) {
    const lock = await readJson(lockPath)
    lock.version = next
    if (lock.packages?.['']) lock.packages[''].version = next
    await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n')
  }
}

function startJob(name, fn) {
  if (job?.running) throw new Error('Es läuft schon etwas. Bitte kurz warten.')
  job = { name, running: true, ok: null, log: [] }
  const j = job
  const log = (line) => { j.log.push(line); if (j.log.length > 2000) j.log.splice(0, j.log.length - 2000) }
  fn(log).then(() => { j.ok = true }, (e) => { log(`✗ ${e.message}`); j.ok = false }).finally(() => { j.running = false })
}

function runBuild(log) {
  return new Promise((resolve, reject) => {
    log('> npm run dist')
    const p = spawn('npm', ['run', 'dist'], { cwd: root, shell: true, env: { ...process.env, FORCE_COLOR: '0' } })
    let rest = ''
    const onData = (d) => {
      const lines = (rest + d.toString()).split(/\r?\n/)
      rest = lines.pop()
      for (const l of lines) if (l.trim()) log(l.replace(/\x1b\[[0-9;]*m/g, ''))
    }
    p.stdout.on('data', onData)
    p.stderr.on('data', onData)
    p.on('error', reject)
    p.on('close', (code) => {
      if (rest.trim()) log(rest)
      code === 0 ? (log('✓ Installer gebaut.'), resolve()) : reject(new Error(`Build abgebrochen (Code ${code}).`))
    })
  })
}

async function runUpload(log) {
  const cfg = await loadConfig()
  if (!configured(cfg)) throw new Error('R2-Zugang fehlt. Bitte unter „Einstellungen“ eintragen.')
  const version = await localVersion()
  const url = await feed()
  const info = await buildInfo(RELEASE_DIR, version)
  if (!info.ready) throw new Error(`Für Version ${version} ist noch kein fertiger Build da. Bitte zuerst bauen.`)
  const live = await liveVersion(url)
  if (live.version && compareVersions(version, live.version) <= 0) {
    throw new Error(`Online ist schon ${live.version}. Bitte zuerst die Version erhöhen, sonst bekommen Kunden kein Update.`)
  }
  const prefix = feedPrefix(url)
  for (const f of releaseFiles(version)) {
    const size = info.files.find((x) => x.name === f.name)?.size
    log(`↑ ${f.name}${size ? ` (${size < 1e6 ? `${Math.ceil(size / 1e3)} KB` : `${(size / 1e6).toFixed(1)} MB`})` : ''} …`)
    await uploadFile(cfg, prefix ? `${prefix}/${f.name}` : f.name, join(RELEASE_DIR, f.name), f.type, f.cache)
    log(`✓ ${f.name}`)
  }
  const check = await liveVersion(url)
  if (check.version === version) log(`✓ Fertig. ${url}/latest.yml zeigt jetzt ${version}. Kunden bekommen das Update beim nächsten Start.`)
  else log(`! Hochgeladen, aber ${url}/latest.yml zeigt noch ${check.version ?? check.error ?? 'nichts'}. Prüfe die Custom Domain des Buckets.`)
}

async function body(req) {
  let s = ''
  for await (const c of req) { s += c; if (s.length > 1e5) throw new Error('Zu groß') }
  return s ? JSON.parse(s) : {}
}

const send = (res, code, data, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(type === 'application/json' ? JSON.stringify(data) : data)
}

const server = createServer(async (req, res) => {
  // Only this machine, and only pages served by this dashboard (blocks DNS rebinding and cross-site POSTs).
  if (req.headers.host !== `127.0.0.1:${PORT}` && req.headers.host !== `localhost:${PORT}`) return send(res, 403, { error: 'forbidden' })
  if (req.method === 'POST' && req.headers['x-dash-token'] !== TOKEN) return send(res, 403, { error: 'forbidden' })
  try {
    const path = new URL(req.url, 'http://x').pathname
    if (req.method === 'GET' && path === '/') {
      const html = await readFile(join(root, 'scripts', 'release-dashboard.html'), 'utf8')
      return send(res, 200, html.replace('__TOKEN__', TOKEN), 'text/html; charset=utf-8')
    }
    if (req.method === 'GET' && path === '/api/state') return send(res, 200, await state())
    if (req.method === 'POST' && path === '/api/version') {
      if (job?.running) throw new Error('Bitte warten, bis der laufende Schritt fertig ist.')
      const { version } = await body(req)
      if (!isVersion(version)) throw new Error('Version bitte als Zahlen, z. B. 1.0.1')
      const current = await localVersion()
      if (compareVersions(version, current) <= 0) throw new Error(`Die neue Version muss größer als ${current} sein.`)
      await setVersion(version)
      return send(res, 200, { ok: true })
    }
    if (req.method === 'POST' && path === '/api/build') { startJob('build', runBuild); return send(res, 200, { ok: true }) }
    if (req.method === 'POST' && path === '/api/upload') { startJob('upload', runUpload); return send(res, 200, { ok: true }) }
    if (req.method === 'POST' && path === '/api/settings') {
      const input = await body(req)
      const cfg = await loadConfig()
      for (const k of CONFIG_KEYS) {
        const v = typeof input[k] === 'string' ? input[k].trim() : ''
        if (v || k !== 'secretAccessKey') cfg[k] = v // an empty secret field keeps the saved one
      }
      await writeFile(SECRETS, JSON.stringify(cfg, null, 2) + '\n')
      if (!configured(cfg)) throw new Error('Gespeichert, aber es fehlen noch Felder.')
      await testConnection(cfg)
      return send(res, 200, { ok: true })
    }
    send(res, 404, { error: 'not found' })
  } catch (e) {
    send(res, 400, { error: e.message })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`
  console.log(`Release-Dashboard läuft: ${url}  (Beenden mit Strg+C)`)
  if (process.argv.includes('--no-open')) return
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]]
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
})
