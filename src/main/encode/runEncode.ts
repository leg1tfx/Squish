import { win32 } from 'node:path'
import { buildArgs, PASSLOG_NAME } from '@shared/ffmpegArgs'
import { buildPlan, MIN_VIDEO_KBPS } from '@shared/planner'
import type { EncodeProgress, EncodeResult, EncoderId, Plan, Settings, VideoInfo } from '@shared/types'
import type { Runner } from '../ffmpeg/runner'
import { applyProgressLine, type ProgressState } from './progress'

export interface EncodeRequest { info: VideoInfo; settings: Settings; available: EncoderId[]; output: string }
export interface EncodeDeps {
  run: Runner
  tmpDir: string
  fileSize: (p: string) => Promise<number>
  remove: (p: string) => Promise<void>
}
export type { EncodeProgress, EncodeResult }

export class EncodeError extends Error {
  constructor(public kind: 'aborted' | 'disk' | 'ffmpeg' | 'size', message: string, public log = '') { super(message) }
}

const PASSLOGS = [
  `${PASSLOG_NAME}-0.log`, `${PASSLOG_NAME}-0.log.mbtree`, `${PASSLOG_NAME}.log`, `${PASSLOG_NAME}.log.cutree`,
  // x264 writes these while a pass is still running and renames them away on completion; a cancel mid-pass
  // leaves the .temp files behind, so they must be cleaned up too.
  `${PASSLOG_NAME}-0.log.temp`, `${PASSLOG_NAME}-0.log.mbtree.temp`, `${PASSLOG_NAME}.log.temp`, `${PASSLOG_NAME}.log.cutree.temp`
]
const DISK_FULL = /No space left on device|There is not enough space on the disk/i

type Once = { ok: true } | { ok: false; log: string }

export async function runEncode(
  req: EncodeRequest,
  deps: EncodeDeps,
  on: { progress?: (p: EncodeProgress) => void; log?: (line: string) => void },
  signal?: AbortSignal
): Promise<EncodeResult> {
  const { info, settings, available, output } = req
  const cleanPasslogs = async (): Promise<void> => {
    for (const f of PASSLOGS) await deps.remove(win32.join(deps.tmpDir, f))
  }

  async function encodeOnce(plan: Plan): Promise<Once> {
    for (let pass = 1; pass <= plan.passes; pass++) {
      let st: ProgressState = { outTimeSec: 0, speed: null, ended: false }
      const args = buildArgs(info, plan, {
        input: info.path, output,
        pass: plan.passes === 2 ? (pass as 1 | 2) : undefined,
        passLogName: PASSLOG_NAME
      })
      on.log?.(`> ffmpeg ${args.join(' ')}`)
      const r = await deps.run(args, {
        cwd: deps.tmpDir, signal, onErrLine: on.log,
        onLine: (line) => {
          st = applyProgressLine(st, line)
          const within = Math.min(1, st.outTimeSec / info.durationSec)
          const fraction = (pass - 1 + within) / plan.passes
          const remainingSec = st.speed ? ((1 - fraction) * info.durationSec * plan.passes) / st.speed : null
          on.progress?.({ fraction, pass, passes: plan.passes, speed: st.speed, remainingSec, encoder: plan.encoder })
        }
      })
      if (r.aborted || signal?.aborted) {
        await deps.remove(output); await cleanPasslogs()
        throw new EncodeError('aborted', 'Cancelled')
      }
      if (r.code !== 0) {
        await deps.remove(output); await cleanPasslogs()
        if (DISK_FULL.test(r.stderrTail)) throw new EncodeError('disk', `Not enough disk space to write ${output}`, r.stderrTail)
        return { ok: false, log: r.stderrTail }
      }
    }
    await cleanPasslogs()
    return { ok: true }
  }

  let encoder = buildPlan(info, settings, available).encoder
  let videoKbps: number | undefined
  let fellBack = false
  let retries = 0
  let attempts = 0
  const limit = settings.maxMB !== null ? settings.maxMB * 1e6 : Infinity

  for (;;) {
    const plan = buildPlan(info, settings, available, { encoder, videoKbps })
    attempts++
    const r = await encodeOnce(plan)
    if (!r.ok) {
      if (encoder !== 'cpu') { encoder = 'cpu'; fellBack = true; retries = 0; continue }
      throw new EncodeError('ffmpeg', 'FFmpeg stopped with an error.', r.log)
    }
    const bytes = await deps.fileSize(output)
    if (bytes <= limit) return { output, bytes, encoder, fellBack, attempts }
    const lower = Math.max(MIN_VIDEO_KBPS, Math.floor(plan.videoKbps * (limit / bytes) * 0.98))
    if (retries < 2) { retries++; videoKbps = lower; continue }
    if (encoder !== 'cpu') { encoder = 'cpu'; retries = 0; videoKbps = lower; continue }
    await deps.remove(output)
    throw new EncodeError('size', `Could not get this video under ${settings.maxMB} MB.`)
  }
}
