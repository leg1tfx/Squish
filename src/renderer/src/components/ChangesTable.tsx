import { AnimatePresence, motion } from 'motion/react'
import type { Change } from '@shared/types'
import { snappy } from '../motion'

export function ChangesTable({ rows }: { rows: Change[] }) {
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 12, overflow: 'hidden' }}>
      {rows.map((r, i) => {
        const kept = r.to === 'kept'
        return (
          <div key={r.label} className="mono" style={{ display: 'grid', gridTemplateColumns: '104px minmax(0,1fr) 24px minmax(0,1fr)', alignItems: 'center', height: 40, padding: '0 16px', borderTop: i ? '1px solid var(--hairline)' : 'none', fontSize: 13 }}>
            <span style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--ink-3)' }}>{r.label}</span>
            <span style={{ color: 'var(--ink-3)' }}>{r.from}</span>
            <span aria-hidden="true" style={{ color: kept ? 'var(--hairline)' : 'var(--rule)' }}>→</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={r.to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={snappy}
                style={{ color: kept ? 'var(--ink-3)' : 'var(--gold-text)' }}>{r.to}</motion.span>
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
