import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Runner } from '../ffmpeg/runner'
import { rifeArgs } from './runRife'

export interface GpuProbeDeps {
  ffmpeg: Runner
  rife: Runner
  rifeCwd: string
  modelDir: string
  workDir: string
  count(dir: string): Promise<number>
}
export type GpuProbe = { ok: true } | { ok: false; log: string }

/** Definitive Vulkan check: RIFE must really turn two 64x64 frames into three. Run once per app start. */
export async function probeVulkan(d: GpuProbeDeps): Promise<GpuProbe> {
  const inDir = join(d.workDir, 'gpu-probe-in')
  const outDir = join(d.workDir, 'gpu-probe-out')
  const wipe = async (): Promise<void> => {
    await rm(inDir, { recursive: true, force: true }); await rm(outDir, { recursive: true, force: true })
  }
  await wipe()
  await mkdir(inDir, { recursive: true }); await mkdir(outDir, { recursive: true })
  try {
    const g = await d.ffmpeg(['-hide_banner', '-nostdin', '-y', '-f', 'lavfi', '-i', 'testsrc=s=64x64:r=2', '-frames:v', '2', '-pix_fmt', 'rgb24', join(inDir, '%08d.png')])
    if (g.code !== 0) return { ok: false, log: g.stderrTail }
    const r = await d.rife(rifeArgs({ inDir, outDir, frames: 3, modelDir: d.modelDir }), { cwd: d.rifeCwd })
    if (r.code === 0 && (await d.count(outDir)) === 3) return { ok: true }
    return { ok: false, log: r.stderrTail }
  } finally {
    await wipe()
  }
}
