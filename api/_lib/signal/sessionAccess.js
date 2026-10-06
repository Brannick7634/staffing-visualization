// Production access resolver for /api/signal/*.
//
// 'authorized' when either the existing dashboard session (Bearer token,
// api/_lib/auth.js) or the signed Staffing Signal subscriber cookie
// (api/_lib/signalSession.js, set at signup, sign-in or password reset)
// verifies; anything else is 'public'. The development-only simulated-access
// cookie is never read.
//
// Server-only.
import { verifySession } from '../auth.js'
import { verifySession as verifySignalSession } from '../signalSession.js'
import { ACCESS } from '../../../shared/signal/contract.js'

function bearerToken(req) {
  const header = req && req.headers ? req.headers.authorization : null
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token && token.length <= 4096 ? token : null
}

export function sessionAccess(req) {
  const token = bearerToken(req)
  let session = token ? verifySession(token) : null
  if (!session) {
    try { session = verifySignalSession(req) } catch { session = null }
  }
  return { access: session ? ACCESS.AUTHORIZED : ACCESS.PUBLIC, simulated: false }
}
