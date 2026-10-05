import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import { fetchReport } from '../api.js'

// "This Month's Signal": 3-5 deterministic headline trends from the latest
// monthly report, with a link to the full report. Renders nothing when no
// report exists yet (never a broken box on the homepage).

export function TrendArrow({ direction }) {
  const sym = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '★'
  const word = direction === 'up' ? 'Up' : direction === 'down' ? 'Down' : 'New'
  return (
    <span className={`ssp-trend ssp-trend--${direction}`}>
      <span aria-hidden="true">{sym}</span>
      <span className="ssp-visually-hidden">{word}: </span>
    </span>
  )
}

export function reportPath(site, month) {
  const base = site ? '/report' : '/preview/report'
  return month ? `${base}/${month}` : base
}

export default function MonthlySignal() {
  const { site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const [report, setReport] = useState(null)

  useEffect(() => {
    let live = true
    fetchReport().then((r) => { if (live) setReport(r) }).catch(() => { if (live) setReport(null) })
    return () => { live = false }
  }, [])

  const headlines = (report?.national?.headlines || []).slice(0, 5)
  if (headlines.length < 3) return null
  return (
    <section className="ssp-section ssp-monthly" aria-labelledby="ssp-monthly-title">
      <div className="ssp-container">
        <div className="ssp-sechead">
          <div className="ssp-sechead__text">
            <h2 id="ssp-monthly-title" className="ssp-h2">This Month's Signal</h2>
            <p className="ssp-lede">{report.label}: what moved since last month, nationwide.</p>
          </div>
          <Link to={reportPath(site)} className="ssp-link ssp-sechead__link">
            Read the {report.label} report <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ul className="ssp-monthly__list">
          {headlines.map((h, i) => (
            <li key={i} className="ssp-card ssp-monthly__item">
              <TrendArrow direction={h.direction} />
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
        <p className="ssp-muted ssp-monthly__note">Staffing-firm postings only. Advertised pay, not actual pay.</p>
      </div>
    </section>
  )
}
