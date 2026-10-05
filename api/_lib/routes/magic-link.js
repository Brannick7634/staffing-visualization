// POST /api/auth/magic-link  { email }
// Emails a sign-in link to an existing subscriber. Always answers the same way
// so the endpoint cannot be used to discover who has signed up.
import { loadConfig, readBody, sendJson, sendError, unavailable, methodNotAllowed, normalizeEmail, isEmail, findByEmail, sendMagicLink } from '../subscribers.js'

import { rateLimit } from '../security.js'

export function createMagicLinkHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  return async function magicLinkHandler(req, res) {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    if (!rateLimit(req, res, { key: 'magic-link', limit: 5, windowMs: 600000 })) return
    const conf = loadConfig(env, { needMail: true })
    if (!conf.ok) return unavailable(res)
    const email = normalizeEmail(readBody(req)?.email)
    if (!isEmail(email)) return sendError(res, 400, 'invalid_fields', 'Enter a valid work email address.', { fields: { email: 'Enter a valid work email address.' }, field: 'email' })
    try {
      const record = await findByEmail(conf.cfg, fetchImpl, email)
      if (record) await sendMagicLink(conf.cfg, fetchImpl, email, now())
    } catch {
      return sendError(res, 502, 'email_failed', 'We could not send the sign-in email. Please try again.')
    }
    return sendJson(res, 200, { ok: true, message: 'If that email is signed up, a sign-in link is on its way.' })
  }
}

export default createMagicLinkHandler()
