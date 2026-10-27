// Daily site stats -> Airtable "Site Daily Stats" (one row per Eastern-time day).
//   GET /api/analytics/daily -> Vercel Cron (routed through api/account.js).
// Rewrites the last DAYS days each run, so a missed night heals itself.
// Upserts match on the text 'Day Key': Airtable does not merge on a date field.
// Stats rows carry only aggregate counts. A second step copies Valley smart-link
// opens (per ref id, which is already an Airtable id) onto Valley Pay Targets so
// Andy can follow up with people who opened their link; it never fails the stats.
import { cronAuthorized, defaultDb, ensureTable } from './analytics.js'

export const DAYS = 8
export const STATS_BASE = 'appFkwB2Aei2oblnz'
export const STATS_TABLE = 'tblXoPhpHKUESzcO9'
const TZ = 'America/New_York'
export const TARGETS_TABLE = 'tblj8uHoUS5gRKxsN' // Valley Pay Targets
export const LINK_CAMPAIGN = 'pay-targets'

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
    const fields = { 'Day Key': k, Date: k, 'Total Events': Object.values(ev).reduce((s, n) => s + n, 0), Updated: stamp }
    for (const [col, names] of Object.entries(COLUMNS)) fields[col] = names.reduce((s, e) => s + (ev[e] || 0), 0)
    return { fields }
  })
}

const DAILY_SQL = `SELECT to_char(ts AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, event, count(*)::int AS n
FROM analytics_events WHERE ts >= $1 GROUP BY 1, 2`

const OPENS_SQL = `SELECT props->>'ref' AS ref, count(*)::int AS n, min(ts) AS first, max(ts) AS last
FROM analytics_events WHERE event = 'smart_link_opened' AND props->>'utmCampaign' = $1 AND props->>'ref' IS NOT NULL GROUP BY 1`

// opens: [{ ref, n, first, last }], rows: Airtable records with Link Ref / Link Opens / Insurance Follow-up.
// Returns PATCH records for rows whose open count changed; 'To contact' only fills a blank follow-up.
export function buildOpenUpdates(opens, rows) {
  const byRef = new Map((opens || []).map((o) => [o.ref, o]))
  const out = []
  for (const r of rows || []) {
    const o = byRef.get(r.fields['Link Ref'])
    if (!o || Number(r.fields['Link Opens'] || 0) === o.n) continue
    const fields = { 'Link Opens': o.n, 'First Link Open': new Date(o.first).toISOString(), 'Last Link Open': new Date(o.last).toISOString() }
    if (!r.fields['Insurance Follow-up']) fields['Insurance Follow-up'] = 'To contact'
    out.push({ id: r.id, fields })
  }
  return out
}

const esc = (v) => String(v).replace(/[^A-Za-z0-9_-]/g, '')

async function syncLinkOpens(db, fetchImpl, key, env) {
  const { rows: opens } = await db.query(OPENS_SQL, [LINK_CAMPAIGN])
  if (!opens.length) return 0
  const url = `https://api.airtable.com/v0/${env.SIGNAL_STATS_BASE || STATS_BASE}/${env.SIGNAL_TARGETS_TABLE || TARGETS_TABLE}`
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const rows = []
  for (let i = 0; i < opens.length; i += 40) {
    const f = `OR(${opens.slice(i, i + 40).map((o) => `{Link Ref}='${esc(o.ref)}'`).join(',')})`
    let offset = ''
    do {
      const q = new URLSearchParams({ filterByFormula: f, pageSize: '100' })
      for (const n of ['Link Ref', 'Link Opens', 'Insurance Follow-up']) q.append('fields[]', n)
      if (offset) q.set('offset', offset)
      const r = await fetchImpl(`${url}?${q}`, { headers })
      if (!r.ok) throw new Error(`airtable ${r.status}`)
      const j = await r.json()
      rows.push(...(j.records || []))
      offset = j.offset || ''
    } while (offset)
  }
  const updates = buildOpenUpdates(opens, rows)
  for (let i = 0; i < updates.length; i += 10) {
    const r = await fetchImpl(url, { method: 'PATCH', headers, body: JSON.stringify({ records: updates.slice(i, i + 10), typecast: true }) })
    if (!r.ok) throw new Error(`airtable ${r.status}`)
  }
  return updates.length
}

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
          body: JSON.stringify({ performUpsert: { fieldsToMergeOn: ['Day Key'] }, records: records.slice(i, i + 10) })
        })
        if (!r.ok) throw new Error(`airtable ${r.status}`)
      }
      let linkOpens = 'failed'
      try { linkOpens = await syncLinkOpens(db, fetchImpl, key, env) } catch (e) {
        console.error('link_opens_sync_failed', e && e.message ? String(e.message).slice(0, 40) : 'error')
      }
      return reply(200, { ok: true, days: records.length, linkOpens })
    } catch (e) {
      console.error('analytics_daily_failed', e && e.message ? String(e.message).slice(0, 40) : 'error')
      return reply(500, { error: 'daily_failed' })
    }
  }
}

export const daily = makeDaily()
