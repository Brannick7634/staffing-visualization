import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createSubscribeHandler } from '../../api/subscribe.js'
import { createMagicLinkHandler } from '../../api/auth/magic-link.js'
import { createVerifyHandler } from '../../api/auth/verify.js'
import { createUnsubscribeHandler } from '../../api/unsubscribe.js'
import { createPreferencesHandler } from '../../api/preferences.js'
import { F, escapeFormulaString, validateSignup } from '../../api/_lib/subscribers.js'
import { loginToken, unsubscribeToken, sessionToken, verifySession, verifyToken, SESSION_COOKIE } from '../../api/_lib/signalSession.js'
import { beforeEach } from 'node:test'
import { _resetRateLimits } from '../../api/_lib/security.js'
beforeEach(() => _resetRateLimits())

const SECRET = 'test-secret-'.padEnd(40, 'x')
const ENV = {
  AIRTABLE_API_KEY: 'patTEST', SIGNAL_SESSION_SECRET: SECRET, SIGNAL_SITE_URL: 'https://signal.example',
  RESEND_API_KEY: 're_test', SIGNAL_FROM_EMAIL: 'Signal <hello@signal.example>'
}

// In-memory Airtable + Resend mock.
function mockFetch(rows = []) {
  const calls = { emails: [], writes: [] }
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url)
    const ok = (data) => ({ ok: true, status: 200, json: async () => data })
    if (u.hostname === 'api.resend.com') { calls.emails.push(JSON.parse(opts.body)); return ok({ id: 'em_1' }) }
    if (opts.method === 'GET' || !opts.method) {
      const m = /="(.*)"$/.exec(u.searchParams.get('filterByFormula'))
      const email = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      return ok({ records: rows.filter((r) => r.fields[F.email].toLowerCase() === email) })
    }
    const body = JSON.parse(opts.body)
    calls.writes.push({ method: opts.method, body })
    if (opts.method === 'POST') {
      const rec = { id: `rec${rows.length + 1}`, fields: { ...body.records[0].fields } }
      rows.push(rec)
      return ok({ records: [rec] })
    }
    for (const r of body.records) Object.assign(rows.find((x) => x.id === r.id).fields, r.fields)
    return ok({ records: body.records })
  }
  return { fetchImpl, rows, calls }
}

function call(handler, { method = 'GET', url = '/', body, cookie } = {}) {
  return new Promise((resolve) => {
    const headers = {}
    const res = {
      statusCode: 200,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v },
      end: (b) => resolve({ status: res.statusCode, headers, body: b ? (headers['content-type']?.includes('json') ? JSON.parse(b) : b) : '' })
    }
    Promise.resolve(handler({ method, url, body, headers: cookie ? { cookie } : {} }, res))
  })
}

describe('missing env fails closed', () => {
  for (const [name, make, req] of [
    ['subscribe', createSubscribeHandler, { method: 'POST', body: { name: 'A', email: 'a@b.co' } }],
    ['magic-link', createMagicLinkHandler, { method: 'POST', body: { email: 'a@b.co' } }],
    ['verify', createVerifyHandler, { url: '/?token=x' }],
    ['unsubscribe', createUnsubscribeHandler, { url: '/?token=x' }],
    ['preferences', createPreferencesHandler, { method: 'POST', body: {} }]
  ]) {
    test(`${name} -> 503`, async () => {
      const r = await call(make({ env: {}, fetchImpl: () => { throw new Error('no network') } }), req)
      assert.equal(r.status, 503)
    })
  }
  test('short secret counts as missing', async () => {
    const r = await call(createSubscribeHandler({ env: { ...ENV, SIGNAL_SESSION_SECRET: 'short' } }), { method: 'POST', body: {} })
    assert.equal(r.status, 503)
  })
})

describe('validation + escaping', () => {
  test('newsletter defaults to checked; email lowercased', () => {
    const v = validateSignup({ name: ' Ann ', email: ' Ann@Firm.COM ' })
    assert.equal(v.ok, true)
    assert.equal(v.value.newsletter, true)
    assert.equal(v.value.email, 'ann@firm.com')
  })
  test('rejects bad email, long name, non-boolean newsletter', () => {
    const v = validateSignup({ name: 'x'.repeat(101), email: 'nope', newsletter: 'yes' })
    assert.deepEqual(Object.keys(v.fields).sort(), ['email', 'name', 'newsletter'])
  })
  test('formula escaping', () => {
    assert.equal(escapeFormulaString('a"b\\c'), 'a\\"b\\\\c')
  })
})

