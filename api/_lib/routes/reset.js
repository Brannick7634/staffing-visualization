// POST /api/auth/reset  { token, password }
// Sets a new password from a 60-minute reset link, marks the email verified
// (the reader proved they can open it) and signs them in.
// Single use: a link is refused once a password has been set at or after the
// moment it was issued, or once the stored hash differs from the one it was
// issued against. Two submits of one link at the same moment can both pass
// that check, so after saving we read the row back: only the request whose
// hash is stored signs in, the other gets link_used. Sessions are tied to
// the hash, so older sessions (anyone else's) stop working for account changes.
import { loadConfig, readBody, requireJson, RATE_LIMITED, sendJson, sendError, unavailable, methodNotAllowed, findByEmail, updateRecord, validatePassword, hashPassword, startSession, F } from '../subscribers.js'
import { verifyToken, passwordFingerprint } from '../signalSession.js'
import { rateLimit } from '../security.js'

const expired = (res) => sendError(res, 400, 'link_expired', 'This reset link has expired or is not valid. Ask for a new one.')
const used = (res) => sendError(res, 400, 'link_used', 'This reset link has already been used. Ask for a new one if you need to.')
const failed = (res) => sendError(res, 502, 'save_failed', 'We could not set your password. Please try again.')

export function createResetHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  return async function resetHandler(req, res) {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    if (!requireJson(req, res)) return
    if (!rateLimit(req, res, { key: 'reset', limit: 10, windowMs: 600000, body: RATE_LIMITED })) return
    const conf = loadConfig(env)
    if (!conf.ok) return unavailable(res)
    const { cfg } = conf
    const body = readBody(req) || {}
    const t = now()
    const payload = verifyToken(body.token, cfg.secret, { purpose: 'reset', now: t })
    if (!payload || typeof payload.iat !== 'number' || typeof payload.h !== 'string') return expired(res)
    let record
    try {
      record = await findByEmail(cfg, fetchImpl, payload.email)
    } catch {
      return failed(res)
    }
    if (!record) return expired(res)
    const setAt = Date.parse(record.fields?.[F.passwordSetAt] || '')
    const hashChanged = passwordFingerprint(record.fields?.[F.passwordHash] || '', cfg.secret) !== payload.h
    if ((Number.isFinite(setAt) && setAt >= payload.iat) || hashChanged) return used(res)
    const problem = validatePassword(body.password)
    if (problem) return sendError(res, 400, 'invalid_fields', 'Please check the highlighted fields.', { fields: { password: problem }, field: 'password' })
    const stamp = new Date(t).toISOString()
    const hash = await hashPassword(body.password)
    try {
      await updateRecord(cfg, fetchImpl, record.id, {
        [F.passwordHash]: hash,
        [F.passwordSetAt]: stamp,
        [F.verified]: true,
        [F.lastSignInAt]: stamp
      })
    } catch {
      return failed(res)
    }
    let stored = null
    try {
      stored = await findByEmail(cfg, fetchImpl, payload.email)
    } catch {
      // The password is saved; the read-back is only a race check.
      console.error('[subscribers] reset: read-back failed')
    }
    if (stored && stored.id === record.id && stored.fields?.[F.passwordHash] !== hash) return used(res)
    startSession(res, cfg, payload.email, { now: t, hash })
    return sendJson(res, 200, { ok: true, signedIn: true })
  }
}

export default createResetHandler()
