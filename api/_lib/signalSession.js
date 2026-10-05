// Signed tokens and the session cookie for Staffing Signal subscribers.
// HMAC-SHA256 over a base64url JSON payload, keyed by SIGNAL_SESSION_SECRET.
// Each token carries a purpose ("login" | "session" | "unsub") so one kind can
// never be replayed as another.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'ss_session'
export const LOGIN_TTL_MS = 15 * 60 * 1000
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

export function loginToken(email, secret, now = Date.now()) {
  return signToken({ p: 'login', email, iat: now, exp: now + LOGIN_TTL_MS }, secret)
}
// No expiry: unsubscribe links in old emails must keep working.
export function unsubscribeToken(email, secret) {
  return signToken({ p: 'unsub', email }, secret)
}
export function sessionToken(email, secret, now = Date.now()) {
  return signToken({ p: 'session', email, iat: now, exp: now + SESSION_TTL_MS }, secret)
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
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

// verifySession(req) -> { email } for a valid signed-in subscriber, else null.
// Fails closed (null) when SIGNAL_SESSION_SECRET is missing or too short.
export function verifySession(req, { env = process.env, now = Date.now() } = {}) {
  const payload = verifyToken(readCookie(req, SESSION_COOKIE), sessionSecret(env), { purpose: 'session', now })
  return payload ? { email: payload.email } : null
}
