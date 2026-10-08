import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ACCESS, COVERAGE } from '../../../shared/signal/contract.js'
import { EVENTS, track } from '../lib/track.js'
import { FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import { DataModeChip, formatCount } from './IssueStrip.jsx'
import '../styles/sections.css'

// Market report preview: "Busiest cities" (observed volume) beside "Markets to
// watch" (normalized momentum). Rows come only from the API: a signed-out
// payload already omits gated cities and cooling states (no names, values or
// counts), so this component never has hidden figures to leak.

// Accessible tabs (WAI-ARIA tabs pattern, automatic activation): roving
// tabindex, Left/Right arrows, Home/End. Also used by SectorModule.
export function TabList({ idPrefix, label, tabs, active, onChange, className = '' }) {
  const refs = useRef([])

  function onKeyDown(event, index) {
    let next = null
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    if (next === null) return
    event.preventDefault()
    onChange(tabs[next].key)
    const el = refs.current[next]
    if (el) el.focus()
  }

  return (
    <div role="tablist" aria-label={label} className={`ssp-tabs ${className}`.trim()}>
      {tabs.map((tab, index) => {
        const selected = tab.key === active
        return (
          <button
            key={tab.key}
            ref={(el) => { refs.current[index] = el }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.key}`}
            tabIndex={selected ? 0 : -1}
            className={`ssp-tab${selected ? ' is-active' : ''}${tab.tone ? ` ssp-tab--${tab.tone}` : ''}`}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.content || tab.label}
          </button>
        )
      })}
    </div>
  )
}

// '+142%' / '−37%' (true minus sign). Values are shown as supplied.
export function formatMomentum(pct) {
  if (!Number.isFinite(pct)) return ''
  const abs = Math.abs(pct)
  const text = Number.isInteger(abs) ? String(abs) : abs.toFixed(1)
  if (pct > 0) return `+${text}%`
  if (pct < 0) return `−${text}%`
  return `${text}%`
}

export function momentumCaption(momentum) {
  const cur = momentum?.windowDays
  const prev = momentum?.previousWindowDays
  const windows = Number.isFinite(cur) && Number.isFinite(prev) ? `latest ${cur} days vs previous ${prev}` : null
  return ['Normalized posting momentum', windows, 'not raw growth'].filter(Boolean).join(' · ')
}

// Rows for one direction. Cooling is ordered by size of decline (largest
// first) and heating by size of increase, whatever order the payload uses.
export function MomentumRows({ rows, direction }) {
  const sorted = [...rows]
    .filter((row) => Number.isFinite(row.momentumPct))
    .sort((a, b) => (direction === 'cool' ? a.momentumPct - b.momentumPct : b.momentumPct - a.momentumPct))
  return (
    <ol className="ssp-momentum">
      {sorted.map((row, index) => (
        <li key={row.code || row.name} className="ssp-momentum__row">
          <span className="ssp-momentum__rank ssp-num" aria-hidden="true">{index + 1}</span>
          <span className="ssp-momentum__name">{row.name}</span>
          <span className={`ssp-momentum__value ${direction === 'cool' ? 'ssp-cool' : 'ssp-heat'}`}>
            <span aria-hidden="true">{direction === 'cool' ? '▼' : '▲'} </span>
            {formatMomentum(row.momentumPct)}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function NoHistory({ momentum }) {
  return (
    <div className="ssp-nohistory" role="note">
      <p className="ssp-nohistory__title">Not enough comparable history</p>
      <p className="ssp-muted">
        {momentum?.message || 'Not enough comparable history to show momentum yet.'} No momentum number is shown
        instead — not 0%, and not “steady”.
      </p>
    </div>
  )
}

function CityBars({ cities }) {
  const rows = (Array.isArray(cities?.rows) ? cities.rows : []).filter((row) => Number.isFinite(row.postings))
  // One truthful scale that starts at zero; the longest bar is the largest shown value.
  const max = rows.reduce((m, row) => Math.max(m, row.postings), 0)
  if (rows.length === 0) {
    return <p className="ssp-muted">No city rows pass publication checks in this snapshot.</p>
  }
  return (
    <ol className="ssp-bars">
      {rows.map((row) => {
        const pct = max > 0 ? Math.max(0, Math.min(100, (row.postings / max) * 100)) : 0
        const place = row.state ? `${row.city}, ${row.state}` : row.city
        return (
          <li key={row.key} className="ssp-bars__row">
            <span className="ssp-bars__rank ssp-num" aria-hidden="true">{row.rank}</span>
            <span className="ssp-bars__name">{place}</span>
            <span className="ssp-bars__track" aria-hidden="true">
              <span className="ssp-bars__fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="ssp-bars__value ssp-num">
              {formatCount(row.postings)}
              <span className="ssp-visually-hidden"> postings</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function LockIcon() {
  return (
    <svg className="ssp-lockicon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="4" y="9" width="12" height="9" rx="2" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" strokeWidth="2" />
    </svg>
  )
}

function UnlockButton({ onUnlock, children }) {
  return (
    <button type="button" className="ssp-btn ssp-btn--primary ssp-btn--sm" onClick={onUnlock}>
      {children}
    </button>
  )
}

export default function MarketPreview({ snapshot, access, onUnlock }) {
  const { variant, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const [tab, setTab] = useState('heating')
  const cities = snapshot?.cities
  const momentum = snapshot?.momentum
  const authorized = access === ACCESS.AUTHORIZED
  const noHistory = momentum?.coverage === COVERAGE.INSUFFICIENT_HISTORY
  const heatingRows = Array.isArray(momentum?.heating?.rows) ? momentum.heating.rows : []
  const cooling = momentum?.cooling || null
  const coolingLocked = !cooling || cooling.access === ACCESS.REQUIRES_FREE_ACCOUNT
  const coolingRows = !coolingLocked && Array.isArray(cooling.rows) ? cooling.rows : []
  const cityCaption = [
    cities?.metric,
    Number.isFinite(cities?.windowDays) ? `last ${cities.windowDays} days` : null,
    cities?.scope
  ].filter(Boolean).join(' · ')

  const tabs = [
    { key: 'heating', label: 'Heating', tone: 'heat', content: <><span aria-hidden="true">▲</span> Heating</> },
    { key: 'cooling', label: 'Cooling', tone: 'cool', content: <><span aria-hidden="true">▼</span> Cooling</> }
  ]

  return (
    <section className="ssp-section ssp-market" aria-labelledby="ssp-market-title">
      <div className="ssp-container">
        <div className="ssp-sechead">
          <div className="ssp-sechead__text">
            <h2 id="ssp-market-title" className="ssp-h2">Busy is not the same as heating up.</h2>
            <p className="ssp-lede">
              Posting volume shows where we observed more staffing activity. Momentum shows how activity changed
              compared with the change across all observed states. They answer different questions.
            </p>
          </div>
          {site ? (
            <span className="ssp-sechead__soon">Full market report coming soon</span>
          ) : (
            <Link
              to="/preview/market-report"
              className="ssp-link ssp-sechead__link"
              onClick={() => track(EVENTS.MARKET_REPORT_OPENED, { variant })}
            >
              See the full market report <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>

        <div className="ssp-market__grid">
          <article className="ssp-card ssp-market__panel" aria-labelledby="ssp-cities-title">
            <div className="ssp-market__panelhead">
              <h3 id="ssp-cities-title" className="ssp-card__title">Busiest cities</h3>
              <DataModeChip mode={snapshot?.dataMode} />
            </div>
            {cityCaption && <p className="ssp-market__caption">{cityCaption}</p>}
            <CityBars cities={cities} />
            {cities?.more && cities.more.access === ACCESS.REQUIRES_FREE_ACCOUNT && (
              <div className="ssp-lock ssp-market__lock">
                <p className="ssp-market__lockcopy">
                  <LockIcon />
                  {cities.more.description || 'Unlock the full city rankings.'}
                </p>
                <UnlockButton onUnlock={onUnlock}>Unlock full rankings</UnlockButton>
              </div>
            )}
            <p className="ssp-market__basis ssp-market__basis--end ssp-muted">Observed postings, not verified open orders or vacancies.</p>
          </article>

          <article className="ssp-card ssp-market__panel" aria-labelledby="ssp-watch-title">
            <div className="ssp-market__panelhead">
              <h3 id="ssp-watch-title" className="ssp-card__title">Markets to watch</h3>
              <DataModeChip mode={snapshot?.dataMode} />
            </div>
            <TabList idPrefix="ssp-watch" label="Markets to watch" tabs={tabs} active={tab} onChange={setTab} className="ssp-tabs--compact" />

            <div
              role="tabpanel"
              id="ssp-watch-panel-heating"
              aria-labelledby="ssp-watch-tab-heating"
              hidden={tab !== 'heating'}
              tabIndex={0}
              className="ssp-market__tabpanel"
            >
              <p className="ssp-market__caption">{momentumCaption(momentum)}</p>
              {noHistory ? (
                <NoHistory momentum={momentum} />
              ) : heatingRows.length > 0 ? (
                <MomentumRows rows={heatingRows} direction="heat" />
              ) : (
                <p className="ssp-muted">No heating states pass publication checks in this snapshot.</p>
              )}
            </div>

            <div
              role="tabpanel"
              id="ssp-watch-panel-cooling"
              aria-labelledby="ssp-watch-tab-cooling"
              hidden={tab !== 'cooling'}
              tabIndex={0}
              className="ssp-market__tabpanel"
            >
              <p className="ssp-market__caption">{momentumCaption(momentum)}</p>
              {noHistory ? (
                <NoHistory momentum={momentum} />
              ) : coolingLocked ? (
                <div className="ssp-lock ssp-market__lock">
                  <p className="ssp-market__lockcopy">
                    <LockIcon />
                    Cooling markets are part of free access.
                  </p>
                  <UnlockButton onUnlock={onUnlock}>Get free access</UnlockButton>
                </div>
              ) : coolingRows.length > 0 ? (
                <MomentumRows rows={coolingRows} direction="cool" />
              ) : (
                <p className="ssp-muted">No cooling states pass publication checks in this snapshot.</p>
              )}
            </div>

            {momentum?.basis && <p className="ssp-market__basis ssp-muted">{momentum.basis}</p>}
            {momentum?.historyNote && <p className="ssp-market__basis ssp-muted">{momentum.historyNote}</p>}
          </article>
        </div>

        <p className="ssp-market__footnote ssp-muted">
          Signed-out visitors see the top five heating states and top three cities from the default nationwide
          ranking. Filtered and full rankings require free access.
          {authorized && ' You are seeing the full rankings (signed in).'}
        </p>
      </div>
    </section>
  )
}
