import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { createSubscribeHandler } from '../../api/_lib/routes/subscribe.js'
import { createLoginHandler } from '../../api/_lib/routes/login.js'
import { createForgotHandler } from '../../api/_lib/routes/forgot.js'
import { createResetHandler } from '../../api/_lib/routes/reset.js'
import { createLogoutHandler } from '../../api/_lib/routes/logout.js'
import { createUnsubscribeHandler } from '../../api/_lib/routes/unsubscribe.js'
import { createPreferencesHandler } from '../../api/_lib/routes/preferences.js'
import { F, escapeFormulaString, validateSignup, validatePassword, checkPassword } from '../../api/_lib/subscribers.js'
import { resetToken, passwordFingerprint, unsubscribeToken, sessionToken, verifySession, verifyToken, SESSION_COOKIE, RESET_TTL_MS } from '../../api/_lib/signalSession.js'
import { _resetRateLimits } from '../../api/_lib/security.js'

beforeEach(() => _resetRateLimits())

const SECRET = 'test-secret-'.padEnd(40, 'x')
const ENV = {
  AIRTABLE_API_KEY: 'patTEST', SIGNAL_SESSION_SECRET: SECRET, SIGNAL_SITE_URL: 'https://signal.example',
  RESEND_API_KEY: 're_test', SIGNAL_FROM_EMAIL: 'Signal <hello@signal.example>'
}
const NO_MAIL_ENV = { AIRTABLE_API_KEY: 'patTEST', SIGNAL_SESSION_SECRET: SECRET, SIGNAL_SITE_URL: 'https://signal.example' }
const PW = 'correct horse battery'
// Sign-up requires an area: a listed city key here.
const AREA = { state: 'TX', city: 'TX:houston' }
const T0 = 1_800_000_000_000
// Low cost keeps fixture rows fast; real hashes use cost 10.
const hashOf = (pw) => bcrypt.hashSync(pw, 4)
const CLEAR = 'ss_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'

// In-memory Airtable + Resend mock. `fail` makes one service answer 500.
// `sync: { GET: 2, POST: 2 }` holds the first N calls of a method until all N
// have arrived, then runs them in arrival order (deterministic races).
function mockFetch(rows = [], { fail, sync } = {}) {
  const calls = { emails: [], writes: [], reads: 0 }
  const gates = {}
  let seq = 0
  async function syncPoint(method) {
    const n = sync?.[method]
    if (!n) return
    const g = (gates[method] ||= { count: 0 })
    if (g.count >= n) return
    g.count++
    if (!g.done) g.done = new Promise((resolve) => { g.release = resolve })
    if (g.count === n) g.release()
    await g.done
  }
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url)
    if (u.hostname === 'api.airtable.com') await syncPoint(opts.method || 'GET')
    const ok = (data) => ({ ok: true, status: 200, json: async () => data })
    const bad = { ok: false, status: 500, json: async () => ({ error: { type: 'SERVER_ERROR' } }) }
    if (u.hostname === 'api.resend.com') {
      if (fail === 'resend') return bad
      calls.emails.push(JSON.parse(opts.body))
      return ok({ id: 'em_1' })
    }
    if (fail === 'airtable') return bad
    if (opts.method === 'GET' || !opts.method) {
      calls.reads++
      const m = /="(.*)"$/.exec(u.searchParams.get('filterByFormula'))
      const email = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      return ok({ records: rows.filter((r) => r.fields[F.email].toLowerCase() === email) })
    }
    if (opts.method === 'DELETE') {
      const id = decodeURIComponent(u.pathname.split('/').pop())
      calls.writes.push({ method: 'DELETE', id })
      rows.splice(rows.findIndex((x) => x.id === id), 1)
      return ok({ id, deleted: true })
    }
    const body = JSON.parse(opts.body)
    calls.writes.push({ method: opts.method, body })
    if (opts.method === 'POST') {
      seq++
      const rec = { id: `rec${rows.length + seq}`, createdTime: new Date(T0 + seq * 1000).toISOString(), fields: { ...body.records[0].fields } }
      rows.push(rec)
      return ok({ records: [rec] })
    }
    for (const r of body.records) Object.assign(rows.find((x) => x.id === r.id).fields, r.fields)
    return ok({ records: body.records })
  }
  return { fetchImpl, rows, calls }
}

