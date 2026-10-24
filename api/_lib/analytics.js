// First-party, cookie-free product analytics (docs/repair/ANALYTICS_EVENTS.md).
//   POST /api/track            -> collect one event (204, always fast)
//   GET  /api/analytics/weekly -> Vercel Cron: email the weekly report, prune old rows
// Both are routed through api/account.js to stay under the Hobby function cap.
//
// Privacy: the server re-applies the client allowlist and rejects anything
// else. It never logs request bodies, IPs or user agents, sets no cookies and
// stores no visitor or session identifier.
import crypto from 'node:crypto'
import pg from 'pg'
import { sendEmail } from './subscribers.js'
import { ALLOWED_PROPS, allowedValue, routePath } from '../../shared/signal/analyticsRules.js'

// Must match src/preview/lib/track.js (a test enforces this). Legacy
// overclaiming names (report_printed etc.) are deliberately not accepted.
export const KNOWN_EVENTS = new Set([
  'page_view', 'pay_check_started', 'national_result_viewed', 'local_benchmark_requested',
  'local_coverage_available', 'local_coverage_unavailable', 'gate_shown',
  'signup_started', 'signup_failed', 'signup_completed', 'first_local_result_viewed',
  'preferences_saved', 'market_report_opened', 'monthly_issue_opened', 'return_visit',
  'report_create_clicked', 'report_gate_shown', 'sample_report_viewed', 'report_viewed',
  'report_print_requested', 'report_download_started', 'report_download_failed',
  'report_email_submitted', 'report_email_accepted', 'report_email_failed', 'contact_clicked',
  'smart_link_opened'
])
export { ALLOWED_PROPS }
export const MAX_BODY_BYTES = 2048
export const REPORT_TO = 'andy@thestaffingsignal.com'
export const RETENTION_MONTHS = 13

// Per-instance ingestion cap: bounded work per minute even under abuse.
// Best effort (each serverless instance counts separately).
export const MAX_EVENTS_PER_MINUTE = 300

// Returns a clean { event, props, path } or null. Strict: any unknown
// top-level key, unknown prop key, or unsafe value rejects the whole event.
export function validateEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  for (const k of Object.keys(body)) if (!['event', 'props', 'path'].includes(k)) return null
  const { event, props = {}, path = '/' } = body
  if (typeof event !== 'string' || !KNOWN_EVENTS.has(event)) return null
  if (!props || typeof props !== 'object' || Array.isArray(props)) return null
  const clean = {}
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED_PROPS.includes(k)) return null
    if (!allowedValue(k, v)) return null
    clean[k] = v
  }
  if (typeof path !== 'string' || routePath(path) !== path) return null
  return { event, props: clean, path }
}

export function parseBody(req) {
  const len = Number(req.headers?.['content-length'] || 0)
  if (len > MAX_BODY_BYTES) return null
  let raw = req.body
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8')
  if (typeof raw === 'string') {
    if (raw.length > MAX_BODY_BYTES) return null
    try { return JSON.parse(raw) } catch { return null }
  }
  if (raw && typeof raw === 'object') {
    if (JSON.stringify(raw).length > MAX_BODY_BYTES) return null
    return raw
  }
  return null
}

