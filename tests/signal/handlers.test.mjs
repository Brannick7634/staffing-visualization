import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import jwt from 'jsonwebtoken'

// auth.js reads SESSION_SECRET at import time, so set a test-only secret
// before loading the production entrypoints dynamically.
const TEST_SECRET = 'signal-handlers-test-secret-not-real'
process.env.SESSION_SECRET = TEST_SECRET

const { default: productionSnapshot } = await import('../../api/_lib/routes/signal-snapshot.js')
const { default: productionPay } = await import('../../api/_lib/routes/signal-pay.js')
const { sessionAccess } = await import('../../api/_lib/signal/sessionAccess.js')
const { createSnapshotHandler, createPayHandler, validatePaySelection } = await import('../../api/_lib/signal/handlers.js')
const { createFixtureAdapter } = await import('../../dev/signal/fixtureAdapter.js')
const { devAccess, parseCookies } = await import('../../dev/signal/devAccess.js')
const devEndpoints = await import('../../dev/signal/devEndpoints.js')
const plugin = await import('../../dev/signal/vitePlugin.js')

const FEED_UNAVAILABLE = {
  contractVersion: 'signal-preview-1',
  error: { code: 'feed_unavailable', message: 'Market data is not connected yet.' }
}
const DEV_COOKIE = 'ssp_sim_access=authorized'

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    getHeader(name) { return this.headers[name.toLowerCase()] },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this }
  }
}

function fakeReq({ method = 'GET', query = {}, headers = {}, body } = {}) {
  return { method, query, headers, body }
}

async function call(handler, reqInit) {
  const res = fakeRes()
  await handler(fakeReq(reqInit), res)
  return res
}

function assertNoStore(res) {
  assert.equal(res.headers['cache-control'], 'private, no-store')
  assert.equal(res.headers.vary, 'Authorization, Cookie')
}

// Capture every console call made while fn runs.
async function captureConsole(fn) {
  const lines = []
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace']
  const saved = methods.map((m) => console[m])
  methods.forEach((m) => { console[m] = (...args) => lines.push(args.map(String).join(' ')) })
  try {
    await fn()
  } finally {
    methods.forEach((m, i) => { console[m] = saved[i] })
  }
  return lines.join('\n')
}

const validToken = () => jwt.sign({ email: 'someone@example.com' }, TEST_SECRET, { expiresIn: '5m' })

const devAdapter = createFixtureAdapter()
const devSnapshot = createSnapshotHandler({ adapter: devAdapter, resolveAccess: devAccess })
const devPay = createPayHandler({ adapter: devAdapter, resolveAccess: devAccess })

describe('production entrypoints fail closed', () => {
  test('snapshot returns 503 feed_unavailable and nothing else', async () => {
    const res = await call(productionSnapshot)
    assert.equal(res.statusCode, 503)
    assert.deepEqual(res.body, FEED_UNAVAILABLE)
    assertNoStore(res)
  })

  test('snapshot ignores the dev cookie and a valid session still gets no data', async () => {
    for (const headers of [{ cookie: DEV_COOKIE }, { authorization: `Bearer ${validToken()}`, cookie: DEV_COOKIE }]) {
      const res = await call(productionSnapshot, { headers })
      assert.equal(res.statusCode, 503)
      assert.deepEqual(res.body, FEED_UNAVAILABLE)
    }
  })

  test('pay returns 503 for a valid selection, with or without the dev cookie', async () => {
    for (const headers of [{}, { cookie: DEV_COOKIE }, { authorization: `Bearer ${validToken()}` }]) {
      const res = await call(productionPay, { query: { role: 'forklift-operator', state: 'TX', city: 'TX:houston' }, headers })
      assert.equal(res.statusCode, 503)
      assert.deepEqual(res.body, FEED_UNAVAILABLE)
      assertNoStore(res)
    }
  })

  test('pay still validates input first', async () => {
    const res = await call(productionPay, { query: { role: 'not-a-role' } })
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.error.code, 'invalid_selection')
    assert.equal(res.body.error.field, 'role')
    assertNoStore(res)
  })

  test('pay is limited per IP (60 per 10 minutes) so places cannot be stepped through quickly', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.77' }
    const codes = []
    for (let i = 0; i < 61; i++) codes.push((await call(productionPay, { query: { role: 'not-a-role' }, headers })).statusCode)
    assert.equal(codes.filter((code) => code === 400).length, 60)
    const limited = await call(productionPay, { query: { role: 'forklift-operator' }, headers })
    assert.equal(codes[60], 429)
    assert.equal(limited.statusCode, 429)
    assert.equal(limited.body.error.code, 'rate_limited')
    assert.match(limited.headers['cache-control'], /no-store/)
    // Another visitor is unaffected.
    assert.equal((await call(productionPay, { query: { role: 'not-a-role' }, headers: { 'x-forwarded-for': '203.0.113.78' } })).statusCode, 400)
  })

  test('non-GET methods are refused', async () => {
    for (const handler of [productionSnapshot, productionPay]) {
      const res = await call(handler, { method: 'POST', query: { role: 'forklift-operator' } })
      assert.equal(res.statusCode, 405)
      assertNoStore(res)
    }
  })
})

