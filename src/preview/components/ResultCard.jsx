import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildClientReportModel, hasFigures } from '../../../shared/signal/clientReport.js'
import { ACCESS, COVERAGE, FRESHNESS, REQUEST } from '../../../shared/signal/contract.js'
import { roleByKey } from '../../../shared/signal/taxonomy.js'
import LocalGate from './LocalGate.jsx'
import MarketPayInsights, { MarketFiguresOnly } from './insights/MarketPayInsights.jsx'
import ReportCta from './insights/ReportCta.jsx'
import { firmsPhrase, formatIsoDay, gapSentence } from './insights/format.js'
import { usePreview } from '../PreviewContext.jsx'

// Renders every coverage/access state of a pay response. When any scope has
// figures, the "Market Pay Insights" come from buildClientReportModel (the
// same model as the Client Pay Market Report), computed here, client-side,
// from the in-memory rate. Nothing is guessed when a benchmark is missing.

function isLocked(part) {
  return Boolean(part) && part.coverage === COVERAGE.PUBLISHABLE && part.access === ACCESS.REQUIRES_FREE_ACCOUNT
}

function geoLabel(part, fallback = 'Nationwide') {
  return part?.geography?.label || fallback
}

function placeName(part) {
  const label = geoLabel(part)
  if (part?.geography?.level === 'city') return label.split(',')[0].trim()
  return label
}

function roleLabelFor(response) {
  return response?.request?.roleLabel ||
    response?.result?.roleLabel ||
    response?.national?.roleLabel ||
    roleByKey(response?.request?.roleKey)?.label ||
    'Selected job'
}

function formatDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value || null
  return formatIsoDay(value) || value
}

// Snapshot metadata may arrive on the response, or separately as the full
// snapshot response ({ snapshot: {...} }) or just its metadata object.
function snapshotMeta(response, snapshot) {
  const candidates = [response?.snapshot, snapshot?.snapshot, snapshot].filter((s) => s && typeof s === 'object')
  return candidates.find((s) => s.freshness || s.exactDate) || null
}

function staleInfo(response, snapshot) {
  const meta = snapshotMeta(response, snapshot)
  const freshness = response?.freshness || meta?.freshness || null
  if (freshness !== FRESHNESS.STALE) return null
  return { date: formatDay(meta?.exactDate || meta?.lastSuccessfulRefresh) || meta?.label || null }
}

function dataDay(response, snapshot) {
  const fromTrend = response?.trend?.snapshotDate
  if (typeof fromTrend === 'string' && fromTrend) return fromTrend.slice(0, 10)
  const exact = snapshotMeta(response, snapshot)?.exactDate
  return typeof exact === 'string' && exact ? exact.slice(0, 10) : null
}

