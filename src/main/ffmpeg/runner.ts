import { spawn } from 'node:child_process'

export interface RunOptions {
  cwd?: string
  onLine?: (line: string) => void
  onErrLine?: (line: string) => void
  signal?: AbortSignal
}
export interface RunResult { code: number | null; stderrTail: string; aborted: boolean }
export type Runner = (args: string[], opts?: RunOptions) => Promise<RunResult>

function splitter(cb?: (l: string) => void): (chunk: string) => void {
  let buf = ''
  return (chunk) => {
    buf += chunk
    let i: number
    while ((i = buf.search(/\r?\n|\r/)) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + (buf[i] === '\r' && buf[i + 1] === '\n' ? 2 : 1))
      if (line) cb?.(line)
    }
  }
}

export function createRunner(binary: string): Runner {
  return (args, opts = {}) => new Promise((resolve) => {
    let tail = ''
    let aborted = false
    let done = false
    const finish = (code: number | null): void => {
      if (done) return
      done = true
      opts.signal?.removeEventListener('abort', onAbort)
      resolve({ code, stderrTail: tail, aborted })
    }
    const child = spawn(binary, args, { cwd: opts.cwd, windowsHide: true })
    function onAbort(): void { aborted = true; child.kill() }
    if (opts.signal?.aborted) onAbort()
    else opts.signal?.addEventListener('abort', onAbort, { once: true })
    const out = splitter(opts.onLine)
    const err = splitter(opts.onErrLine)
    child.stdout?.setEncoding('utf8').on('data', out)
    child.stderr?.setEncoding('utf8').on('data', (d: string) => { tail = (tail + d).slice(-8000); err(d) })
    child.on('error', (e) => { tail += String(e); finish(-1) })
    child.on('close', (code) => finish(code))
  })
}
