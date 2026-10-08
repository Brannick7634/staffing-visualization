import { useCallback } from 'react'
import { DATA_MODE, REQUEST } from '../../../shared/signal/contract.js'
import AccessInvite from '../components/AccessInvite.jsx'
import Calculator from '../components/Calculator.jsx'
import CoverageStrip from '../components/CoverageStrip.jsx'
import Hero, { Freshness } from '../components/Hero.jsx'
import IssueStrip from '../components/IssueStrip.jsx'
import MarketPreview from '../components/MarketPreview.jsx'
import MonthlySignal from '../components/MonthlySignal.jsx'

// The monthly report stays hidden in production until VITE_SIGNAL_REPORT=1
// (first trustworthy comparison: October vs September, early November).
const REPORT_ON = import.meta.env.DEV || import.meta.env.VITE_SIGNAL_REPORT === '1'
import ResultCard from '../components/ResultCard.jsx'
import SamplePreview from '../components/SamplePreview.jsx'
import SectorModule from '../components/SectorModule.jsx'
import TrustStrip from '../components/TrustStrip.jsx'
import { FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import { simNotify } from '../api.js'

// Homepage composition. Variant A follows the approved image (corrected);
// Variant B (live) stacks the calculator, the sample-report preview and the
// Market Pay Insights, and moves the free-access invitation up.

function dataModeLabel(mode) {
  if (import.meta.env.DEV && mode === DATA_MODE.DEVELOPMENT_EXAMPLE) return 'Development example'
  if (import.meta.env.DEV && mode === DATA_MODE.SYNTHETIC) return 'Synthetic test data'
  return null
}

function SnapshotStatus({ state, onRetry }) {
  return (
    <section className="ssp-section">
      <div className="ssp-container">
        {state === REQUEST.ERROR ? (
          <div className="ssp-card ssp-status" role="alert">
            <p className="ssp-status__title">We couldn't load the market snapshot.</p>
            <p className="ssp-muted">No figures are shown instead of a guess. The client pay report above still works on its own.</p>
            <button type="button" className="ssp-btn ssp-btn--secondary" onClick={onRetry}>Retry</button>
          </div>
        ) : (
          <div className="ssp-card ssp-status" role="status">
            <p className="ssp-status__title">Loading the market snapshot…</p>
            <span className="ssp-skel ssp-skel--lg" />
            <span className="ssp-skel ssp-skel--md" />
          </div>
        )}
      </div>
    </section>
  )
}

export default function HomePage({ variant = 'a' }) {
  const {
    snapshot, snapshotState, reloadSnapshot, access, payCheck, isOutOfDate, retryPayCheck,
    requestFocus, requestFreeAccess, pickRole, signedUp, pendingReturn, runPayCheck, setSelection, createClientReport,
    site: siteMount
  } = usePreview()
  const site = FORCE_SITE || siteMount

  const checked = payCheck.selection
  const inviteContext = pendingReturn || (checked && !payCheck.isExample ? checked : null)

  const onCompareLocal = useCallback(() => requestFocus('state'), [requestFocus])
  // The report CTA under the insights (and the rare locked-local gate) build
  // the report from the comparison on screen, not from edited inputs.
  // Never from the first-load example (a rate the visitor did not enter).
  const onCreateReport = useCallback((options) => {
    if (!checked || payCheck.isExample || typeof createClientReport !== 'function') return
    createClientReport({ selection: checked, rateCents: payCheck.rateCents, intent: options?.intent })
  }, [checked, createClientReport, payCheck.rateCents, payCheck.isExample])
  const onEnterDetails = useCallback(() => requestFocus('role'), [requestFocus])
  const onSeeFallback = useCallback(() => {
    if (!checked) return
    const next = { ...checked, city: null }
    setSelection(next)
    runPayCheck({ selection: next, rateCents: payCheck.rateCents })
  }, [checked, setSelection, runPayCheck, payCheck.rateCents])
  const onNotify = useCallback(async () => {
    if (!checked) return
    await simNotify({ roleKey: checked.roleKey, state: checked.state, city: checked.city })
  }, [checked])
  const onMarketUnlock = useCallback(() => requestFreeAccess(inviteContext), [requestFreeAccess, inviteContext])

  const wide = variant === 'b'
  const result = (
    <ResultCard
      response={payCheck.response}
      rateCents={payCheck.rateCents}
      requestState={payCheck.requestState}
      isExample={payCheck.isExample}
      isOutOfDate={isOutOfDate}
      onCompareLocal={onCompareLocal}
      onCreateReport={payCheck.isExample ? undefined : onCreateReport}
      onEnterDetails={onEnterDetails}
      onSeeFallback={onSeeFallback}
      onNotify={site ? undefined : onNotify}
      onRetry={retryPayCheck}
      dataModeLabel={dataModeLabel(payCheck.response?.dataMode)}
      layout={wide ? 'wide' : 'stacked'}
      snapshot={snapshot}
    />
  )

  const issue = snapshot
    ? <div id="issue" className="ssp-anchor"><IssueStrip snapshot={snapshot} /></div>
    : <div id="issue" className="ssp-anchor"><SnapshotStatus state={snapshotState} onRetry={reloadSnapshot} /></div>
  const coverage = snapshot && (
    <div id="coverage" className="ssp-anchor"><CoverageStrip snapshot={snapshot} compact={wide} /></div>
  )
  const market = snapshot && (
    <div id="market" className="ssp-anchor"><MarketPreview snapshot={snapshot} access={access} onUnlock={onMarketUnlock} /></div>
  )
  const sectors = snapshot && (
    <div id="sectors" className="ssp-anchor"><SectorModule snapshot={snapshot} onPickRole={pickRole} /></div>
  )
  const invite = (
    <div id="free-access" className="ssp-anchor"><AccessInvite context={inviteContext} signedUp={signedUp} /></div>
  )
  const trust = snapshot && (
    <div id="trust" className="ssp-anchor"><TrustStrip snapshot={snapshot} /></div>
  )

  if (wide) {
    return (
      <>
        <section id="pay-check" className="ssp-hero ssp-hero--b" aria-label="Client pay report">
          <div className="ssp-container">
            <Hero compact />
            <div className="ssp-hero__stack">
              <Calculator layout="wide" />
              <SamplePreview />
              {result}
              <div className="ssp-hero__footnote">
                <p className="ssp-hero__support">
                  <span className="ssp-hero__check" aria-hidden="true">✓</span>
                  Staffing-firm data only. Updated weekly.
                </p>
                <Freshness />
              </div>
            </div>
          </div>
        </section>
        {REPORT_ON && <div id="monthly-signal" className="ssp-anchor"><MonthlySignal /></div>}
        {issue}
        {invite}
        {market}
        {sectors}
        {coverage}
        {trust}
      </>
    )
  }

  return (
    <>
      <section id="pay-check" className="ssp-hero" aria-label="Client pay report">
        <div className="ssp-container">
          <Hero />
          <div className="ssp-hero__tool">
            <Calculator layout="card" />
            {result}
          </div>
          <SamplePreview />
        </div>
      </section>
      {REPORT_ON && <div id="monthly-signal" className="ssp-anchor"><MonthlySignal /></div>}
      {issue}
      {coverage}
      {market}
      {sectors}
      {invite}
      {trust}
    </>
  )
}
