import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { STATES } from '../../../shared/signal/geography.js'
import { formatCents } from '../../../shared/signal/money.js'
import { TrendArrow, reportPath } from '../components/MonthlySignal.jsx'
import { FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import { fetchReport } from '../api.js'

// /report (latest) and /report/YYYY-MM. Public readers get the national
// section; signed-in readers see their own city/state first (from saved
// preferences, or the area picker here), with an honest note when their local
// comparison was withheld.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthName = (m) => `${MONTH_NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`
const pct = (p) => `${p > 0 ? '+' : '−'}${Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0)}%`

function Headlines({ items }) {
  if (!items?.length) return <p className="ssp-muted">No changes cleared our reliability bar this month.</p>
  return (
    <ul className="ssp-monthly__list">
      {items.map((h, i) => (
        <li key={i} className="ssp-card ssp-monthly__item"><TrendArrow direction={h.direction} /><span>{h.text}</span></li>
      ))}
    </ul>
  )
}

function PayTable({ rows, caption }) {
  if (!rows?.length) return null
  return (
    <div className="ssp-report__tablewrap">
      <table className="ssp-report__table">
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Role</th><th scope="col">Last month</th><th scope="col">This month</th><th scope="col">Change</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.roleKey}>
              <th scope="row">{r.label}</th>
              <td className="ssp-num">{formatCents(r.fromCents)}</td>
              <td className="ssp-num">{formatCents(r.toCents)}</td>
              <td className="ssp-num"><TrendArrow direction={r.direction} /> {pct(r.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MoveList({ title, rows }) {
  if (!rows?.length) return null
  return (
    <div className="ssp-card ssp-report__moves">
      <h3 className="ssp-h3">{title}</h3>
      <ul>
        {rows.map((r) => (
          <li key={r.key}><TrendArrow direction={r.direction} /> {r.label} <span className="ssp-num ssp-muted">{pct(r.pct)}</span></li>
        ))}
      </ul>
    </div>
  )
}

function Section({ section, heading }) {
  return (
    <section className="ssp-report__section" aria-label={heading}>
      <h2 className="ssp-h2">{heading}</h2>
      <Headlines items={section.headlines} />
      <PayTable rows={section.payMoves} caption="Typical advertised hourly pay" />
      <div className="ssp-grid-2">
        <MoveList title="Gaining share of postings" rows={section.hottestRoles} />
        <MoveList title="Losing share of postings" rows={section.coolingRoles} />
      </div>
    </section>
  )
}

export default function ReportPage() {
  const { month } = useParams()
  const { site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const [state, setState] = useState({ status: 'loading', data: null })
  const [pick, setPick] = useState('')

  useEffect(() => {
    let live = true
    setState({ status: 'loading', data: null })
    fetchReport({ month, state: pick || undefined })
      .then((data) => { if (live) setState({ status: 'ok', data }) })
      .catch((err) => { if (live) setState({ status: err?.status === 404 ? 'missing' : 'error', data: null, months: err?.details?.months }) })
    return () => { live = false }
  }, [month, pick])

  useEffect(() => {
    const prev = document.title
    if (state.data?.label) document.title = `The Staffing Signal — ${state.data.label} report`
    return () => { document.title = prev }
  }, [state.data?.label])

  if (state.status === 'loading') return <div className="ssp-section"><div className="ssp-container"><p className="ssp-muted">Loading the report…</p></div></div>
  if (state.status !== 'ok') {
    return (
      <div className="ssp-section"><div className="ssp-container">
        <h1 className="ssp-h1">Monthly Signal</h1>
        <p>{state.status === 'missing' ? 'There is no report for that month.' : 'We could not load the report. Please try again.'}</p>
        <Link to={reportPath(site)} className="ssp-link">See the latest report</Link>
      </div></div>
    )
  }
  const d = state.data
  const n = d.national
  const signedIn = !d.localLocked
  const local = d.local
  return (
    <div className="ssp-section"><div className="ssp-container ssp-report">
      <p className="ssp-eyebrow">The Monthly Signal</p>
      <h1 className="ssp-h1">{d.label}</h1>
      <p className="ssp-lede">Compared with {monthName(d.previousMonth)}. Staffing-firm postings only; advertised pay, not actual pay.</p>

      {signedIn && (
        <div className="ssp-report__area">
          <label htmlFor="ssp-report-state" className="ssp-field__label">Show local trends for</label>
          <select id="ssp-report-state" value={pick || d.area?.state || ''} onChange={(e) => setPick(e.target.value)}>
            <option value="">My saved area</option>
            {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
          {!d.area && <p className="ssp-muted">Add your state and city in <Link to={site ? '/preferences' : '/preview/preferences'} className="ssp-link">preferences</Link> to see your area first.</p>}
        </div>
      )}
      {signedIn && local?.note && <p className="ssp-card ssp-report__fallback" role="note">{local.note}</p>}
      {signedIn && local?.section && <Section section={local.section} heading={`Your area: ${local.section.name}`} />}
      {signedIn && local?.level === 'city' && d.area?.state && d.states?.[d.area.state] && (
        <Section section={d.states[d.area.state]} heading={d.states[d.area.state].name} />
      )}

      <section className="ssp-report__section" aria-label="National">
        <h2 className="ssp-h2">National</h2>
        <Headlines items={n.headlines} />
        <PayTable rows={n.payMoves} caption="Biggest moves in typical advertised hourly pay, nationwide" />
        <div className="ssp-grid-2">
          <MoveList title="Roles gaining share of postings" rows={n.hottestRoles} />
          <MoveList title="Roles losing share of postings" rows={n.coolingRoles} />
          <MoveList title="States heating up" rows={n.hottestStates} />
          <MoveList title="States cooling" rows={n.coolingStates} />
        </div>
        {n.newlyPublishable?.length > 0 && (
          <p>Newly reliable national pay ranges: {n.newlyPublishable.map((r) => r.label).join(', ')}.</p>
        )}
      </section>

      {!signedIn && (
        <div className="ssp-card ssp-report__locked">
          <h2 className="ssp-h3">Your state and city, first</h2>
          <p>Free access adds state and city trends to this report, led by your own area.</p>
          <Link to={site ? '/free-access' : '/preview/free-access'} className="ssp-btn ssp-btn--primary">Get free access</Link>
        </div>
      )}

      <section className="ssp-report__section" aria-label="How to read this">
        <h2 className="ssp-h3">How to read this</h2>
        <ul className="ssp-muted">{(d.notes || []).map((t, i) => <li key={i}>{t}</li>)}</ul>
      </section>

      {d.months?.length > 0 && (
        <nav className="ssp-report__archive" aria-label="Report archive">
          <h2 className="ssp-h3">Archive</h2>
          <ul>
            {d.months.map((m) => (
              <li key={m}>{m === d.month ? <strong>{monthName(m)}</strong> : <Link to={reportPath(site, m)} className="ssp-link">{monthName(m)}</Link>}</li>
            ))}
          </ul>
        </nav>
      )}
    </div></div>
  )
}
