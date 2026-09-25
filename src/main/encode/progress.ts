export interface ProgressState { outTimeSec: number; speed: number | null; ended: boolean }

export function applyProgressLine(state: ProgressState, line: string): ProgressState {
  const i = line.indexOf('=')
  if (i < 0) return state
  const key = line.slice(0, i)
  const value = line.slice(i + 1).trim()
  if (key === 'out_time_us') {
    const us = Number(value)
    return Number.isFinite(us) ? { ...state, outTimeSec: us / 1e6 } : state
  }
  if (key === 'speed') {
    const sp = Number(value.replace('x', ''))
    return Number.isFinite(sp) && value !== 'N/A' ? { ...state, speed: sp } : state
  }
  if (key === 'progress' && value === 'end') return { ...state, ended: true }
  return state
}
