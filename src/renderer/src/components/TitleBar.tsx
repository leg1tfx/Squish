import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/api'
import { useSquish } from '../state/store'
import { Seal } from './Seal'

function UpdateButton() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'none' })
  const encoding = useSquish((s) => s.screen === 'encoding')
  useEffect(() => {
    void window.squish.update.status().then(setStatus)
    return window.squish.update.onStatus(setStatus)
  }, [])
  if (status.state !== 'ready') return null
  return (
    <button className="update" disabled={encoding} onClick={() => void window.squish.update.install()}
      title={encoding ? 'Available after the encode finishes' : `Restart to install version ${status.version}`}>
      Update ready · Restart
    </button>
  )
}

export function TitleBar({ onAbout }: { onAbout: () => void }) {
  const w = window.squish.window
  return (
    <header className="titlebar">
      <div className="brand"><Seal /><span>Pyno's Squish</span></div>
      <div className="ctl">
        <UpdateButton />
        <button className="about" onClick={onAbout}>About</button>
        <button aria-label="Minimize" onClick={w.minimize}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10" stroke="var(--ink-3)" strokeWidth="1.2" /></svg></button>
        <button aria-label="Maximize" onClick={w.toggleMaximize}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="var(--ink-3)" strokeWidth="1.2" /></svg></button>
        <button aria-label="Close" className="close" onClick={w.close}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="var(--ink-3)" strokeWidth="1.2" /></svg></button>
      </div>
    </header>
  )
}
