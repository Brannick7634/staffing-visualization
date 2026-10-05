import { Link } from 'react-router-dom'
import '../styles/sections.css'
import { usePreview } from '../PreviewContext.jsx'

// Four plain-language trust points (brief §6.I) plus the publication rule.
// The refresh line uses the snapshot's last successful refresh and says
// plainly when that date isn't available.

function refreshLine(meta) {
  const date = meta?.lastSuccessfulRefresh
  if (typeof date === 'string' && date !== '') return `Last successful refresh: ${date}`
  return 'Last successful refresh: not available yet'
}

function Icon({ name }) {
  const common = { viewBox: '0 0 28 28', width: 28, height: 28, 'aria-hidden': 'true', focusable: 'false' }
  if (name === 'firms') {
    return (
      <svg {...common}>
        <circle cx="14" cy="10" r="4" fill="none" strokeWidth="2" />
        <path d="M6 23c1.2-4.2 4.3-6.5 8-6.5s6.8 2.3 8 6.5" fill="none" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  if (name === 'aggregate') {
    return (
      <svg {...common}>
        <rect x="7" y="12" width="14" height="11" rx="2" fill="none" strokeWidth="2" />
        <path d="M10 12V9a4 4 0 0 1 8 0v3" fill="none" strokeWidth="2" />
      </svg>
    )
  }
  if (name === 'weekly') {
    return (
      <svg {...common}>
        <rect x="5" y="7" width="18" height="16" rx="2" fill="none" strokeWidth="2" />
        <path d="M5 12h18M10 4v5M18 4v5" fill="none" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="14" cy="14" r="9" fill="none" strokeWidth="2" />
      <path d="M14 13v6M14 9.2v.1" fill="none" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export default function TrustStrip({ snapshot }) {
  const { base } = usePreview()
  const meta = snapshot?.snapshot
  const cadence = meta?.refreshCadence === 'weekly' ? 'Data refreshes weekly. ' : ''
  const points = [
    { key: 'firms', title: 'Staffing firms only', body: 'No direct-employer postings in these benchmarks.' },
    { key: 'aggregate', title: 'Aggregated results', body: 'No individual staffing firms or postings displayed.' },
    { key: 'weekly', title: 'Weekly updates', body: `${cadence}${refreshLine(meta)}.` },
    { key: 'limits', title: 'Clear limitations', body: 'Advertised pay, not actual pay. Momentum figures are early signals.' }
  ]

  return (
    <section className="ssp-section ssp-trust" aria-labelledby="ssp-trust-title">
      <div className="ssp-container">
        <h2 id="ssp-trust-title" className="ssp-visually-hidden">How this data is handled</h2>
        <ul className="ssp-trust__list">
          {points.map((point) => (
            <li key={point.key} className="ssp-trust__item">
              <span className="ssp-trust__icon"><Icon name={point.key} /></span>
              <div>
                <h3 className="ssp-trust__title">{point.title}</h3>
                <p className="ssp-trust__body">{point.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="ssp-trust__method">
          We publish a figure only when at least five distinct staffing firms contribute and no single firm
          contributes more than 50% of its observations. These rules reduce the risk of revealing any one firm; they
          are not a guarantee of anonymity.{' '}
          <Link to={`${base}/methodology`} className="ssp-link">See how we count</Link>
        </p>
      </div>
    </section>
  )
}
