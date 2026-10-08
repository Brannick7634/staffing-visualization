// Signed tokens and the session cookie for Staffing Signal subscribers.
// HMAC-SHA256 over a base64url JSON payload, keyed by SIGNAL_SESSION_SECRET.
// Each token carries a purpose ("session" | "reset" | "unsub" | "confirm") so one kind can
// never be replayed as another.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'ss_session'
export const RESET_TTL_MS = 60 * 60 * 1000
export const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MIN_SECRET = 32

export function sessionSecret(env = process.env) {
  const s = env.SIGNAL_SESSION_SECRET
  return typeof s === 'string' && s.length >= MIN_SECRET ? s : null
}

const b64 = (s) => Buffer.from(s).toString('base64url')
const mac = (secret, data) => createHmac('sha256', secret).update(data).digest('base64url')

export function signToken(payload, secret) {
  if (!secret) throw new Error('missing_secret')
  const body = b64(JSON.stringify(payload))
  return `${body}.${mac(secret, body)}`
}

// Returns the payload, or null when malformed, forged, expired or wrong purpose.
export function verifyToken(token, secret, { purpose, now = Date.now() } = {}) {
  if (!secret || typeof token !== 'string' || token.length > 2048) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const expected = Buffer.from(mac(secret, parts[0]))
  const given = Buffer.from(parts[1])
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  let payload
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) } catch { return null }
  if (!payload || typeof payload !== 'object') return null
  if (purpose && payload.p !== purpose) return null
  if (typeof payload.email !== 'string' || !payload.email) return null
  if (payload.exp !== undefined && !(typeof payload.exp === 'number' && payload.exp > now)) return null
  return payload
}

// Password reset link: 60 minutes. `h` fingerprints the password hash at the
// time the link was issued (see passwordFingerprint) so the link stops
// working once any password has been set.
export function resetToken(email, secret, { now = Date.now(), h = '' } = {}) {
  return signToken({ p: 'reset', email, iat: now, exp: now + RESET_TTL_MS, h }, secret)
}
// Email confirmation link: 24 hours. Opening it (and pressing Confirm) proves
// the reader can receive mail at the address; it changes nothing else.
export function confirmToken(email, secret, { now = Date.now() } = {}) {
  return signToken({ p: 'confirm', email, iat: now, exp: now + CONFIRM_TTL_MS }, secret)
}
// Short keyed digest of the stored bcrypt hash ('' when none). Reveals nothing
// about the hash; it only changes when the password changes.
export function passwordFingerprint(hash, secret) {
  return mac(secret, `pw:${typeof hash === 'string' ? hash : ''}`).slice(0, 16)
}
// No expiry: unsubscribe links in old emails must keep working.
export function unsubscribeToken(email, secret) {
  return signToken({ p: 'unsub', email }, secret)
}
// `h` is passwordFingerprint() of the hash the session was started with, so a
// password change (reset) ends every older session for record-level actions.
// Tokens without `h` (issued before passwords existed) count as "no password".
export function sessionToken(email, secret, now = Date.now(), h) {
  return signToken({ p: 'session', email, iat: now, exp: now + SESSION_TTL_MS, ...(typeof h === 'string' ? { h } : {}) }, secret)
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

function readCookie(req, name) {
  const raw = req?.headers?.cookie
  if (typeof raw !== 'string') return null
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

// verifySession(req) -> { email, h } for a valid signed-in subscriber, else null.
// `h` is the password fingerprint the session was started with; routes that
// load the subscriber's row must also check sessionMatchesHash() so sessions
// from before a password reset stop working there.
// Fails closed (null) when SIGNAL_SESSION_SECRET is missing or too short.
export function verifySession(req, { env = process.env, now = Date.now() } = {}) {
  const secret = sessionSecret(env)
  const payload = verifyToken(readCookie(req, SESSION_COOKIE), secret, { purpose: 'session', now })
  if (!payload) return null
  return { email: payload.email, h: typeof payload.h === 'string' ? payload.h : passwordFingerprint('', secret) }
}

// True when the session was started with the password currently stored.
export function sessionMatchesHash(session, storedHash, secret) {
  if (!session || typeof session.h !== 'string' || !secret) return false
  const a = Buffer.from(session.h)
  const b = Buffer.from(passwordFingerprint(storedHash || '', secret))
  return a.length === b.length && timingSafeEqual(a, b)
}