// POSTs carry Content-Type: application/json like the site's fetch calls;
// pass `contentType` to send something else (null for none).
function call(handler, { method = 'GET', url = '/', body, cookie, ip, contentType } = {}) {
  return new Promise((resolve) => {
    const headers = {}
    const res = {
      statusCode: 200,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v },
      end: (b) => resolve({ status: res.statusCode, headers, raw: b || '', body: b ? (headers['content-type']?.includes('json') ? JSON.parse(b) : b) : '' })
    }
    const type = contentType !== undefined ? contentType : (method === 'POST' ? 'application/json' : null)
    const reqHeaders = { ...(type ? { 'content-type': type } : {}), ...(cookie ? { cookie } : {}), ...(ip ? { 'x-forwarded-for': ip } : {}) }
    Promise.resolve(handler({ method, url, body, headers: reqHeaders }, res))
  })
}

async function captureConsole(fn) {
  const lines = []
  const methods = ['log', 'info', 'warn', 'error', 'debug']
  const saved = methods.map((m) => console[m])
  methods.forEach((m) => { console[m] = (...args) => lines.push(args.map(String).join(' ')) })
  try { await fn() } finally { methods.forEach((m, i) => { console[m] = saved[i] }) }
  return lines.join('\n')
}

const cookieEmail = (setCookie) => {
  const token = /^ss_session=([^;]+);/.exec(setCookie)[1]
  return verifySession({ headers: { cookie: `${SESSION_COOKIE}=${token}` } }, { env: ENV })?.email
}
const resetLinkToken = (mail) => decodeURIComponent(/\/reset-password\?token=([^\s"<]+)/.exec(mail.text)[1])

describe('missing env fails closed', () => {
  for (const [name, make, req] of [
    ['subscribe', createSubscribeHandler, { method: 'POST', body: { name: 'A', email: 'a@b.co', password: PW } }],
    ['login', createLoginHandler, { method: 'POST', body: { email: 'a@b.co', password: PW } }],
    ['forgot', createForgotHandler, { method: 'POST', body: { email: 'a@b.co' } }],
    ['reset', createResetHandler, { method: 'POST', body: { token: 'x', password: PW } }],
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
  test('forgot needs the email settings; signup does not', async () => {
    const m = mockFetch()
    assert.equal((await call(createForgotHandler({ env: NO_MAIL_ENV, fetchImpl: m.fetchImpl }), { method: 'POST', body: { email: 'a@b.co' } })).status, 503)
    assert.equal((await call(createSubscribeHandler({ env: NO_MAIL_ENV, fetchImpl: m.fetchImpl }), { method: 'POST', body: { name: 'A', email: 'a@b.co', password: PW, ...AREA } })).status, 200)
  })
})

describe('validation + escaping', () => {
  test('newsletter defaults to checked; email lowercased; password kept exactly', () => {
    const v = validateSignup({ name: ' Ann ', email: ' Ann@Firm.COM ', password: '  spaced out  ', ...AREA })
    assert.equal(v.ok, true)
    assert.equal(v.value.newsletter, true)
    assert.equal(v.value.email, 'ann@firm.com')
    assert.equal(v.value.password, '  spaced out  ')
  })
  test('rejects bad email, long name, non-boolean newsletter, missing password', () => {
    const v = validateSignup({ name: 'x'.repeat(101), email: 'nope', newsletter: 'yes' })
    assert.deepEqual(Object.keys(v.fields).sort(), ['email', 'name', 'newsletter', 'password', 'state'])
  })
  test('password rules: 8+ characters, at most 72 bytes', () => {
    assert.match(validatePassword(undefined), /Enter a password/)
    assert.match(validatePassword(''), /Enter a password/)
    assert.match(validatePassword(12345678), /Enter a password/)
    assert.match(validatePassword('1234567'), /at least 8/)
    assert.equal(validatePassword('12345678'), '')
    assert.equal(validatePassword('é'.repeat(8)), '') // 8 characters, 16 bytes
    assert.equal(validatePassword('a'.repeat(72)), '')
    assert.match(validatePassword('a'.repeat(73)), /too long/)
    assert.match(validatePassword('\u{1F600}'.repeat(19)), /too long/) // 19 characters, 76 bytes
  })
  test('formula escaping', () => {
    assert.equal(escapeFormulaString('a"b\\c'), 'a\\"b\\\\c')
  })
})

describe('subscribe', () => {
  test('creates the account with a bcrypt hash, signs in, sends no email', async () => {
    const m = mockFetch()
    const h = createSubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => new Date(T0) })
    let r
    const logged = await captureConsole(async () => {
      r = await call(h, { method: 'POST', body: { name: 'Ann', email: 'Ann@Firm.com', password: PW, newsletter: false, state: 'TX', city: 'Houston' } })
    })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body, { ok: true, signedIn: true, newsletter: false })
    assert.equal(r.headers['cache-control'], 'no-store')
    assert.equal(m.calls.emails.length, 0)
    assert.equal(m.rows.length, 1)
    const f = m.rows[0].fields
    assert.equal(f[F.email], 'ann@firm.com')
    assert.match(f[F.passwordHash], /^\$2[aby]\$10\$/)
    assert.equal(await bcrypt.compare(PW, f[F.passwordHash]), true)
    assert.equal(f[F.passwordSetAt], new Date(T0).toISOString())
    assert.equal(f[F.signedUpAt], new Date(T0).toISOString())
    assert.equal(f[F.lastSignInAt], new Date(T0).toISOString())
    assert.equal(f[F.states], 'TX')
    assert.equal(f[F.city], 'Houston, TX')
    const written = JSON.stringify(m.calls.writes)
    assert.equal(written.includes(PW), false, 'plain password must never be stored')
    assert.match(r.headers['set-cookie'], /^ss_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/)
    assert.equal(cookieEmail(r.headers['set-cookie']), 'ann@firm.com')
    assert.equal(r.raw.includes('$2'), false)
    assert.equal(logged.includes(PW) || logged.includes('ann@firm.com'), false)
  })
  test('existing email -> 409, record untouched, no cookie (with or without a password)', async () => {
    const before = [
      { id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.name]: 'Ann', [F.passwordHash]: hashOf('original pw'), [F.newsletter]: false } },
      { id: 'rec2', fields: { [F.email]: 'old@firm.com', [F.name]: 'Old', [F.unsubscribed]: true, [F.unsubscribedAt]: '2026-01-01T00:00:00.000Z' } }
    ]
    const snapshot = JSON.stringify(before)
    const m = mockFetch(before)
    const h = createSubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl })
    for (const email of ['Ann@Firm.com', 'old@firm.com']) {
      const r = await call(h, { method: 'POST', body: { name: 'Mallory', email, password: 'attacker pw 123', newsletter: true, ...AREA } })
      assert.equal(r.status, 409)
      assert.deepEqual(r.body, { error: { code: 'account_exists', message: 'An account with this email already exists. Sign in, or use Forgot password to set a new one.' } })
      assert.equal(r.headers['set-cookie'], undefined)
    }
    assert.equal(m.calls.writes.length, 0)
    assert.equal(JSON.stringify(m.rows), snapshot)
    assert.equal(m.calls.emails.length, 0)
  })
  test('400 on short or over-72-byte password (nothing written), 405 on GET', async () => {
    const m = mockFetch()
    const h = createSubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl })
    for (const password of ['short', 'a'.repeat(73), '\u{1F600}'.repeat(19)]) {
      const r = await call(h, { method: 'POST', body: { name: 'Ann', email: 'ann@firm.com', password } })
      assert.equal(r.status, 400)
      assert.equal(r.body.error.code, 'invalid_fields')
      assert.ok(r.body.error.fields.password)
      assert.equal(r.raw.includes(password), false)
    }
    assert.equal((await call(h, { method: 'POST', body: { email: 'x' } })).status, 400)
    assert.equal((await call(h, { method: 'GET' })).status, 405)
    assert.equal(m.calls.writes.length, 0)
  })
  test('Airtable failure -> 502 and no cookie', async () => {
    const r = await call(createSubscribeHandler({ env: ENV, fetchImpl: mockFetch([], { fail: 'airtable' }).fetchImpl }), { method: 'POST', body: { name: 'Ann', email: 'ann@firm.com', password: PW, ...AREA } })
    assert.equal(r.status, 502)
    assert.equal(r.headers['set-cookie'], undefined)
  })
})

