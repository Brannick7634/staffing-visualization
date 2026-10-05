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
