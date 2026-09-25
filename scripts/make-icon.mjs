import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

// Pyno's Squish: a gold video frame squeezed by two chevrons, on a Pyno Nacht tile.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512">
<defs>
  <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#172629"/><stop offset="1" stop-color="#0b1416"/>
  </linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f0d27a"/><stop offset="1" stop-color="#d4af37"/>
  </linearGradient>
</defs>
<rect x="16" y="16" width="480" height="480" rx="112" fill="url(#tile)" stroke="#22363b" stroke-width="4"/>
<rect x="180" y="140" width="152" height="232" rx="36" fill="url(#gold)"/>
<path d="M232 210 L232 302 L296 256 Z" fill="#0b1416" stroke="#0b1416" stroke-width="14" stroke-linejoin="round"/>
<g fill="none" stroke="#4fd6c0" stroke-width="30" stroke-linecap="round" stroke-linejoin="round">
  <path d="M86 196 L138 256 L86 316"/>
  <path d="M426 196 L374 256 L426 316"/>
</g>
</svg>`

await mkdir('build', { recursive: true })
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('build/icon.png')
console.log('build/icon.png written')