// 'Data updated October 6, 2026 · from 204 staffing firms · advertised pay'
function metaLine(model) {
  const day = formatIsoDay(model.snapshotDate)
  const text = [day && `Data updated ${day}`, firmsPhrase(model.figures.firmCount), 'advertised pay'].filter(Boolean).join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function Notice({ children, tone = 'info' }) {
  return (
    <div className={`ssp-notice ssp-notice--${tone}`}>
      <span className="ssp-notice__icon" aria-hidden="true">{tone === 'warn' ? '!' : 'i'}</span>
      <div className="ssp-notice__text">{children}</div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="ssp-result__loading">
      <span className="ssp-skel ssp-skel--sm" />
      <span className="ssp-skel ssp-skel--lg" />
      <span className="ssp-skel ssp-skel--md" />
      <span className="ssp-skel ssp-skel--band" />
      <span className="ssp-skel ssp-skel--md" />
      <span className="ssp-skel ssp-skel--sm" />
      <p className="ssp-result__checking">Checking…</p>
    </div>
  )
}

function announce({ requestState, response, isExample, model }) {
  if (requestState === REQUEST.LOADING) return 'Checking…'
  if (requestState === REQUEST.ERROR) return 'We couldn\'t load this benchmark. No figure is shown instead of a guess.'
  if (requestState !== REQUEST.READY || !response || isExample) return ''
  const result = response.result
  const parts = []
  if (isLocked(result)) parts.push('A local benchmark is available with a free account.')
  if (model) {
    parts.push(`Market pay insights for ${model.roleLabel}, ${model.scope.label}.`)
    if (model.fallbackNote && !isLocked(result)) parts.push(model.fallbackNote)
    parts.push(`${model.competitiveness.label}.`, gapSentence(model.gap))
  } else {
    parts.push(`${geoLabel(result)} result for ${roleLabelFor(response)}. No benchmark figure is available for this selection.`)
  }
  return parts.join(' ')
}

export default function ResultCard({
  response,
  rateCents,
  requestState,
  isExample = false,
  isOutOfDate = false,
  onCompareLocal,
  onUnlock,
  onSeeFallback,
  onNotify,
  onRetry,
  onCreateReport,
  onEnterDetails,
  dataModeLabel = null,
  layout = 'stacked',
  snapshot = null
}) {
  const { base, access } = usePreview()
  const [notify, setNotify] = useState('idle')
  const headingId = useId()
  const bodyRef = useRef(null)

  useEffect(() => {
    setNotify('idle')
  }, [response])

  async function handleNotify() {
    if (notify !== 'idle') return
    setNotify('sending')
    try {
      if (typeof onNotify === 'function') await onNotify()
      setNotify('done')
    } catch {
      setNotify('error')
    }
  }

  const result = response?.result || null
  const ready = requestState === REQUEST.READY && result
  const roleLabel = roleLabelFor(response)
  const requestedLocal = Boolean(response?.request?.state) || (result && result.geography?.level !== 'nationwide')
  const stale = ready ? staleInfo(response, snapshot) : null
  const outdated = Boolean(ready && isOutOfDate)
  const day = ready ? dataDay(response, snapshot) : null
  const model = useMemo(
    () => (ready ? buildClientReportModel({ payResponse: response, rateCents, snapshotDate: day }) : null),
    [ready, response, rateCents, day]
  )

  // An out-of-date answer must not be read or used as if it matched the new
  // inputs: it is dimmed and made inert until "Create Client Pay Report" is pressed.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (outdated) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [outdated, response, requestState])

  const notifyBlock = (
    <div className="ssp-notify">
      {notify === 'done' ? (
        <p className="ssp-notify__done" role="status">{import.meta.env.DEV ? 'Noted (simulated) — no email will be sent from this preview.' : 'Noted.'}</p>
      ) : (
        <button type="button" className="ssp-btn ssp-btn--secondary ssp-btn--sm" onClick={handleNotify} disabled={notify === 'sending'}>
          Tell me when this benchmark becomes available
        </button>
      )}
      {notify === 'error' && <p className="ssp-field-error" role="alert">That didn't go through. Nothing was saved; please try again.</p>}
    </div>
  )

  let body = null
  if (requestState === REQUEST.LOADING) {
    body = <Skeleton />
  } else if (requestState === REQUEST.ERROR) {
    body = (
      <div className="ssp-result__error">
        <Notice tone="warn">
          <p><strong>We couldn't load this benchmark. No figure is shown instead of a guess.</strong></p>
        </Notice>
        <button type="button" className="ssp-btn ssp-btn--secondary" onClick={() => onRetry && onRetry()}>Retry</button>
      </div>
    )
  } else if (!ready) {
    body = (
      <div className="ssp-result__idle">
        <p className="ssp-muted">
          Choose a job title and location, enter your client’s hourly pay rate and press <strong>Create Client Pay Report</strong>. The rate you enter stays in this browser.
        </p>
      </div>
    )
  } else {
    const place = placeName(result)
    const parts = []
    let note
    let before = null

    if (isLocked(result)) {
      parts.push(<LocalGate key="gate" rateCents={rateCents} placeName={place} onUnlock={onUnlock || onCreateReport} />)
      if (model) note = `Meanwhile, ${model.scope.level === 'nationwide' ? 'nationwide' : model.scope.label} figures are shown.`
    } else if (result.coverage === COVERAGE.INSUFFICIENT_SAMPLE) {
      const fb = response.fallback
      if (fb && fb.coverage === COVERAGE.PUBLISHABLE && !hasFigures(fb)) {
        const fbPlace = placeName(fb)
        parts.push(
          <Notice key="insufficient">
            <p>We don't have enough comparable {place} pay data to publish this benchmark. {/^[aeiou]/i.test(fbPlace) ? 'An' : 'A'} {fbPlace} benchmark is available.</p>
            <button type="button" className="ssp-btn ssp-btn--primary ssp-btn--sm" onClick={() => onSeeFallback && onSeeFallback()}>
              See the {fbPlace} benchmark
            </button>
          </Notice>
        )
      } else if (!model) {
        parts.push(
          <Notice key="insufficient">
            <p>We don't have enough comparable {place} pay data to publish this benchmark.</p>
          </Notice>
        )
      }
    } else if (result.coverage === COVERAGE.NOT_YET_AVAILABLE) {
      const nationwideMissing = result.geography?.level === 'nationwide'
      const notifier = typeof onNotify === 'function' ? notifyBlock : null
      if (model) {
        before = notifier
      } else {
        parts.push(
          <Notice key="nya">
            <p>
              {nationwideMissing
                ? `No verified nationwide benchmark for ${roleLabel} is available in our data yet.`
                : `No verified ${place} benchmark is available in our data yet.`}
            </p>
            {notifier}
          </Notice>
        )
      }
    } else if (result.coverage === COVERAGE.UNSUPPORTED) {
      parts.push(
        <Notice key="unsupported" tone="warn">
          <p>{result.message || 'This comparison is not supported for an hourly pay input.'}</p>
        </Notice>
      )
      note = null
    } else if (!hasFigures(result) && !model) {
      parts.push(
        <Notice key="other">
          <p>{result.message || 'No benchmark figure is available for this selection.'}</p>
        </Notice>
      )
    }

    if (model) {
      // The first-load example uses a rate nobody entered: no report from it.
      const cta = isExample
        ? <ReportCta example onEnterDetails={onEnterDetails} />
        : typeof onCreateReport === 'function'
          ? <ReportCta signedIn={access === ACCESS.AUTHORIZED} reportHref={`${base}/client-report`} onCreateReport={onCreateReport} />
          : null
      parts.push(<MarketPayInsights key="insights" model={model} note={note} before={before} after={cta} />)
    } else {
      const figures = [result, response.fallback, response.national].find(hasFigures)
      if (figures) {
        parts.push(<MarketFiguresOnly key="figures" figures={figures} placeLabel={geoLabel(figures)} />)
      } else if (parts.length === 0) {
        parts.push(
          <Notice key="none">
            <p>No benchmark figure is available for this selection.</p>
          </Notice>
        )
      }
    }
    body = <div className="ssp-result__stack">{parts}</div>
  }

  const message = announce({ requestState, response, isExample, model })
  const showFooter = ready || requestState === REQUEST.LOADING
  const subject = ready ? (model ? `${model.roleLabel} · ${model.scope.label}` : `${roleLabel} · ${geoLabel(result)}`) : null

  return (
    <section
      className={`ssp-card ssp-result ssp-result--${layout}${outdated ? ' has-outdated' : ''}`}
      aria-labelledby={headingId}
      aria-busy={requestState === REQUEST.LOADING ? 'true' : undefined}
    >
      <div className="ssp-result__top">
        <div className="ssp-result__heading">
          <h2 id={headingId} className="ssp-result__title">Market Pay Insights</h2>
          {subject && <p className="ssp-result__subject">{subject}</p>}
        </div>
        <div className="ssp-result__chips">
          {ready && isExample && <span className="ssp-chip ssp-chip--example">Example</span>}
          {ready && dataModeLabel && (
            <span className={`ssp-chip ${/synthetic/i.test(dataModeLabel) ? 'ssp-chip--synthetic' : 'ssp-chip--dev'}`}>{dataModeLabel}</span>
          )}
        </div>
      </div>
      {ready && model && <p className="ssp-result__meta">{metaLine(model)}</p>}

      {stale && (
        <div className="ssp-result__stale ssp-caution" role="note">
          <strong>Stale data.</strong> These figures are from {stale.date || 'an earlier snapshot'}; the latest weekly refresh has not completed. No fresh change is claimed.
        </div>
      )}

      <div className="ssp-result__main">
        <div className="ssp-result__body" ref={bodyRef}>{body}</div>
        {outdated && (
          <div className="ssp-result__overlay">
            <p className="ssp-result__overlay-msg" role="status">
              <span aria-hidden="true">↻</span> Out of date — press Create Client Pay Report
            </p>
          </div>
        )}
      </div>

      {showFooter && (
        <div className="ssp-result__footer">
          <Link to={`${base}/methodology`} className="ssp-link">See how we count <span aria-hidden="true">→</span></Link>
          {ready && (
            <button type="button" className="ssp-btn ssp-btn--secondary ssp-btn--sm" onClick={() => onCompareLocal && onCompareLocal()}>
              {requestedLocal ? 'Try another market' : 'Compare in your client’s market'}
            </button>
          )}
        </div>
      )}

      <div className="ssp-visually-hidden" aria-live="polite" aria-atomic="true">{message}</div>
    </section>
  )
}
