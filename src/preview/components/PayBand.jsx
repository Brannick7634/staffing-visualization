import { useLayoutEffect, useRef, useState } from 'react'
import { formatCents } from '../../../shared/signal/money.js'
import { bandGeometry, classifyRate, placeLabels, VERDICT } from '../../../shared/signal/payBand.js'
import { POSITION_LABELS } from '../../../shared/signal/clientReport.js'

// A horizontal advertised-pay band on ONE truthful dollar scale. The track is
// split into three zones (Below market / Market range / Above market) at the
// market low (P25) and high (P75), the median is a tick, and the client's rate
// is a marker on the same scale. Labels are de-collided (marker positions
// never move) and connected to their ticks with leader lines. The visual is
// hidden from assistive tech; a text equivalent is rendered instead.

const CAPTIONS = { p25: 'Low', typical: 'Median', p75: 'High' }
const ZONES = ['below', 'within', 'above']
const FALLBACK = { width: 0, labelWidth: 78, pillWidth: 120 }

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value))
}

// De-collide labels inside [half, 100 - half] so edge labels never overflow
// the band. Uses the shared placeLabels; marker xPct is untouched.
function placeWithin(markers, { widthPx, labelPx, gapPx }) {
  if (!widthPx) return placeLabels(markers, { minGapPct: 14 })
  const half = clamp(((labelPx / 2) / widthPx) * 100, 0, 40)
  const inner = 100 - 2 * half
  const mapped = markers.map((m) => ({ ...m, xPct: clamp(((m.xPct - half) / inner) * 100, 0, 100) }))
  const minGapPct = (((labelPx + gapPx) / widthPx) * 100 / inner) * 100
  const placed = placeLabels(mapped, { minGapPct })
  return markers.map((marker, i) => {
    const labelPct = half + (placed[i].labelPct * inner) / 100
    return { ...marker, labelPct, shifted: Math.abs(labelPct - marker.xPct) > 0.4 }
  })
}

function textEquivalent({ geographyLabel, rateCents, p25Cents, typicalCents, p75Cents, verdict }) {
  const geo = geographyLabel && geographyLabel !== 'Nationwide' ? `${geographyLabel} advertised-pay band.` : 'Nationwide advertised-pay band.'
  const parts = [
    geo,
    `Market range: ${formatCents(p25Cents)} (market low, 25th percentile) to ${formatCents(p75Cents)} (market high, 75th percentile).`
  ]
  if (Number.isSafeInteger(typicalCents)) parts.push(`Market median: ${formatCents(typicalCents)}.`)
  if (Number.isSafeInteger(rateCents)) {
    const rate = formatCents(rateCents)
    if (verdict === VERDICT.BELOW) parts.push(`The client's rate, ${rate}, is below the market range.`)
    else if (verdict === VERDICT.ABOVE) parts.push(`The client's rate, ${rate}, is above the market range.`)
    else if (verdict === VERDICT.WITHIN) parts.push(`The client's rate, ${rate}, falls inside the market range.`)
  }
  return parts.join(' ')
}

