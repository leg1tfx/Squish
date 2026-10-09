import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import type { ReadableStream as WebStream } from 'node:stream/web'
import { rifePackReady, type RifePack } from '@shared/rifePack'
import type { RifeStatus } from '@shared/types'

export const RIFE_EXE = 'rife-ncnn-vulkan.exe'
export const RIFE_MODEL = 'rife-v4.6'
const MARKER = 'ok.json'
const NETWORK_MESSAGE = 'Could not download the add-on. Check your connection and try again.'

export type InstallErrorKind = 'network' | 'hash' | 'extract' | 'disk' | 'aborted'
export class InstallError extends Error {
  constructor(public kind: InstallErrorKind, message: string) { super(message) }
}

export interface InstallerDeps {
  /** Folder that holds all installed versions, e.g. userData\rife. */
  root: string
  pack: RifePack
  fetch: (url: string, init: { signal?: AbortSignal }) => Promise<Response>
  extract: (zipFile: string, destDir: string) => Promise<void>
}
export interface InstallOptions { onProgress?: (done: number, total: number) => void; signal?: AbortSignal }
export interface Installer {
  status(): Promise<RifeStatus>
  install(opts: InstallOptions): Promise<void>
  /** Folder with the exe and the model. Only valid when status() is 'installed'. */
  dir(): string
}

const exists = (p: string): Promise<boolean> => stat(p).then(() => true, () => false)
const wipe = async (p: string): Promise<void> => { await rm(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }

function failure(e: unknown, signal?: AbortSignal): InstallError {
  if (signal?.aborted) return new InstallError('aborted', 'Cancelled')
  if ((e as NodeJS.ErrnoException)?.code === 'ENOSPC') return new InstallError('disk', 'Not enough disk space to download the add-on.')
  return new InstallError('network', NETWORK_MESSAGE)
}

export function createInstaller(deps: InstallerDeps): Installer {
  const { root, pack } = deps
  const finalDir = join(root, pack.version)
  const part = join(root, '.download.part')
  const staging = join(root, '.staging')

  async function download(onProgress: InstallOptions['onProgress'], signal?: AbortSignal): Promise<void> {
    let res: Response
    try { res = await deps.fetch(pack.url, { signal }) } catch (e) { throw failure(e, signal) }
    if (!res.ok || !res.body) throw new InstallError('network', NETWORK_MESSAGE)
    const total = Number(res.headers.get('content-length')) || pack.sizeBytes
    const hash = createHash('sha256')
    const out = createWriteStream(part)
    let done = 0
    try {
      for await (const chunk of Readable.fromWeb(res.body as unknown as WebStream)) {
        hash.update(chunk)
        if (!out.write(chunk)) await once(out, 'drain')
        done += chunk.length
        onProgress?.(done, total)
      }
      out.end()
      await finished(out)
    } catch (e) {
      out.destroy()
      throw failure(e, signal)
    }
    if (hash.digest('hex') !== pack.sha256) throw new InstallError('hash', 'The download was damaged and was deleted. Try again.')
  }

  return {
    dir: () => finalDir,

    async status() {
      if (!rifePackReady(pack)) return 'unavailable'
      try {
        const marker = JSON.parse(await readFile(join(finalDir, MARKER), 'utf8')) as { sha256?: string }
        if (marker.sha256 !== pack.sha256) return 'missing'
        return (await exists(join(finalDir, RIFE_EXE))) && (await exists(join(finalDir, RIFE_MODEL))) ? 'installed' : 'missing'
      } catch {
        return 'missing'
      }
    },

    async install({ onProgress, signal } = {}) {
      await mkdir(root, { recursive: true })
      await wipe(part); await wipe(staging)
      try {
        await download(onProgress, signal)
        await mkdir(staging, { recursive: true })
        try { await deps.extract(part, staging) } catch { throw new InstallError('extract', 'The add-on could not be unpacked. Try again.') }
        if (!(await exists(join(staging, RIFE_EXE))) || !(await exists(join(staging, RIFE_MODEL)))) {
          throw new InstallError('extract', 'The add-on is incomplete. Try again.')
        }
        await writeFile(join(staging, MARKER), JSON.stringify({ sha256: pack.sha256 }))
        await wipe(finalDir)
        await rename(staging, finalDir)
      } finally {
        await wipe(part); await wipe(staging)
      }
    }
  }
}
