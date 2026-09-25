import type { Transition, Variants } from 'motion/react'

export const snappy: Transition = { type: 'spring', stiffness: 500, damping: 32 }
export const smooth: Transition = { type: 'spring', stiffness: 260, damping: 28 }
export const bouncy: Transition = { type: 'spring', stiffness: 380, damping: 18 }

export const enter: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: smooth },
  exit: { opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.15 } }
}
export const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } }, exit: {} }
export const pressProps = { whileHover: { scale: 1.03 }, whileTap: { scale: 0.96 }, transition: snappy }
