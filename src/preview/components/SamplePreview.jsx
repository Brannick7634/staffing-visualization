import { useId } from 'react'
import { Link } from 'react-router-dom'
import { usePreview } from '../PreviewContext.jsx'

// Teaser for the public sample report, under the calculator. The thumbnail is
// a decorative sketch of page 1 (no figures, so nothing to keep in sync).

const BENEFITS = [
  'Professional, client-ready format',
  'Independent market data',
  'Supports conversations about raising pay',
  'Turns market data into a stronger client conversation'
]

function ReportThumb() {
  return (
    <span className="ssp-thumb" aria-hidden="true">
      <span className="ssp-thumb__head">
        <span className="ssp-thumb__logo"><i /><i /><i /></span>
        <span className="ssp-thumb__line ssp-thumb__line--brand" />
      </span>
      <span className="ssp-thumb__rule" />
      <span className="ssp-thumb__line ssp-thumb__line--title" />
      <span className="ssp-thumb__line ssp-thumb__line--sub" />
      <span className="ssp-thumb__tiles"><i /><i /><i /><i className="is-client" /></span>
      <span className="ssp-thumb__band"><i /><i /><i /><b /></span>
      <span className="ssp-thumb__line" />
      <span className="ssp-thumb__line ssp-thumb__line--short" />
      <span className="ssp-thumb__scale"><i /><i /><i /><i /><i /></span>
      <span className="ssp-thumb__line ssp-thumb__line--short" />
    </span>
  )
}

export default function SamplePreview() {
  const { base } = usePreview()
  const headingId = useId()
  return (
    <section className="ssp-card ssp-sample" aria-labelledby={headingId}>
      <ReportThumb />
      <div className="ssp-sample__body">
        <h2 id={headingId} className="ssp-sample__title">Want to see what the report looks like?</h2>
        <p className="ssp-sample__text">
          See an example Client Pay Market Report showing how a client’s pay compares to the local market. No sign-up needed.
        </p>
        <Link to={`${base}/sample-report`} className="ssp-btn ssp-btn--secondary ssp-sample__cta">
          View Sample Report <span aria-hidden="true">→</span>
        </Link>
      </div>
      <ul className="ssp-sample__benefits">
        {BENEFITS.map((benefit) => (
          <li key={benefit}>
            <span className="ssp-sample__check" aria-hidden="true">✓</span>
            {benefit}
          </li>
        ))}
      </ul>
    </section>
  )
}