let pool = null
export function defaultDb() {
  if (!process.env.DATABASE_URL) return null
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 })
  return pool
}

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS analytics_events (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  path text NOT NULL DEFAULT '/'
);
CREATE INDEX IF NOT EXISTS analytics_events_ts_idx ON analytics_events (ts)`
const ready = new WeakSet()
export async function ensureTable(db) {
  if (ready.has(db)) return
  await db.query(CREATE_SQL)
  ready.add(db)
}

function end(res, status) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  res.end()
}

export function makeCollect({ getDb = defaultDb, now = () => Date.now(), limit = MAX_EVENTS_PER_MINUTE } = {}) {
  let windowStart = 0
  let count = 0
  let warnedNoDb = false
  return async function collect(req, res) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return end(res, 405) }
    const t = now()
    if (t - windowStart >= 60000) { windowStart = t; count = 0 }
    if (++count > limit) return end(res, 429)
    const event = validateEvent(parseBody(req))
    if (!event) return end(res, 400)
    // X-Analytics-Stored tells an operator whether the row was written
    // (a 204 alone can't prove storage). Contains no visitor data.
    const db = getDb()
    if (!db) {
      if (!warnedNoDb) { warnedNoDb = true; console.warn('analytics_db_not_configured') }
      res.setHeader('X-Analytics-Stored', '0')
      return end(res, 204)
    }
    try {
      await ensureTable(db)
      await db.query('INSERT INTO analytics_events (event, props, path) VALUES ($1, $2, $3)', [event.event, JSON.stringify(event.props), event.path])
      res.setHeader('X-Analytics-Stored', '1')
    } catch (e) {
      // Error code only: never the body, IP or user agent.
      console.error('analytics_insert_failed', e && e.code ? e.code : 'error')
      res.setHeader('X-Analytics-Stored', '0')
    }
    return end(res, 204)
  }
}

// ---- weekly report ----
export function cronAuthorized(req, env = process.env) {
  const secret = env.CRON_SECRET
  if (typeof secret !== 'string' || secret.length < 16) return false
  const a = Buffer.from(req.headers?.authorization || '')
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// rows: [{ event, period: 'current'|'prior', n }]
export function computeReport(rows) {
  const p = { current: {}, prior: {} }
  for (const r of rows || []) {
    const bucket = p[r.period]
    if (!bucket) continue
    bucket[r.event] = (bucket[r.event] || 0) + Number(r.n || 0)
  }
  const pick = (b) => {
    const g = (k) => b[k] || 0
    const avail = g('local_coverage_available')
    const unavail = g('local_coverage_unavailable')
    return {
      pageViews: g('page_view'),
      comparisonsStarted: g('pay_check_started'),
      coverageAvailable: avail,
      coverageUnavailable: unavail,
      coverageRate: avail + unavail ? avail / (avail + unavail) : null,
      gateShown: g('gate_shown') + g('report_gate_shown'),
      signupsCompleted: g('signup_completed'),
      reportsViewed: g('report_viewed'),
      downloadStarted: g('report_download_started'),
      printRequested: g('report_print_requested'),
      emailAccepted: g('report_email_accepted'),
      emailFailed: g('report_email_failed'),
      smartLinkOpens: g('smart_link_opened'),
      total: Object.values(b).reduce((s, n) => s + n, 0)
    }
  }
  return { current: pick(p.current), prior: pick(p.prior) }
}

export const pct = (num, den) => (den ? `${Math.round((num / den) * 100)}%` : 'n/a')

// rows: [{ source, campaign, market, n }] for smart_link_opened this week.
function smartLinkLines(rows) {
  const list = (rows || []).filter((r) => r && Number(r.n) > 0).slice(0, 15)
  if (!list.length) return []
  return ['  By source / campaign / market (market "-" = nationwide figure):',
    ...list.map((r) => `    ${r.source || '-'} / ${r.campaign || '-'} / ${r.market || '-'}: ${Number(r.n)}`)]
}

export function buildEmail(report, { start, end: endDate } = {}) {
  const c = report.current
  const pr = report.prior
  const day = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : '?')
  const subject = `Staffing Signal weekly analytics: ${day(start)} to ${day(endDate)}`
  let lines
  if (!c.total && !pr.total) {
    lines = [
      'No analytics events were recorded in the last 14 days, so there is nothing to report yet.',
      'If the site has had visitors, check that analytics is enabled and DATABASE_URL is set in Vercel.'
    ]
  } else {
    const row = (label, k) => `${label}: ${c[k]} (prior week ${pr[k]})`
    lines = [
      `Last 7 days vs the 7 days before.${c.total ? '' : ' No events at all this week.'}`,
      '',
      row('Page views', 'pageViews'),
      row('Comparisons started', 'comparisonsStarted'),
      `Local coverage: ${c.coverageAvailable} available, ${c.coverageUnavailable} unavailable, rate ${pct(c.coverageAvailable, c.coverageAvailable + c.coverageUnavailable)} (prior ${pct(pr.coverageAvailable, pr.coverageAvailable + pr.coverageUnavailable)})`,
      row('Signup gate shown', 'gateShown'),
      row('Signups completed', 'signupsCompleted'),
      row('Reports viewed', 'reportsViewed'),
      row('Report download started', 'downloadStarted'),
      row('Report print requested', 'printRequested'),
      `Report email: ${c.emailAccepted} accepted, ${c.emailFailed} failed (prior ${pr.emailAccepted} / ${pr.emailFailed})`,
      row('Outreach link opens', 'smartLinkOpens'),
      ...smartLinkLines(report.smartLinks),
      '',
      'Action ratios this week (event counts divided by event counts; NOT unique-person conversion rates, because there is no visitor ID):',
      `  Signups completed per signup gate shown: ${c.signupsCompleted} / ${c.gateShown} = ${pct(c.signupsCompleted, c.gateShown)}`,
      `  Local coverage available per comparison started: ${c.coverageAvailable} / ${c.comparisonsStarted} = ${pct(c.coverageAvailable, c.comparisonsStarted)}`,
      `  Downloads started per report viewed: ${c.downloadStarted} / ${c.reportsViewed} = ${pct(c.downloadStarted, c.reportsViewed)}`,
      `  Prints requested per report viewed: ${c.printRequested} / ${c.reportsViewed} = ${pct(c.printRequested, c.reportsViewed)}`,
      `  Emails accepted per report viewed: ${c.emailAccepted} / ${c.reportsViewed} = ${pct(c.emailAccepted, c.reportsViewed)}`,
      '  One visitor can repeat an action, so a ratio can exceed 100%.',
      '',
      'Page views count each page opened in the site; there is no visitor ID, so they are not unique visitors.',
      'Download started and print requested mean the browser was asked, not that a file was saved or printed. Email accepted means our server accepted it, not that it was delivered.'
    ]
  }
  const text = lines.join('\n')
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${esc(text)}</pre>`
  return { subject, text, html }
}

