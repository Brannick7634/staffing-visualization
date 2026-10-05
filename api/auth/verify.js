// GET /api/auth/verify?token=...
// Checks the 15-minute login token, marks the email verified, records the
// sign-in, sets the 30-day session cookie and redirects to the site.
// Single use: a token issued at or before the last recorded sign-in is refused.
import { loadConfig, unavailable, methodNotAllowed, findByEmail, updateRecord, F } from '../_lib/subscribers.js'
import { verifyToken, sessionToken, sessionCookie } from '../_lib/signalSession.js'

function redirect(res, location) {
  res.statusCode = 303
  res.setHeader('Location', location)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.end()
}

export function createVerifyHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  return async function verifyHandler(req, res) {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET')
    const conf = loadConfig(env)
    if (!conf.ok) return unavailable(res)
    const { cfg } = conf
    const t = now()
    const token = new URL(req.url || '/', 'http://x').searchParams.get('token')
    const payload = verifyToken(token, cfg.secret, { purpose: 'login', now: t })
    if (!payload) return redirect(res, `${cfg.site}/?signin=expired`)
    try {
      const record = await findByEmail(cfg, fetchImpl, payload.email)
      if (!record) return redirect(res, `${cfg.site}/?signin=expired`)
      const last = Date.parse(record.fields?.[F.lastSignInAt] || '')
      if (Number.isFinite(last) && last >= payload.iat) return redirect(res, `${cfg.site}/?signin=used`)
      await updateRecord(cfg, fetchImpl, record.id, { [F.verified]: true, [F.lastSignInAt]: new Date(t).toISOString() })
    } catch {
      return redirect(res, `${cfg.site}/?signin=error`)
    }
    res.setHeader('Set-Cookie', sessionCookie(sessionToken(payload.email, cfg.secret, t)))
    return redirect(res, `${cfg.site}/?signin=ok`)
  }
}

export default createVerifyHandler()
