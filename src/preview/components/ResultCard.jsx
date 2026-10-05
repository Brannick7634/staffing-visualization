import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ACCESS, COVERAGE, FRESHNESS, REQUEST } from '../../../shared/signal/contract.js'
import { formatCents } from '../../../shared/signal/money.js'
import { classifyRate, verdictCopy, VERDICT } from '../../../shared/signal/payBand.js'
import { roleByKey } from '../../../shared/signal/taxonomy.js'
import LocalGate from './LocalGate.jsx'
import PayBand from './PayBand.jsx'
import { usePreview } from '../PreviewContext.jsx'

// Renders every coverage/access state of a pay response (spec §2). Figures
// come only from the response; the verdict is computed here, client-side, from
// the in-memory rate. Nothing is guessed when a benchmark is missing.

function hasFigures(part) {
  return Boolean(part) &&
    part.coverage === COVERAGE.PUBLISHABLE &&
    part.access !== ACCESS.REQUIRES_FREE_ACCOUNT &&
    Number.isSafeInteger(part.p25Cents) &&
    Number.isSafeInteger(part.p75Cents)
}

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

// The typical figure is always labelled "Typical advertised rate": its
// aggregation method is not verified, so it is never called anything else.
const TYPICAL_LABEL = 'Typical advertised rate'

function roleLabelFor(response) {
  return response?.request?.roleLabel ||
    response?.result?.roleLabel ||
    response?.national?.roleLabel ||
    roleByKey(response?.request?.roleKey)?.label ||
    'Selected job'
}

function formatDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value || null
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

// Snapshot metadata may arrive on the response, or separately as the full
// snapshot response ({ snapshot: {...} }) or just its metadata object.
function staleInfo(response, snapshot) {
  const candidates = [response?.snapshot, snapshot?.snapshot, snapshot].filter((s) => s && typeof s === 'object')
  const meta = candidates.find((s) => s.freshness) || null
  const freshness = response?.freshness || meta?.freshness || null
  if (freshness !== FRESHNESS.STALE) return null
  return { date: formatDay(meta?.exactDate || meta?.lastSuccessfulRefresh) || meta?.label || null }
}

