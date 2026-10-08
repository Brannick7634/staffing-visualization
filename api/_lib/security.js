// Shared request-security helpers for the /api handlers.
import { timingSafeEqual, createHash } from 'node:crypto'
import { verifySession } from './auth.js'

// --- Admin / server-to-server secret ---------------------------------------
// Accepts `x-admin-token: <ADMIN_API_TOKEN>` or `Authorization: Bearer <secret>`
// where secret is ADMIN_API_TOKEN or CRON_SECRET (Vercel Cron sends the latter).
function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest()
  const hb = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(ha, hb)
}

export function isAdminRequest(req, env = process.env) {
  const secrets = [env.ADMIN_API_TOKEN, env.CRON_SECRET].filter((s) => typeof s === 'string' && s.length >= 16)
  if (secrets.length === 0) return false
  const header = req.headers?.authorization || ''
  const candidates = [req.headers?.['x-admin-token'], header.startsWith('Bearer ') ? header.slice(7) : null].filter(Boolean)
  let ok = false
  for (const c of candidates) for (const s of secrets) if (safeEqual(c, s)) ok = true
  return ok
}

// Optional session: returns the decoded session or null, never sends a response.
export function optionalSession(req) {
  const header = req.headers?.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  return token ? verifySession(token) : null
}

// --- Same-origin check -------------------------------------------------------
// The site's origin from SIGNAL_SITE_URL plus its www/apex twin (visitors may
// be on either host). [] when the URL is unusable, so the check fails closed.
export function siteOrigins(siteUrl) {
  let u
  try { u = new URL(String(siteUrl || '')) } catch { return [] }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.host) return []
  const host = u.host.toLowerCase()
  const twin = host.startsWith('www.') ? host.slice(4) : `www.${host}`
  return [`${u.protocol}//${host}`, `${u.protocol}//${twin}`]
}

// Origin of the page that sent the request: the Origin header (browsers send
// it on every POST; the opaque "null" origin never matches), else the Referer.
export function requestOrigin(req) {
  const headers = req?.headers || {}
  const origin = headers.origin
  const raw = typeof origin === 'string' && origin ? origin : (typeof headers.referer === 'string' ? headers.referer : '')
  if (!raw || raw === 'null') return null
  try {
    const u = new URL(raw)
    return u.host ? `${u.protocol}//${u.host.toLowerCase()}` : null
  } catch {
    return null
  }
}

// True only when the request comes from the site itself (cross-site request
// forgery guard for state-changing POSTs that act with the session cookie).
export function sameOrigin(req, env = process.env) {
  const origin = requestOrigin(req)
  return Boolean(origin) && siteOrigins(env.SIGNAL_SITE_URL).includes(origin)
}

// --- Rate limiting -----------------------------------------------------------
// Best-effort, in-memory, per-IP fixed window. On Vercel each warm instance
// keeps its own counter and cold starts reset it, so this slows abuse but is
// not a hard guarantee (use Vercel KV/Upstash for that).
const buckets = new Map()

export function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for']
  if (fwd) return String(fwd).split(',')[0].trim()
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
}

// `subject` replaces the client IP in the bucket id (e.g. a hashed email for a
// per-account limit); `body` replaces the default 429 JSON body.
export function rateLimit(req, res, { key = 'default', limit = 10, windowMs = 60_000, now = Date.now(), subject, body: limitedBody } = {}) {
  const id = `${key}:${subject ?? clientIp(req)}`
  let b = buckets.get(id)
  if (!b || now >= b.reset) {
    b = { count: 0, reset: now + windowMs }
    buckets.set(id, b)
  }
  b.count++
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now >= v.reset) buckets.delete(k)
  }
  if (b.count > limit) {
    res.setHeader?.('Retry-After', String(Math.ceil((b.reset - now) / 1000)))
    res.setHeader?.('Cache-Control', 'no-store')
    const body = limitedBody || { success: false, error: 'Too many requests. Please try again shortly.' }
    if (typeof res.status === 'function') res.status(429).json(body)
    else { res.statusCode = 429; res.setHeader?.('Content-Type', 'application/json'); res.end(JSON.stringify(body)) }
    return false
  }
  return true
}

export function _resetRateLimits() { buckets.clear() }

// --- Anonymous dashboard view ------------------------------------------------
// Anonymous visitors get aggregates plus a small, id-free sample of table rows
// for the public dashboard. Record ids and per-city firm lists are removed.
export const PUBLIC_TABLE_ROW_CAP = 25

function publicRow(f) {
  if (!f || typeof f !== 'object') return f
  const { id, ...rest } = f
  return rest
}
function capRows(list) {
  return Array.isArray(list) ? list.slice(0, PUBLIC_TABLE_ROW_CAP).map(publicRow) : []
}

export function toPublicDashboardMetrics(metrics) {
  if (!metrics) return metrics
  const segmentTableFirms = {}
  for (const [segment, entry] of Object.entries(metrics.segmentTableFirms || {})) {
    if (Array.isArray(entry)) { segmentTableFirms[segment] = capRows(entry); continue }
    const bySize = {}
    for (const [band, list] of Object.entries(entry?.bySize || {})) bySize[band] = capRows(list)
    const byState = {}
    for (const [abbr, bandMap] of Object.entries(entry?.byState || {})) {
      byState[abbr] = {}
      for (const [band, list] of Object.entries(bandMap || {})) byState[abbr][band] = capRows(list)
    }
    segmentTableFirms[segment] = { default: capRows(entry?.default), bySize, byState }
  }
  const { countyData, countyDataBySegment, ...rest } = metrics
  return {
    ...rest,
    segmentTableFirms,
    tableFirms: capRows(metrics.tableFirms),
    countyData: {},
    countyDataBySegment: {},
  }
}