describe('production session access', () => {
  test('only a valid Bearer session is authorized; cookies are ignored', () => {
    assert.deepEqual(sessionAccess(fakeReq()), { access: 'public', simulated: false })
    assert.deepEqual(sessionAccess(fakeReq({ headers: { cookie: DEV_COOKIE } })), { access: 'public', simulated: false })
    assert.deepEqual(sessionAccess(fakeReq({ headers: { authorization: 'Bearer not-a-jwt' } })), { access: 'public', simulated: false })
    const forged = jwt.sign({ email: 'x@example.com' }, 'some-other-secret')
    assert.equal(sessionAccess(fakeReq({ headers: { authorization: `Bearer ${forged}` } })).access, 'public')
    assert.equal(sessionAccess(fakeReq({ headers: { authorization: validToken() } })).access, 'public')
    assert.deepEqual(sessionAccess(fakeReq({ headers: { authorization: `Bearer ${validToken()}` } })), { access: 'authorized', simulated: false })
  })
})

describe('handlers with the development adapter', () => {
  test('snapshot: signed out vs simulated signed in', async () => {
    const pub = await call(devSnapshot)
    assert.equal(pub.statusCode, 200)
    assertNoStore(pub)
    assert.deepEqual(pub.body.viewer, { access: 'public', simulated: true })
    assert.equal(pub.body.cities.rows.length, 3)
    const auth = await call(devSnapshot, { headers: { cookie: `other=1; ${DEV_COOKIE}` } })
    assert.deepEqual(auth.body.viewer, { access: 'authorized', simulated: true })
    assert.equal(auth.body.cities.rows.length, 8)
    assert.equal(auth.body.momentum.cooling.rows.length, 3)
  })

  test('only the exact cookie value grants simulated access', async () => {
    for (const cookie of ['ssp_sim_access=AUTHORIZED', 'ssp_sim_access=authorized2', 'x_ssp_sim_access=authorized', 'ssp_sim_access=public']) {
      const res = await call(devSnapshot, { headers: { cookie } })
      assert.equal(res.body.viewer.access, 'public', cookie)
    }
    assert.equal(parseCookies('a=1; b=2').b, '2')
  })

  test('pay rejects unknown or inconsistent selections with 400', async () => {
    const cases = [
      [{}, 'role'],
      [{ role: 'not-a-role' }, 'role'],
      [{ role: '' }, 'role'],
      [{ role: ['forklift-operator', 'software-engineer'] }, 'role'],
      [{ role: 'forklift-operator', state: 'ZZ' }, 'state'],
      [{ role: 'forklift-operator', state: 'tx' }, 'state'],
      [{ role: 'forklift-operator', state: ['TX', 'CA'] }, 'state'],
      [{ role: 'forklift-operator', city: 'TX:houston' }, 'city'],
      [{ role: 'forklift-operator', state: 'CA', city: 'TX:houston' }, 'city'],
      [{ role: 'forklift-operator', state: 'TX', city: 'TX:nowhere' }, 'city'],
      [{ role: 'forklift-operator', state: 'TX', city: 'x'.repeat(65) }, 'city'],
      [{ role: '__proto__' }, 'role']
    ]
    for (const [query, field] of cases) {
      const res = await call(devPay, { query })
      assert.equal(res.statusCode, 400, JSON.stringify(query))
      assert.equal(res.body.error.code, 'invalid_selection')
      assert.equal(res.body.error.field, field, JSON.stringify(query))
      assertNoStore(res)
    }
  })

  test('validatePaySelection accepts nationwide, state and city selections', () => {
    assert.deepEqual(validatePaySelection({ role: 'forklift-operator' }).selection, { roleKey: 'forklift-operator', state: null, city: null })
    assert.deepEqual(validatePaySelection({ role: 'forklift-operator', state: 'TX', city: 'TX:houston' }).selection, { roleKey: 'forklift-operator', state: 'TX', city: 'TX:houston' })
  })

  test('a rate parameter is ignored and never logged', async () => {
    const query = { role: 'forklift-operator', state: 'TX', city: 'TX:houston' }
    const rate = '1234.56'
    let withRate
    const logged = await captureConsole(async () => {
      withRate = await call(devPay, { query: { ...query, rate } })
    })
    const without = await call(devPay, { query })
    assert.equal(withRate.statusCode, 200)
    assert.deepEqual(withRate.body, without.body)
    assert.equal(JSON.stringify(withRate.body).includes(rate), false)
    assert.doesNotMatch(JSON.stringify(withRate.body), /"rate"\s*:/)
    assert.equal(logged.includes(rate), false)
  })

  test('signed-out Houston has no figures and no gate', async () => {
    const res = await call(devPay, { query: { role: 'forklift-operator', state: 'TX', city: 'TX:houston' } })
    assert.equal(res.body.result.coverage, 'not_yet_available')
    assert.equal(res.body.result.access, 'public')
    assert.equal('typicalCents' in res.body.result, false)
    assert.equal(res.body.national.typicalCents, 1850)
  })
})

