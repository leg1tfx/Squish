import { motion } from 'motion/react'
import { snappy } from '../motion'

export function Segmented<T extends string>(p: {
  id: string; label: string; value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={p.label} className="seg" style={{ gridTemplateColumns: `repeat(${p.options.length}, minmax(0, 1fr))` }}>
      {p.options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === p.value} disabled={o.disabled} className="seg-opt" onClick={() => p.onChange(o.value)}>
          {o.value === p.value && <motion.span layoutId={`seg-${p.id}`} className="seg-ind" transition={snappy} />}
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}
