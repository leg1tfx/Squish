import { Seal } from './Seal'

export function TitleBar({ onAbout }: { onAbout: () => void }) {
  const w = window.squish.window
  return (
    <header className="titlebar">
      <div className="brand"><Seal /><span>Pyno's Squish</span></div>
      <div className="ctl">
        <button className="about" onClick={onAbout}>About</button>
        <button aria-label="Minimize" onClick={w.minimize}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10" stroke="var(--ink-3)" strokeWidth="1.2" /></svg></button>
        <button aria-label="Maximize" onClick={w.toggleMaximize}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="var(--ink-3)" strokeWidth="1.2" /></svg></button>
        <button aria-label="Close" className="close" onClick={w.close}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="var(--ink-3)" strokeWidth="1.2" /></svg></button>
      </div>
    </header>
  )
}
