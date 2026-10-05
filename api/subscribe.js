// POST /api/subscribe  { name, email, company?, newsletter?, source? }
// Validates, upserts the subscriber by lowercased email, and emails a sign-in
// link. The response is the same for new and existing emails (no enumeration).
import { loadConfig, readBody, sendJson, sendError, unavailable, methodNotAllowed, validateSignup, upsertSubscriber, sendMagicLink } from './_lib/subscribers.js'

import { rateLimit } from './_lib/security.js'

export function createSubscribeHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  return async function subscribeHandler(req, res) {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    if (!rateLimit(req, res, { key: 'subscribe', limit: 5, windowMs: 600000 })) return
    const conf = loadConfig(env, { needMail: true })
    if (!conf.ok) return unavailable(res)
    const checked = validateSignup(readBody(req))
    if (!checked.ok) return sendError(res, 400, 'invalid_fields', 'Please check the highlighted fields.', { fields: checked.fields, field: checked.field })
    const at = now()
    try {
      await upsertSubscriber(conf.cfg, fetchImpl, checked.value, at)
    } catch {
      return sendError(res, 502, 'save_failed', 'We could not save your signup. Please try again.')
    }
    try {
      await sendMagicLink(conf.cfg, fetchImpl, checked.value.email, at.getTime())
    } catch {
      return sendError(res, 502, 'email_failed', 'You are signed up, but we could not send the sign-in email. Please try again.')
    }
    return sendJson(res, 200, { ok: true, checkEmail: true, newsletter: checked.value.newsletter, message: 'Check your inbox for a sign-in link.' })
  }
}

export default createSubscribeHandler()
