import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect } from 'react'
import { bouncy, pressProps, smooth, snappy } from '../motion'
import { doneSummary, smoothDone } from '../state/logic'
import { useSquish } from '../state/store'

export function DoneScreen() {
  const { result, info, plan, settings, data, reset, dismissPromo } = useSquish()
  const reduced = useReducedMotion()
  const mb = useMotionValue(info ? info.sizeBytes / 1e6 : 0)
  const text = useTransform(mb, (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} GB` : `${v.toFixed(1)} MB`))
  useEffect(() => {
    if (!result) return
    if (reduced) { mb.set(result.bytes / 1e6); return }
    const c = animate(mb, result.bytes / 1e6, { duration: 1.1, delay: 0.56, ease: [0.16, 1, 0.3, 1] })
    return () => c.stop()
  }, [result, mb, reduced])
  const showPromo = data !== null && !data.promoDismissed
  // Once per finished encode; not again when the promo is dismissed.
  useEffect(() => { if (result && showPromo) window.squish.track('promo_shown') }, [result])
  if (!result || !info) return <div />

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, padding: '0 96px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
        <svg width="96" height="96" viewBox="0 0 120 120" aria-hidden="true" style={{ overflow: 'visible' }}>
          <motion.circle cx="60" cy="60" r="56" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ originX: '60px', originY: '60px' }}
            initial={{ scale: 0.8, opacity: 0.6 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ ...smooth, delay: 0.38 }} />
          <motion.g style={{ originX: '60px', originY: '60px' }} initial={{ scale: 1.6, rotate: -90, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={bouncy}>
            <circle cx="60" cy="60" r="49" fill="none" stroke="var(--gold-text)" strokeWidth="7" strokeDasharray="0.9 5.5" />
            <circle cx="60" cy="60" r="56" fill="none" stroke="var(--gold-line)" strokeWidth="1" />
          </motion.g>
          <motion.path d="M40 61l14 14 27-30" fill="none" stroke="var(--gold-text)" strokeWidth="6" strokeLinecap="square"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ ...snappy, delay: 0.42 }} />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <motion.h1 className="display" initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ ...smooth, delay: 0.56 }}
            style={{ margin: 0, fontSize: 76, lineHeight: '76px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
            Done. <motion.span>{text}</motion.span>.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...smooth, delay: 0.64 }} style={{ margin: 0, fontSize: 19, lineHeight: '30px', color: 'var(--ink-2)' }}>
            {doneSummary(info, settings.maxMB, result.bytes)}
          </motion.p>
          {result.fellBack && <p className="mono" style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Your GPU encoder failed, finished on CPU.</p>}
          {plan && info && smoothDone(plan, info) && <p className="mono" style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>{smoothDone(plan, info)}</p>}
        </div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...smooth, delay: 0.72 }} style={{ display: 'flex', gap: 8 }}>
          <motion.button {...pressProps} className="btn btn-gold" onClick={() => void window.squish.revealInFolder(result.output)}>Show in folder</motion.button>
          <motion.button {...pressProps} className="btn btn-ghost" onClick={reset}>Squish another</motion.button>
        </motion.div>
      </div>
      {showPromo && (
        <div style={{ flexShrink: 0, margin: '0 32px', height: 56, overflow: 'hidden', borderTop: '1px solid var(--hairline)' }}>
          <motion.div initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...smooth, delay: 1.5 }}
            style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>
              Squish is free. Pyno's makes more tools for editors.{' '}
              <button className="link-btn" onClick={() => { window.squish.track('promo_clicked'); void window.squish.openPromo() }}>See them →</button>
            </span>
            <button aria-label="Hide this" className="mono" style={{ width: 32, height: 32, color: 'var(--ink-3)', fontSize: 16 }} onClick={() => { window.squish.track('promo_dismissed'); void dismissPromo() }}>×</button>
          </motion.div>
        </div>
      )}
    </div>
  )
}
