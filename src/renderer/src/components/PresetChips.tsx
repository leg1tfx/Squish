import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import type { Preset } from '@shared/types'
import { snappy } from '../motion'

interface Props {
  presets: Preset[]; activeId: string; edited: boolean
  onPick: (id: string) => void; onRename: (id: string, label: string) => void; onDelete: (id: string) => void
}

export function PresetChips(p: Props) {
  const [menu, setMenu] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const move = (from: number, dir: 1 | -1): void => {
    const n = p.presets.length
    if (n === 0) return
    const idx = ((from + dir) % n + n) % n
    const x = p.presets[idx]
    p.onPick(x.id)
    refs.current[x.id]?.focus()
  }

  const commitRename = (id: string, value: string): void => {
    const trimmed = value.trim()
    if (trimmed.length > 0) p.onRename(id, trimmed)
    setRenaming(null)
  }

  return (
    <div role="radiogroup" aria-label="Preset" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, position: 'relative' }}>
      {p.presets.map((x, i) => {
        const on = x.id === p.activeId
        if (renaming === x.id) {
          return (
            <input key={x.id} autoFocus defaultValue={x.label} aria-label="Preset name" className="mono"
              onBlur={(e) => commitRename(x.id, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }}
              style={{ height: 32, width: 150, padding: '0 12px', borderRadius: 999, border: '1px solid var(--gold-line)', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: 13, outline: 'none' }} />
          )
        }
        return (
          <motion.button key={x.id} ref={(el) => { refs.current[x.id] = el }} layout role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            initial={x.builtIn ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} transition={snappy}
            onClick={() => p.onPick(x.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1) }
              else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1) }
              else if (e.key === 'Escape' && menu === x.id) { e.stopPropagation(); setMenu(null) }
            }}
            onContextMenu={(e) => { if (!x.builtIn) { e.preventDefault(); setMenu(menu === x.id ? null : x.id) } }}
            style={{ position: 'relative', height: 32, padding: '0 12px', borderRadius: 999, border: '1px solid var(--hairline)', fontSize: 13, fontWeight: 500, color: on ? 'var(--gold-text)' : x.builtIn ? 'var(--ink-2)' : 'var(--ink)' }}>
            {on && <motion.span layoutId="preset-ind" transition={snappy} style={{ position: 'absolute', inset: -1, borderRadius: 999, border: '1px solid var(--gold-line)', background: 'var(--gold-wash)' }} />}
            <span style={{ position: 'relative' }}>{x.builtIn ? '' : '★ '}{x.label}{on && p.edited ? ' · edited' : ''}</span>
            <AnimatePresence>
              {menu === x.id && (
                <motion.span role="menu" initial={{ opacity: 0, y: -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={snappy}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(null) } }}
                  style={{ position: 'absolute', top: 36, left: 0, zIndex: 5, display: 'flex', flexDirection: 'column', padding: 4, borderRadius: 8, background: 'var(--surface-raised)', border: '1px solid var(--hairline)' }}>
                  <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setMenu(null); setRenaming(x.id) }} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--ink)', background: 'transparent', border: 0 }}>Rename</button>
                  <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setMenu(null); p.onDelete(x.id) }} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--negative)', background: 'transparent', border: 0 }}>Delete</button>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )
      })}
    </div>
  )
}
