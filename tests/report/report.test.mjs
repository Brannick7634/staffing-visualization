import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildReport, localFor, cityKeyFor, previousMonth, monthLabel, THRESHOLDS, validateMonthly } from '../../api/_lib/signal/report.js'
import { createReportHandler, areaFromRecord } from '../../api/_lib/routes/signal-report.js'
import { F } from '../../api/_lib/subscribers.js'
import { sessionToken, passwordFingerprint, SESSION_COOKIE } from '../../api/_lib/signalSession.js'
import { ACCESS } from '../../shared/signal/contract.js'

const ok = (firms = 8, share = 0.2) => ({ status: 'verified', distinctFirms: firms, maxFirmShare: share })
const pay = (roleKey, typ, n = 50, extra = {}) => ({ roleKey, level: 'nationwide', state: null, city: null, n, p25Cents: typ - 200, typicalCents: typ, p75Cents: typ + 200, checks: ok(), ...extra })
function month(m, { payRows = [], states = [], cities = [], roles = [], total = 10000, roleStatus = {} } = {}) {
  return {
    format: 'staffing-signal-monthly-aggregates', schemaVersion: 1, calcVersion: 'signal-month-1.0.0', baseCalcVersion: 'x', month: m,
    reliability: { reliable: true }, totals: { postings: total, firms: 900, payObservations: 5000 }, roleStatus, pay: payRows, demand: { states, cities, roles }
  }
}
const st = (code, postings, checks = ok()) => ({ code, postings, checks })