describe('login', () => {
  const rows = () => [
    { id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.passwordHash]: hashOf(PW) } },
    { id: 'rec2', fields: { [F.email]: 'legacy@firm.com' } },
    { id: 'rec3', fields: { [F.email]: 'gone@firm.com', [F.passwordHash]: hashOf(PW), [F.unsubscribed]: true } }
  ]
  test('correct password signs in and records the time', async () => {
    const m = mockFetch(rows())
    const h = createLoginHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 })
    const r = await call(h, { method: 'POST', body: { email: ' Ann@Firm.com ', password: PW } })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body, { ok: true, signedIn: true })
    assert.equal(r.headers['cache-control'], 'no-store')
    assert.equal(cookieEmail(r.headers['set-cookie']), 'ann@firm.com')
    assert.equal(m.rows[0].fields[F.lastSignInAt], new Date(T0).toISOString())
    assert.equal(r.raw.includes('$2'), false)
  })
  test('unsubscribed readers can still sign in', async () => {
    const r = await call(createLoginHandler({ env: ENV, fetchImpl: mockFetch(rows()).fetchImpl }), { method: 'POST', body: { email: 'gone@firm.com', password: PW } })
    assert.equal(r.status, 200)
  })
  test('wrong password, unknown email and no password yet get the same 401', async () => {
    const m = mockFetch(rows())
    const h = createLoginHandler({ env: ENV, fetchImpl: m.fetchImpl })
    const bodies = []
    for (const body of [
      { email: 'ann@firm.com', password: 'wrong password' },
      { email: 'nobody@firm.com', password: PW },
      { email: 'legacy@firm.com', password: PW },
      { email: 'ann@firm.com', password: `${PW}${'x'.repeat(80)}` },
      { email: 'not-an-email', password: PW },
      { email: 'ann@firm.com' }
    ]) {
      const r = await call(h, { method: 'POST', body })
      assert.equal(r.status, 401, JSON.stringify(body))
      assert.equal(r.headers['set-cookie'], undefined)
      bodies.push(r.raw)
    }
    assert.equal(new Set(bodies).size, 1)
    assert.deepEqual(JSON.parse(bodies[0]), { error: { code: 'invalid_credentials', message: 'Email or password is incorrect.' } })
    assert.equal(m.calls.writes.length, 0)
  })
  test('no account still runs a full-cost bcrypt compare (dummy hash)', async () => {
    const real = bcrypt.hashSync(PW, 10)
    const time = async (fn) => { const t = process.hrtime.bigint(); await fn(); return Number(process.hrtime.bigint() - t) / 1e6 }
    const wrong = await time(() => checkPassword('wrong password', real))
    const none = await time(() => checkPassword(PW, undefined))
    const junk = await time(() => checkPassword(PW, 'not-a-hash'))
    assert.equal(await checkPassword(PW, undefined), false)
    assert.equal(await checkPassword(PW, real), true)
    assert.ok(none > wrong * 0.3 && junk > wrong * 0.3, `dummy compare too fast: ${none}ms / ${junk}ms vs ${wrong}ms`)
  })
  test('Airtable failure -> 502; rate limited after 10 tries', async () => {
    const r = await call(createLoginHandler({ env: ENV, fetchImpl: mockFetch([], { fail: 'airtable' }).fetchImpl }), { method: 'POST', body: { email: 'ann@firm.com', password: PW } })
    assert.equal(r.status, 502)
    _resetRateLimits()
    const h = createLoginHandler({ env: ENV, fetchImpl: mockFetch(rows()).fetchImpl })
    for (let i = 0; i < 10; i++) assert.equal((await call(h, { method: 'POST', ip: '7.7.7.7', body: { email: 'x' } })).status, 401)
    assert.equal((await call(h, { method: 'POST', ip: '7.7.7.7', body: { email: 'ann@firm.com', password: PW } })).status, 429)
    assert.equal((await call(h, { method: 'GET' })).status, 405)
  })
})

