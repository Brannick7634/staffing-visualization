import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import jwt from 'jsonwebtoken'

// auth.js reads SESSION_SECRET at import time, so set a test-only secret
// before loading the production entrypoints dynamically.
const TEST_SECRET = 'signal-handlers-test-secret-not-real'
process.env.SESSION_SECRET = TEST_SECRET

const { default: productionSnapshot } = await import('../../api/signal/snapshot.js')
const { default: productionPay } = await import('../../api/signal/pay.js')
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

  test('dev/signup validates, is idempotent by normalized email and never echoes or logs PII', async () => {
    const handler = devEndpoints.createDevSignupHandler()
    const invalid = [
      [{ name: '', email: 'a@b.co' }, 'name'],
      [{ name: '   ', email: 'a@b.co' }, 'name'],
      [{ name: 'x'.repeat(101), email: 'a@b.co' }, 'name'],
      [{ name: 'Pat', email: 'not-an-email' }, 'email'],
      [{ name: 'Pat', email: 'pat@example.c' }, 'email'],
      [{ name: 'Pat', email: `${'a'.repeat(250)}@b.co` }, 'email'],
      [{ name: 'Pat', email: 'pat@example.com', newsletter: 'yes' }, 'newsletter']
    ]
    for (const [body, field] of invalid) {
      const res = await call(handler, { method: 'POST', body })
      assert.equal(res.statusCode, 400, JSON.stringify(body))
      assert.ok(field in res.body.error.fields, field)
      assert.equal(res.headers['set-cookie'], undefined)
    }
    let first, again, other
    const logged = await captureConsole(async () => {
      first = await call(handler, { method: 'POST', body: { name: 'Pat Example', email: ' Pat@Example.com ', newsletter: true, context: { roleKey: 'forklift-operator', state: 'TX', city: 'TX:houston' } } })
      again = await call(handler, { method: 'POST', body: { name: 'Pat', email: 'pat@example.com', newsletter: false } })
      other = await call(handler, { method: 'POST', body: { name: 'Sam', email: 'sam@example.com' } })
    })
    assert.equal(first.statusCode, 200)
    assert.match(first.body.subscriberId, /^dev-sim-[0-9a-f]{6}$/)
    assert.equal(first.body.created, true)
    assert.equal(first.body.newsletter, true)
    assert.equal(first.body.simulated, true)
    assert.equal(first.body.message, 'Simulated signup \u2014 nothing was saved to Airtable and no email was sent.')
    assert.equal(first.headers['set-cookie'], 'ssp_sim_access=authorized; Path=/; HttpOnly; SameSite=Lax')
    assert.equal(again.body.subscriberId, first.body.subscriberId)
    assert.equal(again.body.created, false)
    assert.notEqual(other.body.subscriberId, first.body.subscriberId)
    assert.equal(other.body.newsletter, false)
    const echoed = JSON.stringify([first.body, again.body, other.body]).toLowerCase()
    for (const pii of ['pat@example.com', 'pat example', 'sam@example.com', 'houston']) assert.equal(echoed.includes(pii), false, pii)
    assert.equal(logged, '')
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
    const ok = await call(handler, { method: 'POST', body: { sectors: ['healthcare'], states: ['TX'], cities: ['TX:houston'], newsletter: true, alerts: 'weekly' } })
    assert.deepEqual(ok.body, { ok: true, simulated: true, saved: { sectors: ['healthcare'], states: ['TX'], cities: ['TX:houston'], newsletter: true, alerts: 'weekly' } })
    for (const body of [{ sectors: ['nope'] }, { states: ['ZZ'] }, { cities: ['TX:nowhere'] }, { alerts: 'daily' }, { newsletter: 'yes' }, null]) {
      const res = await call(handler, { method: 'POST', body })
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