describe('report builder', () => {
  test('months helpers and input validation', () => {
    assert.equal(previousMonth('2026-01'), '2025-12')
    assert.equal(monthLabel('2026-09'), 'September 2026')
    assert.throws(() => buildReport(month('2026-09'), month('2026-07')), /consecutive/)
    assert.throws(() => validateMonthly({ ...month('2026-09'), reliability: { reliable: false } }, '2026-09'), /unreliable/)
  })

  test('pay moves: thresholds, privacy in both months, deterministic text', () => {
    const prev = month('2026-08', { payRows: [pay('welder', 2400), pay('forklift-operator', 1800), pay('cna', 2000), pay('registered-nurse', 4800), pay('line-cook', 1600, 10), pay('server', 1500, 50, { checks: ok(2) })] })
    const cur = month('2026-09', { payRows: [pay('welder', 2800), pay('forklift-operator', 1820), pay('cna', 1800), pay('registered-nurse', 6000), pay('line-cook', 2000), pay('server', 1800)] })
    const r = buildReport(cur, prev, { now: new Date('2026-10-05T00:00:00Z') })
    // forklift +1.1% < 2% noise floor; RN +25% over the 20% mix-shift cap;
    // line-cook n < 30 last month; server failed the privacy rule last month.
    assert.deepEqual(r.national.payMoves.map((m) => m.roleKey), ['welder', 'cna'])
    assert.equal(r.national.payMoves[0].pct, 16.7)
    assert.equal(r.national.headlines[0].text, 'Welder typical advertised pay rose 17% to $28.00/hr (from $24.00 in August).')
    assert.equal(r.national.headlines[0].direction, 'up')
    assert.ok(r.national.headlines.some((h) => h.direction === 'down' && h.ref.roleKey === 'cna'))
    assert.deepEqual(buildReport(cur, prev, { now: new Date(0) }).national, buildReport(cur, prev, { now: new Date(1) }).national)
  })

  test('demand is share-normalized; noise and huge swings suppressed; privacy both months', () => {
    const prev = month('2026-08', { total: 10000, states: [st('TX', 1000), st('CA', 1000), st('FL', 1000), st('OH', 1000, ok(2)), st('WY', 100)] })
    const cur = month('2026-09', { total: 5000, states: [st('TX', 650), st('CA', 520), st('FL', 1000), st('OH', 700), st('WY', 100)] })
    const r = buildReport(cur, prev)
    // TX share 10% -> 13% = +30%; CA +4% (noise); FL +100% (over cap);
    // OH failed privacy in August; WY under 200 postings.
    assert.deepEqual(r.national.hottestStates.map((s) => s.key), ['TX'])
    assert.equal(r.national.hottestStates[0].pct, 30)
    assert.equal(r.national.headlines.find((h) => h.kind === 'state-demand').text, 'Texas heated up: its share of staffing-firm postings grew 30% vs August.')
  })

  test('newly publishable roles and local sections with honest fallback', () => {
    const prev = month('2026-08', { roleStatus: { welder: 'withheld', cna: 'publishable' }, payRows: [pay('cna', 2000), pay('cna', 2000, 30, { level: 'state', state: 'TX' })], states: [st('TX', 1000)] })
    const cur = month('2026-09', { roleStatus: { welder: 'publishable', cna: 'publishable' }, payRows: [pay('welder', 2500), pay('cna', 2000), pay('cna', 2200, 30, { level: 'state', state: 'TX' })], states: [st('TX', 1300)] })
    const r = buildReport(cur, prev)
    assert.deepEqual(r.national.newlyPublishable.map((x) => x.roleKey), ['welder'])
    assert.ok(r.national.headlines.some((h) => h.direction === 'new'))
    assert.match(r.states.TX.headlines[0].text, /^Texas: /)
    const city = localFor(r, { state: 'TX', cityKey: 'TX:houston' })
    assert.equal(city.level, 'state')
    assert.match(city.note, /No reliable Houston, TX comparison/)
    const none = localFor(r, { state: 'WY' })
    assert.equal(none.level, 'national')
    assert.match(none.note, /Wyoming/)
    assert.equal(localFor(r, {}).note, null)
  })

  test('cityKeyFor matches the pipeline slug rule', () => {
    assert.equal(cityKeyFor('TX', '  Houston '), 'TX:houston')
    assert.equal(cityKeyFor('MO', 'St. Louis'), 'MO:st-louis')
    assert.equal(cityKeyFor('GA', 'Greater Atlanta Area'), 'GA:atlanta')
    assert.equal(cityKeyFor('DC', 'anything'), 'DC:washington')
    assert.equal(cityKeyFor('TX', ''), null)
  })

  test('thresholds are documented', () => {
    assert.equal(THRESHOLDS.privacy.minDistinctFirms, 5)
    assert.ok(THRESHOLDS.pay.minObservations.nationwide >= 30)
  })
})

