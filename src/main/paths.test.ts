import { describe, expect, it } from 'vitest'
import { binPath } from './paths'

describe('binPath', () => {
  it('uses resources/bin under the app folder in development', () => {
    expect(binPath('ffmpeg', { packaged: false, resourcesPath: 'X', appPath: 'C:\\dev\\squish' }))
      .toBe('C:\\dev\\squish\\resources\\bin\\ffmpeg.exe')
  })
  it('uses process.resourcesPath/bin when packaged', () => {
    expect(binPath('ffprobe', { packaged: true, resourcesPath: 'C:\\App\\resources', appPath: 'Y' }))
      .toBe('C:\\App\\resources\\bin\\ffprobe.exe')
  })
})