describe('failures are generic', () => {
  test('an adapter that throws yields 503 without internal details', async () => {
    const adapter = { dataMode: 'development_example', async load() { throw new Error('SECRET-PATH C:\\internal\\db password=hunter2') } }
    const handler = createSnapshotHandler({ adapter, resolveAccess: devAccess })
    let res
    const logged = await captureConsole(async () => { res = await call(handler) })
    assert.equal(res.statusCode, 503)
    assert.deepEqual(res.body, FEED_UNAVAILABLE)
    assert.equal(logged.includes('SECRET'), false)
    assert.equal(logged.includes('hunter2'), false)
  })

  test('a builder failure yields a generic 500', async () => {
    const places = { get sectors() { throw new Error('SECRET-BUILD-DETAIL') }, roles: [], role: () => null, state: () => null, city: () => null }
    const handler = createSnapshotHandler({ adapter: devAdapter, resolveAccess: devAccess, places })
    let res
    const logged = await captureConsole(async () => { res = await call(handler) })
    assert.equal(res.statusCode, 500)
    assert.deepEqual(res.body, { contractVersion: 'signal-preview-1', error: { code: 'internal_error', message: 'Something went wrong loading market data.' } })
    assert.equal(logged.includes('SECRET'), false)
    assertNoStore(res)
  })

  test('an access resolver that throws falls back to public', async () => {
    const handler = createSnapshotHandler({ adapter: devAdapter, resolveAccess: () => { throw new Error('nope') } })
    const res = await call(handler)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.viewer.access, 'public')
    assert.equal(res.body.cities.rows.length, 3)
  })
})

