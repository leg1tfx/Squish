import { interpolate } from 'remotion'
import { C, FONT } from '../theme'

const CHIPS = ['TikTok', 'Reels', 'Discord · 10 MB', 'WhatsApp · 16 MB']
const ACTIVE = 2

export function AppWindow({ fileIn, chipOn }: { fileIn: number; chipOn: number }) {
  return (
    <div
      style={{
        width: 900, height: 540, borderRadius: 16, background: C.surface, border: `1px solid ${C.hairline}`,
        boxShadow: '0 60px 120px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', textAlign: 'left'
      }}
    >
      <div style={{ height: 52, display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: `1px solid ${C.hairline}`, fontFamily: FONT.display, fontWeight: 600, fontSize: 18, color: C.ink }}>
        Pyno's Squish
      </div>
      <div style={{ flex: 1, padding: 28, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ flex: 1, borderRadius: 12, border: `2px dashed ${C.rule}`, display: 'grid', placeItems: 'center', position: 'relative' }}>
          <span style={{ fontFamily: FONT.body, fontSize: 22, color: C.ink3, opacity: 1 - fileIn }}>Drop your video here.</span>
          <div
            style={{
              position: 'absolute', padding: '14px 20px', borderRadius: 10, background: C.surfaceRaised,
              border: `1px solid ${C.hairline}`, fontFamily: FONT.mono, fontSize: 20, color: C.ink,
              opacity: fileIn, transform: `translateY(${interpolate(fileIn, [0, 1], [-220, 0])}px) scale(${interpolate(fileIn, [0, 1], [1.08, 1])})`
            }}
          >
            clip.mp4 · 48 MB
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {CHIPS.map((label, i) => {
            const on = i === ACTIVE ? chipOn : 0
            return (
              <div
                key={label}
                style={{
                  padding: '10px 16px', borderRadius: 999, fontFamily: FONT.mono, fontSize: 17, fontWeight: 500,
                  border: `1px solid ${on > 0.5 ? C.gold : C.hairline}`,
                  background: `rgba(212, 175, 55, ${0.9 * on})`,
                  color: on > 0.5 ? C.onGold : C.ink2,
                  transform: `scale(${1 + 0.06 * Math.sin(Math.PI * on)})`
                }}
              >
                {label}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
