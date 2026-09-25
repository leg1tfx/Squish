import { win32 } from 'node:path'
import { unlink } from 'node:fs/promises'
import { buildArgs, TONEMAP_CHAIN } from '@shared/ffmpegArgs'
import { buildPlan } from '@shared/planner'
import type { EncoderId, Settings, VideoInfo } from '@shared/types'
import type { Runner } from '../ffmpeg/runner'

export function sampleWindow(info: VideoInfo): { startSec: number; durationSec: number } {
  const durationSec = Math.min(5, info.durationSec)
  return { startSec: Math.max(0, info.durationSec / 2 - durationSec / 2), durationSec }
}

const sdr = (info: VideoInfo, extra: string[] = []): string => [...(info.hdr ? TONEMAP_CHAIN : []), ...extra, 'format=yuv420p'].join(',')
const EVEN_SCALE = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'

export type RemoveFn = (path: string) => Promise<void>
const defaultRemove: RemoveFn = (path) => unlink(path).catch(() => {})

export async function makeThumbnail(run: Runner, info: VideoInfo, outFile: string): Promise<boolean> {
  const r = await run(['-hide_banner', '-nostdin', '-y', '-ss', String(info.durationSec * 0.1), '-i', info.path,
    '-frames:v', '1', '-vf', sdr(info, ['scale=-2:540']), '-q:v', '3', outFile])
  return r.code === 0
}

let counter = 0

export async function makePreview(
  run: Runner, req: { info: VideoInfo; settings: Settings; available: EncoderId[] }, dir: string,
  signal?: AbortSignal, remove: RemoveFn = defaultRemove
): Promise<{ before: string; after: string }> {
  const { info } = req
  const n = ++counter
  const win = sampleWindow(info)
  const before = `before-${n}.mp4`
  const after = `after-${n}.mp4`
  const beforePath = win32.join(dir, before)
  const raw = win32.join(dir, `after-raw-${n}.mp4`)
  const finalPath = win32.join(dir, after)
  const cleanup = async (): Promise<void> => {
    await Promise.all([remove(beforePath), remove(raw), remove(finalPath)])
  }
  const display = (inFile: string, vf: string, outFile: string): string[] =>
    ['-hide_banner', '-nostdin', '-y', '-ss', String(win.startSec), '-i', inFile, '-t', String(win.durationSec),
      '-map', '0:v:0', '-an', '-vf', vf, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', outFile]

  const b = await run(display(info.path, sdr(info, [EVEN_SCALE]), beforePath), { signal })
  if (b.code !== 0) { await cleanup(); throw new Error('Preview failed (before).') }

  const encodeAfter = async (encoder?: EncoderId): Promise<{ ok: boolean; codec: string }> => {
    const base = buildPlan(info, req.settings, req.available, encoder ? { encoder } : {})
    const plan = { ...base, passes: 1 as const }
    const args = buildArgs(info, plan, { input: info.path, output: raw, sample: win })
    const r = await run(args, { signal })
    return { ok: r.code === 0, codec: plan.codec }
  }
  let a = await encodeAfter()
  if (!a.ok) a = await encodeAfter('cpu')
  if (!a.ok) { await cleanup(); throw new Error('Preview failed (after).') }

  const conv = await run(['-hide_banner', '-nostdin', '-y', '-i', raw, '-map', '0:v:0', '-an',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', finalPath], { signal })
  await remove(raw)
  if (conv.code !== 0) { await cleanup(); throw new Error('Preview failed (display copy).') }
  return { before, after }
}
