// POST /api/auth/confirm
//   { token }  -> confirms the email address in a 24-hour link (sets Verified).
//   { }        -> signed in: emails the account a confirmation link.
// A confirmed address is required before the account can email Client Pay
// Market Reports to other people, so a sign-up made with someone else's
// address cannot be used to mail anyone. The link opens a page with a
// Confirm button, so a mail scanner that follows links does not confirm it.
import {
  loadConfig, readBody, requireJson, RATE_LIMITED, sendJson, sendError, unavailable, methodNotAllowed,
  normalizeEmail, findByEmail, updateRecord, sendEmailConfirmation, F
} from '../subscribers.js'
import { verifyToken, verifySession, sessionMatchesHash } from '../signalSession.js'
import { rateLimit, sameOrigin } from '../security.js'
import { createHash } from 'node:crypto'

const expired = (res) => sendError(res, 400, 'link_expired', 'This confirmation link has expired or is not valid. Ask for a new one.')

export function createConfirmHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  return async function confirmHandler(req, res) {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    if (!requireJson(req, res)) return
    if (!rateLimit(req, res, { key: 'confirm', limit: 10, windowMs: 600000, body: RATE_LIMITED })) return
    const body = readBody(req) || {}
    const t = now()

    if (typeof body.token === 'string' && body.token) {
      const conf = loadConfig(env)
      if (!conf.ok) return unavailable(res)
      const payload = verifyToken(body.token, conf.cfg.secret, { purpose: 'confirm', now: t })
      if (!payload || typeof payload.email !== 'string') return expired(res)
      try {
        const record = await findByEmail(conf.cfg, fetchImpl, payload.email)
        if (!record) return expired(res)
        if (record.fields?.[F.verified] !== true) await updateRecord(conf.cfg, fetchImpl, record.id, { [F.verified]: true })
      } catch {
        return sendError(res, 502, 'save_failed', 'We could not confirm your email. Please try again.')
      }
      return sendJson(res, 200, { ok: true, confirmed: true })
    }

    // Asking for a link: the signed-in account only, from the site itself.
    if (!sameOrigin(req, env)) return sendError(res, 403, 'bad_origin', 'Ask for the link from the site.')
    const conf = loadConfig(env, { needMail: true })
    if (!conf.ok) return unavailable(res)
    const { cfg } = conf
    const session = verifySession(req, { env, now: t })
    if (!session) return sendError(res, 401, 'sign_in_required', 'Please sign in first.')
    const email = normalizeEmail(session.email)
    const subject = createHash('sha256').update(`confirm:${email}`).digest('hex').slice(0, 32)
    if (!rateLimit(req, res, { key: 'confirm-send', subject, limit: 3, windowMs: 3600000, now: t, body: RATE_LIMITED })) return
    try {
      const record = await findByEmail(cfg, fetchImpl, email)
      if (!record || !sessionMatchesHash(session, record.fields?.[F.passwordHash], cfg.secret)) {
        return sendError(res, 401, 'sign_in_required', 'Please sign in first.')
      }
      if (record.fields?.[F.verified] === true) return sendJson(res, 200, { ok: true, alreadyConfirmed: true })
      await sendEmailConfirmation(cfg, fetchImpl, email, { now: t })
    } catch {
      return sendError(res, 502, 'email_failed', 'We could not send the confirmation email. Please try again.')
    }
    return sendJson(res, 200, { ok: true, sent: true })
  }
}

export default createConfirmHandler()
