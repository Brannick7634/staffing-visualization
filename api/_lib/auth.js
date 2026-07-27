// Server-only session handling. Tokens are signed with SESSION_SECRET so a
// client can no longer fabricate a valid session by writing to localStorage —
// every protected endpoint verifies the signature before returning data.
import jwt from 'jsonwebtoken'

const SECRET = process.env.SESSION_SECRET
const EXPIRY = '4h'

export function signSession(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRY })
}

export function verifySession(token) {
  try {
    return jwt.verify(token, SECRET)
  } catch {
    return null
  }
}

// Call at the top of a protected handler. Sends 401 and returns null if the
// request has no valid session; otherwise returns the decoded session.
export function requireAuth(req, res) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const session = token ? verifySession(token) : null
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  return session
}
