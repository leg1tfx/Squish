import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addPreset, cleanLabel, defaultStore, deletePreset, loadStore, renamePreset, saveStore } from './presetStore'

const settings = { res: '1080', fps: 'best', audio: 'best', codec: 'h265', maxMB: null, bitrateKbps: null, interpolate: 'off' } as const

describe('presetStore', () => {
  it('returns defaults for a missing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'squish-store-'))
    expect(await loadStore(join(dir, 'nope.json'))).toEqual(defaultStore())
  })
  it('turns stats off for a corrupt or unknown-version file, since a stored opt-out may be lost', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'squish-store-'))
    const offSeen = { ...defaultStore(), telemetry: 'off', telemetryNoticeSeen: true }
    await writeFile(join(dir, 'bad.json'), '{not json')
    expect(await loadStore(join(dir, 'bad.json'))).toEqual(offSeen)
    await writeFile(join(dir, 'v2.json'), JSON.stringify({ version: 2, userPresets: [] }))
    expect(await loadStore(join(dir, 'v2.json'))).toEqual(offSeen)
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
  it('drops invalid stored presets and forces builtIn false', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'squish-store-'))
    const file = join(dir, 'presets.json')
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        lastPresetId: 'tiktok',
        promoDismissed: false,
        userPresets: [
          { id: 'user-1', label: 'Valid', builtIn: true, settings },
          { id: 'user-2', label: 'Empty settings', builtIn: false, settings: {} },
          { id: 'user-3', label: 'Bad res', builtIn: false, settings: { ...settings, res: 123 } }
        ]
      }),
      'utf8'
    )
    const loaded = await loadStore(file)
    expect(loaded.userPresets).toEqual([{ id: 'user-1', label: 'Valid', builtIn: false, settings }])
  })
  it('defaults stats on with the notice unseen, also for files from 1.0.0', async () => {
    expect(defaultStore()).toMatchObject({ telemetry: 'on', telemetryNoticeSeen: false })
    const dir = await mkdtemp(join(tmpdir(), 'squish-store-'))
    const file = join(dir, 'presets.json')
    await writeFile(file, JSON.stringify({ version: 1, userPresets: [], lastPresetId: 'reels', promoDismissed: true }), 'utf8')
    expect(await loadStore(file)).toEqual({
      version: 1, userPresets: [], lastPresetId: 'reels', promoDismissed: true, telemetry: 'on', telemetryNoticeSeen: false
    })
  })
  it('keeps a stored opt-out and reads junk values as off / unseen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'squish-store-'))
    const file = join(dir, 'presets.json')
    const stored = { version: 1, userPresets: [], lastPresetId: 'tiktok', promoDismissed: false }
    await writeFile(file, JSON.stringify({ ...stored, telemetry: 'off', telemetryNoticeSeen: true }), 'utf8')
    expect(await loadStore(file)).toMatchObject({ telemetry: 'off', telemetryNoticeSeen: true })
    await writeFile(file, JSON.stringify({ ...stored, telemetry: 'OFF', telemetryNoticeSeen: 'yes' }), 'utf8')
    expect(await loadStore(file)).toMatchObject({ telemetry: 'off', telemetryNoticeSeen: false })
  })

  it('adds interpolate: off to presets saved before smooth motion existed and drops unknown values', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'squish-store-'))
    const file = join(dir, 'presets.json')
    const { interpolate: _drop, ...old } = settings
    await writeFile(file, JSON.stringify({
      version: 1,
      userPresets: [
        { id: 'user-1', label: 'Old', builtIn: false, settings: old },
        { id: 'user-2', label: 'Bad', builtIn: false, settings: { ...old, interpolate: '240' } },
        { id: 'user-3', label: 'New', builtIn: false, settings: { ...old, interpolate: '120' } }
      ],
      lastPresetId: 'tiktok', promoDismissed: false
    }))
    const d = await loadStore(file)
    expect(d.userPresets.map((p) => [p.id, p.settings.interpolate])).toEqual([['user-1', 'off'], ['user-3', '120']])
  })
})
