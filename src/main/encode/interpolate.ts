import { win32 } from 'node:path'
import { buildFrameExportArgs } from '@shared/ffmpegArgs'
import { formatBytes } from '@shared/format'
import { interpolationDiskBytes } from '@shared/interpolation'
import type { EncodePhase, Plan, VideoInfo } from '@shared/types'
import type { Runner } from '../ffmpeg/runner'
import { runRife } from '../rife/runRife'
import { DISK_FULL, EncodeError } from './errors'
import { applyProgressLine, type ProgressState } from './progress'

export const FRAMES_IN = 'frames-in'
export const FRAMES_OUT = 'frames-out'

export interface InterpolateDeps {
  ffmpeg: Runner
  /** A runner bound to rife-ncnn-vulkan.exe. */
  rife: Runner
  rifeCwd: string
  modelDir: string
  tmpDir: string
  freeBytes(dir: string): Promise<number>
  countFiles(dir: string): Promise<number>
  makeDir(path: string): Promise<void>
  removeDir(path: string): Promise<void>
  pollMs?: number
}
export interface Frames { dir: string; fps: number; cleanup(): Promise<void> }
export type StepFn = (phase: EncodePhase, within: number) => void

function exportFailure(log: string): EncodeError {
  return DISK_FULL.test(log)
    ? new EncodeError('disk', 'Not enough disk space to prepare the frames.', log)
    : new EncodeError('ffmpeg', 'FFmpeg stopped with an error.', log)
}

/** Stages 1 and 2 of smooth motion: source -> PNG frames -> RIFE -> interpolated PNG frames. */
export async function prepareFrames(
  req: { info: VideoInfo; plan: Plan; input: string },
  deps: InterpolateDeps,
  on: { step?: StepFn; log?: (line: string) => void },
  signal?: AbortSignal
): Promise<Frames> {
  const { info, plan } = req
  const interp = plan.interpolation
  if (!interp) throw new Error('prepareFrames needs a plan with interpolation.')
  const inDir = win32.join(deps.tmpDir, FRAMES_IN)
  const outDir = win32.join(deps.tmpDir, FRAMES_OUT)
  const cleanup = async (): Promise<void> => { await deps.removeDir(inDir); await deps.removeDir(outDir) }

  const needed = interpolationDiskBytes(info, plan)
  const free = await deps.freeBytes(deps.tmpDir)
  if (free < needed) {
    const drive = win32.parse(deps.tmpDir).root.replace(/\\$/, '')
    throw new EncodeError('disk',
      `Not enough free space for smooth motion. About ${formatBytes(needed)} needed on drive ${drive}, ${formatBytes(free)} free. Try a lower resolution or turn smooth motion off.`)
  }

  try {
    await cleanup() // leftovers from a crashed run
    await deps.makeDir(inDir)
    await deps.makeDir(outDir)

    let st: ProgressState = { outTimeSec: 0, speed: null, ended: false }
    const args = buildFrameExportArgs(info, plan, { input: req.input, dir: inDir })
    on.log?.(`> ffmpeg ${args.join(' ')}`)
    const ex = await deps.ffmpeg(args, {
      signal, onErrLine: on.log,
      onLine: (line) => { st = applyProgressLine(st, line); on.step?.('prepare', st.outTimeSec / info.durationSec) }
    })
    if (ex.aborted || signal?.aborted) throw new EncodeError('aborted', 'Cancelled')
    if (ex.code !== 0) throw exportFailure(ex.stderrTail)

    on.step?.('interpolate', 0)
    const r = await runRife(
      { run: deps.rife, cwd: deps.rifeCwd, count: deps.countFiles, pollMs: deps.pollMs },
      { inDir, outDir, frames: interp.frames, modelDir: deps.modelDir, signal, onLog: on.log,
        onFrames: (n) => on.step?.('interpolate', n / interp.frames) }
    )
    if (r.aborted) throw new EncodeError('aborted', 'Cancelled')
    if (!r.ok || (await deps.countFiles(outDir)) < interp.frames) throw new EncodeError('smooth', 'Smooth motion stopped with an error.', r.log)

    await deps.removeDir(inDir) // the source frames are no longer needed; free the disk early
    return { dir: outDir, fps: interp.targetFps, cleanup }
  } catch (e) {
    await cleanup()
    throw e
  }
}
