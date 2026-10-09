import { AnimatePresence, motion } from 'motion/react'
import { smooth } from '../motion'
import { addonQuestion, downloadLabel } from '../state/logic'
import { useSquish } from '../state/store'

export function AddonDialog() {
  const addon = useSquish((s) => s.addon)
  const rife = useSquish((s) => s.rife)
  const confirm = useSquish((s) => s.confirmAddon)
  const cancel = useSquish((s) => s.cancelAddon)
  const pct = addon?.phase === 'downloading' && addon.total > 0 ? Math.min(100, Math.floor((addon.done / addon.total) * 100)) : 0

  return (
    <AnimatePresence>
      {addon && (
        <motion.div role="dialog" aria-modal="true" aria-label="Smooth motion add-on"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'grid', placeItems: 'center', zIndex: 10 }}>
          <motion.div initial={{ y: 16, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 8, opacity: 0 }} transition={smooth}
            style={{ width: 440, padding: 24, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--gold-line)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kicker">Add-on</div>

            {addon.phase === 'ask' && (
              <>
                <div className="display" style={{ fontSize: 22 }}>Add smooth motion?</div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--ink-2)' }}>{addonQuestion(rife?.sizeBytes ?? 0)}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-ghost" style={{ height: 40 }} onClick={cancel}>Cancel</button>
                  <button className="btn btn-gold" style={{ height: 40 }} autoFocus onClick={() => void confirm()}>Download</button>
                </div>
              </>
            )}

            {addon.phase === 'downloading' && (
              <>
                <div className="display" style={{ fontSize: 22 }}>Downloading add-on</div>
                <div role="progressbar" aria-label="Download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
                  style={{ height: 6, borderRadius: 3, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--gold)', transition: 'width 200ms' }} />
                </div>
                <div className="mono" style={{ fontSize: 13, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>{downloadLabel(addon.done, addon.total)}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button className="btn btn-ghost" style={{ height: 40 }} autoFocus onClick={cancel}>Cancel</button>
                </div>
              </>
            )}

            {addon.phase === 'error' && (
              <>
                <div className="display" style={{ fontSize: 22 }}>Smooth motion isn't ready</div>
                <p role="alert" style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--ink-2)' }}>{addon.message}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-ghost" style={{ height: 40 }} autoFocus={!addon.retry} onClick={cancel}>Close</button>
                  {addon.retry && <button className="btn btn-gold" style={{ height: 40 }} autoFocus onClick={() => void confirm()}>Try again</button>}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