describe('forgot password', () => {
  const MSG = { ok: true, message: 'If that email has an account, a password reset link is on its way.' }
  test('same answer either way; email only when the account exists', async () => {
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.passwordHash]: hashOf(PW) } }])
    const h = createForgotHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 })
    const unknown = await call(h, { method: 'POST', body: { email: 'who@x.com' } })
    assert.equal(unknown.status, 200)
    assert.deepEqual(unknown.body, MSG)
    assert.equal(m.calls.emails.length, 0)
    const known = await call(h, { method: 'POST', body: { email: 'Ann@Firm.com' } })
    assert.equal(known.raw, unknown.raw)
    assert.equal(known.headers['cache-control'], 'no-store')
    assert.equal(m.calls.emails.length, 1)
    const mail = m.calls.emails[0]
    assert.deepEqual(mail.to, ['ann@firm.com'])
    assert.equal(mail.subject, 'Reset your Staffing Signal password')
    assert.match(mail.text, /https:\/\/signal\.example\/reset-password\?token=/)
    assert.match(mail.html, /https:\/\/signal\.example\/reset-password\?token=/)
    assert.match(mail.text, /works once, for 60 minutes/)
    assert.ok(mail.headers['List-Unsubscribe'])
    assert.match(mail.text, /Unsubscribe: https:\/\/signal\.example\/api\/unsubscribe\?token=/)
    assert.equal(JSON.stringify(mail).includes('$2'), false)
    const payload = verifyToken(resetLinkToken(mail), SECRET, { purpose: 'reset', now: T0 })
    assert.equal(payload.email, 'ann@firm.com')
    assert.equal(payload.iat, T0)
    assert.equal(payload.exp, T0 + 60 * 60 * 1000)
    assert.equal(m.calls.writes.length, 0)
  })
  test('Resend failure -> 502 email_failed; bad email -> 400; rate limited after 5', async () => {
    const rows = [{ id: 'rec1', fields: { [F.email]: 'ann@firm.com' } }]
    const r = await call(createForgotHandler({ env: ENV, fetchImpl: mockFetch(rows, { fail: 'resend' }).fetchImpl }), { method: 'POST', body: { email: 'ann@firm.com' } })
    assert.equal(r.status, 502)
    assert.equal(r.body.error.code, 'email_failed')
    _resetRateLimits()
    const h = createForgotHandler({ env: ENV, fetchImpl: mockFetch(rows).fetchImpl })
    assert.equal((await call(h, { method: 'POST', body: { email: 'nope' } })).status, 400)
    for (let i = 0; i < 4; i++) assert.equal((await call(h, { method: 'POST', body: { email: 'who@x.com' } })).status, 200)
    assert.equal((await call(h, { method: 'POST', body: { email: 'who@x.com' } })).status, 429)
  })
})

