import { describe, expect, it } from 'vitest'
import { applyProgressLine } from './progress'

const s0 = { outTimeSec: 0, speed: null, ended: false }

describe('applyProgressLine', () => {
  it('reads out_time_us, speed and end', () => {
    let s = applyProgressLine(s0, 'out_time_us=12500000')
    s = applyProgressLine(s, 'speed=4.2x')
    expect(s).toEqual({ outTimeSec: 12.5, speed: 4.2, ended: false })
    expect(applyProgressLine(s, 'progress=end').ended).toBe(true)
  })
  it('ignores N/A and unknown keys', () => {
    expect(applyProgressLine(s0, 'out_time_us=N/A')).toEqual(s0)
    expect(applyProgressLine(s0, 'speed=N/A')).toEqual(s0)
    expect(applyProgressLine(s0, 'frame=10')).toEqual(s0)
  })
})
