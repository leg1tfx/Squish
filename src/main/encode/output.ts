import { win32 } from 'node:path'

export function uniqueOutputPath(input: string, exists: (p: string) => boolean, ext = 'mp4'): string {
  const dir = win32.dirname(input)
  const name = win32.basename(input, win32.extname(input))
  for (let n = 1; ; n++) {
    const candidate = win32.join(dir, `${name}_squish${n === 1 ? '' : ` (${n})`}.${ext}`)
    if (!exists(candidate)) return candidate
  }
}
