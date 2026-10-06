// POST /api/auth/login  { email, password }
// Checks the password against the stored bcrypt hash and sets the 30-day
// session cookie. Unknown email, no password yet and wrong password all get
// the same 401 after the same bcrypt work, so the answer reveals nothing.
// Unsubscribed readers can still sign in (unsubscribe only stops email).
// Limits: 10 tries per 10 minutes per IP, and 20 per hour per email (keyed by
// a hash of the email) so guessing spread across many IPs is slowed too.
// Both are in-memory per serverless instance (best effort).
import { createHash } from 'node:crypto'
import { loadConfig, readBody, requireJson, RATE_LIMITED, sendJson, sendError, unavailable, methodNotAllowed, normalizeEmail, isEmail, findByEmail, updateRecord, checkPassword, startSession, F } from '../subscribers.js'
import { rateLimit } from '../security.js'

export function createLoginHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  return async function loginHandler(req, res) {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    if (!requireJson(req, res)) return
    if (!rateLimit(req, res, { key: 'login', limit: 10, windowMs: 600000, body: RATE_LIMITED })) return
    const conf = loadConfig(env)
    if (!conf.ok) return unavailable(res)
    const body = readBody(req) || {}
    const email = normalizeEmail(body.email)
    if (isEmail(email)) {
      const subject = createHash('sha256').update(email).digest('base64url')
      if (!rateLimit(req, res, { key: 'login-email', subject, limit: 20, windowMs: 3600000, body: RATE_LIMITED })) return
    }
    let record = null
    try {
      if (isEmail(email)) record = await findByEmail(conf.cfg, fetchImpl, email)
    } catch {
      return sendError(res, 502, 'signin_failed', 'We could not sign you in just now. Please try again.')
    }
    if (!(await checkPassword(body.password, record?.fields?.[F.passwordHash]))) {
      return sendError(res, 401, 'invalid_credentials', 'Email or password is incorrect.')
    }
    const t = now()
    try {
      await updateRecord(conf.cfg, fetchImpl, record.id, { [F.lastSignInAt]: new Date(t).toISOString() })
    } catch {
      // Sign-in still succeeds; the timestamp is informational only.
      console.error('[subscribers] login: could not record sign-in time')
    }
    startSession(res, conf.cfg, email, { now: t, hash: record.fields[F.passwordHash] })
    return sendJson(res, 200, { ok: true, signedIn: true })
  }
}

export default createLoginHandler()
