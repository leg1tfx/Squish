export function SquishIcon({ size, squeeze }: { size: number; squeeze: number }) {
  const off = 70 * (1 - squeeze)
  // Frame gives a little as the chevrons land: peaks at squeeze≈0.85, settles to 1.
  const give = Math.max(0, 1 - Math.abs(squeeze - 0.85) / 0.15)
  const sx = 1 - 0.1 * give
  return (
    <svg width={size} height={size} viewBox="0 0 512 512">
      <defs>
        <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#172629" /><stop offset="1" stopColor="#0b1416" />
        </linearGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0d27a" /><stop offset="1" stopColor="#d4af37" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#tile)" stroke="#22363b" strokeWidth="4" />
      <g transform={`translate(256 256) scale(${sx} ${1 + (1 - sx) * 0.4}) translate(-256 -256)`}>
        <rect x="180" y="140" width="152" height="232" rx="36" fill="url(#gold)" />
        <path d="M232 210 L232 302 L296 256 Z" fill="#0b1416" stroke="#0b1416" strokeWidth="14" strokeLinejoin="round" />
      </g>
      <g fill="none" stroke="#4fd6c0" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round">
        <path d="M86 196 L138 256 L86 316" transform={`translate(${-off} 0)`} />
        <path d="M426 196 L374 256 L426 316" transform={`translate(${off} 0)`} />
      </g>
    </svg>
  )
}
