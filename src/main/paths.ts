import { win32 } from 'node:path'

export interface PathEnv { packaged: boolean; resourcesPath: string; appPath: string }

export function binPath(name: 'ffmpeg' | 'ffprobe', env: PathEnv): string {
  const base = env.packaged ? env.resourcesPath : win32.join(env.appPath, 'resources')
  return win32.join(base, 'bin', `${name}.exe`)
}
