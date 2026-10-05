import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'

// auth.js reads SESSION_SECRET at import time; set test-only secrets first.
const TEST_SECRET = 'api-security-test-secret-not-real'
process.env.SESSION_SECRET = TEST_SECRET
process.env.ADMIN_API_TOKEN = 'admin-token-for-tests-0123456789'
delete process.env.CRON_SECRET

const { escapeFormulaValue, formulaEquals } = await import('../../api/_lib/airtableServer.js')
const { isAdminRequest, rateLimit, _resetRateLimits, toPublicDashboardMetrics, PUBLIC_TABLE_ROW_CAP } = await import('../../api/_lib/security.js')
const { createDashboardMetricsHandler } = await import('../../api/dashboard-metrics.js')
const { createProtectedFirmsHandler } = await import('../../api/protected-firms.js')
const { default: firmsHandler } = await import('../../api/firms.js')

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(n, v) { this.headers[n.toLowerCase()] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}
const req = ({ method = 'GET', headers = {}, query = {}, body } = {}) => ({ method, headers, query, body })
const bearer = (payload) => ({ authorization: `Bearer ${jwt.sign(payload, TEST_SECRET)}` })

const row = (i) => ({ id: `rec${i}`, primarySegment: 'Healthcare', companyCity: 'Austin', eeCount: i })
const SAMPLE = {
  segmentStats: { 'All segments': { firms: 40 } },
  tableFirms: Array.from({ length: 40 }, (_, i) => row(i)),
  segmentTableFirms: { 'All segments': { default: Array.from({ length: 40 }, (_, i) => row(i)), bySize: { '1-5': [row(1)] }, byState: { TX: { _: [row(2)] } } } },
  countyData: { TX: { Austin: { firmCount: 1, firms: [{ id: 'rec1' }] } } },
  countyDataBySegment: { 'All segments': { TX: {} } },
  computedAt: '2026-10-04T00:00:00Z',
}

describe('formula escaping', () => {
  test('quotes, backslashes and newlines cannot break out of the literal', () => {
    assert.equal(escapeFormulaValue('a"b'), 'a\\"b')
    assert.equal(escapeFormulaValue('a\\b'), 'a\\\\b')
    assert.equal(escapeFormulaValue('x\r\ny'), 'x y')
    assert.equal(escapeFormulaValue(null), '')
    assert.equal(formulaEquals('Email', '" , TRUE()) , OR("'), '{Email} = "\\" , TRUE()) , OR(\\""')
    assert.equal(formulaEquals('Email', 'x\\'), '{Email} = "x\\\\"')
  })
})

describe('admin secret', () => {
  test('accepts the right token only', () => {
    assert.equal(isAdminRequest(req({ headers: { 'x-admin-token': process.env.ADMIN_API_TOKEN } })), true)
    assert.equal(isAdminRequest(req({ headers: { authorization: `Bearer ${process.env.ADMIN_API_TOKEN}` } })), true)
    assert.equal(isAdminRequest(req({ headers: { 'x-admin-token': 'wrong' } })), false)
    assert.equal(isAdminRequest(req()), false)
  })
  test('no secret (or a too-short one) configured means nobody is admin', () => {
    assert.equal(isAdminRequest(req({ headers: { 'x-admin-token': 'anything' } }), {}), false)
    assert.equal(isAdminRequest(req({ headers: { 'x-admin-token': 'short' } }), { ADMIN_API_TOKEN: 'short' }), false)
  })
})

