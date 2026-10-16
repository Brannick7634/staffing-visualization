import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { validateEvent, parseBody, makeCollect, makeWeekly, computeReport, buildEmail, cronAuthorized, KNOWN_EVENTS, ALLOWED_PROPS, REPORT_TO } from '../../api/_lib/analytics.js'
import { EVENTS, ALLOWED_PROPS as CLIENT_PROPS } from '../../src/preview/lib/track.js'

function mockRes() {
  return { statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v }, end(b) { this.body = b || '' } }
}
function mockDb() {
  const calls = []
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows: [], rowCount: 0 } } }
}

describe('server allowlist', () => {
  test('matches the client allowlist and non-legacy events', () => {
    assert.deepEqual(ALLOWED_PROPS, CLIENT_PROPS)
    const legacy = new Set(['report_printed', 'report_downloaded', 'report_emailed'])
    assert.deepEqual([...KNOWN_EVENTS].sort(), Object.values(EVENTS).filter((e) => !legacy.has(e)).sort())
  })
  test('accepts a clean event', () => {
    assert.deepEqual(validateEvent({ event: 'pay_check_started', props: { roleKey: 'cna' }, path: '/pay' }), { event: 'pay_check_started', props: { roleKey: 'cna' }, path: '/pay' })
  })
  test('rejects PII keys', () => {
    for (const k of ['rate', 'email', 'name', 'token', 'recipients', 'note', 'ip', 'userAgent']) {
      assert.equal(validateEvent({ event: 'pay_check_started', props: { [k]: 'x' } }), null, k)
    }
    assert.equal(validateEvent({ event: 'pay_check_started', email: 'a@b.com' }), null)
  })
  test('rejects PII values under allowed keys', () => {
    for (const v of ['a@b.com', '18.50', '25', 'Andy Kohler', '$18', 'x'.repeat(65), 42, ['cna']]) {
      assert.equal(validateEvent({ event: 'pay_check_started', props: { roleKey: v } }), null, String(v))
    }
  })
  test('rejects unknown/legacy events and unsafe paths', () => {
    assert.equal(validateEvent({ event: 'report_printed' }), null)
    assert.equal(validateEvent({ event: 'nope' }), null)
    assert.equal(validateEvent({ event: 'report_viewed', path: '/r?token=abc' }), null)
    assert.equal(validateEvent({ event: 'report_viewed', path: 'https://x.com/' }), null)
  })
  test('caps body size', () => {
    assert.equal(parseBody({ headers: { 'content-length': '5000' }, body: {} }), null)
    assert.equal(parseBody({ headers: {}, body: 'x'.repeat(3000) }), null)
    assert.deepEqual(parseBody({ headers: {}, body: '{"event":"gate_shown"}' }), { event: 'gate_shown' })
  })
})

describe('collector', () => {
  test('inserts valid event, 204, no cookie', async () => {
    const db = mockDb(); const res = mockRes()
    await makeCollect({ getDb: () => db })({ method: 'POST', headers: {}, body: { event: 'gate_shown', props: { access: 'free' }, path: '/' } }, res)
    assert.equal(res.statusCode, 204)
    assert.equal(res.headers['Set-Cookie'], undefined)
    const ins = db.calls.find((c) => c.sql.startsWith('INSERT'))
    assert.deepEqual(ins.params, ['gate_shown', '{"access":"free"}', '/'])
  })
  test('rejects bad event without touching db', async () => {
    const db = mockDb(); const res = mockRes()
    await makeCollect({ getDb: () => db })({ method: 'POST', headers: {}, body: { event: 'gate_shown', props: { email: 'a@b.com' } } }, res)
    assert.equal(res.statusCode, 400)
    assert.equal(db.calls.length, 0)
  })
  test('db failure still returns 204', async () => {
    const res = mockRes()
    await makeCollect({ getDb: () => ({ query: async () => { throw Object.assign(new Error('x'), { code: 'ECONN' }) } }) })({ method: 'POST', headers: {}, body: { event: 'gate_shown' } }, res)
    assert.equal(res.statusCode, 204)
  })
})

