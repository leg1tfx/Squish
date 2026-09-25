import { motion } from 'motion/react'
import { smooth } from '../motion'

const ROWS = [[18, 27, 12, 22, 21], [8, 34, 16, 26]]

export function TimelineLoader({ fraction }: { fraction: number | null }) {
  const pct = fraction === null ? null : Math.max(0, Math.min(1, fraction)) * 100
  const clips = (done: boolean) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ROWS.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, height: 30 }}>
          {row.map((w, j) => (i === 1 && j === 0
            ? <div key={j} style={{ width: `${w}%` }} />
            : <div key={j} style={{ width: `${w}%`, borderRadius: 4, background: done ? 'var(--surface-raised)' : 'var(--surface)', border: `1px solid ${done ? 'var(--gold-line)' : 'var(--hairline)'}` }} />))}
        </div>
      ))}
      <div style={{ height: 18, borderRadius: 4, background: `repeating-linear-gradient(90deg, ${done ? 'var(--gold-line)' : 'var(--hairline)'} 0 2px, transparent 2px 5px)` }} />
    </div>
  )
  return (
    <div aria-hidden="true" style={{ position: 'relative', padding: '16px 0', borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)' }}>
      {clips(false)}
      <motion.div style={{ position: 'absolute', left: 0, top: 16, bottom: 16, overflow: 'hidden' }}
        animate={pct === null ? { width: ['0%', '100%'] } : { width: `${pct}%` }}
        transition={pct === null ? { duration: 1.6, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' } : smooth}>
        <div style={{ width: 'var(--loader-w, 928px)' }}>{clips(true)}</div>
      </motion.div>
      <motion.div style={{ position: 'absolute', top: -10, bottom: -10, width: 2, marginLeft: -1, background: 'var(--gold)' }}
        animate={pct === null ? { left: ['0%', '100%'] } : { left: `${pct}%` }}
        transition={pct === null ? { duration: 1.6, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' } : smooth}>
        <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 1.2, repeat: Infinity }}
          style={{ position: 'absolute', top: 0, left: -5, width: 12, height: 10, background: 'var(--gold)', clipPath: 'polygon(0 0,100% 0,50% 100%)' }} />
      </motion.div>
    </div>
  )
}
