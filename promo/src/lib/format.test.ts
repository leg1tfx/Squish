import { describe, expect, it } from 'vitest'
import { countdownValue, formatMb } from './format'

describe('formatMb', () => {
  it('shows whole MB from 10 up and one decimal below', () => {
    expect(formatMb(48)).toBe('48 MB')
    expect(formatMb(10.04)).toBe('10 MB')
    expect(formatMb(9.7)).toBe('9.7 MB')
    expect(formatMb(9.96)).toBe('10 MB')
  })
})

describe('countdownValue', () => {
  it('runs from 48 to 9.7 and clamps', () => {
    expect(countdownValue(0)).toBe(48)
    expect(countdownValue(1)).toBeCloseTo(9.7)
    expect(countdownValue(1.2)).toBeCloseTo(9.7)
    expect(countdownValue(-0.1)).toBe(48)
  })
})
