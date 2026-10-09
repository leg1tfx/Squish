import { describe, expect, it } from 'vitest'
import { makePreview, sampleWindow } from './preview'
import type { Runner } from '../ffmpeg/runner'
import type { Settings, VideoInfo } from '@shared/types'

const info = (d: number): VideoInfo => ({
  path: 'C:\\in.mp4', sizeBytes: 1, durationSec: d, width: 1920, height: 1080, fps: 30, fpsFraction: '30/1',
  videoCodec: 'h264', videoKbps: 1, hasAudio: false, audioCodec: '', audioKbps: 0, hdr: false
})
const s: Settings = { res: 'best', fps: 'best', audio: 'best', codec: 'h265', maxMB: 10, bitrateKbps: null, interpolate: 'off', encoder: 'auto' }

describe('sampleWindow', () => {
  it('takes 5 s from the middle', () => {
    expect(sampleWindow(info(134))).toEqual({ startSec: 64.5, durationSec: 5 })
  })
  it('clamps short clips to the whole clip', () => {
    expect(sampleWindow(info(2))).toEqual({ startSec: 0, durationSec: 2 })
  })
})

describe('makePreview', () => {
  it('encodes before (x264 crf 12), after (single pass, same plan) and an H.264 display copy for H.265', async () => {
    const calls: string[][] = []
    const run: Runner = async (a) => { calls.push(a); return { code: 0, stderrTail: '', aborted: false } }
    const r = await makePreview(run, { info: info(134), settings: s, available: ['cpu'] }, 'C:\\p')
    expect(calls).toHaveLength(3)
    expect(calls[0]).toContain('libx264')
    expect(calls[0][calls[0].indexOf('-crf') + 1]).toBe('12')
    expect(calls[1]).not.toContain('-pass')
    expect(calls[1]).toContain('libx265')
    expect(r.before).toMatch(/^before-\d+\.mp4$/)
    expect(r.after).toMatch(/^after-\d+\.mp4$/)
  })
  it('retries the after sample on CPU when the GPU fails', async () => {
    const calls: string[][] = []
    const run: Runner = async (a) => { calls.push(a); return { code: a.includes('hevc_nvenc') ? 1 : 0, stderrTail: '', aborted: false } }
    await makePreview(run, { info: info(134), settings: s, available: ['nvenc', 'cpu'] }, 'C:\\p')
    expect(calls.some((a) => a.includes('libx265'))).toBe(true)
  })

  it('rounds the before sample to even dimensions', async () => {
    const calls: string[][] = []
    const run: Runner = async (a) => { calls.push(a); return { code: 0, stderrTail: '', aborted: false } }
    await makePreview(run, { info: info(134), settings: s, available: ['cpu'] }, 'C:\\p')
    const vf = calls[0][calls[0].indexOf('-vf') + 1]
    expect(vf).toContain('scale=trunc(iw/2)*2:trunc(ih/2)*2')
  })

  it('deletes the after-raw temp file once the display copy is made', async () => {
    const run: Runner = async () => ({ code: 0, stderrTail: '', aborted: false })
    const removed: string[] = []
    const remove = async (p: string): Promise<void> => { removed.push(p) }
    await makePreview(run, { info: info(134), settings: s, available: ['cpu'] }, 'C:\\p', undefined, remove)
    expect(removed.some((p) => /after-raw-\d+\.mp4$/.test(p))).toBe(true)
  })

  it('cleans up this preview\'s files when the before sample fails', async () => {
    const run: Runner = async () => ({ code: 1, stderrTail: '', aborted: false })
    const removed: string[] = []
    const remove = async (p: string): Promise<void> => { removed.push(p) }
    await expect(
      makePreview(run, { info: info(134), settings: s, available: ['cpu'] }, 'C:\\p', undefined, remove)
    ).rejects.toThrow('Preview failed (before).')
    expect(removed.some((p) => /before-\d+\.mp4$/.test(p))).toBe(true)
    expect(removed.some((p) => /after-raw-\d+\.mp4$/.test(p))).toBe(true)
    expect(removed.some((p) => /(?<!raw-)after-\d+\.mp4$/.test(p))).toBe(true)
  })

  it('cleans up this preview\'s files when every after attempt fails', async () => {
    const run: Runner = async (a) => ({ code: a.includes('libx264') ? 0 : 1, stderrTail: '', aborted: false })
    const removed: string[] = []
    const remove = async (p: string): Promise<void> => { removed.push(p) }
    await expect(
      makePreview(run, { info: info(134), settings: s, available: ['cpu'] }, 'C:\\p', undefined, remove)
    ).rejects.toThrow('Preview failed (after).')
    expect(removed.some((p) => /before-\d+\.mp4$/.test(p))).toBe(true)
    expect(removed.some((p) => /after-raw-\d+\.mp4$/.test(p))).toBe(true)
    expect(removed.some((p) => /(?<!raw-)after-\d+\.mp4$/.test(p))).toBe(true)
  })
})
