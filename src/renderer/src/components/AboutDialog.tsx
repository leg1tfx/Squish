import { AnimatePresence, motion } from 'motion/react'
import { smooth } from '../motion'

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div role="dialog" aria-modal="true" aria-label="About Pyno's Squish" onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'grid', placeItems: 'center', zIndex: 10 }}>
          <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 16, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 8, opacity: 0 }} transition={smooth}
            style={{ width: 440, padding: 24, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--gold-line)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kicker">About</div>
            <div className="display" style={{ fontSize: 22 }}>Pyno's Squish {window.squish.version}</div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--ink-2)' }}>
              Squish uses FFmpeg, licensed under the GNU GPL v3. FFmpeg runs as a separate program bundled with this app. Its source code is available from the link below.
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <button className="link-btn" onClick={() => window.squish.openFfmpegSource()}>FFmpeg source →</button>
              <button className="btn btn-ghost" style={{ height: 40 }} onClick={onClose}>Close</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
