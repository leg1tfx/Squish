import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { formatBytes } from '@shared/format'
import { Segmented } from '../components/Segmented'
import { TimelineLoader } from '../components/TimelineLoader'
import { pressProps, smooth, snappy } from '../motion'
import { useSquish } from '../state/store'

export function CompareScreen() {
  const { preview, previewError, plan, info, settings, backToSettings, startEncode } = useSquish()
  const split = useMotionValue(50)
  const clip = useTransform(split, (v) => `inset(0 0 0 ${v}%)`)
  const left = useTransform(split, (v) => `${v}%`)
  const beforeOp = useTransform(split, [12, 24], [0, 1])
  const afterOp = useTransform(split, [76, 88], [1, 0])
  const frame = useRef<HTMLDivElement>(null)
  const before = useRef<HTMLVideoElement>(null)
  const after = useRef<HTMLVideoElement>(null)
  const [zoom, setZoom] = useState<'fit' | '100'>('fit')
  const touched = useRef(false)

  useEffect(() => {
    if (!preview) return
    const t = setTimeout(async () => {
      if (touched.current) return
      await animate(split, 30, { duration: 0.42, ease: 'easeOut' })
      if (!touched.current) await animate(split, 50, smooth)
    }, 700)
    return () => clearTimeout(t)
  }, [preview, split])

  const setFromPointer = (clientX: number): void => {
    const r = frame.current!.getBoundingClientRect()
    split.set(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)))
  }
  const sync = (): void => {
    const b = before.current, a = after.current
    if (b && a && Math.abs(a.currentTime - b.currentTime) > 0.05) a.currentTime = b.currentTime
  }
  if (!plan || !info) return <div />
  const fit = zoom === 'fit' ? 'contain' : 'none'
  const label = settings.maxMB !== null ? `MAX ${settings.maxMB} MB · ` : ''

  return (
    <div style={{ height: '100%', padding: '24px 32px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="kicker">{label}{Math.min(plan.width, plan.height)}p · {Math.round(plan.fps)} FPS · {plan.codec === 'h265' ? 'H.265' : 'H.264'}</div>
        <Segmented<'fit' | '100'> id="zoom" label="Zoom" value={zoom} onChange={setZoom}
          options={[{ value: 'fit', label: 'Fit' }, { value: '100', label: '100%' }]} />
      </div>

      <div ref={frame} style={{ position: 'relative', flex: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--hairline)', background: '#152428', cursor: 'ew-resize', touchAction: 'none' }}
        onPointerDown={(e) => { touched.current = true; split.stop(); frame.current!.setPointerCapture(e.pointerId); setFromPointer(e.clientX) }}
        onPointerMove={(e) => { if (e.buttons === 1) setFromPointer(e.clientX) }}>
        {!preview && !previewError && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 48 }}>
            <div style={{ width: '100%' }}><TimelineLoader fraction={null} /><p className="mono" style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Rendering a 5 s sample…</p></div>
          </div>
        )}
        {previewError && <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--negative)' }}>Error: {previewError}</div>}
        {preview && (
          <>
            <video ref={before} src={preview.beforeUrl} autoPlay loop muted playsInline onTimeUpdate={sync} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit }} />
            <motion.div style={{ position: 'absolute', inset: 0, clipPath: clip }}>
              <video ref={after} src={preview.afterUrl} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: fit }} />
            </motion.div>
            <motion.div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left, width: 2, marginLeft: -1, background: 'var(--gold)' }} />
            <motion.div aria-hidden="true" style={{ position: 'absolute', top: '50%', left, width: 40, height: 40, margin: '-20px 0 0 -20px' }}>
              <motion.div whileHover={{ scale: 1.18 }} whileTap={{ scale: 0.92 }} transition={snappy}
                style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--gold)', color: 'var(--on-gold)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)' }}>↔</motion.div>
            </motion.div>
            <motion.div className="mono" style={{ position: 'absolute', left: 14, top: 14, opacity: beforeOp, padding: '5px 9px', borderRadius: 999, background: 'var(--scrim)', fontSize: 11, letterSpacing: '0.06em' }}>BEFORE · {formatBytes(info.sizeBytes)}</motion.div>
            <motion.div className="mono" style={{ position: 'absolute', right: 14, top: 14, opacity: afterOp, padding: '5px 9px', borderRadius: 999, background: 'var(--scrim)', fontSize: 11, letterSpacing: '0.06em', color: 'var(--gold-text)' }}>AFTER · ~{formatBytes(plan.estimateBytes)}</motion.div>
            <div className="mono" style={{ position: 'absolute', left: 14, bottom: 14, padding: '5px 9px', borderRadius: 999, background: 'var(--scrim)', fontSize: 11, letterSpacing: '0.06em', color: 'var(--ink-2)' }}>5 s SAMPLE · LOOPING</div>
          </>
        )}
        <input type="range" min={0} max={100} aria-label="Move the divider between before and after" defaultValue={50}
          onChange={(e) => { touched.current = true; split.set(Number(e.target.value)) }}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <motion.button {...pressProps} className="btn btn-ghost" onClick={backToSettings}>Back</motion.button>
        <motion.button {...pressProps} className="btn btn-gold" onClick={() => void startEncode()}>Squish it</motion.button>
      </div>
    </div>
  )
}
