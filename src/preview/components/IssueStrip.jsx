import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ACCESS, DATA_MODE } from '../../../shared/signal/contract.js'
import { EVENTS, track } from '../lib/track.js'
import { FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import '../styles/sections.css'

// "The issue in 30 seconds." — three editorial cards that come straight from
// the snapshot's issueCards (title, metric, basis, geography). Nothing here is
// hardcoded: if the snapshot carries no cards, the section says so.

// Small shared helpers for the section components (kept here so the
// sections need no extra files).
export function dataModeChipLabel(mode) {
  if (import.meta.env.DEV && mode === DATA_MODE.DEVELOPMENT_EXAMPLE) return 'Development example'
  if (import.meta.env.DEV && mode === DATA_MODE.SYNTHETIC) return 'Synthetic test data'
  return null
}

export function DataModeChip({ mode, className = '' }) {
  const label = dataModeChipLabel(mode)
  if (!label) return null
  const tone = mode === DATA_MODE.SYNTHETIC ? 'ssp-chip--synthetic' : 'ssp-chip--dev'
  return <span className={`ssp-chip ${tone} ${className}`.trim()}>{label}</span>
}

export function formatCount(value) {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : ''
}

function IssueIcon({ kind }) {
  if (kind === 'momentum') {
    return (
      <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
        <rect x="5" y="18" width="5" height="9" rx="1" />
        <rect x="13.5" y="13" width="5" height="14" rx="1" />
        <rect x="22" y="7" width="5" height="20" rx="1" />
      </svg>
    )
  }
  if (kind === 'pay') {
    return (
      <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
        <path d="M16 4v24M21 9.5c-1.2-1.6-3-2.5-5-2.5-2.8 0-5 1.6-5 4s2 3.4 5 4 5 1.8 5 4.3-2.2 4.2-5 4.2c-2.3 0-4.3-1-5.4-2.8" fill="none" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
      <path d="M7 27V8l9-4v23M16 27V12l9 3v12M4 27h24" fill="none" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M10 12h2M10 16h2M10 20h2M19 18h2M19 22h2" fill="none" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IssueCard({ card, mode }) {
  const locked = card.access === ACCESS.REQUIRES_FREE_ACCOUNT
  const kind = ['momentum', 'pay', 'volume'].includes(card.kind) ? card.kind : 'volume'
  // Direction is read from the metric's own sign; colour is never the only cue.
  const metric = typeof card.metric === 'string' ? card.metric : ''
  let direction = null
  if (kind === 'momentum' && /^\s*\+/.test(metric)) direction = 'heat'
  else if (kind === 'momentum' && /^\s*[-−]/.test(metric)) direction = 'cool'
  return (
    <li className={`ssp-card ssp-issue__card ssp-issue__card--${kind}`}>
      <div className="ssp-issue__top">
        <span className="ssp-issue__icon"><IssueIcon kind={kind} /></span>
        <div className="ssp-issue__chips">
          {card.geography && <span className="ssp-chip">{card.geography}</span>}
          <DataModeChip mode={mode} />
        </div>
      </div>
      <h3 className="ssp-issue__title">{card.title}</h3>
      {locked ? (
        <p className="ssp-issue__metric ssp-muted">Part of free access.</p>
      ) : (
        <p className={`ssp-issue__metric ssp-num${direction ? ` ssp-issue__metric--${direction}` : ''}`}>
          {direction && <span aria-hidden="true">{direction === 'heat' ? '▲ ' : '▼ '}</span>}
          {metric}
        </p>
      )}
      {card.basis && <p className="ssp-issue__basis">{card.basis}</p>}
    </li>
  )
}

// "This week's signals": four rotating cards (biggest mover, hot vs. cold,
// state spotlight, name that rate) from the snapshot's weeklyCards. Every
// figure and sentence comes from the weekly export; nothing is hardcoded.
function QuizCard({ card }) {
  const [picked, setPicked] = useState(null)
  const done = picked !== null
  return (
    <>
      <div className="ssp-weekly__quiz" role="group" aria-label="Pick a rate">
        {card.options.map((n) => {
          const state = !done ? '' : n === card.answer ? ' is-right' : n === picked ? ' is-wrong' : ''
          return (
            <button key={n} type="button" className={`ssp-weekly__opt${state}`} onClick={() => setPicked(n)} disabled={done}>
              ${n}/hr
            </button>
          )
        })}
      </div>
      <p className="ssp-weekly__sowhat" aria-live="polite">
        {done
          ? <>{picked === card.answer ? 'Right. ' : 'Not quite. '}Typical advertised rate: <strong>{card.answerText}</strong>.</>
          : 'Pick one to reveal the answer.'}
      </p>
    </>
  )
}

function WeeklyCard({ card }) {
  return (
    <li className={`ssp-card ssp-weekly__card ssp-weekly__card--${card.kind}`}>
      <span className="ssp-weekly__label">{card.label}</span>
      <h3 className="ssp-issue__title">{card.title}</h3>
      {card.kind === 'mover' && (
        <p className="ssp-weekly__move ssp-num">
          <span className="ssp-weekly__was">{card.before}</span>
          <span aria-hidden="true"> → </span>
          <span className="ssp-weekly__now">{card.after}</span>
          <span className={card.changePct >= 0 ? 'ssp-weekly__up' : 'ssp-weekly__down'}>
            {card.changePct >= 0 ? '▲ +' : '▼ '}{card.changePct}%
          </span>
        </p>
      )}
      {card.kind === 'hotCold' && (
        <div className="ssp-weekly__pair">
          <div className="ssp-weekly__tile ssp-weekly__tile--hot">
            <span>Heating up</span><strong>{card.hot.label}</strong><b className="ssp-num">▲ +{card.hot.pct}%</b>
          </div>
          <div className="ssp-weekly__tile ssp-weekly__tile--cold">
            <span>Cooling off</span><strong>{card.cold.label}</strong><b className="ssp-num">▼ {card.cold.pct}%</b>
          </div>
        </div>
      )}
      {card.kind === 'spotlight' && (
        <dl className="ssp-weekly__facts">
          {card.facts.map((f) => (
            <div key={f.label}><dt>{f.label}</dt><dd className="ssp-num">{f.value}</dd></div>
          ))}
        </dl>
      )}
      {card.kind === 'quiz' && <QuizCard card={card} />}
      {card.soWhat && <p className="ssp-weekly__sowhat">{card.soWhat}</p>}
      {card.basis && <p className="ssp-issue__basis">{card.basis}</p>}
    </li>
  )
}

export default function IssueStrip({ snapshot }) {
  const weekly = Array.isArray(snapshot?.weeklyCards) ? snapshot.weeklyCards : []
  if (weekly.length > 0) {
    return (
      <section className="ssp-section ssp-issue" aria-labelledby="ssp-issue-title">
        <div className="ssp-container">
          <div className="ssp-sechead">
            <div className="ssp-sechead__text">
              <h2 id="ssp-issue-title" className="ssp-h2">This week's signals.</h2>
              <p className="ssp-lede">
                What moved in staffing pay and demand{snapshot?.snapshot?.label ? ` · ${snapshot.snapshot.label}` : ''}.
              </p>
            </div>
          </div>
          <ul className="ssp-weekly__list">
            {weekly.map((card) => <WeeklyCard key={card.key} card={card} />)}
          </ul>
          <p className="ssp-weekly__cta">
            <a href="#get-report" className="ssp-link">Get your local report <span aria-hidden="true">→</span></a>
          </p>
        </div>
      </section>
    )
  }
  return <ClassicIssueStrip snapshot={snapshot} />
}

function ClassicIssueStrip({ snapshot }) {
  const { variant, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const cards = Array.isArray(snapshot?.issueCards) ? snapshot.issueCards : []
  const mode = snapshot?.dataMode

  return (
    <section className="ssp-section ssp-issue" aria-labelledby="ssp-issue-title">
      <div className="ssp-container">
        <div className="ssp-sechead">
          <div className="ssp-sechead__text">
            <h2 id="ssp-issue-title" className="ssp-h2">The issue in 30 seconds.</h2>
            <p className="ssp-lede">A quick look at observed staffing demand and advertised pay.</p>
          </div>
          {site ? (
            <span className="ssp-sechead__soon">Full market report coming soon</span>
          ) : (
            <Link
              to="/preview/market-report"
              className="ssp-link ssp-sechead__link"
              onClick={() => track(EVENTS.MARKET_REPORT_OPENED, { variant })}
            >
              Read the full market report <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>

        {cards.length > 0 ? (
          <ul className="ssp-grid-3 ssp-issue__list">
            {cards.map((card) => <IssueCard key={card.key} card={card} mode={mode} />)}
          </ul>
        ) : (
          <p className="ssp-card ssp-muted">No signals are available in this snapshot.</p>
        )}

        {snapshot?.snapshot?.label && (
          <p className="ssp-issue__scope ssp-muted">
            Snapshot: {snapshot.snapshot.label}. National signals unless a card names a place.
          </p>
        )}
      </div>
    </section>
  )
}
