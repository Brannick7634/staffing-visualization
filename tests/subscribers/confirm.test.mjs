// POST /api/auth/confirm: confirm-your-email links. A confirmed address is
// what lets an account email Client Pay Market Reports to other people.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createConfirmHandler } from '../../api/_lib/routes/confirm.js'
import { F } from '../../api/_lib/subscribers.js'
import { confirmToken, resetToken, sessionToken, passwordFingerprint, SESSION_COOKIE, CONFIRM_TTL_MS } from '../../api/_lib/signalSession.js'
import { _resetRateLimits } from '../../api/_lib/security.js'

beforeEach(() => _resetRateLimits())

const SECRET = 'test-secret-'.padEnd(40, 'x')
const SITE = 'https://signal.example'
const ENV = {
  AIRTABLE_API_KEY: 'patTEST', SIGNAL_SESSION_SECRET: SECRET, SIGNAL_SITE_URL: SITE,
  RESEND_API_KEY: 're_test', SIGNAL_FROM_EMAIL: 'Signal <hello@signal.example>'
}
const T0 = 1_800_000_000_000
const EMAIL = 'pat@agency.example'
const HASH = '$2a$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234'

function mock(fields = {}) {
  const rows = [{ id: 'recPAT', fields: { [F.email]: EMAIL, [F.passwordHash]: HASH, ...fields } }]
  const calls = { emails: [], patches: [] }
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url)
    const ok = (data) => ({ ok: true, status: 200, json: async () => data })
    if (u.hostname === 'api.resend.com') { calls.emails.push(JSON.parse(opts.body)); return ok({ id: 'em' }) }
    if (!opts.method || opts.method === 'GET') {
      const email = /="(.*)"$/.exec(u.searchParams.get('filterByFormula'))[1]
      return ok({ records: rows.filter((r) => r.fields[F.email] === email) })
    }
    const body = JSON.parse(opts.body)
    calls.patches.push(body.records[0])
    for (const r of body.records) Object.assign(rows.find((x) => x.id === r.id).fields, r.fields)
    return ok({ records: body.records })
  }
  return { rows, calls, fetchImpl }
}

const cookie = (hash = HASH) => `${SESSION_COOKIE}=${sessionToken(EMAIL, SECRET, T0, passwordFingerprint(hash, SECRET))}`

function call(handler, { body = {}, headers = {}, method = 'POST' } = {}) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, setHeader() {}, end: (b) => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }) }
    handler({ method, body, headers: { 'content-type': 'application/json', ...headers } }, res)
  })
}

describe('confirming a link', () => {
  test('a valid link marks the address confirmed', async () => {
    const m = mock()
    const h = createConfirmHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 + 1000 })
    const r = await call(h, { body: { token: confirmToken(EMAIL, SECRET, { now: T0 }) } })
    assert.equal(r.status, 200)
    assert.equal(r.body.confirmed, true)
    assert.equal(m.rows[0].fields[F.verified], true)
  })

  test('expired, forged or wrong-purpose links are refused and change nothing', async () => {
    const m = mock()
    const h = createConfirmHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 + CONFIRM_TTL_MS + 1 })
    const tokens = [
      confirmToken(EMAIL, SECRET, { now: T0 }),
      confirmToken(EMAIL, 'another-secret-'.padEnd(40, 'y'), { now: T0 + CONFIRM_TTL_MS }),
      resetToken(EMAIL, SECRET, { now: T0 + CONFIRM_TTL_MS })
    ]
    for (const token of tokens) {
      const r = await call(h, { body: { token } })
      assert.equal(r.status, 400)
      assert.equal(r.body.error.code, 'link_expired')
    }
    assert.equal(m.calls.patches.length, 0)
  })
})

describe('asking for a link', () => {
  test('signed in and unconfirmed: one email with a /confirm-email link', async () => {
    const m = mock()
    const h = createConfirmHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 + 1000 })
    const r = await call(h, { headers: { cookie: cookie(), origin: SITE } })
    assert.equal(r.status, 200)
    assert.equal(r.body.sent, true)
    assert.equal(m.calls.emails.length, 1)
    assert.deepEqual(m.calls.emails[0].to, [EMAIL])
    assert.match(m.calls.emails[0].text, /https:\/\/signal\.example\/confirm-email\?token=/)
    assert.equal(m.calls.patches.length, 0)
  })

  test('already confirmed: nothing sent', async () => {
    const m = mock({ [F.verified]: true })
    const r = await call(createConfirmHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 }), { headers: { cookie: cookie(), origin: SITE } })
    assert.equal(r.body.alreadyConfirmed, true)
    assert.equal(m.calls.emails.length, 0)
  })

  test('needs the site origin and a current session', async () => {
    const m = mock()
    const h = createConfirmHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 })
    assert.equal((await call(h, { headers: { cookie: cookie() } })).status, 403)
    assert.equal((await call(h, { headers: { cookie: cookie(), origin: 'https://evil.example' } })).status, 403)
    assert.equal((await call(h, { headers: { origin: SITE } })).status, 401)
    assert.equal((await call(h, { headers: { cookie: cookie('$2a$10$old-hash'), origin: SITE } })).status, 401)
    assert.equal(m.calls.emails.length, 0)
  })

  test('at most 3 links an hour per account', async () => {
    const m = mock()
    const h = createConfirmHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 })
    const statuses = []
    for (let i = 0; i < 4; i++) statuses.push((await call(h, { headers: { cookie: cookie(), origin: SITE, 'x-forwarded-for': `9.9.9.${i}` } })).status)
    assert.deepEqual(statuses, [200, 200, 200, 429])
    assert.equal(m.calls.emails.length, 3)
  })

  test('POST and JSON only', async () => {
    const h = createConfirmHandler({ env: ENV, fetchImpl: mock().fetchImpl })
    assert.equal((await call(h, { method: 'GET' })).status, 405)
  })
})
