// Daily site stats -> Airtable "Site Daily Stats" (one row per Eastern-time day).
//   GET /api/analytics/daily -> Vercel Cron (routed through api/account.js).
// Rewrites the last DAYS days each run, so a missed night heals itself.
// Writes only aggregate counts: no events, paths or identifiers leave Postgres.
import { cronAuthorized, defaultDb, ensureTable } from './analytics.js'

export const DAYS = 8
export const STATS_BASE = 'appFkwB2Aei2oblnz'
export const STATS_TABLE = 'tblXoPhpHKUESzcO9'
const TZ = 'America/New_York'

// Airtable field name -> analytics event(s) summed into it.
export const COLUMNS = {
  'Page Views': ['page_view'],
  'Pay Checks Started': ['pay_check_started'],
  'Sign-ups': ['signup_completed'],
  'Report Create Clicks': ['report_create_clicked'],
  'Reports Viewed': ['report_viewed'],
  'Reports Emailed': ['report_email_accepted'],
  'Report Downloads': ['report_download_started'],
  'Report Prints': ['report_print_requested']
}

export const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d) // YYYY-MM-DD

// rows: [{ day: 'YYYY-MM-DD', event, n }] -> Airtable records, one per day (zeros included).
export function buildDailyRecords(rows, now, days = DAYS, stamp = now.toISOString()) {
  const keys = []
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(now.getTime() - i * 864e5))
    if (!keys.includes(k)) keys.push(k)
  }
  const by = Object.fromEntries(keys.map((k) => [k, {}]))
  for (const r of rows || []) if (by[r.day]) by[r.day][r.event] = (by[r.day][r.event] || 0) + Number(r.n || 0)
  return keys.map((k) => {
    const ev = by[k]
    const fields = { Date: k, 'Total Events': Object.values(ev).reduce((s, n) => s + n, 0), Updated: stamp }
    for (const [col, names] of Object.entries(COLUMNS)) fields[col] = names.reduce((s, e) => s + (ev[e] || 0), 0)
    return { fields }
  })
}

const DAILY_SQL = `SELECT to_char(ts AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, event, count(*)::int AS n
FROM analytics_events WHERE ts >= $1 GROUP BY 1, 2`

export function makeDaily({ getDb = defaultDb, fetchImpl = (...a) => fetch(...a), env = process.env, now = () => new Date() } = {}) {
  return async function daily(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'application/json')
    const reply = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)) }
    if (!cronAuthorized(req, env)) return reply(401, { error: 'unauthorized' })
    const key = env.SIGNAL_AIRTABLE_API_KEY || env.AIRTABLE_API_KEY
    if (!key) return reply(503, { error: 'airtable_not_configured' })
    const db = getDb()
    if (!db) return reply(503, { error: 'db_not_configured' })
    const t = now()
    try {
      await ensureTable(db)
      const { rows } = await db.query(DAILY_SQL, [new Date(t.getTime() - (DAYS + 1) * 864e5)])
      const records = buildDailyRecords(rows, t)
      const url = `https://api.airtable.com/v0/${env.SIGNAL_STATS_BASE || STATS_BASE}/${env.SIGNAL_STATS_TABLE || STATS_TABLE}`
      for (let i = 0; i < records.length; i += 10) {
        const r = await fetchImpl(url, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ performUpsert: { fieldsToMergeOn: ['Date'] }, records: records.slice(i, i + 10) })
        })
        if (!r.ok) throw new Error(`airtable ${r.status}`)
      }
      return reply(200, { ok: true, days: records.length })
    } catch (e) {
      console.error('analytics_daily_failed', e && e.message ? String(e.message).slice(0, 40) : 'error')
      return reply(500, { error: 'daily_failed' })
    }
  }
}

export const daily = makeDaily()
