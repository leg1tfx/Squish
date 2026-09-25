import { describe, expect, it } from 'vitest'
import { detectEncoders } from './encoders'
import type { Runner } from './runner'

const fake = (ok: string[]): Runner => async (args) => {
  const enc = args[args.indexOf('-c:v') + 1]
  return { code: ok.includes(enc) ? 0 : 1, stderrTail: '', aborted: false }
}

describe('detectEncoders', () => {
  it('returns working hardware encoders in priority order plus cpu', async () => {
    expect(await detectEncoders(fake(['h264_qsv', 'h264_nvenc']))).toEqual(['nvenc', 'qsv', 'cpu'])
  })
  it('returns only cpu when nothing works', async () => {
    expect(await detectEncoders(fake([]))).toEqual(['cpu'])
  })
  it('tests QSV with nv12 input', async () => {
    const seen: string[][] = []
    await detectEncoders(async (args) => { seen.push(args); return { code: 1, stderrTail: '', aborted: false } })
    const qsv = seen.find((a) => a.includes('h264_qsv'))!
    expect(qsv[qsv.indexOf('-pix_fmt') + 1]).toBe('nv12')
  })
})