describe('weekly report', () => {
  const rows = [
    { event: 'pay_check_started', period: 'current', n: 40 },
    { event: 'local_coverage_available', period: 'current', n: 30 },
    { event: 'local_coverage_unavailable', period: 'current', n: 10 },
    { event: 'gate_shown', period: 'current', n: 15 },
    { event: 'report_gate_shown', period: 'current', n: 5 },
    { event: 'signup_completed', period: 'current', n: 4 },
    { event: 'report_viewed', period: 'current', n: 8 },
    { event: 'report_download_started', period: 'current', n: 2 },
    { event: 'report_email_accepted', period: 'current', n: 1 },
    { event: 'report_email_failed', period: 'current', n: 1 },
    { event: 'pay_check_started', period: 'prior', n: 20 }
  ]
  test('math', () => {
    const r = computeReport(rows)
    assert.equal(r.current.coverageRate, 0.75)
    assert.equal(r.current.gateShown, 20)
    assert.equal(r.current.total, 116)
    assert.equal(r.prior.comparisonsStarted, 20)
    assert.equal(r.prior.coverageRate, null)
    const { text } = buildEmail(r, { start: new Date('2026-10-05'), end: new Date('2026-10-12') })
    assert.match(text, /rate 75%/)
    assert.match(text, /Signups \/ gate shown: 4 \/ 20 = 20%/)
    assert.match(text, /Report actions \/ reports viewed: 3 \/ 8 = 38%/)
    assert.match(text, /Comparisons started: 40 \(prior week 20\)/)
  })
  test('no data says so, no fabricated numbers', () => {
    const { text } = buildEmail(computeReport([]), {})
    assert.match(text, /No analytics events were recorded/)
    assert.doesNotMatch(text, /\d+%/)
  })
  const env = { CRON_SECRET: 's'.repeat(32), RESEND_API_KEY: 'test', SIGNAL_FROM_EMAIL: 'from@example.test' }
  test('cron auth required', async () => {
    assert.equal(cronAuthorized({ headers: {} }, env), false)
    assert.equal(cronAuthorized({ headers: { authorization: 'Bearer wrong' } }, env), false)
    assert.equal(cronAuthorized({ headers: { authorization: `Bearer ${env.CRON_SECRET}` } }, {}), false)
    let sent = 0
    const res = mockRes()
    await makeWeekly({ getDb: mockDb, env, fetchImpl: async () => { sent++ } })({ headers: { authorization: 'Bearer nope' } }, res)
    assert.equal(res.statusCode, 401)
    assert.equal(sent, 0)
  })
  test('builds and sends through mocked transport, then prunes', async () => {
    const db = { calls: [], query: async (sql, p) => { db.calls.push(sql); return sql.startsWith('SELECT') ? { rows } : { rows: [], rowCount: 3 } } }
    const mails = []
    const fetchImpl = async (url, opts) => { mails.push({ url, body: JSON.parse(opts.body) }); return { ok: true, json: async () => ({}) } }
    const res = mockRes()
    await makeWeekly({ getDb: () => db, env, fetchImpl, now: () => new Date('2026-10-12T12:00:00Z') })({ headers: { authorization: `Bearer ${env.CRON_SECRET}` } }, res)
    assert.equal(res.statusCode, 200)
    assert.equal(mails.length, 1)
    assert.equal(mails[0].url, 'https://api.resend.com/emails')
    assert.deepEqual(mails[0].body.to, [REPORT_TO])
    assert.match(mails[0].body.subject, /2026-10-05 to 2026-10-12/)
    assert.ok(db.calls.some((s) => /DELETE FROM analytics_events WHERE ts < now\(\) - interval '13 months'/.test(s)))
    assert.deepEqual(JSON.parse(res.body), { ok: true, events: 116, pruned: 3 })
  })
})
