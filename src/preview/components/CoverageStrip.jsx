import { DataModeChip, formatCount } from './IssueStrip.jsx'
import '../styles/sections.css'

// Compressed evidence/coverage strip. Every value and label comes from the
// snapshot's coverageStrip / extraCoverage; approximate values read "About …"
// rather than carrying an unsupported "+".

function displayValue(item) {
  if (typeof item.valueLabel === 'string' && item.valueLabel !== '') return item.valueLabel
  if (!Number.isFinite(item.value)) return null
  const count = formatCount(item.value)
  return item.approximate ? `About ${count}` : count
}

function extraLine(extra) {
  if (!extra || typeof extra !== 'object') return null
  const parts = []
  if (Number.isFinite(extra.reliablePayTitles)) {
    parts.push(`${formatCount(extra.reliablePayTitles)} job titles with reliable pay`)
  }
  const combos = extra.jobCityPayCombos
  if (combos && Number.isFinite(combos.value)) {
    const count = formatCount(combos.value)
    parts.push(`${combos.approximate ? 'about ' : ''}${count} job/city pay combinations (not ${count} fully covered cities)`)
  }
  return parts.length ? parts.join(' · ') : null
}

export default function CoverageStrip({ snapshot, compact = false }) {
  const items = (Array.isArray(snapshot?.coverageStrip) ? snapshot.coverageStrip : [])
    .map((item) => ({ ...item, display: displayValue(item) }))
    .filter((item) => item.display)
  const extra = extraLine(snapshot?.extraCoverage)
  if (items.length === 0 && !extra) return null

  return (
    <section className={`ssp-section ssp-coverage${compact ? ' ssp-coverage--compact' : ''}`} aria-labelledby="ssp-coverage-title">
      <div className="ssp-container">
        <div className="ssp-coverage__head">
          <h2 id="ssp-coverage-title" className="ssp-coverage__title">Dataset coverage</h2>
          <DataModeChip mode={snapshot?.dataMode} />
          <p className="ssp-coverage__sub ssp-muted">Observed dataset coverage, not a census of every staffing job in the United States.</p>
        </div>
        <ul className="ssp-coverage__list">
          {items.map((item) => (
            <li key={item.key} className="ssp-coverage__item">
              <span className="ssp-coverage__value ssp-num">{item.display}</span>
              <span className="ssp-coverage__label">
                {item.label}
                {item.period && <span className="ssp-muted"> ({item.period})</span>}
              </span>
              {item.note && <span className="ssp-coverage__note ssp-muted">{item.note}</span>}
            </li>
          ))}
        </ul>
        {extra && <p className="ssp-coverage__extra ssp-num">{extra}</p>}
      </div>
    </section>
  )
}
