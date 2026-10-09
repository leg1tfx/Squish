import { describe, expect, it } from 'vitest'
import type { Runner } from '../ffmpeg/runner'
import { rifeArgs, runRife } from './runRife'

const o = { inDir: 'C:\\w\\frames-in', outDir: 'C:\\w\\frames-out', frames: 600, modelDir: 'C:\\rife\\rife-v4.6' }

describe('rifeArgs', () => {
  it('passes directories, exact frame count and model', () => {
    expect(rifeArgs(o)).toEqual(['-i', 'C:\\w\\frames-in', '-o', 'C:\\w\\frames-out', '-n', '600', '-m', 'C:\\rife\\rife-v4.6'])
  })
})

describe('runRife', () => {
  const slowOk: Runner = async () => { await new Promise((r) => setTimeout(r, 40)); return { code: 0, stderrTail: '', aborted: false } }

  it('reports the number of written frames while running', async () => {
    let n = 0
    const seen: number[] = []
    const r = await runRife({ run: slowOk, cwd: 'C:\\rife', count: async () => ++n, pollMs: 5 }, { ...o, onFrames: (c) => seen.push(c) })
    expect(r).toEqual({ ok: true, aborted: false, log: '' })
    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
  })
  it('runs in the rife folder and forwards the abort signal', async () => {
    let cwd: string | undefined
    let sig: AbortSignal | undefined
    const run: Runner = async (_a, opts) => { cwd = opts?.cwd; sig = opts?.signal; return { code: null, stderrTail: 'killed', aborted: true } }
    const ac = new AbortController()
    const r = await runRife({ run, cwd: 'C:\\rife', count: async () => 0, pollMs: 1000 }, { ...o, signal: ac.signal })
    expect(cwd).toBe('C:\\rife')
    expect(sig).toBe(ac.signal)
    expect(r).toMatchObject({ ok: false, aborted: true })
  })
  it('returns the log when RIFE fails', async () => {
    const run: Runner = async () => ({ code: 3, stderrTail: 'vkCreateDevice failed', aborted: false })
    const r = await runRife({ run, cwd: 'C:\\rife', count: async () => 0, pollMs: 1000 }, o)
    expect(r).toEqual({ ok: false, aborted: false, log: 'vkCreateDevice failed' })
  })
})
