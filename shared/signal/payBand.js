// Pay-band logic for The Staffing Signal preview: the three-way verdict, its
// copy, and the geometry of the dollar-scale band.
//
// Browser-safe (no node: imports). Every input is integer cents. The band is a
// dollar scale, not a percentile estimator: P25 and P75 do not tell us the
// exact percentile of an entered rate, so nothing here computes one.
//
// The typical rate IS the median of advertised pay (the snapshot's
// method.quantile says "typical = median"), and the client pay report labels it
// "Market Median". The three-way verdict below stays in "typical advertised
// range" wording; the median-based report copy lives in clientReport.js.
import { formatDiffCents } from './money.js'

export const VERDICT = Object.freeze({ BELOW: 'below', WITHIN: 'within', ABOVE: 'above' })

function isCents(value) {
  return Number.isSafeInteger(value) && value > 0
}

// classifyRate(rateCents, p25Cents, p75Cents) -> 'below' | 'within' | 'above' | null
// rate < P25 -> below; P25 <= rate <= P75 -> within; rate > P75 -> above.
// Returns null (no verdict) when any value is missing, not a positive integer
// number of cents, or the band is inverted (P25 > P75).
export function classifyRate(rateCents, p25Cents, p75Cents) {
  if (!isCents(rateCents) || !isCents(p25Cents) || !isCents(p75Cents)) return null
  if (p25Cents > p75Cents) return null
  if (rateCents < p25Cents) return VERDICT.BELOW
  if (rateCents > p75Cents) return VERDICT.ABOVE
  return VERDICT.WITHIN
}

function geographyPhrase(geographyLabel) {
  if (typeof geographyLabel !== 'string') return 'nationwide'
  const label = geographyLabel.trim()
  if (label === '' || label.toLowerCase() === 'nationwide') return 'nationwide'
  return label
}

// verdictCopy(verdict, { rateCents, p25Cents, p75Cents, geographyLabel })
//   -> { headline, detail } | null
// Returns null when the verdict is unknown or does not match the figures it is
// asked to describe, so stale or mismatched copy is never shown.
export function verdictCopy(verdict, { rateCents, p25Cents, p75Cents, geographyLabel } = {}) {
  const actual = classifyRate(rateCents, p25Cents, p75Cents)
  if (actual === null || actual !== verdict) return null
  const geo = geographyPhrase(geographyLabel)

  if (verdict === VERDICT.BELOW) {
    return {
      headline: 'Client rate is below the typical advertised range.',
      detail: `Your client's rate is ${formatDiffCents(p25Cents - rateCents)} below the lower end of this ${geo} range.`
    }
  }
  if (verdict === VERDICT.ABOVE) {
    return {
      headline: 'Client rate is above the typical advertised range.',
      detail: `Your client's rate is ${formatDiffCents(rateCents - p75Cents)} above the upper end of this ${geo} range. That does not make it the highest rate in the market.`
    }
  }
  return {
    headline: 'Client rate is within the typical advertised range.',
    detail: `Your client's rate falls inside the middle half of advertised rates for this ${geo} comparison.`
  }
}

const MARKER_ORDER = ['rate', 'p25', 'typical', 'p75']