describe('dashboard-metrics handler', () => {
  let calls
  const deps = () => ({
    fetchDashboardMetrics: async () => structuredClone(SAMPLE),
    computeDashboardMetrics: async () => { calls.push('compute'); return { computedAt: 'now' } },
    storeDashboardMetrics: async () => { calls.push('store'); return { success: true } },
    markDashboardRecomputing: async () => {},
  })
  beforeEach(() => { calls = [] })

  test('anonymous POST cannot recompute', async () => {
    const res = fakeRes()
    await createDashboardMetricsHandler(deps())(req({ method: 'POST' }), res)
    assert.equal(res.statusCode, 401)
    assert.deepEqual(calls, [])
  })
  test('signed-in non-admin user cannot recompute either', async () => {
    const res = fakeRes()
    await createDashboardMetricsHandler(deps())(req({ method: 'POST', headers: bearer({ userId: 'recX' }) }), res)
    assert.equal(res.statusCode, 401)
    assert.deepEqual(calls, [])
  })
  test('admin POST and cron GET recompute', async () => {
    const h = createDashboardMetricsHandler(deps())
    const r1 = fakeRes()
    await h(req({ method: 'POST', headers: { 'x-admin-token': process.env.ADMIN_API_TOKEN } }), r1)
    const r2 = fakeRes()
    await h(req({ query: { recompute: '1' }, headers: { authorization: `Bearer ${process.env.ADMIN_API_TOKEN}` } }), r2)
    assert.equal(r1.statusCode, 200)
    assert.equal(r2.statusCode, 200)
    assert.deepEqual(calls, ['compute', 'store', 'compute', 'store'])
  })
  test('anonymous GET ?recompute=1 is refused', async () => {
    const res = fakeRes()
    await createDashboardMetricsHandler(deps())(req({ query: { recompute: '1' } }), res)
    assert.equal(res.statusCode, 401)
  })
  test('anonymous GET gets aggregates without ids or city firm lists', async () => {
    const res = fakeRes()
    await createDashboardMetricsHandler(deps())(req(), res)
    const m = res.body.metrics
    assert.deepEqual(m.segmentStats, SAMPLE.segmentStats)
    assert.equal(m.tableFirms.length, PUBLIC_TABLE_ROW_CAP)
    assert.equal(m.segmentTableFirms['All segments'].default.length, PUBLIC_TABLE_ROW_CAP)
    assert.ok(!JSON.stringify(m).includes('"id"'))
    assert.deepEqual(m.countyData, {})
    assert.deepEqual(m.countyDataBySegment, {})
  })
  test('signed-in GET gets full rows', async () => {
    const res = fakeRes()
    await createDashboardMetricsHandler(deps())(req({ headers: bearer({ userId: 'recX' }) }), res)
    assert.equal(res.body.metrics.tableFirms.length, 40)
    assert.equal(res.body.metrics.countyData.TX.Austin.firms[0].id, 'rec1')
  })
  test('toPublicDashboardMetrics tolerates null', () => {
    assert.equal(toPublicDashboardMetrics(null), null)
  })
})

describe('firms + protected-firms', () => {
  test('/api/firms rejects anonymous', async () => {
    const res = fakeRes()
    await firmsHandler(req(), res)
    assert.equal(res.statusCode, 401)
  })
  test('protected-firms ignores body segment and uses the session user record', async () => {
    let seen
    const h = createProtectedFirmsHandler({
      fetchUserSegment: async (id) => (id === 'recUser' ? 'Healthcare' : null),
      fetchProtectedFirms: async (segment) => { seen = segment; return [] },
    })
    const res = fakeRes()
    await h(req({ method: 'POST', headers: bearer({ userId: 'recUser' }), body: { user: { primarySegment: 'IT", TRUE())' } } }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(seen, 'Healthcare')
  })
  test('protected-firms rejects anonymous', async () => {
    const res = fakeRes()
    await createProtectedFirmsHandler({ fetchUserSegment: async () => 'x', fetchProtectedFirms: async () => [] })(req({ method: 'POST' }), res)
    assert.equal(res.statusCode, 401)
  })
})

describe('rate limiting', () => {
  beforeEach(() => _resetRateLimits())
  test('blocks after the limit per IP and window, then resets', () => {
    const r = req({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })
    const opts = { key: 't', limit: 2, windowMs: 1000, now: 0 }
    assert.equal(rateLimit(r, fakeRes(), opts), true)
    assert.equal(rateLimit(r, fakeRes(), opts), true)
    const res = fakeRes()
    assert.equal(rateLimit(r, res, opts), false)
    assert.equal(res.statusCode, 429)
    assert.ok(res.headers['retry-after'])
    assert.equal(rateLimit(req({ headers: { 'x-forwarded-for': '5.6.7.8' } }), fakeRes(), opts), true)
    assert.equal(rateLimit(r, fakeRes(), { ...opts, now: 1500 }), true)
  })
})