function Comparison({ benchmark, roleLabel, rateCents, sublabel, outdated }) {
  const geographyLabel = geoLabel(benchmark)
  const nationwide = benchmark.geography?.level === 'nationwide' || geographyLabel === 'Nationwide'
  const verdict = classifyRate(rateCents, benchmark.p25Cents, benchmark.p75Cents)
  const copy = verdict
    ? verdictCopy(verdict, { rateCents, p25Cents: benchmark.p25Cents, p75Cents: benchmark.p75Cents, geographyLabel })
    : null
  const hasTypical = Number.isSafeInteger(benchmark.typicalCents)
  const scopeWord = nationwide ? 'National' : geographyLabel

  return (
    <div className={`ssp-compare${verdict ? ` ssp-compare--${verdict}` : ''}${outdated ? ' is-outdated' : ''}`}>
      {sublabel && <p className="ssp-compare__sublabel">{sublabel}</p>}
      <p className="ssp-compare__role">{roleLabel}</p>
      <h3 className="ssp-compare__verdict">
        {copy ? copy.headline : 'Advertised-pay band'}
      </h3>
      {Number.isSafeInteger(rateCents) && (
        <p className="ssp-compare__rate">
          Your rate: <strong className="ssp-num">{formatCents(rateCents)}/hour</strong>.
        </p>
      )}
      <PayBand
        rateCents={Number.isSafeInteger(rateCents) ? rateCents : null}
        p25Cents={benchmark.p25Cents}
        typicalCents={hasTypical ? benchmark.typicalCents : null}
        p75Cents={benchmark.p75Cents}
        geographyLabel={geographyLabel}
      />
      <div className="ssp-compare__facts">
        <p>
          Middle half of advertised rates:{' '}
          <strong className="ssp-num">{formatCents(benchmark.p25Cents)}–{formatCents(benchmark.p75Cents)}/hour</strong>.
        </p>
        {hasTypical && (
          <p>
            {TYPICAL_LABEL}: <strong className="ssp-num">{formatCents(benchmark.typicalCents)}/hour</strong>.
          </p>
        )}
      </div>
      {copy && (
        <p className={`ssp-compare__detail${verdict === VERDICT.BELOW ? ' ssp-caution' : ''}`}>
          {verdict === VERDICT.BELOW && <span className="ssp-compare__detail-icon" aria-hidden="true">!</span>}
          <span>{copy.detail}</span>
        </p>
      )}
      <p className="ssp-compare__caveat">
        {scopeWord} comparison only. Advertised rates do not predict whether an order will fill.
      </p>
    </div>
  )
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

function announce({ requestState, response, rateCents, isExample }) {
  if (requestState === REQUEST.LOADING) return 'Checking…'
  if (requestState === REQUEST.ERROR) return 'We couldn\'t load this benchmark. No figure is shown instead of a guess.'
  if (requestState !== REQUEST.READY || !response || isExample) return ''
  const result = response.result
  const shown = hasFigures(result) ? result : (hasFigures(response.fallback) ? response.fallback : (hasFigures(response.national) ? response.national : null))
  const parts = [`${geoLabel(result)} result for ${roleLabelFor(response)}.`]
  if (isLocked(result)) parts.push('A local benchmark is available with free access.')
  if (shown) {
    const verdict = classifyRate(rateCents, shown.p25Cents, shown.p75Cents)
    const copy = verdict ? verdictCopy(verdict, { rateCents, p25Cents: shown.p25Cents, p75Cents: shown.p75Cents, geographyLabel: geoLabel(shown) }) : null
    if (shown !== result) parts.push(`Showing the ${geoLabel(shown)} comparison.`)
    if (copy) parts.push(copy.headline)
  } else {
    parts.push('No benchmark figure is available for this selection.')
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
  dataModeLabel = null,
  layout = 'stacked',
  renderSignup = null,
  snapshot = null
}) {
  const { base } = usePreview()
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
  const scope = ready ? geoLabel(result) : (response?.result ? geoLabel(response.result) : 'Nationwide')
  const roleLabel = roleLabelFor(response)
  const national = hasFigures(response?.national) ? response.national : null
  const requestedLocal = Boolean(response?.request?.state) || (result && result.geography?.level !== 'nationwide')
  const stale = ready ? staleInfo(response, snapshot) : null
  const outdated = Boolean(ready && isOutOfDate)

  // An out-of-date answer must not be read or used as if it matched the new
  // inputs: it is dimmed and made inert until "Check my rate" is pressed.
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
        <p className="ssp-muted">Choose a job, enter your hourly pay and press <strong>Check my rate</strong>. Your rate stays in this browser.</p>
      </div>
    )
  } else if (hasFigures(result)) {
    body = <Comparison benchmark={result} roleLabel={roleLabel} rateCents={rateCents} outdated={outdated} />
  } else {
    const place = placeName(result)
    const parts = []

    if (isLocked(result)) {
      parts.push(
        <LocalGate
          key="gate"
          rateCents={rateCents}
          placeName={place}
          onUnlock={onUnlock}
          signup={renderSignup ? renderSignup() : null}
        />
      )
    } else if (result.coverage === COVERAGE.INSUFFICIENT_SAMPLE) {
      const fb = response.fallback
      if (fb && fb.coverage === COVERAGE.PUBLISHABLE) {
        const fbPlace = placeName(fb)
        parts.push(
          <Notice key="insufficient">
            <p>We don't have enough comparable {place} pay data to publish this benchmark. {/^[aeiou]/i.test(fbPlace) ? 'An' : 'A'} {fbPlace} benchmark is available.</p>
            {!hasFigures(fb) && (
              <button type="button" className="ssp-btn ssp-btn--primary ssp-btn--sm" onClick={() => onSeeFallback && onSeeFallback()}>
                See the {fbPlace} benchmark
              </button>
            )}
          </Notice>
        )
        if (hasFigures(fb)) {
          parts.push(
            <Comparison key="fallback" benchmark={fb} roleLabel={roleLabel} rateCents={rateCents} outdated={outdated} sublabel={`${geoLabel(fb)} benchmark`} />
          )
        }
      } else {
        parts.push(
          <Notice key="insufficient">
            <p>We don't have enough comparable {place} pay data to publish this benchmark.{national && result.geography?.level !== 'nationwide' ? ' The nationwide comparison is shown instead.' : ''}</p>
          </Notice>
        )
      }
    } else if (result.coverage === COVERAGE.NOT_YET_AVAILABLE) {
      const nationwideMissing = result.geography?.level === 'nationwide'
      parts.push(
        <Notice key="nya">
          <p>
            {nationwideMissing
              ? `No verified nationwide benchmark for ${roleLabel} is available in our data yet.`
              : `No verified ${place} benchmark is available in our data yet.${national ? ' The nationwide comparison is shown instead.' : ''}`}
          </p>
          {typeof onNotify === 'function' && notifyBlock}
        </Notice>
      )
    } else if (result.coverage === COVERAGE.UNSUPPORTED) {
      parts.push(
        <Notice key="unsupported" tone="warn">
          <p>{result.message || 'This comparison is not supported for an hourly pay input.'}</p>
        </Notice>
      )
    } else {
      parts.push(
        <Notice key="other">
          <p>{result.message || 'No benchmark figure is available for this selection.'}</p>
        </Notice>
      )
    }

    const showNational = national && !hasFigures(response.fallback) && result.geography?.level !== 'nationwide'
    if (showNational) {
      parts.push(
        <Comparison
          key="national"
          benchmark={national}
          roleLabel={roleLabel}
          rateCents={rateCents}
          outdated={outdated}
          sublabel={isLocked(result) ? 'Meanwhile, nationwide' : 'Nationwide comparison'}
        />
      )
    }
    body = <div className="ssp-result__stack">{parts}</div>
  }

  const message = announce({ requestState, response, rateCents, isExample })
  const showFooter = ready || requestState === REQUEST.LOADING

  return (
    <section
      className={`ssp-card ssp-result ssp-result--${layout}${outdated ? ' has-outdated' : ''}`}
      aria-labelledby={headingId}
      aria-busy={requestState === REQUEST.LOADING ? 'true' : undefined}
    >
      <div className="ssp-result__top">
        <h2 id={headingId} className="ssp-result__scope">
          {ready ? `${scope} result` : 'Your result'}
        </h2>
        <div className="ssp-result__chips">
          {ready && isExample && <span className="ssp-chip ssp-chip--example">National example</span>}
          {ready && dataModeLabel && (
            <span className={`ssp-chip ${/synthetic/i.test(dataModeLabel) ? 'ssp-chip--synthetic' : 'ssp-chip--dev'}`}>{dataModeLabel}</span>
          )}
        </div>
      </div>

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
              <span aria-hidden="true">↻</span> Out of date — press Check my rate
            </p>
          </div>
        )}
      </div>

      {showFooter && (
        <div className="ssp-result__footer">
          <Link to={`${base}/methodology`} className="ssp-link">See how we count <span aria-hidden="true">→</span></Link>
          {ready && (
            <button type="button" className="ssp-btn ssp-btn--secondary ssp-btn--sm" onClick={() => onCompareLocal && onCompareLocal()}>
              {requestedLocal ? 'Try another market' : 'Compare in my market'}
            </button>
          )}
        </div>
      )}

      <div className="ssp-visually-hidden" aria-live="polite" aria-atomic="true">{message}</div>
    </section>
  )
}