describe('dev-only endpoints', () => {
  test('dev/access sets and clears the simulated cookie', async () => {
    const handler = devEndpoints.createDevAccessHandler()
    const on = await call(handler, { method: 'POST', body: { access: 'authorized' } })
    assert.equal(on.statusCode, 200)
    assert.deepEqual(on.body, { simulated: true, access: 'authorized' })
    assert.equal(on.headers['set-cookie'], 'ssp_sim_access=authorized; Path=/; HttpOnly; SameSite=Lax')
    const off = await call(handler, { method: 'POST', body: { access: 'public' } })
    assert.match(off.headers['set-cookie'], /^ssp_sim_access=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0$/)
    const bad = await call(handler, { method: 'POST', body: { access: 'admin' } })
    assert.equal(bad.statusCode, 400)
    assert.equal(bad.headers['set-cookie'], undefined)
    assert.equal((await call(handler, { method: 'GET' })).statusCode, 405)
  })

  test('dev/signup validates, signs in, refuses a second signup for the same email and never echoes or logs PII', async () => {
    const store = devEndpoints.createDevAccountStore()
    const handler = devEndpoints.createDevSignupHandler(store)
    const PW = 'dev password 1'
    const invalid = [
      [{ name: '', email: 'a@b.co', password: PW }, 'name'],
      [{ name: '   ', email: 'a@b.co', password: PW }, 'name'],
      [{ name: 'x'.repeat(101), email: 'a@b.co', password: PW }, 'name'],
      [{ name: 'Pat', email: 'not-an-email', password: PW }, 'email'],
      [{ name: 'Pat', email: 'pat@example.c', password: PW }, 'email'],
      [{ name: 'Pat', email: `${'a'.repeat(250)}@b.co`, password: PW }, 'email'],
      [{ name: 'Pat', email: 'pat@example.com', password: PW, newsletter: 'yes' }, 'newsletter'],
      [{ name: 'Pat', email: 'pat@example.com' }, 'password'],
      [{ name: 'Pat', email: 'pat@example.com', password: 'short' }, 'password'],
      [{ name: 'Pat', email: 'pat@example.com', password: 'a'.repeat(73) }, 'password'],
      // State + city are required, with the production rules (tests/subscribers/area.test.mjs).
      [{ name: 'Pat', email: 'pat@example.com', password: PW }, 'state'],
      [{ name: 'Pat', email: 'pat@example.com', password: PW, state: 'TX' }, 'city']
    ]
    for (const [body, field] of invalid) {
      const res = await call(handler, { method: 'POST', body })
      assert.equal(res.statusCode, 400, JSON.stringify(body))
      assert.ok(field in res.body.error.fields, field)
      assert.equal(res.headers['set-cookie'], undefined)
    }
    let first, again, other
    const logged = await captureConsole(async () => {
      first = await call(handler, { method: 'POST', body: { name: 'Pat Example', email: ' Pat@Example.com ', password: PW, newsletter: true, state: 'TX', city: 'TX:houston', context: { roleKey: 'forklift-operator', state: 'TX', city: 'TX:houston' } } })
      again = await call(handler, { method: 'POST', body: { name: 'Pat', email: 'pat@example.com', password: 'other password', newsletter: false, state: 'TX', city: 'Houston' } })
      other = await call(handler, { method: 'POST', body: { name: 'Sam', email: 'sam@example.com', password: PW, state: 'AK', city: 'Juneau' } })
    })
    assert.equal(first.statusCode, 200)
    assert.match(first.body.subscriberId, /^dev-sim-[0-9a-f]{6}$/)
    assert.equal(first.body.created, true)
    assert.equal(first.body.signedIn, true)
    assert.equal(first.body.newsletter, true)
    assert.equal(first.body.simulated, true)
    assert.equal(first.body.message, 'Simulated signup — nothing was saved to Airtable and no email was sent.')
    assert.equal(first.headers['set-cookie'], 'ssp_sim_access=authorized; Path=/; HttpOnly; SameSite=Lax')
    assert.equal(again.statusCode, 409)
    assert.equal(again.body.error.code, 'account_exists')
    assert.equal(again.headers['set-cookie'], undefined)
    assert.notEqual(other.body.subscriberId, first.body.subscriberId)
    assert.equal(other.body.newsletter, false)
    const echoed = JSON.stringify([first.body, again.body, other.body]).toLowerCase()
    for (const pii of ['pat@example.com', 'pat example', 'sam@example.com', 'houston', PW]) assert.equal(echoed.includes(pii), false, pii)
    assert.equal(logged, '')
    for (const account of store.accounts.values()) assert.match(account.hash, /^\$2[aby]\$/)
  })

  test('dev/login, dev/forgot, dev/reset and dev/logout simulate password sign-in', async () => {
    let clock = 1_800_000_000_000
    const store = devEndpoints.createDevAccountStore({ now: () => clock })
    const signup = devEndpoints.createDevSignupHandler(store)
    const login = devEndpoints.createDevLoginHandler(store)
    const forgot = devEndpoints.createDevForgotHandler(store)
    const reset = devEndpoints.createDevResetHandler(store)
    const logout = devEndpoints.createDevLogoutHandler()
    const PW = 'dev password 1'
    const NEW_PW = 'dev password 2'
    await call(signup, { method: 'POST', body: { name: 'Pat', email: 'pat@example.com', password: PW, state: 'TX', city: 'TX:houston' } })
    const ok = await call(login, { method: 'POST', body: { email: ' PAT@example.com', password: PW } })
    assert.equal(ok.statusCode, 200)
    assert.deepEqual(ok.body, { ok: true, simulated: true, signedIn: true })
    assert.equal(ok.headers['set-cookie'], 'ssp_sim_access=authorized; Path=/; HttpOnly; SameSite=Lax')
    for (const body of [{ email: 'pat@example.com', password: 'wrong password' }, { email: 'nobody@example.com', password: PW }, { email: 'pat@example.com' }]) {
      const bad = await call(login, { method: 'POST', body })
      assert.equal(bad.statusCode, 401)
      assert.equal(bad.body.error.code, 'invalid_credentials')
      assert.equal(bad.headers['set-cookie'], undefined)
    }
    // Forgot: neutral message plus a dev-only reset link that never carries the email.
    clock += 1000
    const sent = await call(forgot, { method: 'POST', body: { email: 'pat@example.com' } })
    assert.equal(sent.statusCode, 200)
    assert.equal(sent.body.message, 'If that email has an account, a password reset link is on its way.')
    assert.match(sent.body.devResetUrl, /^\/reset-password\?token=[^&]+$/)
    assert.equal(JSON.stringify(sent.body).includes('pat@example.com'), false)
    assert.equal((await call(forgot, { method: 'POST', body: { email: 'nope' } })).statusCode, 400)
    const token = decodeURIComponent(sent.body.devResetUrl.split('token=')[1])
    clock += 1000
    assert.equal((await call(reset, { method: 'POST', body: { token, password: 'short' } })).body.error.code, 'invalid_fields')
    const done = await call(reset, { method: 'POST', body: { token, password: NEW_PW } })
    assert.equal(done.statusCode, 200)
    assert.deepEqual(done.body, { ok: true, simulated: true, signedIn: true })
    assert.equal(done.headers['set-cookie'], 'ssp_sim_access=authorized; Path=/; HttpOnly; SameSite=Lax')
    assert.equal((await call(reset, { method: 'POST', body: { token, password: 'third password' } })).body.error.code, 'link_used')
    assert.equal((await call(login, { method: 'POST', body: { email: 'pat@example.com', password: PW } })).statusCode, 401)
    assert.equal((await call(login, { method: 'POST', body: { email: 'pat@example.com', password: NEW_PW } })).statusCode, 200)
    // Expired and forged links.
    const fresh = decodeURIComponent((await call(forgot, { method: 'POST', body: { email: 'pat@example.com' } })).body.devResetUrl.split('token=')[1])
    clock += 61 * 60 * 1000
    assert.equal((await call(reset, { method: 'POST', body: { token: fresh, password: NEW_PW } })).body.error.code, 'link_expired')
    assert.equal((await call(reset, { method: 'POST', body: { token: 'forged.token', password: NEW_PW } })).body.error.code, 'link_expired')
    // A reader with no dev account (e.g. joined before passwords) can set one.
    const legacy = await call(forgot, { method: 'POST', body: { email: 'legacy@example.com' } })
    const set = await call(reset, { method: 'POST', body: { token: decodeURIComponent(legacy.body.devResetUrl.split('token=')[1]), password: NEW_PW } })
    assert.equal(set.statusCode, 200)
    const out = await call(logout, { method: 'POST', body: {} })
    assert.deepEqual(out.body, { ok: true, simulated: true })
    assert.match(out.headers['set-cookie'], /^ssp_sim_access=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0$/)
    assert.equal((await call(logout, { method: 'GET' })).statusCode, 405)
  })

  test('dev account endpoints are mounted by the dev plugin only', () => {
    const routes = plugin.createSignalRoutes()
    for (const name of ['signup', 'login', 'forgot', 'reset', 'logout']) assert.equal(typeof routes.get(`/api/signal/dev/${name}`), 'function', name)
    assert.equal(plugin.default().apply, 'serve')
  })

  test('dev/notify accepts only a valid selection', async () => {
    const handler = devEndpoints.createDevNotifyHandler()
    const ok = await call(handler, { method: 'POST', body: { roleKey: 'forklift-operator', state: 'TX', city: 'TX:houston' } })
    assert.deepEqual(ok.body, { ok: true, simulated: true })
    const bad = await call(handler, { method: 'POST', body: { roleKey: 'forklift-operator', city: 'TX:houston' } })
    assert.equal(bad.statusCode, 400)
  })

  test('dev/preferences echoes a validated selection', async () => {
    const handler = devEndpoints.createDevPreferencesHandler()
    const headers = { cookie: 'ssp_sim_access=authorized' }
    // Like production: no (simulated) sign-in, no save.
    const signedOut = await call(handler, { method: 'POST', body: { sectors: ['healthcare'] } })
    assert.equal(signedOut.statusCode, 401)
    const ok = await call(handler, { method: 'POST', headers, body: { sectors: ['healthcare'], states: ['TX'], cities: ['TX:houston'], newsletter: true, alerts: 'weekly' } })
    assert.deepEqual(ok.body, { ok: true, simulated: true, saved: { sectors: ['healthcare'], states: ['TX'], cities: ['TX:houston'], newsletter: true, alerts: 'weekly' } })
    // A newsletter choice not sent is left unchanged, so it is not echoed.
    const untouched = await call(handler, { method: 'POST', headers, body: { sectors: [], states: [], cities: [] } })
    assert.equal('newsletter' in untouched.body.saved, false)
    // A saved sector key the page no longer lists is sent back and saves (production rule).
    const legacy = await call(handler, { method: 'POST', headers, body: { sectors: ['retired-sector'] } })
    assert.equal(legacy.statusCode, 200)
    assert.deepEqual(legacy.body.saved.sectors, ['retired-sector'])
    for (const body of [{ sectors: ['not a key!'] }, { states: ['ZZ'] }, { cities: ['TX:nowhere'] }, { alerts: 'daily' }, { newsletter: 'yes' }, null]) {
      const res = await call(handler, { method: 'POST', headers, body })
      assert.equal(res.statusCode, 400, JSON.stringify(body))
    }
  })

  test('dev/scenarios returns synthetic data only', async () => {
    const res = await call(devEndpoints.createDevScenariosHandler())
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.dataMode, 'synthetic')
    assert.ok(res.body.scenarios.length >= 15)
    assertNoStore(res)
  })
})

