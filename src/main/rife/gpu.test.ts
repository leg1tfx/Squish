import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Runner } from '../ffmpeg/runner'
import { probeVulkan } from './gpu'

let work = ''
beforeEach(async () => { work = await mkdtemp(join(tmpdir(), 'squish-gpu-')) })
afterEach(async () => { await rm(work, { recursive: true, force: true }) })

const ok: Runner = async () => ({ code: 0, stderrTail: '', aborted: false })
const base = () => ({ ffmpeg: ok, rife: ok, rifeCwd: 'C:\\rife', modelDir: 'C:\\rife\\rife-v4.6', workDir: work, count: async () => 3 })

describe('probeVulkan', () => {
  it('passes when RIFE turns 2 tiny frames into 3', async () => {
    const calls: string[][] = []
    const rife: Runner = async (a) => { calls.push(a); return { code: 0, stderrTail: '', aborted: false } }
    expect(await probeVulkan({ ...base(), rife })).toEqual({ ok: true })
    expect(calls[0][calls[0].indexOf('-n') + 1]).toBe('3')
    expect(await readdir(work)).toEqual([])
  })
  it('fails with the RIFE log when it cannot start', async () => {
    const rife: Runner = async () => ({ code: 1, stderrTail: 'invalid gpu device', aborted: false })
    expect(await probeVulkan({ ...base(), rife })).toEqual({ ok: false, log: 'invalid gpu device' })
    expect(await readdir(work)).toEqual([])
  })
  it('fails when RIFE exits 0 but writes the wrong number of frames', async () => {
    expect(await probeVulkan({ ...base(), count: async () => 0 })).toMatchObject({ ok: false })
  })
  it('fails when the test frames cannot be created', async () => {
    const ffmpeg: Runner = async () => ({ code: 1, stderrTail: 'no lavfi', aborted: false })
    expect(await probeVulkan({ ...base(), ffmpeg })).toEqual({ ok: false, log: 'no lavfi' })
  })
})
