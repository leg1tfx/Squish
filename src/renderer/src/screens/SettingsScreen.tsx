import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { formatBytes } from '@shared/format'
import { disabledFps, disabledRes } from '@shared/planner'
import type { AudioChoice, Codec, EncoderChoice, FpsChoice, ResChoice } from '@shared/types'
import { ChangesTable } from '../components/ChangesTable'
import { PresetChips } from '../components/PresetChips'
import { Segmented } from '../components/Segmented'
import { SizeReadout } from '../components/SizeReadout'
import { pressProps, snappy, stagger, enter } from '../motion'
import { allPresets, nextPresetName } from '../state/logic'
import { useSquish } from '../state/store'

const ENC_LABEL: Record<string, string> = { nvenc: 'NVIDIA NVENC', amf: 'AMD AMF', qsv: 'Intel QSV', cpu: 'CPU (x264 / x265)' }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '104px minmax(0,1fr)', alignItems: 'center', minHeight: 42, borderBottom: '1px solid var(--hairline)', gap: 8 }}>
      <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{label}</span>
      {children}
    </div>
  )
}

export function SettingsScreen() {
  const s = useSquish()
  const [saving, setSaving] = useState<string | null>(null)
  if (!s.info || !s.plan || !s.data) return <div />
  const { info, plan, settings } = s
  const dRes = disabledRes(info)
  const dFps = disabledFps(info)

  return (
    <div style={{ height: '100%', padding: '28px 32px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 460px', gap: 40 }}>
      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <motion.div variants={enter} style={{ aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--hairline)', background: '#152428' }}>
          {s.thumbUrl && <img src={s.thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />}
        </motion.div>
        <motion.div variants={enter} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div className="display" style={{ fontSize: 22, lineHeight: '28px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.path.split('\\').pop()}</div>
            <div className="mono" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {Math.floor(info.durationSec / 60)}:{String(Math.round(info.durationSec % 60)).padStart(2, '0')} · {formatBytes(info.sizeBytes)}
            </div>
          </div>
          <button className="link-btn" onClick={s.reset}>Change</button>
        </motion.div>
        <motion.div variants={enter}><ChangesTable rows={plan.changes} /></motion.div>
      </motion.div>

      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <motion.div variants={enter} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 }}>
            <span className="kicker">Preset</span>
            <AnimatePresence mode="wait">
              {s.edited && saving === null && (
                <motion.button key="save" className="link-btn" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={snappy}
                  onClick={() => setSaving(nextPresetName(s.data!))}>+ Save as preset</motion.button>
              )}
              {saving !== null && (
                <motion.form key="form" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={snappy}
                  onSubmit={(e) => { e.preventDefault(); void s.savePreset(saving); setSaving(null) }} style={{ display: 'flex', gap: 6 }}>
                  <label className="field" style={{ width: 180 }}><input autoFocus aria-label="Preset name" value={saving} onChange={(e) => setSaving(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setSaving(null) }} /></label>
                  <button className="link-btn" type="submit">Save</button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
          <PresetChips presets={allPresets(s.data)} activeId={s.presetId} edited={s.edited} onPick={s.pickPreset} onRename={(id, l) => void s.renamePreset(id, l)} onDelete={(id) => void s.deletePreset(id)} />
        </motion.div>

        <motion.div variants={enter} style={{ borderTop: '1px solid var(--hairline)' }}>
          <Row label="Resolution">
            <Segmented<ResChoice> id="res" label="Resolution" value={settings.res} onChange={(v) => s.edit({ res: v })}
              options={[{ value: 'best', label: 'Best' }, ...(['1440', '1080', '720'] as const).map((v) => ({ value: v, label: `${v}p`, disabled: dRes.includes(v) }))]} />
          </Row>
          <Row label="Frame rate">
            <Segmented<FpsChoice> id="fps" label="Frame rate" value={settings.fps} onChange={(v) => s.edit({ fps: v })}
              options={[{ value: 'best', label: 'Best' }, { value: '60', label: '60', disabled: dFps.includes('60') }, { value: '30', label: '30' }]} />
          </Row>
          {info.hasAudio && (
            <Row label="Audio">
              <Segmented<AudioChoice> id="audio" label="Audio" value={settings.audio} onChange={(v) => s.edit({ audio: v })}
                options={[{ value: 'best', label: 'Best' }, { value: 'high', label: 'High' }, { value: 'standard', label: 'Standard' }]} />
            </Row>
          )}
          <Row label="Codec">
            <Segmented<Codec> id="codec" label="Codec" value={settings.codec} onChange={(v) => s.edit({ codec: v })}
              options={[{ value: 'h264', label: 'H.264' }, { value: 'h265', label: 'H.265' }]} />
          </Row>
          <Row label="Size">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 112px', gap: 8 }}>
              <Segmented<'auto' | 'max'> id="size" label="Size" value={settings.maxMB === null ? 'auto' : 'max'}
                onChange={(v) => s.edit({ maxMB: v === 'auto' ? null : settings.maxMB ?? 50 })}
                options={[{ value: 'auto', label: 'Auto' }, { value: 'max', label: 'Max size' }]} />
              <label className="field" style={{ opacity: settings.maxMB === null ? 0.5 : 1 }}>
                <input type="number" min={1} disabled={settings.maxMB === null} aria-label="Max size in MB" value={settings.maxMB ?? 50}
                  onChange={(e) => { const v = Number(e.target.value); if (v > 0) s.edit({ maxMB: v }) }} style={{ textAlign: 'right' }} />
                <span style={{ color: 'var(--ink-3)' }}>MB</span>
              </label>
            </div>
          </Row>
          <Row label="Encoder">
            <label className="field">
              <select aria-label="Encoder" value={settings.encoder} disabled={s.available === null} onChange={(e) => s.edit({ encoder: e.target.value as EncoderChoice })}>
                <option value="auto">{s.available === null ? 'Detecting…' : `Auto · ${ENC_LABEL[plan.encoder]}`}</option>
                {(s.available ?? []).map((id) => <option key={id} value={id}>{ENC_LABEL[id]}</option>)}
              </select>
            </label>
          </Row>
          <Row label="Bitrate">
            <label className="field">
              <input type="number" step={0.1} min={0.1} aria-label="Video bitrate in Mbit/s" disabled={settings.maxMB !== null}
                value={(plan.videoKbps / 1000).toFixed(1)}
                onChange={(e) => { const v = Number(e.target.value); if (v > 0) s.edit({ bitrateKbps: Math.round(v * 1000) }) }} />
              <span style={{ color: 'var(--ink-3)' }}>Mbit/s · {plan.mode === 'target' ? 'from size' : plan.mode === 'bitrate' ? 'manual' : 'auto'}</span>
              {plan.mode === 'bitrate' && <button className="link-btn" aria-label="Back to automatic bitrate" onClick={() => s.edit({ bitrateKbps: null })}>×</button>}
            </label>
          </Row>
        </motion.div>

        <AnimatePresence>
          {plan.warning && (
            <motion.div role="status" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={snappy}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
              <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: 999, background: 'var(--ember)' }} />
              <span style={{ flex: 1, fontSize: 13, lineHeight: '18px', color: 'var(--ink-2)' }}>{plan.warning.text}</span>
              <motion.button {...pressProps} className="mono" onClick={() => s.edit({ res: plan.warning!.suggest })}
                style={{ height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid var(--gold-line)', background: 'var(--gold-wash)', color: 'var(--gold-text)', fontSize: 12, fontWeight: 500 }}>
                Use {plan.warning.suggest}p
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div variants={enter} style={{ marginTop: 'auto' }}><SizeReadout bytes={plan.estimateBytes} sourceBytes={info.sizeBytes} /></motion.div>
        <motion.div variants={enter} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.5fr)', gap: 8 }}>
          <motion.button {...pressProps} className="btn btn-ghost" onClick={() => void s.loadPreview()}>Compare</motion.button>
          <motion.button {...pressProps} className="btn btn-gold" onClick={() => void s.startEncode()}>Squish it</motion.button>
        </motion.div>
      </motion.div>
    </div>
  )
}
