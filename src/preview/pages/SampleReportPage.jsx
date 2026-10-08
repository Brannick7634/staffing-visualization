import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildClientReportModel } from '../../../shared/signal/clientReport.js'
import { geographyLabel } from '../../../shared/signal/geography.js'
import { formatCents } from '../../../shared/signal/money.js'
import { fetchPay } from '../api.js'
import ClientReportDocument from '../components/ClientReportDocument.jsx'
import { EVENTS, track } from '../lib/track.js'
import { usePreview } from '../PreviewContext.jsx'
import '../styles/report.css'

// /sample-report: a public example built from live data (Forklift Operator in
// Houston, TX) with an example client pay rate. No figures are hard-coded; if
// Houston has no publishable cell the report falls back like any other.

const SAMPLE = Object.freeze({ roleKey: 'forklift-operator', state: 'TX', city: 'TX:houston', rateCents: 1700 })

export default function SampleReportPage() {
  const { homePath } = usePreview()
  const [load, setLoad] = useState({ status: 'loading', response: null })
  const request = useRef(0)

  const fetchSample = useCallback(async () => {
    const id = ++request.current
    setLoad({ status: 'loading', response: null })
    try {
      const response = await fetchPay({ roleKey: SAMPLE.roleKey, state: SAMPLE.state, city: SAMPLE.city })
      if (id === request.current) setLoad({ status: 'ready', response })
    } catch {
      if (id === request.current) setLoad({ status: 'error', response: null })
    }
  }, [])

  useEffect(() => {
    fetchSample()
    track(EVENTS.SAMPLE_REPORT_VIEWED, { roleKey: SAMPLE.roleKey, geographyLevel: 'city' })
  }, [fetchSample])

  const model = useMemo(() => (
    load.response
      ? buildClientReportModel({ payResponse: load.response, rateCents: SAMPLE.rateCents, sample: true })
      : null
  ), [load.response])

  const place = model ? model.scope.label : geographyLabel(SAMPLE.state, SAMPLE.city)
  const ownReport = { pathname: homePath, hash: '#pay-check' }

  return (
    <div className="ssp-page ssp-report ssp-report--sample">
      <div className="ssp-container">
        <header className="ssp-report__intro">
          <span className="ssp-chip ssp-chip--example">Example report</span>
          <h1 className="ssp-page__title">Sample Client Pay Market Report</h1>
          <p className="ssp-report__lede">
            A real example built from current {place} data with an example client pay rate of {formatCents(SAMPLE.rateCents)}/hr.
          </p>
          <Link className="ssp-btn ssp-btn--primary" to={ownReport}>Create your own report</Link>
        </header>

        {load.status === 'loading' && (
          <div className="ssp-report-panel"><p className="ssp-report-panel__text" role="status">Loading the sample report…</p></div>
        )}
        {load.status === 'error' && (
          <div className="ssp-report-panel">
            <h2 className="ssp-report-panel__title">The sample report didn’t load</h2>
            <p className="ssp-report-panel__text">Please try again in a moment.</p>
            <div className="ssp-report-panel__actions">
              <button type="button" className="ssp-btn ssp-btn--primary" onClick={fetchSample}>Try again</button>
            </div>
          </div>
        )}
        {load.status === 'ready' && !model && (
          <div className="ssp-report-panel">
            <h2 className="ssp-report-panel__title">The sample isn’t available right now</h2>
            <p className="ssp-report-panel__text">The market data behind it is being refreshed. You can still create your own report.</p>
          </div>
        )}
        {model && (
          <div className="ssp-report__pages ssp-report__pages--solo">
            <ClientReportDocument model={model} idPrefix="ssp-sample-report" />
          </div>
        )}

        <div className="ssp-report__cta">
          <p>Build the same report for your client’s job, location and pay rate. A free account lets you print, download and email it.</p>
          <Link className="ssp-btn ssp-btn--primary" to={ownReport}>Create your own report</Link>
        </div>
      </div>
    </div>
  )
}