describe('reset password', () => {
  const NEW_PW = 'brand new password'
  async function issue(rows, at = T0) {
    const m = mockFetch(rows)
    await call(createForgotHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => at }), { method: 'POST', body: { email: rows[0].fields[F.email] } })
    return { m, token: resetLinkToken(m.calls.emails[0]) }
  }
  test('sets the hash, verifies the email, signs in; the link then stops working', async () => {
    const { m, token } = await issue([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.passwordHash]: hashOf(PW), [F.passwordSetAt]: new Date(T0 - 86400000).toISOString() } }])
    const h = createResetHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 + 60_000 })
    let r
    const logged = await captureConsole(async () => { r = await call(h, { method: 'POST', body: { token, password: NEW_PW } }) })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body, { ok: true, signedIn: true })
    assert.equal(r.headers['cache-control'], 'no-store')
    assert.equal(cookieEmail(r.headers['set-cookie']), 'ann@firm.com')
    const f = m.rows[0].fields
    assert.equal(await bcrypt.compare(NEW_PW, f[F.passwordHash]), true)
    assert.equal(f[F.passwordSetAt], new Date(T0 + 60_000).toISOString())
    assert.equal(f[F.lastSignInAt], new Date(T0 + 60_000).toISOString())
    assert.equal(f[F.verified], true)
    assert.equal(JSON.stringify(m.calls.writes).includes(NEW_PW), false)
    assert.equal(r.raw.includes('$2'), false)
    assert.equal(logged, '')
    // Old password out, new password in.
    const login = createLoginHandler({ env: ENV, fetchImpl: m.fetchImpl })
    assert.equal((await call(login, { method: 'POST', body: { email: 'ann@firm.com', password: PW } })).status, 401)
    assert.equal((await call(login, { method: 'POST', body: { email: 'ann@firm.com', password: NEW_PW } })).status, 200)
    // Single use.
    const again = await call(h, { method: 'POST', body: { token, password: 'another password' } })
    assert.equal(again.status, 400)
    assert.equal(again.body.error.code, 'link_used')
    assert.equal(again.headers['set-cookie'], undefined)
    assert.equal(await bcrypt.compare(NEW_PW, m.rows[0].fields[F.passwordHash]), true)
  })
  test('readers who joined before passwords can set one', async () => {
    const { m, token } = await issue([{ id: 'rec1', fields: { [F.email]: 'legacy@firm.com', [F.verified]: true } }])
    const r = await call(createResetHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 + 1000 }), { method: 'POST', body: { token, password: NEW_PW } })
    assert.equal(r.status, 200)
    assert.equal(await bcrypt.compare(NEW_PW, m.rows[0].fields[F.passwordHash]), true)
  })
  test('link_used when a password was set at or after the link was issued', async () => {
    const hash = hashOf(PW)
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.passwordHash]: hash, [F.passwordSetAt]: new Date(T0).toISOString() } }])
    const token = resetToken('ann@firm.com', SECRET, { now: T0, h: passwordFingerprint(hash, SECRET) })
    const r = await call(createResetHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 + 1000 }), { method: 'POST', body: { token, password: NEW_PW } })
    assert.equal(r.status, 400)
    assert.equal(r.body.error.code, 'link_used')
    assert.equal(m.calls.writes.length, 0)
  })
  test('link_used when the hash changed even if the timestamp lags (e.g. rounded)', async () => {
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.passwordHash]: hashOf('newer'), [F.passwordSetAt]: new Date(T0 - 5000).toISOString() } }])
    const token = resetToken('ann@firm.com', SECRET, { now: T0, h: passwordFingerprint(hashOf('older'), SECRET) })
    const r = await call(createResetHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 + 1000 }), { method: 'POST', body: { token, password: NEW_PW } })
    assert.equal(r.body.error.code, 'link_used')
  })
  test('expired, forged, wrong-purpose and unknown-account links -> link_expired', async () => {
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com' } }])
    const h = createResetHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 + RESET_TTL_MS + 1 })
    const fp = passwordFingerprint('', SECRET)
    for (const token of [
      resetToken('ann@firm.com', SECRET, { now: T0, h: fp }),
      resetToken('ann@firm.com', 'other'.padEnd(40, 'y'), { now: T0 + RESET_TTL_MS, h: fp }),
      unsubscribeToken('ann@firm.com', SECRET),
      sessionToken('ann@firm.com', SECRET, T0 + RESET_TTL_MS),
      resetToken('nobody@firm.com', SECRET, { now: T0 + RESET_TTL_MS, h: fp }),
      'garbage',
      undefined
    ]) {
      const r = await call(h, { method: 'POST', body: { token, password: NEW_PW } })
      assert.equal(r.status, 400)
      assert.equal(r.body.error.code, 'link_expired')
      assert.equal(r.headers['set-cookie'], undefined)
    }
    assert.equal(m.calls.writes.length, 0)
  })
  test('weak password with a good link -> 400 invalid_fields and the link still works', async () => {
    const { m, token } = await issue([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com' } }])
    const h = createResetHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 + 1000 })
    const r = await call(h, { method: 'POST', body: { token, password: 'short' } })
    assert.equal(r.status, 400)
    assert.ok(r.body.error.fields.password)
    assert.equal(m.calls.writes.length, 0)
    assert.equal((await call(h, { method: 'POST', body: { token, password: NEW_PW } })).status, 200)
  })
})

