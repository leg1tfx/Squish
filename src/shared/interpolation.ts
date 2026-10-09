import type { EncodePhase, InterpolateChoice, Plan, VideoInfo } from './types'

export const INTERP_TARGETS = [60, 120] as const
/** Same tolerance as disabledFps: 59.94 counts as 60. */
export const INTERP_TOLERANCE = 0.5
export const NO_VULKAN_MESSAGE = 'Smooth motion needs a graphics card with Vulkan support. None was found.'

const PNG_BYTES_PER_PIXEL = 1.5
const DISK_RESERVE = 1.2
const PHASE_START: Record<EncodePhase, number> = { prepare: 0, interpolate: 0.1, encode: 0.7 }
const PHASE_SPAN: Record<EncodePhase, number> = { prepare: 0.1, interpolate: 0.6, encode: 0.3 }

export function interpTarget(choice: InterpolateChoice): 60 | 120 | null {
  return choice === '60' ? 60 : choice === '120' ? 120 : null
}

export function disabledInterpolate(info: VideoInfo): InterpolateChoice[] {
  return INTERP_TARGETS.filter((t) => info.fps >= t - INTERP_TOLERANCE).map((t) => String(t) as InterpolateChoice)
}

export function sourceFrameCount(info: VideoInfo): number {
  return Math.ceil(info.durationSec * info.fps)
}

/** Peak temp disk use: input and output frames exist together while RIFE runs. */
export function interpolationDiskBytes(info: VideoInfo, plan: Plan): number {
  if (!plan.interpolation) return 0
  const perFrame = plan.width * plan.height * PNG_BYTES_PER_PIXEL
  return Math.round((sourceFrameCount(info) + plan.interpolation.frames) * perFrame * DISK_RESERVE)
}

export function overallFraction(phase: EncodePhase, within: number): number {
  const w = Math.min(1, Math.max(0, within))
  return PHASE_START[phase] + PHASE_SPAN[phase] * w
}
