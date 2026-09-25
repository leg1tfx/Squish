import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addPreset, cleanLabel, defaultStore, deletePreset, loadStore, renamePreset, saveStore } from './presetStore'

const settings = { res: '1080', fps: 'best', audio: 'best', codec: 'h265', maxMB: null, bitrateKbps: null } as const

describe('presetStore', () => {
  it('returns defaults for a missing or corrupt file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'squish-store-'))
    expect(await loadStore(join(dir, 'nope.json'))).toEqual(defaultStore())
    await writeFile(join(dir, 'bad.json'), '{not json')
    expect(await loadStore(join(dir, 'bad.json'))).toEqual(defaultStore())
  })
  it('round-trips through disk into a new folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'squish-store-'))
    const file = join(dir, "Pyno's Squish", 'presets.json')
    const { data } = addPreset(defaultStore(), 'Vlog 1080', settings, 1000)
    await saveStore(file, data)
    expect(await loadStore(file)).toEqual(data)
    expect(JSON.parse(await readFile(file, 'utf8')).version).toBe(1)
  })
  it('adds, renames and deletes user presets', () => {
    const a = addPreset(defaultStore(), '  Vlog  ', settings, 42)
    expect(a.preset).toEqual({ id: 'user-42', label: 'Vlog', builtIn: false, settings })
    expect(a.data.lastPresetId).toBe('user-42')
    const r = renamePreset(a.data, 'user-42', 'Travel')
    expect(r.userPresets[0].label).toBe('Travel')
    const d = deletePreset(r, 'user-42')
    expect(d.userPresets).toEqual([])
    expect(d.lastPresetId).toBe('tiktok')
  })
  it('rejects empty labels and trims to 40 chars', () => {
    expect(cleanLabel('   ')).toBeNull()
    expect(cleanLabel('x'.repeat(50))).toHaveLength(40)
  })
})