describe('logout', () => {
  test('clears the session cookie (no config needed); POST only', async () => {
    const h = createLogoutHandler()
    const r = await call(h, { method: 'POST' })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body, { ok: true })
    assert.equal(r.headers['set-cookie'], CLEAR)
    assert.equal(r.headers['cache-control'], 'no-store')
    assert.equal((await call(h, { method: 'GET' })).status, 405)
  })
})

describe('session', () => {
  test('verifySession accepts a valid cookie, rejects tampering, wrong purpose and missing secret', () => {
    const tok = sessionToken('ann@firm.com', SECRET)
    const req = { headers: { cookie: `a=1; ${SESSION_COOKIE}=${tok}` } }
    // A token with no password fingerprint counts as "no password set".
    assert.deepEqual(verifySession(req, { env: ENV }), { email: 'ann@firm.com', h: passwordFingerprint('', SECRET) })
    const bound = sessionToken('ann@firm.com', SECRET, Date.now(), passwordFingerprint('$2b$x', SECRET))
    assert.deepEqual(verifySession({ headers: { cookie: `${SESSION_COOKIE}=${bound}` } }, { env: ENV }), { email: 'ann@firm.com', h: passwordFingerprint('$2b$x', SECRET) })
    assert.equal(verifySession({ headers: { cookie: `${SESSION_COOKIE}=${tok}x` } }, { env: ENV }), null)
    assert.equal(verifySession(req, { env: {} }), null)
    const reset = resetToken('ann@firm.com', SECRET)
    assert.equal(verifySession({ headers: { cookie: `${SESSION_COOKIE}=${reset}` } }, { env: ENV }), null)
    assert.equal(verifyToken(reset, SECRET, { purpose: 'session' }), null)
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

describe('sessions follow the password', () => {
  test('a reset ends older sessions for account changes (signup with another person’s email)', async () => {
    const m = mockFetch()
    const squat = await call(createSubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => new Date(T0) }), { method: 'POST', body: { name: 'Squatter', email: 'Victim@Corp.com', password: 'squatter pw 1', ...AREA } })
    assert.equal(squat.status, 200)
    const squatCookie = squat.headers['set-cookie'].split(';')[0]
    const prefs = createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl })
    assert.equal((await call(prefs, { method: 'POST', cookie: squatCookie, body: { newsletter: true } })).status, 200)
    // The real owner takes the address back with Forgot password.
    await call(createForgotHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 + 1000 }), { method: 'POST', body: { email: 'victim@corp.com' } })
    const reset = await call(createResetHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 + 2000 }), { method: 'POST', body: { token: resetLinkToken(m.calls.emails[0]), password: 'owner new password' } })
    assert.equal(reset.status, 200)
    const writes = m.calls.writes.length
    const stale = await call(prefs, { method: 'POST', cookie: squatCookie, body: { newsletter: false } })
    assert.equal(stale.status, 401)
    assert.equal(stale.body.error.code, 'sign_in_required')
    assert.equal(m.calls.writes.length, writes, 'stale session must not write')
    assert.equal(m.rows[0].fields[F.newsletter], true)
    const fresh = await call(prefs, { method: 'POST', cookie: reset.headers['set-cookie'].split(';')[0], body: { newsletter: false } })
    assert.equal(fresh.status, 200)
    assert.equal(m.rows[0].fields[F.newsletter], false)
    const login = createLoginHandler({ env: ENV, fetchImpl: m.fetchImpl })
    assert.equal((await call(login, { method: 'POST', body: { email: 'victim@corp.com', password: 'squatter pw 1' } })).status, 401)
    const back = await call(login, { method: 'POST', body: { email: 'victim@corp.com', password: 'owner new password' } })
    assert.equal(back.status, 200)
    assert.equal((await call(prefs, { method: 'POST', cookie: back.headers['set-cookie'].split(';')[0], body: { newsletter: true } })).status, 200)
  })
  test('sessions from before passwords (no fingerprint) work until a password is set', async () => {
    const legacy = `${SESSION_COOKIE}=${sessionToken('ann@firm.com', SECRET)}`
    const noPw = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com' } }])
    assert.equal((await call(createPreferencesHandler({ env: ENV, fetchImpl: noPw.fetchImpl }), { method: 'POST', cookie: legacy, body: { newsletter: false } })).status, 200)
    const withPw = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.passwordHash]: hashOf(PW) } }])
    assert.equal((await call(createPreferencesHandler({ env: ENV, fetchImpl: withPw.fetchImpl }), { method: 'POST', cookie: legacy, body: { newsletter: false } })).status, 401)
    assert.equal(withPw.calls.writes.length, 0)
  })
})

