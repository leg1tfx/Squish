import { motion, useSpring, useTransform } from 'motion/react'
import { useEffect } from 'react'
import { formatBytes } from '@shared/format'

export function SizeReadout({ bytes, sourceBytes }: { bytes: number; sourceBytes: number }) {
  const mv = useSpring(bytes, { stiffness: 260, damping: 26 })
  useEffect(() => { mv.set(bytes) }, [bytes, mv])
  const text = useTransform(mv, (v) => `~${formatBytes(v)}`)
  const pct = useTransform(mv, (v) => `${Math.max(1, Math.min(100, (v / sourceBytes) * 100))}%`)
  const saving = useTransform(mv, (v) => {
    const p = Math.round((1 - v / sourceBytes) * 100)
    return p > 0 ? `${p}% smaller` : 'about the same size'
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <motion.span className="display" style={{ fontSize: 34, lineHeight: '38px', fontVariantNumeric: 'tabular-nums' }}>{text}</motion.span>
        <motion.span className="mono" style={{ fontSize: 13, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{saving}</motion.span>
      </div>
      <div aria-hidden="true" style={{ height: 4, borderRadius: 999, background: 'var(--surface-raised)', overflow: 'hidden' }}>
        <motion.div style={{ width: pct, height: '100%', background: 'var(--gold)' }} />
      </div>
    </div>
  )
}
