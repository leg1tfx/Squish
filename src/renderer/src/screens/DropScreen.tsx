import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { TelemetryNotice } from '../components/TelemetryNotice'
import { bouncy, pressProps, snappy } from '../motion'
import { useSquish } from '../state/store'

export function DropScreen() {
  const openFile = useSquish((s) => s.openFile)
  const error = useSquish((s) => s.dropError)
  const nonce = useSquish((s) => s.dropNonce)
  const showNotice = useSquish((s) => s.data !== null && !s.data.telemetryNoticeSeen)
  const [over, setOver] = useState(false)
  const dragDepth = useRef(0)
  const shake = useAnimationControls()

  useEffect(() => { if (nonce > 0) void shake.start({ x: [0, -12, 12, -8, 8, -4, 0], transition: { duration: 0.45 } }) }, [nonce, shake])

  const choose = async (): Promise<void> => { const p = await window.squish.openFileDialog(); if (p) await openFile(p) }
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); void choose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onDragEnter = (e: DragEvent): void => {
    e.preventDefault()
    dragDepth.current += 1
    setOver(true)
  }
  const onDragLeave = (e: DragEvent): void => {
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setOver(false)
  }
  const onDrop = (e: DragEvent): void => {
    e.preventDefault(); dragDepth.current = 0; setOver(false)
    const f = e.dataTransfer.files[0]
    if (f) void openFile(window.squish.pathForFile(f))
  }

  return (
    <div style={{ height: '100%', padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <motion.div
        layout animate={shake} onDragOver={(e) => e.preventDefault()} onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDrop={onDrop}
        onClick={() => void choose()} role="button" tabIndex={0} aria-label="Drop a video or choose a file"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter') void choose()
          else if (e.key === ' ') { e.preventDefault(); void choose() }
        }}
        whileHover={{ scale: 1.006 }} transition={snappy}
        style={{
          flex: 1, position: 'relative', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
          border: `1px ${over ? 'solid' : 'dashed'} ${over ? 'var(--gold)' : 'var(--gold-line)'}`,
          background: over ? '#132226' : 'var(--surface)', transition: 'border-color 150ms, background-color 150ms',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32
        }}
      >
        <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
          <motion.circle cx="60" cy="60" r="48" fill="none" stroke="var(--gold-text)" strokeWidth="6" strokeDasharray="0.8 5.48"
            style={{ originX: '60px', originY: '60px' }} initial={{ rotate: -120, scale: 0.6, opacity: 0 }}
            animate={{ rotate: over ? 30 : 0, scale: 1, opacity: 1 }} transition={bouncy} />
          <circle cx="60" cy="60" r="55" fill="none" stroke="var(--gold-line)" strokeWidth="1" />
          <motion.path d="M60 38v34M46 58l14 14 14-14" fill="none" stroke="var(--gold-text)" strokeWidth="3" strokeLinecap="square"
            animate={{ y: over ? 6 : 0 }} transition={bouncy} />
          <path d="M44 84h32" stroke="var(--gold-text)" strokeWidth="3" />
        </svg>
        <h1 className="display" style={{ margin: 0, fontSize: 56, lineHeight: '60px', letterSpacing: '-0.015em', textAlign: 'center' }}>
          {over ? 'Let go.' : 'Drop your video here.'}
        </h1>
        {error && <div role="alert" className="mono" style={{ fontSize: 13, color: 'var(--negative)' }}>{error}</div>}
        <motion.button className="btn btn-gold" {...pressProps} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1, transition: bouncy }}
          onClick={(e) => { e.stopPropagation(); void choose() }}>Choose file</motion.button>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 'auto 0 0 0', height: 14, background: 'repeating-linear-gradient(90deg, var(--hairline) 0 1px, transparent 1px 12px) 0 100% / 100% 6px repeat-x, repeating-linear-gradient(90deg, var(--rule) 0 1px, transparent 1px 96px) 0 100% / 100% 12px repeat-x' }} />
      </motion.div>
      <AnimatePresence>{showNotice && <TelemetryNotice />}</AnimatePresence>
    </div>
  )
}
