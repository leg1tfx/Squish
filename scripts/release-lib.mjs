// Helpers for the release dashboard (scripts/release-dashboard.mjs).
// Pure functions are covered by tests/release/release-lib.test.ts.
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { AwsClient } from 'aws4fetch'

/** Reads `version:` from a latest.yml text. */
export function ymlVersion(text) {
  const m = /^version:\s*['"]?([^'"\s]+)/m.exec(text)
  return m ? m[1] : null
}

/** Reads the generic feed URL from electron-builder.yml. */
export function feedUrl(builderYml) {
  const m = /^\s*url:\s*['"]?([^'"\s]+)/m.exec(builderYml)
  return m ? m[1].replace(/\/+$/, '') : null
}

/** Bucket folder for a feed URL whose domain maps to the bucket root, e.g. ".../squish" -> "squish". */
export function feedPrefix(url) {
  return new URL(url).pathname.replace(/^\/+|\/+$/g, '')
}

/** -1, 0 or 1. Plain x.y.z numbers only. */
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d < 0 ? -1 : 1
  }
  return 0
}

export function isVersion(v) {
  return /^\d+\.\d+\.\d+$/.test(v)
}

/** The three files the updater needs, in upload order (latest.yml last, so the feed never points at a missing file). */
export function releaseFiles(version) {
  const exe = `Pynos-Squish-Setup-${version}.exe`
  return [
    { name: exe, type: 'application/octet-stream', cache: 'public, max-age=31536000, immutable' },
    { name: `${exe}.blockmap`, type: 'application/octet-stream', cache: 'public, max-age=31536000, immutable' },
    { name: 'latest.yml', type: 'text/yaml; charset=utf-8', cache: 'no-cache' }
  ]
}

/** What is in release/ for this version: sizes and whether latest.yml matches. */
export async function buildInfo(releaseDir, version) {
  const files = []
  for (const f of releaseFiles(version)) {
    const p = join(releaseDir, f.name)
    files.push({ name: f.name, size: existsSync(p) ? (await stat(p)).size : null })
  }
  const yml = join(releaseDir, 'latest.yml')
  const ymlVer = existsSync(yml) ? ymlVersion(await readFile(yml, 'utf8')) : null
  return { files, ready: files.every((f) => f.size !== null) && ymlVer === version, ymlVersion: ymlVer }
}

export function r2Client(cfg) {
  return new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: 's3', region: 'auto', retries: 3 })
}

export function r2Endpoint(cfg) {
  return (cfg.endpoint || `https://${cfg.accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, '')
}

function objectUrl(cfg, key) {
  return `${r2Endpoint(cfg)}/${encodeURIComponent(cfg.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`
}

/** Lists one key to prove the credentials and bucket name work. */
export async function testConnection(cfg) {
  const r = await r2Client(cfg).fetch(`${r2Endpoint(cfg)}/${encodeURIComponent(cfg.bucket)}?list-type=2&max-keys=1`)
  if (!r.ok) throw new Error(`R2 antwortet mit ${r.status}: ${short(await r.text())}`)
}

export async function uploadFile(cfg, key, path, type, cache) {
  const body = await readFile(path)
  const r = await r2Client(cfg).fetch(objectUrl(cfg, key), {
    method: 'PUT', body, headers: { 'Content-Type': type, 'Cache-Control': cache }
  })
  if (!r.ok) throw new Error(`Upload von ${key} fehlgeschlagen (${r.status}): ${short(await r.text())}`)
}

function short(text) {
  const code = /<Code>([^<]+)<\/Code>/.exec(text)
  return code ? code[1] : text.slice(0, 200)
}
