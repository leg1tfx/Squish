import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { bouncy, pressProps, smooth } from '../motion'
import { useSquish } from '../state/store'

const DETAILS = [
  'App version, Windows version and language',
  'Which presets, codecs and encoders you use',
  'Rough size and length ranges, never exact values',
  'Error types when an encode or file read fails',
  "Clicks on the Pyno's link after an encode",
  'Never: file names, folders, or anything you type'
]

export function TelemetryNotice() {
  const acknowledge = useSquish((s) => s.acknowledgeTelemetryNotice)
  const setTelemetry = useSquish((s) => s.setTelemetry)
  const [open, setOpen] = useState(false)

  return (
    <motion.aside aria-label="Anonymous stats" layout
      initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: { ...bouncy, delay: 0.4 } }} exit={{ y: 16, opacity: 0, transition: smooth }}
      style={{ flexShrink: 0, borderRadius: 12, border: '1px solid var(--gold-line)', background: 'var(--surface)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <p style={{ margin: 0, flex: 1, fontSize: 14, lineHeight: '22px', color: 'var(--ink-2)' }}>
          Pyno's Squish shares anonymous usage and error stats to help improve the app. No file names, no personal data.{' '}
          <button className="link-btn" aria-expanded={open} aria-controls="telemetry-details" onClick={() => setOpen((o) => !o)}>What's sent?</button>
        </p>
        <button className="link-btn" onClick={() => void setTelemetry(false)}>Turn off</button>
        <motion.button {...pressProps} className="btn btn-ghost" style={{ height: 40 }} onClick={() => void acknowledge()}>Got it</motion.button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul id="telemetry-details" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={smooth}
            style={{ margin: 0, paddingLeft: 18, overflow: 'hidden', fontSize: 13, lineHeight: '20px', color: 'var(--ink-3)' }}>
            {DETAILS.map((d) => <li key={d}>{d}</li>)}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}
