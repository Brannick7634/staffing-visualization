// POST /api/auth/forgot  { email }
// Emails a one-time, 60-minute password reset link when the email has an
// account. Always answers the same way, so it cannot be used to discover who
// has signed up. This is also how readers who joined before passwords set one.
import { loadConfig, readBody, requireJson, RATE_LIMITED, sendJson, sendError, unavailable, methodNotAllowed, normalizeEmail, isEmail, findByEmail, sendPasswordReset, F } from '../subscribers.js'
import { rateLimit } from '../security.js'

export function createForgotHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  return async function forgotHandler(req, res) {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    if (!requireJson(req, res)) return
    if (!rateLimit(req, res, { key: 'forgot', limit: 5, windowMs: 600000, body: RATE_LIMITED })) return
    const conf = loadConfig(env, { needMail: true })
    if (!conf.ok) return unavailable(res)
    const email = normalizeEmail(readBody(req)?.email)
    if (!isEmail(email)) return sendError(res, 400, 'invalid_fields', 'Enter a valid work email address.', { fields: { email: 'Enter a valid work email address.' }, field: 'email' })
    try {
      const record = await findByEmail(conf.cfg, fetchImpl, email)
      if (record) await sendPasswordReset(conf.cfg, fetchImpl, email, { currentHash: record.fields?.[F.passwordHash] || '', now: now() })
    } catch {
      return sendError(res, 502, 'email_failed', 'We could not send the reset email. Please try again.')
    }
    return sendJson(res, 200, { ok: true, message: 'If that email has an account, a password reset link is on its way.' })
  }
}

export default createForgotHandler()
