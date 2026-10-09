import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { TimelineLoader } from '../components/TimelineLoader'
import { pressProps, smooth } from '../motion'
import { phaseLabel } from '../state/logic'
import { useSquish } from '../state/store'

function fmtLeft(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return 'Estimating time…'
  const s = Math.max(1, Math.round(sec))
  return `About ${s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`} left`
}

export function EncodingScreen() {
  const { progress, log, encodeError, notice, cancelEncode, backToSettings } = useSquish()
  const [showLog, setShowLog] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(928)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    if (wrap.current) ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])
  const pct = Math.floor((progress?.fraction ?? 0) * 100)
  const passLabel = phaseLabel(progress)

  if (encodeError) {
    const title = encodeError.kind === 'disk' ? 'Not enough disk space.'
      : encodeError.kind === 'size' ? "Couldn't hit that size."
      : encodeError.kind === 'smooth' ? "Smooth motion didn't work."
      : encodeError.kind === 'addon' ? 'Add-on missing.'
      : 'Something went wrong.'
    return (
      <div style={{ height: '100%', padding: '0 96px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
        <div className="kicker" style={{ color: 'var(--negative)' }}>Error</div>
        <h1 className="display" style={{ margin: 0, fontSize: 56, lineHeight: '60px' }}>{title}</h1>
        <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 19 }}>{encodeError.message}</p>
        {encodeError.log && <pre className="mono" style={{ maxHeight: 220, overflow: 'auto', padding: 14, borderRadius: 8, background: 'var(--surface-sunken)', border: '1px solid var(--hairline)', color: 'var(--ink-2)', fontSize: 12, userSelect: 'text' }}>{encodeError.log}</pre>}
        <div style={{ display: 'flex', gap: 8 }}>
          <motion.button {...pressProps} className="btn btn-gold" onClick={backToSettings}>Back to settings</motion.button>
          {encodeError.log && <motion.button {...pressProps} className="btn btn-ghost" onClick={() => void navigator.clipboard.writeText(encodeError.log)}>Copy log</motion.button>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', padding: '0 96px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <motion.span animate={{ opacity: [1, 0.4, 1], scale: [1, 0.7, 1] }} transition={{ duration: 1.4, repeat: Infinity }} style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--ember)' }} />
            {passLabel}
          </div>
          <h1 className="display" style={{ margin: 0, fontSize: 56, lineHeight: '60px', letterSpacing: '-0.015em' }}>Squishing.</h1>
          {notice && <div role="status" className="mono" style={{ fontSize: 13, color: 'var(--ink-3)' }}>{notice}</div>}
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress" className="display" style={{ fontWeight: 400, fontSize: 76, lineHeight: '76px', color: 'var(--gold-text)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</div>
      </div>
      <div ref={wrap} style={{ ['--loader-w' as string]: `${w}px` }}><TimelineLoader fraction={progress?.fraction ?? 0} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 14, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>{fmtLeft(progress?.remainingSec ?? null)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button className="mono" aria-expanded={showLog} aria-controls="encoding-log" style={{ fontSize: 13, color: 'var(--ink-3)' }} onClick={() => setShowLog((v) => !v)}>{showLog ? 'Hide log' : 'Show log'}</button>
          <motion.button {...pressProps} className="btn btn-ghost" style={{ height: 44 }} onClick={() => void cancelEncode()}>Cancel</motion.button>
        </div>
      </div>
      <AnimatePresence>
        {showLog && (
          <motion.pre id="encoding-log" className="mono" initial={{ height: 0, opacity: 0 }} animate={{ height: 180, opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={smooth}
            style={{ margin: 0, overflow: 'auto', padding: 14, borderRadius: 8, background: 'var(--surface-sunken)', border: '1px solid var(--gold-line)', color: 'var(--circuit)', fontSize: 12, userSelect: 'text' }}>
            {log.join('\n')}
          </motion.pre>
        )}
      </AnimatePresence>
    </div>
  )
}
