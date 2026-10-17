// Plain-language dates for a snapshot. Three different facts, never merged:
//   * recalculated  - when the benchmark file was generated (export run)
//   * sourceRebuilt - when the source pay table was last rebuilt
//   * window        - posting dates of the observations used
// None of these says when every observation was collected.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function dayLabel(value) {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${MONTHS[month - 1]} ${day}, ${m[1]}`
}

// meta: a snapshot meta object (adapter output or bundled snapshot.snapshot).
export function freshnessFacts(meta) {
  if (!meta || typeof meta !== 'object') return { recalculated: null, sourceRebuilt: null, window: null }
  const w = meta.observationWindow
  const first = dayLabel(w?.firstPostingDate)
  const last = dayLabel(w?.lastPostingDate)
  return {
    recalculated: dayLabel(meta.lastSuccessfulRefresh) || dayLabel(meta.exactDate),
    sourceRebuilt: dayLabel(meta.sourceRefreshedAt),
    window: first && last ? `${first} to ${last}` : null
  }
}

// ['Benchmarks recalculated October 16, 2026', 'Source pay table rebuilt October 12, 2026', 'Postings dated ...']
export function freshnessParts(facts) {
  const f = facts || {}
  return [
    f.recalculated && `Benchmarks recalculated ${f.recalculated}`,
    f.sourceRebuilt && `Source pay table rebuilt ${f.sourceRebuilt}`,
    f.window && `Postings dated ${f.window}`
  ].filter(Boolean)
}