export default function PayBand({ rateCents = null, p25Cents, typicalCents = null, p75Cents, geographyLabel, legend = true }) {
  const wrapRef = useRef(null)
  const labelRefs = useRef({})
  const pillRef = useRef(null)
  const [dims, setDims] = useState(FALLBACK)

  const geometry = bandGeometry({ rateCents, p25Cents, typicalCents, p75Cents })
  const verdict = classifyRate(rateCents, p25Cents, p75Cents)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return undefined
    const measure = () => {
      const width = wrap.clientWidth
      let labelWidth = 0
      for (const el of Object.values(labelRefs.current)) {
        if (el) labelWidth = Math.max(labelWidth, el.offsetWidth)
      }
      const pillWidth = pillRef.current ? pillRef.current.offsetWidth : 0
      setDims((prev) => {
        const next = {
          width,
          labelWidth: labelWidth || prev.labelWidth,
          pillWidth: pillWidth || prev.pillWidth
        }
        const same = Math.abs(prev.width - next.width) < 1 &&
          Math.abs(prev.labelWidth - next.labelWidth) < 1 &&
          Math.abs(prev.pillWidth - next.pillWidth) < 1
        return same ? prev : next
      })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [rateCents, p25Cents, typicalCents, p75Cents])

  if (!geometry) return null

  const tickMarkers = geometry.markers.filter((m) => m.key !== 'rate')
  const rateMarker = geometry.markers.find((m) => m.key === 'rate') || null
  const labels = placeWithin(tickMarkers, { widthPx: dims.width, labelPx: dims.labelWidth, gapPx: 10 })

  let pillPct = null
  if (rateMarker) {
    const half = dims.width ? clamp(((dims.pillWidth / 2) / dims.width) * 100, 0, 50) : 12
    pillPct = clamp(rateMarker.xPct, half, 100 - half)
  }

  const verdictClass = verdict ? ` ssp-band--${verdict}` : ''
  const { band } = geometry
  const zoneWidths = {
    below: band.fromPct,
    within: Math.max(0, band.toPct - band.fromPct),
    above: Math.max(0, 100 - band.toPct)
  }

  return (
    <figure className={`ssp-band${verdictClass}`}>
      <div className="ssp-band__visual" ref={wrapRef} aria-hidden="true">
        {rateMarker && (
          <div className="ssp-band__rate-row">
            <span className="ssp-band__pill ssp-num" ref={pillRef} style={{ left: `${pillPct}%` }}>
              <span className="ssp-band__pill-label">Client</span> {formatCents(rateMarker.cents)}
            </span>
            <span className="ssp-band__stem" style={{ left: `${rateMarker.xPct}%` }} />
          </div>
        )}
        <div className="ssp-band__track">
          <span className="ssp-band__zones">
            {ZONES.map((zone) => (
              <span key={zone} className={`ssp-band__zone ssp-band__zone--${zone}`} style={{ width: `${zoneWidths[zone]}%` }} />
            ))}
          </span>
          {tickMarkers.map((m) => (
            <span key={m.key} className={`ssp-band__tick ssp-band__tick--${m.key}`} style={{ left: `${m.xPct}%` }} />
          ))}
          {rateMarker && <span className="ssp-band__marker" style={{ left: `${rateMarker.xPct}%` }} />}
        </div>
        <svg className="ssp-band__leaders" viewBox="0 0 100 14" preserveAspectRatio="none" focusable="false">
          {labels.map((m) => (
            <line
              key={m.key}
              x1={m.xPct}
              y1="0"
              x2={m.labelPct}
              y2="14"
              className={m.shifted ? 'is-shifted' : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div className="ssp-band__labels">
          {labels.map((m) => (
            <span
              key={m.key}
              ref={(el) => { labelRefs.current[m.key] = el }}
              className={`ssp-band__label ssp-band__label--${m.key}`}
              style={{ left: `${m.labelPct}%` }}
            >
              <span className="ssp-band__amount ssp-num">{formatCents(m.cents)}</span>
              <span className="ssp-band__sep"> · </span>
              <span className="ssp-band__cap">{CAPTIONS[m.key]}</span>
            </span>
          ))}
        </div>
        {legend && (
          <ul className="ssp-band__legend">
            {ZONES.map((zone) => (
              <li key={zone} className={`ssp-band__key ssp-band__key--${zone}${verdict === zone ? ' is-current' : ''}`}>
                <span className="ssp-band__swatch" />
                {POSITION_LABELS[zone]}
              </li>
            ))}
          </ul>
        )}
      </div>
      <figcaption className="ssp-visually-hidden">
        {textEquivalent({ geographyLabel, rateCents, p25Cents, typicalCents, p75Cents, verdict })}
      </figcaption>
    </figure>
  )
}