describe('vite dev plugin', () => {
  test('is serve-only', () => {
    const p = plugin.default()
    assert.equal(p.apply, 'serve')
    assert.equal(typeof p.configureServer, 'function')
  })

  test('parseQuery keeps repeated keys as arrays', () => {
    const q = plugin.parseQuery(new URLSearchParams('role=a&state=TX&state=CA'))
    assert.equal(q.role, 'a')
    assert.deepEqual(q.state, ['TX', 'CA'])
  })

  const streamReq = (text, headers = {}) => Object.assign(Readable.from([Buffer.from(text)]), { headers })

  test('readJsonBody enforces JSON and the 10 kB limit', async () => {
    assert.deepEqual(await plugin.readJsonBody(streamReq('{"a":1}', { 'content-type': 'application/json' })), { ok: true, body: { a: 1 } })
    assert.equal((await plugin.readJsonBody(streamReq('{bad', { 'content-type': 'application/json' }))).status, 400)
    assert.equal((await plugin.readJsonBody(streamReq('{"a":1}', { 'content-type': 'text/plain' }))).status, 415)
    const big = JSON.stringify({ a: 'x'.repeat(11 * 1024) })
    assert.equal((await plugin.readJsonBody(streamReq(big, { 'content-type': 'application/json' }))).status, 413)
    assert.equal((await plugin.readJsonBody(streamReq(big, { 'content-type': 'application/json', 'content-length': String(big.length) }))).status, 413)
  })

  test('middleware routes /api/signal/* and passes everything else through', async () => {
    const middleware = plugin.createSignalMiddleware(plugin.createSignalRoutes())
    const nodeRes = () => ({
      statusCode: 200, headers: {}, body: '', headersSent: false,
      setHeader(n, v) { this.headers[n.toLowerCase()] = v },
      getHeader(n) { return this.headers[n.toLowerCase()] },
      end(chunk) { this.body = chunk || ''; this.headersSent = true }
    })
    let passed = false
    await middleware({ url: '/preview', method: 'GET', headers: {} }, nodeRes(), () => { passed = true })
    assert.equal(passed, true)

    const res = nodeRes()
    await middleware({ url: '/api/signal/pay?role=forklift-operator&rate=17.00', method: 'GET', headers: {} }, res, () => assert.fail('next called'))
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['cache-control'], 'private, no-store')
    const body = JSON.parse(res.body)
    assert.equal(body.result.typicalCents, 1850)
    assert.equal(res.body.includes('17.00'), false)

    const missing = nodeRes()
    await middleware({ url: '/api/signal/nope', method: 'GET', headers: {} }, missing, () => assert.fail('next called'))
    assert.equal(missing.statusCode, 404)
  })
})
