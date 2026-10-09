import type { Runner } from '../ffmpeg/runner'

export interface RifeRunDeps {
  /** A runner bound to rife-ncnn-vulkan.exe. */
  run: Runner
  /** The exe's own folder: it loads its DLLs from there. */
  cwd: string
  count(dir: string): Promise<number>
  pollMs?: number
}
export interface RifeRunOptions {
  inDir: string
  outDir: string
  frames: number
  modelDir: string
  signal?: AbortSignal
  onFrames?: (written: number) => void
  onLog?: (line: string) => void
}
export interface RifeRunResult { ok: boolean; aborted: boolean; log: string }

export function rifeArgs(o: Pick<RifeRunOptions, 'inDir' | 'outDir' | 'frames' | 'modelDir'>): string[] {
  return ['-i', o.inDir, '-o', o.outDir, '-n', String(o.frames), '-m', o.modelDir]
}

/** RIFE prints no usable percentage, so progress is the number of finished frames in the output folder. */
export async function runRife(deps: RifeRunDeps, o: RifeRunOptions): Promise<RifeRunResult> {
  const poll = setInterval(() => {
    void deps.count(o.outDir).then((n) => o.onFrames?.(n)).catch(() => {})
  }, deps.pollMs ?? 500)
  try {
    const r = await deps.run(rifeArgs(o), { cwd: deps.cwd, signal: o.signal, onErrLine: o.onLog })
    return { ok: r.code === 0 && !r.aborted, aborted: r.aborted || o.signal?.aborted === true, log: r.stderrTail }
  } finally {
    clearInterval(poll)
  }
}
