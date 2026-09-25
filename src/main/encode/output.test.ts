import { describe, expect, it } from 'vitest'
import { uniqueOutputPath } from './output'

describe('uniqueOutputPath', () => {
  it('appends _squish.mp4 next to the source', () => {
    expect(uniqueOutputPath('D:\\Videos\\vlog final.mov', () => false)).toBe('D:\\Videos\\vlog final_squish.mp4')
  })
  it('counts up instead of overwriting', () => {
    const taken = new Set(['D:\\V\\a_squish.mp4', 'D:\\V\\a_squish (2).mp4'])
    expect(uniqueOutputPath('D:\\V\\a.mp4', (p) => taken.has(p))).toBe('D:\\V\\a_squish (3).mp4')
  })
  it('keeps apostrophes and umlauts', () => {
    expect(uniqueOutputPath("C:\\x\\Pyno's clip ä.mp4", () => false)).toBe("C:\\x\\Pyno's clip ä_squish.mp4")
  })
})
