import { motion } from 'motion/react'
import { bouncy } from '../motion'

export function Seal({ size = 22, intro = false }: { size?: number; intro?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <motion.circle
        cx="12" cy="12" r="10.5" fill="none" stroke="var(--gold-text)" strokeWidth="2.4" strokeDasharray="0.7 2.05"
        style={{ originX: '12px', originY: '12px' }}
        initial={intro ? { rotate: -120, scale: 0.6, opacity: 0 } : false}
        animate={{ rotate: 0, scale: 1, opacity: 1 }} transition={bouncy}
      />
      <text x="12" y="16.3" textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontWeight="600" fontSize="12" fill="var(--gold-text)">P</text>
    </svg>
  )
}
