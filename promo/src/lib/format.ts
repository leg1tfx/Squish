export function formatMb(mb: number): string {
  const r = Math.round(mb * 10) / 10
  return r >= 10 ? `${Math.round(r)} MB` : `${r.toFixed(1)} MB`
}

export function countdownValue(p: number, from = 48, to = 9.7): number {
  const c = Math.min(1, Math.max(0, p))
  return from + (to - from) * c
}
