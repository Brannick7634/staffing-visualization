// GET /api/signal/report?month=YYYY-MM[&state=TX&city=TX:houston]
// Monthly report (latest when month is omitted) plus the archive month list.
//   public     -> national section only.
//   signed in  -> also every state/city section, and `local`: the reader's own
//                 city/state section first (from their saved preferences, or
//                 the state/city query), with an honest fallback note when
//                 their local comparison was withheld.
// Report files ship in the function bundle (vercel.json includeFiles).
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { sendJson } from '../signal/handlers.js'
import { sessionAccess } from '../signal/sessionAccess.js'
import { ACCESS } from '../../../shared/signal/contract.js'
import { MONTH, REPORT_FORMAT, localFor } from '../signal/report.js'
import { stateByCode } from '../../../shared/signal/geography.js'
import { verifySession, sessionMatchesHash } from '../signalSession.js'
import { loadConfig, findByEmail, F, cityKeyFromStored } from '../subscribers.js'

export const DEFAULT_REPORT_DIR = fileURLToPath(new URL('../signal/data/report/', import.meta.url))
const CITY = /^[A-Z]{2}:[a-z0-9-]{1,60}$/

export async function listMonths(dir = DEFAULT_REPORT_DIR) {
  const files = await readdir(dir).catch(() => [])
  return files.filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 7)).filter((m) => MONTH.test(m)).sort().reverse()
}

// Subscriber's saved area: first 2-letter line of States + City text
// ('Houston, TX', 'Katy, TX' or an older bare 'Houston').
export function areaFromRecord(fields) {
  const lines = String(fields?.[F.states] || '').split('\n').map((s) => s.trim())
  const state = lines.find((s) => /^[A-Z]{2}$/.test(s) && stateByCode(s)) || null
  const cityText = typeof fields?.[F.city] === 'string' ? fields[F.city] : ''
  let cityKey = state && cityText ? cityKeyFromStored(state, cityText) : null
  if (!cityKey && state) cityKey = lines.find((s) => CITY.test(s) && s.startsWith(`${state}:`)) || null
  return { state, cityKey }
}

async function defaultLoadArea(req, env, fetchImpl) {
  const session = verifySession(req, { env })
  if (!session) return null
  const conf = loadConfig(env)
  if (!conf.ok) return null
  const rec = await findByEmail(conf.cfg, fetchImpl, session.email)
  // A session from before a password reset does not get the reader's area.
  return rec && sessionMatchesHash(session, rec.fields?.[F.passwordHash], conf.cfg.secret) ? areaFromRecord(rec.fields) : null
}

export function createReportHandler({
  dir = DEFAULT_REPORT_DIR,
  resolveAccess = sessionAccess,
  loadArea = null,
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const areaLoader = loadArea || ((req) => defaultLoadArea(req, env, fetchImpl))
  return async function reportHandler(req, res) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Use GET.' } })
    }
    const q = req.query || {}
    const months = await listMonths(dir)
    const month = typeof q.month === 'string' && q.month ? q.month : months[0]
    if (!month || !MONTH.test(month)) {
      return sendJson(res, months.length ? 400 : 404, { error: { code: months.length ? 'invalid_month' : 'no_reports', message: months.length ? 'Use month=YYYY-MM.' : 'No monthly report yet.' }, months })
    }
    if (!months.includes(month)) return sendJson(res, 404, { error: { code: 'report_not_found', message: 'No report for that month.' }, months })
    let report
    try {
      report = JSON.parse(await readFile(path.join(dir, `${month}.json`), 'utf8'))
      if (report.format !== REPORT_FORMAT || report.month !== month) throw new Error('bad_report')
    } catch {
      console.error('[signal] report load failed')
      return sendJson(res, 500, { error: { code: 'internal_error', message: 'Something went wrong loading the report.' } })
    }
    let access = ACCESS.PUBLIC
    try { access = (resolveAccess(req) || {}).access || ACCESS.PUBLIC } catch { access = ACCESS.PUBLIC }
    const base = {
      month: report.month, previousMonth: report.previousMonth, label: report.label, generatedAt: report.generatedAt,
      notes: report.notes, thresholds: report.thresholds, national: report.national, months, access
    }
    if (access !== ACCESS.AUTHORIZED) {
      return sendJson(res, 200, { ...base, local: null, localLocked: true })
    }
    // Area: explicit query wins (page selector), else saved preferences.
    let area = null
    const qs = typeof q.state === 'string' ? q.state.toUpperCase() : ''
    if (qs && stateByCode(qs)) {
      const qc = typeof q.city === 'string' && CITY.test(q.city) && q.city.startsWith(`${qs}:`) ? q.city : null
      area = { state: qs, cityKey: qc, source: 'query' }
    } else {
      try { area = await areaLoader(req) } catch { area = null }
      if (area) area = { ...area, source: 'preferences' }
    }
    const local = localFor(report, area || {})
    return sendJson(res, 200, {
      ...base,
      states: report.states,
      cities: report.cities,
      area: area ? { state: area.state, cityKey: area.cityKey, source: area.source } : null,
      local: { level: local.level, note: local.note, section: local.section },
      localLocked: false
    })
  }
}

export default createReportHandler()
