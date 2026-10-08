import { DATA_MODE, FRESHNESS, REQUEST } from '../../../shared/signal/contract.js'
import { usePreview } from '../PreviewContext.jsx'

// Hero copy (client pay report positioning). Freshness is rendered separately
// from the "Updated weekly" promise and never implies a refresh that did not
// happen.

const SUB = 'Compare a client’s pay rate with what staffing firms advertise for the same job in the same market, and turn it into a report you can hand your client.'

function formatDate(value) {
  if (typeof value !== 'string' || value === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

export function Freshness({ className = '' }) {
  const { snapshot, snapshotState } = usePreview()
  let text
  if (!snapshot) {
    text = snapshotState === REQUEST.ERROR
      ? 'Snapshot details could not be loaded.'
      : 'Loading snapshot details…'
  } else {
    const meta = snapshot.snapshot || {}
    const parts = [`Snapshot: ${meta.label || 'date not available'}`]
    if (snapshot.dataMode === DATA_MODE.DEVELOPMENT_EXAMPLE) parts.push('development example')
    if (import.meta.env.DEV && snapshot.dataMode === DATA_MODE.SYNTHETIC) parts.push('synthetic test data')
    if (meta.freshness === FRESHNESS.STALE) parts.push('stale: the latest weekly refresh has not completed')
    const refreshed = formatDate(meta.lastSuccessfulRefresh)
    parts.push(`last successful refresh: ${refreshed || 'not available yet'}`)
    text = parts.join(' · ')
  }
  return (
    <p className={`ssp-fresh${className ? ` ${className}` : ''}`}>
      <span className="ssp-fresh__dot" aria-hidden="true" />
      <span>{text}</span>
    </p>
  )
}

export default function Hero({ compact = false }) {
  if (compact) {
    return (
      <div className="ssp-hero__intro ssp-hero__intro--compact">
        <div className="ssp-hero__copy">
          <h1 className="ssp-hero__title">See how your client’s pay stacks up.</h1>
          <p className="ssp-hero__sub">{SUB}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ssp-hero__intro">
      <div className="ssp-hero__copy">
        <p className="ssp-eyebrow">Before you quote the order</p>
        <h1 className="ssp-hero__title">See how your client’s pay stacks up.</h1>
        <p className="ssp-hero__sub">{SUB}</p>
      </div>
      <div className="ssp-hero__meta">
        <p className="ssp-hero__support">
          <span className="ssp-hero__check" aria-hidden="true">✓</span>
          Staffing-firm data only. Updated weekly.
        </p>
        <Freshness />
        <a href="#market" className="ssp-link ssp-hero__explore">
          Explore my staffing market <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  )
}
