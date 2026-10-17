// Product measurement for the site (repair brief §3).
//
// One interface, `track(event, props)`, used by every caller. Delivery is ON
// in production builds, to our own first-party collector at /api/track
// (see docs/repair/ANALYTICS_EVENTS.md). Kill switch at build time:
//   VITE_ANALYTICS_ENABLED=false
// VITE_ANALYTICS_ENDPOINT may override the endpoint. Dev builds send nothing
// unless an endpoint is set; they log events to the console.
//
// Privacy rules enforced here, not left to callers:
// - Only allowlisted property keys survive, and only short machine values
//   (letters, digits, _ . -). A name, email, recipient, note, token or pay
//   rate can never pass, even if a caller passes one by mistake.
// - The page path is sent without query string or hash (tokens live there).
// - No cookies, no storage, no visitor or session identifier.
// - Never throws and never waits: sendBeacon / keepalive fetch, errors ignored.
// - Success events are sent at most once per page load per dedupe key, so
//   repeated clicks, retries and re-renders cannot inflate them.

import { ALLOWED_PROPS, allowedValue, routePath } from '../../../shared/signal/analyticsRules.js'

export const EVENTS = Object.freeze({
  PAGE_VIEW: 'page_view',
  PAY_CHECK_STARTED: 'pay_check_started',
  NATIONAL_RESULT_VIEWED: 'national_result_viewed',
  LOCAL_BENCHMARK_REQUESTED: 'local_benchmark_requested',
  LOCAL_COVERAGE_AVAILABLE: 'local_coverage_available',
  LOCAL_COVERAGE_UNAVAILABLE: 'local_coverage_unavailable',
  GATE_SHOWN: 'gate_shown',
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_FAILED: 'signup_failed',
  SIGNUP_COMPLETED: 'signup_completed',
  FIRST_LOCAL_RESULT_VIEWED: 'first_local_result_viewed',
  PREFERENCES_SAVED: 'preferences_saved',
  MARKET_REPORT_OPENED: 'market_report_opened',
  MONTHLY_ISSUE_OPENED: 'monthly_issue_opened',
  RETURN_VISIT: 'return_visit',
  REPORT_CREATE_CLICKED: 'report_create_clicked',
  REPORT_GATE_SHOWN: 'report_gate_shown',
  SAMPLE_REPORT_VIEWED: 'sample_report_viewed',
  REPORT_VIEWED: 'report_viewed',
  // A print request is not proof anything was printed.
  REPORT_PRINT_REQUESTED: 'report_print_requested',
  // The browser was handed the file; not proof the visitor saved it.
  REPORT_DOWNLOAD_STARTED: 'report_download_started',
  REPORT_DOWNLOAD_FAILED: 'report_download_failed',
  // Email: submitted -> accepted by our server (or failed). Never "delivered".
  REPORT_EMAIL_SUBMITTED: 'report_email_submitted',
  REPORT_EMAIL_ACCEPTED: 'report_email_accepted',
  REPORT_EMAIL_FAILED: 'report_email_failed',
  CONTACT_CLICKED: 'contact_clicked',
  // Legacy names kept for compatibility with existing tests. NOT emitted:
  // their wording overclaims (printed / downloaded / emailed).
  REPORT_PRINTED: 'report_printed',
  REPORT_DOWNLOADED: 'report_downloaded',
  REPORT_EMAILED: 'report_emailed'
})

// Sent at most once per page load per dedupe key.
export const ONCE_EVENTS = new Set([
  EVENTS.SIGNUP_COMPLETED,
  EVENTS.REPORT_VIEWED,
  EVENTS.SAMPLE_REPORT_VIEWED,
  EVENTS.FIRST_LOCAL_RESULT_VIEWED,
  EVENTS.REPORT_EMAIL_ACCEPTED,
  EVENTS.RETURN_VISIT
])

export { ALLOWED_PROPS }

const KNOWN = new Set(Object.values(EVENTS))

// Each allowed key accepts only known enum / taxonomy values
// (shared/signal/analyticsRules.js), so free text can't ride along.
export function sanitizeProps(props) {
  const safe = {}
  if (!props || typeof props !== 'object') return safe
  for (const key of ALLOWED_PROPS) {
    if (allowedValue(key, props[key])) safe[key] = props[key]
  }
  return safe
}

export function safePath(href) {
  try {
    const url = new URL(href, 'https://example.invalid')
    return routePath(url.pathname)
  } catch {
    return '/other'
  }
}

function readEnv() {
  try {
    return (import.meta && import.meta.env) || {}
  } catch {
    return {}
  }
}

export const DEFAULT_ENDPOINT = '/api/track'

const sent = new Set()
let sink = null

// Builds the payload exactly as it would be sent. Exported for tests.
export function buildPayload(event, props, href) {
  return { event, props: sanitizeProps(props), path: safePath(href || '/') }
}

function defaultSink(env) {
  if (String(env.VITE_ANALYTICS_ENABLED) === 'false') return null
  const endpoint = env.VITE_ANALYTICS_ENDPOINT || DEFAULT_ENDPOINT
  // Same-origin path, or an absolute https URL. Anything else is refused.
  if (typeof endpoint !== 'string' || !(/^https:\/\//.test(endpoint) || /^\/[A-Za-z0-9/_-]+$/.test(endpoint))) return null
  // Never send from dev or tests unless an endpoint is set explicitly.
  if (env.DEV && !env.VITE_ANALYTICS_ENDPOINT) return null
  if (typeof window === 'undefined') return null
  return (payload) => {
    const body = JSON.stringify(payload)
    // Stop only when the beacon was actually queued; a false return or a
    // throw falls through to one keepalive fetch. No retries beyond that.
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' &&
          navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' })) === true) return
    } catch {}
    if (typeof fetch === 'function') {
      try {
        const p = fetch(endpoint, { method: 'POST', body, keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'content-type': 'application/json' } })
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {}
    }
  }
}

export const _defaultSinkForTests = defaultSink

// Tests (and only tests) can install a sink; pass null to restore default.
export function _setSinkForTests(fn) {
  sink = fn
  sent.clear()
}

export function track(event, props = {}, options = {}) {
  try {
    if (typeof event !== 'string' || !KNOWN.has(event)) return
    if (ONCE_EVENTS.has(event)) {
      const key = `${event}|${options.dedupeKey || ''}`
      if (sent.has(key)) return
      sent.add(key)
    }
    const env = readEnv()
    const href = typeof window !== 'undefined' && window.location ? window.location.pathname : '/'
    const payload = buildPayload(event, props, href)
    if (env.DEV) console.debug('[ssp-track]', payload.event, payload.props)
    const deliver = sink || defaultSink(env)
    if (deliver) deliver(payload)
  } catch {
    // Analytics must never break the site.
  }
}
