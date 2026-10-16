import { DATA_MODE, FRESHNESS, REQUEST } from '../../../shared/signal/contract.js'
import { Link } from 'react-router-dom'
import { usePreview } from '../PreviewContext.jsx'

// Hero copy (client pay report positioning). Freshness is rendered separately
// from the "Updated weekly" promise and never implies a refresh that did not
// happen.

// Copy from the repair brief §6 (final copy review before release).
const HEADLINE = 'Know whether your client’s pay is competitive.'
const SUB = 'Compare advertised hourly pay for the role and market you serve. Turn available, verified results into a report that helps explain your pay recommendation to your client.'
const DISCLOSURE = 'Advertised pay, not actual wages paid. Local coverage varies. A free account is required to create, print, download, or email a personalized report.'

function HeroActions() {
  const { base, requestFocus } = usePreview()
  return (
    <>
      <div className="ssp-hero__actions">
        <button type="button" className="ssp-btn ssp-btn--primary" onClick={() => requestFocus && requestFocus('role')}>
          Compare Client Pay
        </button>
        <Link to={`${base}/sample-report`} className="ssp-btn ssp-btn--secondary">View Sample Report</Link>
      </div>
      <p className="ssp-hero__disclosure">{DISCLOSURE}</p>
    </>
  )
}

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
          <h1 className="ssp-hero__title">{HEADLINE}</h1>
          <p className="ssp-hero__sub">{SUB}</p>
          <HeroActions />
        </div>
      </div>
    )
  }

  return (
    <div className="ssp-hero__intro">
      <div className="ssp-hero__copy">
        <p className="ssp-eyebrow">Before you quote the order</p>
        <h1 className="ssp-hero__title">{HEADLINE}</h1>
        <p className="ssp-hero__sub">{SUB}</p>
        <HeroActions />
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
