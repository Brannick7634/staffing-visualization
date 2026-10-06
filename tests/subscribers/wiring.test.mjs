import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionAccess } from '../../api/_lib/signal/sessionAccess.js'
import { SESSION_COOKIE, sessionToken } from '../../api/_lib/signalSession.js'
import { rateLimit, _resetRateLimits } from '../../api/_lib/security.js'
import { ACCESS } from '../../shared/signal/contract.js'

const SECRET = 'x'.repeat(40)

test('signed subscriber cookie unlocks pay data; forged or simulated cookies do not', () => {
  process.env.SIGNAL_SESSION_SECRET = SECRET
  const good = sessionToken('a@b.com', SECRET)
  assert.equal(sessionAccess({ headers: { cookie: `${SESSION_COOKIE}=${good}` } }).access, ACCESS.AUTHORIZED)
  assert.equal(sessionAccess({ headers: { cookie: `${SESSION_COOKIE}=${good}x` } }).access, ACCESS.PUBLIC)
  assert.equal(sessionAccess({ headers: { cookie: 'ssp_sim_access=authorized' } }).access, ACCESS.PUBLIC)
  assert.equal(sessionAccess({ headers: {} }).access, ACCESS.PUBLIC)
})

test('rate limit returns 429 on a plain Node response after the limit', () => {
  _resetRateLimits()
  const req = { headers: { 'x-forwarded-for': '9.9.9.9' }, socket: {} }
  let res
  for (let i = 0; i < 6; i++) {
    res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, end(b) { this.body = b } }
    const ok = rateLimit(req, res, { key: 't', limit: 5, windowMs: 60000 })
    assert.equal(ok, i < 5)
  }
  assert.equal(res.statusCode, 429)
})

test('account routes: password sign-in wired, one-time sign-in links gone', async () => {
  const { readFileSync, existsSync } = await import('node:fs')
  const root = new URL('../../', import.meta.url)
  const vercel = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'))
  const rewrites = new Map(vercel.rewrites.map((r) => [r.source, r.destination]))
  for (const name of ['login', 'forgot', 'reset', 'logout']) {
    assert.equal(rewrites.get(`/api/auth/${name}`), `/api/account?route=${name}`)
  }
  assert.equal(rewrites.get('/api/subscribe'), '/api/account?route=subscribe')
  for (const gone of ['/api/auth/magic-link', '/api/auth/verify']) assert.equal(rewrites.has(gone), false, gone)
  // Old sign-in emails land on the sign-in page (a redirect, not a function).
  assert.deepEqual(vercel.redirects.find((r) => r.source === '/api/auth/verify'), { source: '/api/auth/verify', destination: '/sign-in', permanent: false })
  assert.equal(JSON.stringify(vercel).includes('magic'), false)
  assert.ok(vercel.crons.length >= 1, 'crons kept')
  for (const gone of ['api/_lib/routes/magic-link.js', 'api/_lib/routes/verify.js']) assert.equal(existsSync(new URL(gone, root)), false, gone)
  const src = readFileSync(new URL('api/account.js', root), 'utf8')
  for (const name of ['login', 'forgot', 'reset', 'logout', 'subscribe', 'unsubscribe', 'preferences']) assert.match(src, new RegExp(`'${name}': `))
  assert.doesNotMatch(src, /magic|verify/)
  const { default: account } = await import('../../api/account.js')
  const hit = (route, method = 'POST', reqHeaders = { 'content-type': 'application/json' }) => new Promise((resolve) => {
    const headers = {}
    const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v }, end: (b) => resolve({ status: res.statusCode, headers, body: b }) }
    account({ method, query: { route }, headers: reqHeaders, body: {} }, res)
  })
  for (const gone of ['magic-link', 'verify']) {
    const r = await hit(gone)
    assert.equal(r.status, 404)
    assert.equal(r.headers['cache-control'], 'no-store')
  }
  // A cross-site form post (no JSON content type) cannot sign anyone out.
  const form = await hit('logout', 'POST', { 'content-type': 'application/x-www-form-urlencoded' })
  assert.equal(form.status, 415)
  assert.equal(form.headers['set-cookie'], undefined)
  const out = await hit('logout')
  assert.equal(out.status, 200)
  assert.match(out.headers['set-cookie'], /^ss_session=; .*Max-Age=0$/)
  for (const name of ['login', 'forgot', 'reset']) assert.equal((await hit(name, 'GET')).status, 405)
})
