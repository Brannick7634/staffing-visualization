// POST /api/auth/logout
// Clears the session cookie in this browser. The token itself is stateless:
// a copy taken before sign-out still unlocks the free data until it expires
// (30 days), but a password reset stops it from changing preferences.
// Works even when the rest of signup is not configured, so a reader can
// always sign out.
import { sendJson, methodNotAllowed, requireJson } from '../subscribers.js'
import { clearSessionCookie } from '../signalSession.js'

export function createLogoutHandler() {
  return function logoutHandler(req, res) {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    // JSON only, so another site cannot sign a reader out with a hidden form.
    if (!requireJson(req, res)) return
    res.setHeader('Set-Cookie', clearSessionCookie())
    return sendJson(res, 200, { ok: true })
  }
}

export default createLogoutHandler()
