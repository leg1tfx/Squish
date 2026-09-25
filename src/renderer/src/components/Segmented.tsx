import { motion } from 'motion/react'
import { useRef } from 'react'
import { snappy } from '../motion'

export function Segmented<T extends string>(p: {
  id: string; label: string; value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const move = (from: number, dir: 1 | -1): void => {
    const n = p.options.length
    for (let i = 1; i <= n; i++) {
      const idx = ((from + dir * i) % n + n) % n
      const o = p.options[idx]
      if (!o.disabled) {
        p.onChange(o.value)
        refs.current[o.value]?.focus()
        return
      }
    }
  }

  return (
    <div role="radiogroup" aria-label={p.label} className="seg" style={{ gridTemplateColumns: `repeat(${p.options.length}, minmax(0, 1fr))` }}>
      {p.options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => { refs.current[o.value] = el }}
          role="radio"
          aria-checked={o.value === p.value}
          disabled={o.disabled}
          tabIndex={o.value === p.value ? 0 : -1}
          className="seg-opt"
          onClick={() => p.onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1) }
            else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1) }
          }}
        >
          {o.value === p.value && <motion.span layoutId={`seg-${p.id}`} className="seg-ind" transition={snappy} />}
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}
