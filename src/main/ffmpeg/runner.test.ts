import { describe, expect, it } from 'vitest'
import { createRunner } from './runner'

const node = createRunner(process.execPath)

describe('createRunner', () => {
  it('emits stdout lines and keeps a stderr tail', async () => {
    const lines: string[] = []
    const r = await node(['-e', 'console.log("a=1");console.log("b=2");console.error("oops");process.exitCode=3'], { onLine: (l) => lines.push(l) })
    expect(lines).toEqual(['a=1', 'b=2'])
    expect(r.code).toBe(3)
    expect(r.stderrTail).toContain('oops')
    expect(r.aborted).toBe(false)
  })
  it('kills the process on abort', async () => {
    const ac = new AbortController()
    const p = node(['-e', 'setTimeout(()=>{},60000)'], { signal: ac.signal })
    setTimeout(() => ac.abort(), 100)
    const r = await p
    expect(r.aborted).toBe(true)
  })
  it('resolves with code -1 when the binary does not exist', async () => {
    const r = await createRunner('C:\\does\\not\\exist.exe')([])
    expect(r.code).toBe(-1)
  })
})
