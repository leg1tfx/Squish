import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RifePack } from '@shared/rifePack'
import { createInstaller, InstallError, RIFE_EXE, RIFE_MODEL, type InstallerDeps } from './installer'

const payload = Buffer.from('pretend this is a zip')
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
const pack: RifePack = { version: 'rife-pack-1', url: 'https://example.invalid/p.zip', sha256: sha(payload), sizeBytes: payload.length }
const okFetch: InstallerDeps['fetch'] = async () => new Response(payload, { headers: { 'content-length': String(payload.length) } })
const goodExtract: InstallerDeps['extract'] = async (_zip, dest) => {
  await writeFile(join(dest, RIFE_EXE), 'x')
  await mkdir(join(dest, RIFE_MODEL))
  await writeFile(join(dest, RIFE_MODEL, 'flownet.bin'), 'y')
}

let root = ''
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'squish-rife-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const make = (p: Partial<InstallerDeps> = {}) => createInstaller({ root, pack, fetch: okFetch, extract: goodExtract, ...p })

describe('rife installer', () => {
  it('is unavailable while the pack hash is not filled in', async () => {
    expect(await make({ pack: { ...pack, sha256: '' } }).status()).toBe('unavailable')
  })
  it('installs, reports progress and leaves no temp files', async () => {
    const seen: number[] = []
    const inst = make()
    expect(await inst.status()).toBe('missing')
    await inst.install({ onProgress: (done, total) => { seen.push(done); expect(total).toBe(payload.length) } })
    expect(seen.at(-1)).toBe(payload.length)
    expect(await inst.status()).toBe('installed')
    expect((await readdir(root)).sort()).toEqual(['rife-pack-1'])
    expect(inst.dir()).toBe(join(root, 'rife-pack-1'))
  })
  it('rejects a wrong hash and deletes everything', async () => {
    const inst = make({ fetch: async () => new Response(Buffer.from('tampered')) })
    await expect(inst.install({})).rejects.toMatchObject({ kind: 'hash' })
    expect(await readdir(root)).toEqual([])
    expect(await inst.status()).toBe('missing')
  })
  it('maps HTTP errors and network failures to network', async () => {
    await expect(make({ fetch: async () => new Response('no', { status: 404 }) }).install({})).rejects.toMatchObject({ kind: 'network' })
    await expect(make({ fetch: async () => { throw new TypeError('fetch failed') } }).install({})).rejects.toMatchObject({ kind: 'network' })
    expect(await readdir(root)).toEqual([])
  })
  it('aborts mid-download and cleans up', async () => {
    const hang: InstallerDeps['fetch'] = async (_u, init) => new Response(new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([1, 2, 3]))
        init.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')))
      }
    }))
    const ac = new AbortController()
    const p = make({ fetch: hang }).install({ signal: ac.signal, onProgress: () => ac.abort() })
    await expect(p).rejects.toBeInstanceOf(InstallError)
    await expect(p).rejects.toMatchObject({ kind: 'aborted' })
    expect(await readdir(root)).toEqual([])
  })
  it('reports unpack failures and incomplete packs', async () => {
    await expect(make({ extract: async () => { throw new Error('tar failed') } }).install({})).rejects.toMatchObject({ kind: 'extract' })
    await expect(make({ extract: async () => {} }).install({})).rejects.toMatchObject({ kind: 'extract' })
    expect(await readdir(root)).toEqual([])
  })
  it('treats a marker with another hash as missing and replaces it', async () => {
    const stale = join(root, 'rife-pack-1')
    await mkdir(stale, { recursive: true })
    await writeFile(join(stale, 'ok.json'), JSON.stringify({ sha256: 'old' }))
    const inst = make()
    expect(await inst.status()).toBe('missing')
    await inst.install({})
    expect(await inst.status()).toBe('installed')
  })
})