describe('subscribe', () => {
  test('creates once, idempotent on repeat, sends magic link', async () => {
    const m = mockFetch()
    const h = createSubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl })
    const r1 = await call(h, { method: 'POST', body: { name: 'Ann', email: 'Ann@Firm.com', newsletter: false } })
    const r2 = await call(h, { method: 'POST', body: { name: 'Ann B', email: 'ann@firm.com' } })
    assert.equal(r1.status, 200)
    assert.equal(r2.status, 200)
    assert.equal(m.rows.length, 1)
    assert.equal(m.rows[0].fields[F.email], 'ann@firm.com')
    assert.equal(m.rows[0].fields[F.name], 'Ann B')
    assert.equal(m.calls.emails.length, 2)
    assert.match(m.calls.emails[0].text, /https:\/\/signal\.example\/api\/auth\/verify\?token=/)
    assert.ok(m.calls.emails[0].headers['List-Unsubscribe'])
    assert.deepEqual(Object.keys(r1.body).includes('created'), false)
  })
  test('re-signup never clears Unsubscribed', async () => {
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.unsubscribed]: true, [F.unsubscribedAt]: '2026-01-01T00:00:00.000Z' } }])
    await call(createSubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl }), { method: 'POST', body: { name: 'Ann', email: 'ann@firm.com', newsletter: true } })
    assert.equal(m.rows[0].fields[F.unsubscribed], true)
    assert.equal(m.rows[0].fields[F.unsubscribedAt], '2026-01-01T00:00:00.000Z')
    for (const w of m.calls.writes) for (const r of w.body.records) assert.ok(!(F.unsubscribed in r.fields))
  })
  test('400 on invalid input, 405 on GET', async () => {
    const h = createSubscribeHandler({ env: ENV, fetchImpl: mockFetch().fetchImpl })
    assert.equal((await call(h, { method: 'POST', body: { email: 'x' } })).status, 400)
    assert.equal((await call(h, { method: 'GET' })).status, 405)
  })
})

describe('magic link', () => {
  test('same answer for unknown email, no email sent', async () => {
    const m = mockFetch()
    const r = await call(createMagicLinkHandler({ env: ENV, fetchImpl: m.fetchImpl }), { method: 'POST', body: { email: 'who@x.com' } })
    assert.equal(r.status, 200)
    assert.equal(m.calls.emails.length, 0)
  })
})

describe('verify', () => {
  const rows = () => [{ id: 'rec1', fields: { [F.email]: 'ann@firm.com' } }]
  test('valid token sets cookie, verified, sign-in; second use refused', async () => {
    const m = mockFetch(rows())
    const t0 = 1_800_000_000_000
    const token = loginToken('ann@firm.com', SECRET, t0)
    const h = createVerifyHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => t0 + 1000 })
    const r = await call(h, { url: `/api/auth/verify?token=${token}` })
    assert.equal(r.status, 303)
    assert.equal(r.headers.location, 'https://signal.example/?signin=ok')
    assert.match(r.headers['set-cookie'], /HttpOnly; Secure; SameSite=Lax/)
    assert.equal(m.rows[0].fields[F.verified], true)
    const again = await call(h, { url: `/api/auth/verify?token=${token}` })
    assert.equal(again.headers.location, 'https://signal.example/?signin=used')
    assert.equal(again.headers['set-cookie'], undefined)
  })
  test('expired, forged and wrong-purpose tokens refused', async () => {
    const m = mockFetch(rows())
    const t0 = 1_800_000_000_000
    const h = createVerifyHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => t0 + 16 * 60 * 1000 })
    for (const tok of [loginToken('ann@firm.com', SECRET, t0), loginToken('ann@firm.com', 'other'.padEnd(40, 'y'), t0 + 15 * 60 * 1000), unsubscribeToken('ann@firm.com', SECRET)]) {
      const r = await call(h, { url: `/?token=${tok}` })
      assert.equal(r.headers.location, 'https://signal.example/?signin=expired')
    }
  })
})

describe('session', () => {
  test('verifySession accepts a valid cookie, rejects tampering and missing secret', () => {
    const tok = sessionToken('ann@firm.com', SECRET)
    const req = { headers: { cookie: `a=1; ${SESSION_COOKIE}=${tok}` } }
    assert.deepEqual(verifySession(req, { env: ENV }), { email: 'ann@firm.com' })
    assert.equal(verifySession({ headers: { cookie: `${SESSION_COOKIE}=${tok}x` } }, { env: ENV }), null)
    assert.equal(verifySession(req, { env: {} }), null)
    assert.equal(verifyToken(loginToken('a@b.co', SECRET), SECRET, { purpose: 'session' }), null)
  })
})

describe('unsubscribe', () => {
  test('one click sets Unsubscribed + timestamp; bad token 400', async () => {
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.newsletter]: true } }])
    const h = createUnsubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => new Date('2026-10-04T12:00:00Z') })
    const r = await call(h, { method: 'POST', url: `/?token=${unsubscribeToken('ann@firm.com', SECRET)}` })
    assert.equal(r.status, 200)
    assert.equal(m.rows[0].fields[F.unsubscribed], true)
    assert.equal(m.rows[0].fields[F.unsubscribedAt], '2026-10-04T12:00:00.000Z')
    assert.equal((await call(h, { url: '/?token=bad' })).status, 400)
  })
})

describe('preferences', () => {
  test('requires session; saves sectors and states', async () => {
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com' } }])
    const h = createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl })
    assert.equal((await call(h, { method: 'POST', body: {} })).status, 401)
    const cookie = `${SESSION_COOKIE}=${sessionToken('ann@firm.com', SECRET)}`
    const r = await call(h, { method: 'POST', cookie, body: { sectors: ['light_industrial'], states: ['TX'], cities: ['TX:houston'], newsletter: true } })
    assert.equal(r.status, 200)
    assert.equal(m.rows[0].fields[F.sectors], 'light_industrial')
    assert.equal(m.rows[0].fields[F.states], 'TX\nTX:houston')
    assert.equal((await call(h, { method: 'POST', cookie, body: { sectors: ['<script>'] } })).status, 400)
  })
})