// bandGeometry({ rateCents, p25Cents, typicalCents, p75Cents })
//   -> { domain:[lo,hi], x(cents)->percent, markers:[{key,cents,xPct}], band:{fromPct,toPct} } | null
// ONE linear scale positions every marker. The domain spans every value shown
// (rate when entered, P25, typical when supplied, P75) plus padding of
// max(5% of the span, 50 cents) each side, floored at $0.00. Markers are
// returned left to right. Returns null when the band itself is unusable;
// rateCents and typicalCents may be null/undefined (that marker is omitted).
export function bandGeometry({ rateCents = null, p25Cents, typicalCents = null, p75Cents } = {}) {
  if (!isCents(p25Cents) || !isCents(p75Cents) || p25Cents > p75Cents) return null
  if (rateCents !== null && rateCents !== undefined && !isCents(rateCents)) return null
  if (typicalCents !== null && typicalCents !== undefined && !isCents(typicalCents)) return null

  const values = { rate: rateCents ?? null, p25: p25Cents, typical: typicalCents ?? null, p75: p75Cents }
  const present = MARKER_ORDER.filter((key) => values[key] !== null)
  const shown = present.map((key) => values[key])

  const min = Math.min(...shown)
  const max = Math.max(...shown)
  const span = max - min
  const pad = Math.max(Math.ceil((span * 5) / 100), 50)
  const lo = Math.max(0, min - pad)
  const hi = max + pad
  const width = hi - lo

  const x = (cents) => {
    const pct = ((cents - lo) / width) * 100
    return Math.min(100, Math.max(0, pct))
  }

  const markers = present
    .map((key) => ({ key, cents: values[key], xPct: x(values[key]) }))
    .sort((a, b) => a.cents - b.cents || MARKER_ORDER.indexOf(a.key) - MARKER_ORDER.indexOf(b.key))

  return {
    domain: [lo, hi],
    x,
    markers,
    band: { fromPct: x(p25Cents), toPct: x(p75Cents) }
  }
}

// Pool-adjacent-violators: the non-decreasing sequence closest (least squares)
// to `targets`.
function isotonic(targets) {
  const blocks = []
  for (const value of targets) {
    blocks.push({ sum: value, count: 1 })
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1]
      const prev = blocks[blocks.length - 2]
      if (prev.sum / prev.count <= last.sum / last.count) break
      prev.sum += last.sum
      prev.count += last.count
      blocks.pop()
    }
  }
  const out = []
  for (const block of blocks) {
    const mean = block.sum / block.count
    for (let i = 0; i < block.count; i += 1) out.push(mean)
  }
  return out
}

const EPSILON = 1e-9

// placeLabels(markers, { minGapPct = 14 }) -> [{ ...marker, labelPct, shifted }]
// Positions each marker's label so neighbouring labels are at least minGapPct
// apart, labels keep the left-to-right order of their markers, every label
// stays within [0, 100], and labels move as little as possible (least squares).
// The marker positions themselves are never changed: each output keeps the
// input's xPct untouched, and the inputs are not mutated. `shifted` is true when
// the label sits away from its marker, so the UI can draw a leader line.
// Output is in the same order as the input. If the markers cannot fit at the
// requested gap, the gap shrinks to 100 / (n - 1).
export function placeLabels(markers, { minGapPct = 14 } = {}) {
  if (!Array.isArray(markers) || markers.length === 0) return []
  const n = markers.length
  const requested = Number.isFinite(minGapPct) && minGapPct > 0 ? minGapPct : 0
  const gap = n > 1 ? Math.min(requested, 100 / (n - 1)) : 0

  const order = markers
    .map((marker, index) => ({ index, xPct: marker.xPct }))
    .sort((a, b) => a.xPct - b.xPct || a.index - b.index)

  // Substitute y_i = label_i - i*gap: the gap constraint becomes "y is
  // non-decreasing", solved exactly by isotonic regression, and the [0,100]
  // bounds become a box on y, which clipping the isotonic solution satisfies
  // optimally.
  const upper = 100 - (n - 1) * gap
  const fitted = isotonic(order.map((item, i) => item.xPct - i * gap))
  const labels = fitted.map((y, i) => Math.min(upper, Math.max(0, y)) + i * gap)

  const out = new Array(n)
  order.forEach((item, i) => {
    const marker = markers[item.index]
    const labelPct = Math.min(100, Math.max(0, labels[i]))
    out[item.index] = {
      ...marker,
      xPct: marker.xPct,
      labelPct,
      shifted: Math.abs(labelPct - marker.xPct) > EPSILON
    }
  })
  return out
}