describe('GET /api/signal/report', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rep-'))
  const prev = month('2026-08', { payRows: [pay('welder', 2400), pay('cna', 2000), pay('server', 1500), pay('welder', 2400, 30, { level: 'state', state: 'TX' })], states: [st('TX', 1000)] })
  const cur = month('2026-09', { payRows: [pay('welder', 2800), pay('cna', 1800), pay('server', 1600), pay('welder', 2700, 30, { level: 'state', state: 'TX' })], states: [st('TX', 1300)] })
  writeFileSync(path.join(dir, '2026-09.json'), JSON.stringify(buildReport(cur, prev)))
  writeFileSync(path.join(dir, '2026-08.json'), JSON.stringify({ ...buildReport(cur, prev), month: '2026-08' }))
  const call = (h, { query = {}, method = 'GET' } = {}) => new Promise((resolve) => {
    const headers = {}
    const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v }, end: (b) => resolve({ status: res.statusCode, headers, body: JSON.parse(b) }) }
    h({ method, query, headers: {} }, res)
  })
  const pub = createReportHandler({ dir, resolveAccess: () => ({ access: ACCESS.PUBLIC }), loadArea: async () => { throw new Error('must not load') } })
  const auth = createReportHandler({ dir, resolveAccess: () => ({ access: ACCESS.AUTHORIZED }), loadArea: async () => ({ state: 'TX', cityKey: 'TX:houston' }) })

  test('public: latest month, national only, archive list', async () => {
    const r = await call(pub)
    assert.equal(r.status, 200)
    assert.equal(r.body.month, '2026-09')
    assert.deepEqual(r.body.months, ['2026-09', '2026-08'])
    assert.ok(r.body.national.headlines.length > 0)
    assert.equal(r.body.states, undefined)
    assert.equal(r.body.cities, undefined)
    assert.equal(r.body.local, null)
    assert.equal(r.headers['cache-control'], 'private, no-store')
  })

  test('signed in: state sections + own area first with honest fallback', async () => {
    const r = await call(auth)
    assert.ok(r.body.states.TX)
    assert.equal(r.body.local.level, 'state')
    assert.match(r.body.local.note, /Houston, TX/)
    assert.equal(r.body.area.source, 'preferences')
    const q = await call(auth, { query: { state: 'ca' } })
    assert.equal(q.body.area.state, 'CA')
    assert.equal(q.body.local.level, 'national')
  })

  test('saved area needs a session started with the current password', async () => {
    const SECRET = 'report-secret-'.padEnd(40, 'x')
    const env = { AIRTABLE_API_KEY: 'patTEST', SIGNAL_SESSION_SECRET: SECRET, SIGNAL_SITE_URL: 'https://signal.example' }
    const HASH = '$2b$10$' + 'a'.repeat(53)
    const rows = [{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.states]: 'TX', [F.city]: 'Houston', [F.passwordHash]: HASH } }]
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ records: rows }) })
    const h = createReportHandler({ dir, resolveAccess: () => ({ access: ACCESS.AUTHORIZED }), env, fetchImpl })
    const get = (token) => new Promise((resolve) => {
      const res = { statusCode: 200, setHeader: () => {}, end: (b) => resolve(JSON.parse(b)) }
      h({ method: 'GET', query: {}, headers: { cookie: `${SESSION_COOKIE}=${token}` } }, res)
    })
    const current = await get(sessionToken('ann@firm.com', SECRET, Date.now(), passwordFingerprint(HASH, SECRET)))
    assert.equal(current.area.state, 'TX')
    assert.equal(current.area.source, 'preferences')
    const stale = await get(sessionToken('ann@firm.com', SECRET, Date.now(), passwordFingerprint('$2b$10$' + 'b'.repeat(53), SECRET)))
    assert.equal(stale.area, null)
    assert.equal((await get(sessionToken('ann@firm.com', SECRET))).area, null)
  })

  test('bad and missing months', async () => {
    assert.equal((await call(pub, { query: { month: '2026-13' } })).status, 400)
    assert.equal((await call(pub, { query: { month: '2026-07' } })).status, 404)
    assert.equal((await call(pub, { method: 'POST' })).status, 405)
    const empty = createReportHandler({ dir: mkdtempSync(path.join(os.tmpdir(), 'rep0-')), resolveAccess: () => ({}) })
    assert.equal((await call(empty)).status, 404)
  })

  test('area from subscriber record', () => {
    assert.deepEqual(areaFromRecord({ [F.states]: 'TX\nCA\nTX:dallas', [F.city]: 'Houston' }), { state: 'TX', cityKey: 'TX:houston' })
    assert.deepEqual(areaFromRecord({ [F.states]: 'TX\nTX:dallas' }), { state: 'TX', cityKey: 'TX:dallas' })
    assert.deepEqual(areaFromRecord({}), { state: null, cityKey: null })
  })
})

test('report route is wired through the existing dispatcher (no new function)', async () => {
  const fns = readdirSync(new URL('../../api/', import.meta.url)).filter((f) => f.endsWith('.js'))
  assert.ok(fns.length <= 12, `api/*.js = ${fns.length}`)
  const vercel = JSON.parse((await import('node:fs')).readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
  assert.ok(vercel.rewrites.some((r) => r.source === '/api/signal/report' && r.destination === '/api/signal-data?route=signal-report'))
  assert.match(vercel.functions['api/signal-data.js'].includeFiles, /report/)
})