describe('races', () => {
  test('two signups for one email at the same moment: one account, one 409', async () => {
    const m = mockFetch([], { sync: { GET: 2, POST: 2 } })
    const h = createSubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl })
    const [a, b] = await Promise.all([
      call(h, { method: 'POST', ip: '1.1.1.1', body: { name: 'A', email: 'race@corp.com', password: 'password A 1', ...AREA } }),
      call(h, { method: 'POST', ip: '2.2.2.2', body: { name: 'B', email: 'race@corp.com', password: 'password B 2', ...AREA } })
    ])
    const won = [a, b].filter((r) => r.status === 200)
    const lost = [a, b].filter((r) => r.status === 409)
    assert.equal(won.length, 1)
    assert.equal(lost.length, 1)
    assert.ok(won[0].headers['set-cookie'])
    assert.equal(lost[0].headers['set-cookie'], undefined)
    assert.equal(lost[0].body.error.code, 'account_exists')
    assert.equal(m.rows.length, 1)
    const winnerPw = won[0] === a ? 'password A 1' : 'password B 2'
    const login = createLoginHandler({ env: ENV, fetchImpl: mockFetch(m.rows).fetchImpl })
    assert.equal((await call(login, { method: 'POST', body: { email: 'race@corp.com', password: winnerPw } })).status, 200)
  })
  test('one reset link sent twice at the same moment: only one request signs in', async () => {
    const rows = [{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.passwordHash]: hashOf(PW), [F.passwordSetAt]: new Date(T0 - 86400000).toISOString() } }]
    const issue = mockFetch(rows)
    await call(createForgotHandler({ env: ENV, fetchImpl: issue.fetchImpl, now: () => T0 }), { method: 'POST', body: { email: 'ann@firm.com' } })
    const token = resetLinkToken(issue.calls.emails[0])
    const m = mockFetch(rows, { sync: { GET: 2, PATCH: 2 } })
    const h = createResetHandler({ env: ENV, fetchImpl: m.fetchImpl, now: () => T0 + 60_000 })
    const out = await Promise.all([
      call(h, { method: 'POST', ip: '1.1.1.1', body: { token, password: 'first new password' } }),
      call(h, { method: 'POST', ip: '2.2.2.2', body: { token, password: 'second new password' } })
    ])
    const ok = out.filter((r) => r.status === 200)
    const used = out.filter((r) => r.status === 400)
    assert.equal(ok.length, 1)
    assert.equal(used.length, 1)
    assert.equal(used[0].body.error.code, 'link_used')
    assert.equal(used[0].headers['set-cookie'], undefined)
    // The request that signed in is the one whose password is stored.
    const winner = out.indexOf(ok[0]) === 0 ? 'first new password' : 'second new password'
    assert.equal(await bcrypt.compare(winner, rows[0].fields[F.passwordHash]), true)
  })
})