const REPORT_SQL = `SELECT event, CASE WHEN ts >= $1 THEN 'current' ELSE 'prior' END AS period, count(*)::int AS n
FROM analytics_events WHERE ts >= $2 AND ts < $3 GROUP BY 1, 2`
const SMART_LINK_SQL = `SELECT props->>'utmSource' AS source, props->>'utmCampaign' AS campaign, props->>'market' AS market, count(*)::int AS n
FROM analytics_events WHERE event = 'smart_link_opened' AND ts >= $1 AND ts < $2 GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 15`
const PRUNE_SQL = `DELETE FROM analytics_events WHERE ts < now() - interval '${RETENTION_MONTHS} months'`

export function makeWeekly({ getDb = defaultDb, fetchImpl = (...a) => fetch(...a), env = process.env, now = () => new Date() } = {}) {
  return async function weekly(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'application/json')
    const reply = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)) }
    if (!cronAuthorized(req, env)) return reply(401, { error: 'unauthorized' })
    if (!env.RESEND_API_KEY || !env.SIGNAL_FROM_EMAIL) return reply(503, { error: 'mail_not_configured' })
    const db = getDb()
    if (!db) return reply(503, { error: 'db_not_configured' })
    const endDate = now()
    const start = new Date(endDate.getTime() - 7 * 864e5)
    const priorStart = new Date(endDate.getTime() - 14 * 864e5)
    try {
      await ensureTable(db)
      const { rows } = await db.query(REPORT_SQL, [start, priorStart, endDate])
      const report = computeReport(rows)
      try {
        report.smartLinks = (await db.query(SMART_LINK_SQL, [start, endDate]))?.rows || []
      } catch {
        report.smartLinks = []
      }
      const mail = buildEmail(report, { start, end: endDate })
      await sendEmail({ from: env.SIGNAL_FROM_EMAIL, resendKey: env.RESEND_API_KEY }, fetchImpl, { to: REPORT_TO, ...mail })
      const pruned = await db.query(PRUNE_SQL)
      return reply(200, { ok: true, events: report.current.total, pruned: pruned?.rowCount || 0 })
    } catch (e) {
      console.error('analytics_weekly_failed', e && e.message ? String(e.message).slice(0, 40) : 'error')
      return reply(500, { error: 'weekly_failed' })
    }
  }
}

export const collect = makeCollect()
export const weekly = makeWeekly()
