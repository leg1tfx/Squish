import type { EncoderId } from '@shared/types'
import type { Runner } from './runner'

const HW: { id: Exclude<EncoderId, 'cpu'>; codec: string; pix: string }[] = [
  { id: 'nvenc', codec: 'h264_nvenc', pix: 'yuv420p' },
  { id: 'amf', codec: 'h264_amf', pix: 'yuv420p' },
  { id: 'qsv', codec: 'h264_qsv', pix: 'nv12' }
]

export async function detectEncoders(run: Runner): Promise<EncoderId[]> {
  const results = await Promise.all(HW.map(async (h) => {
    const r = await run(['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.1',
      '-pix_fmt', h.pix, '-c:v', h.codec, '-f', 'null', '-'])
    return r.code === 0 ? h.id : null
  }))
  return [...results.filter((x): x is Exclude<EncoderId, 'cpu'> => x !== null), 'cpu']
}
