import { execFile } from 'node:child_process'
import { join } from 'node:path'

/** Windows ships bsdtar as tar.exe, which reads zip. Explicit path: Git Bash's GNU tar cannot. */
export function extractZip(zipFile: string, destDir: string): Promise<void> {
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  return new Promise((resolve, reject) => {
    execFile(tar, ['-xf', zipFile, '-C', destDir], { windowsHide: true }, (e) => (e ? reject(e) : resolve()))
  })
}