describe('request hygiene', () => {
  test('auth POSTs must be JSON (stops cross-site form posts): 415, no cookie, nothing read', async () => {
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.passwordHash]: hashOf(PW) } }])
    const handlers = {
      subscribe: [createSubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl }), { name: 'A', email: 'new@corp.com', password: PW, ...AREA }],
      login: [createLoginHandler({ env: ENV, fetchImpl: m.fetchImpl }), { email: 'ann@firm.com', password: PW }],
      forgot: [createForgotHandler({ env: ENV, fetchImpl: m.fetchImpl }), { email: 'ann@firm.com' }],
      reset: [createResetHandler({ env: ENV, fetchImpl: m.fetchImpl }), { token: 'x', password: PW }],
      logout: [createLogoutHandler(), {}]
    }
    for (const [name, [h, body]] of Object.entries(handlers)) {
      for (const contentType of [null, 'application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x']) {
        const r = await call(h, { method: 'POST', body, contentType })
        assert.equal(r.status, 415, `${name} ${contentType}`)
        assert.equal(r.body.error.code, 'unsupported_media_type')
        assert.equal(r.headers['set-cookie'], undefined, name)
        assert.equal(r.headers['cache-control'], 'no-store')
      }
    }
    assert.equal(m.calls.reads + m.calls.writes.length + m.calls.emails.length, 0)
    const ok = await call(handlers.login[0], { method: 'POST', body: handlers.login[1], contentType: 'application/json; charset=utf-8' })
    assert.equal(ok.status, 200)
  })
  test('429s are JSON { error }, no-store', async () => {
    const h = createLoginHandler({ env: ENV, fetchImpl: mockFetch().fetchImpl })
    for (let i = 0; i < 10; i++) await call(h, { method: 'POST', ip: '8.8.8.8', body: { email: 'x' } })
    const r = await call(h, { method: 'POST', ip: '8.8.8.8', body: { email: 'x' } })
    assert.equal(r.status, 429)
    assert.equal(r.headers['cache-control'], 'no-store')
    assert.deepEqual(r.body, { error: { code: 'rate_limited', message: 'Too many attempts. Please wait a few minutes and try again.' } })
    const f = createForgotHandler({ env: ENV, fetchImpl: mockFetch().fetchImpl })
    for (let i = 0; i < 5; i++) await call(f, { method: 'POST', ip: '8.8.4.4', body: { email: 'who@x.com' } })
    const g = await call(f, { method: 'POST', ip: '8.8.4.4', body: { email: 'who@x.com' } })
    assert.equal(g.status, 429)
    assert.equal(g.body.error.code, 'rate_limited')
    assert.equal(g.headers['cache-control'], 'no-store')
  })
  test('login is also limited per email (20 an hour), across IPs', async () => {
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.passwordHash]: hashOf(PW) } }])
    const h = createLoginHandler({ env: ENV, fetchImpl: m.fetchImpl })
    for (let i = 0; i < 20; i++) {
      const email = i % 2 ? 'ann@firm.com' : ' ANN@firm.com '
      assert.equal((await call(h, { method: 'POST', ip: `10.0.0.${i}`, body: { email, password: `guess ${i} wrong` } })).status, 401)
    }
    const r = await call(h, { method: 'POST', ip: '10.0.1.1', body: { email: 'ann@firm.com', password: PW } })
    assert.equal(r.status, 429)
    assert.equal(r.headers['set-cookie'], undefined)
    // Other accounts are not affected.
    assert.equal((await call(h, { method: 'POST', ip: '10.0.1.2', body: { email: 'bob@firm.com', password: PW } })).status, 401)
  })
})
