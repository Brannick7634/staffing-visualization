// Signal Subscribers table (Airtable REST via fetch, field IDs only) plus the
// validation, config, Resend and response helpers for the signup endpoints.
import { sessionSecret, loginToken, unsubscribeToken } from './signalSession.js'

export const F = {
  email: 'fldSis1UQ5WwDbq9R',
  name: 'fldJ0yvNrCjFTP1Ix',
  company: 'fld61aZyaEkwzbkVY',
  newsletter: 'fldGlQItb8SYsVBGg',
  verified: 'fld8ahav6A1hRDB45',
  unsubscribed: 'fld2kzIDj5hvCRTr9',
  unsubscribedAt: 'fldIjGSXwm1rko0vb',
  signedUpAt: 'fldrbiBHTufXhlgSW',
  lastSignInAt: 'fldnajuFL4vN81qTp',
  sectors: 'fld0K11cHOv596h0A',
  states: 'fldUVhSgbxpWiYWdj',
  source: 'fldPEkhn5c7rf5wVG'
}
const DEFAULT_TABLE = 'tbl3V33K9WVjadzMQ'
const DEFAULT_BASE = 'appFkwB2Aei2oblnz'
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i

// Returns { ok: true, cfg } or { ok: false, missing }. Values are never logged.
export function loadConfig(env = process.env, { needMail = false } = {}) {
  const missing = []
  if (!env.AIRTABLE_API_KEY) missing.push('AIRTABLE_API_KEY')
  const secret = sessionSecret(env)
  if (!secret) missing.push('SIGNAL_SESSION_SECRET')
  const site = String(env.SIGNAL_SITE_URL || '').replace(/\/+$/, '')
  if (!/^https?:\/\/[^/]+$/.test(site)) missing.push('SIGNAL_SITE_URL')
  if (needMail) {
    if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY')
    if (!env.SIGNAL_FROM_EMAIL) missing.push('SIGNAL_FROM_EMAIL')
  }
  if (missing.length) return { ok: false, missing }
  return {
    ok: true,
    cfg: {
      apiKey: env.AIRTABLE_API_KEY,
      base: env.SIGNAL_SUBSCRIBERS_BASE || DEFAULT_BASE, // field IDs below belong to this base
      table: env.SIGNAL_SUBSCRIBERS_TABLE || DEFAULT_TABLE,
      secret,
      site,
      resendKey: env.RESEND_API_KEY,
      from: env.SIGNAL_FROM_EMAIL
    }
  }
}

export function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}
export function sendError(res, status, code, message, extra = {}) {
  sendJson(res, status, { error: { code, message, ...extra } })
}
// Fail closed without saying which variable is missing.
export function unavailable(res) {
  sendError(res, 503, 'signup_unavailable', 'Signup is not available right now. Please try again later.')
}
export function methodNotAllowed(res, allow) {
  res.setHeader('Allow', allow)
  sendError(res, 405, 'method_not_allowed', 'Method not allowed.')
}
export function readBody(req) {
  const b = req?.body
  if (typeof b === 'string') { try { return JSON.parse(b) } catch { return null } }
  return b && typeof b === 'object' && !Array.isArray(b) ? b : null
}

export const normalizeEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '')
export const isEmail = (e) => typeof e === 'string' && e.length <= 254 && EMAIL.test(e)

// Escape a value for a double-quoted Airtable formula string literal.
export function escapeFormulaString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ')
}

function cleanText(v, max) {
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string') return null
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return t.length > max ? null : t
}
const CODE = /^[a-z0-9_:.-]{1,64}$/i
function codeList(v, max) {
  if (v === undefined) return undefined
  if (!Array.isArray(v) || v.length > max) return null
  const out = []
  for (const x of v) {
    if (typeof x !== 'string' || !CODE.test(x)) return null
    if (!out.includes(x)) out.push(x)
  }
  return out
}

export function validateSignup(input) {
  const b = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const fields = {}
  const name = cleanText(b.name, 100)
  if (!name) fields.name = 'Enter your name (up to 100 characters).'
  const email = normalizeEmail(b.email)
  if (!isEmail(email)) fields.email = 'Enter a valid work email address.'
  const company = cleanText(b.company, 150)
  if (company === null) fields.company = 'Company name is too long.'
  if (b.newsletter !== undefined && typeof b.newsletter !== 'boolean') fields.newsletter = 'Choose whether to receive The Monthly Signal.'
  const source = cleanText(b.source, 60)
  const keys = Object.keys(fields)
  if (keys.length) return { ok: false, fields, field: keys[0] }
  // Newsletter defaults to checked (Andy's decision).
  return { ok: true, value: { name, email, company: company || '', newsletter: b.newsletter !== false, source: source || 'pay-first' } }
}

export function validatePreferences(input) {
  const b = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const sectors = codeList(b.sectors, 50)
  const states = codeList(b.states, 60)
  const cities = codeList(b.cities, 200)
  const fields = {}
  if (sectors === null) fields.sectors = 'Invalid sectors.'
  if (states === null) fields.states = 'Invalid states.'
  if (cities === null) fields.cities = 'Invalid cities.'
  if (b.newsletter !== undefined && typeof b.newsletter !== 'boolean') fields.newsletter = 'Invalid newsletter choice.'
  const keys = Object.keys(fields)
  if (keys.length) return { ok: false, fields, field: keys[0] }
  return { ok: true, value: { sectors, states, cities, newsletter: b.newsletter } }
}

// ---- Airtable ----
async function at(cfg, fetchImpl, path, { method = 'GET', body } = {}) {
  const res = await fetchImpl(`https://api.airtable.com/v0/${cfg.base}/${cfg.table}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    console.error(`[subscribers] airtable ${method} ${res.status} ${detail?.error?.type || ''}`)
    throw new Error(`airtable_${res.status}`)
  }
  return res.json()
}

export async function findByEmail(cfg, fetchImpl, email) {
  // Formulas reference fields by NAME (field IDs are not valid inside {}).
  const formula = `LOWER({Email})="${escapeFormulaString(normalizeEmail(email))}"`
  const q = new URLSearchParams({ filterByFormula: formula, maxRecords: '1', returnFieldsByFieldId: 'true' })
  const data = await at(cfg, fetchImpl, `?${q}`)
  return Array.isArray(data.records) && data.records[0] ? data.records[0] : null
}

export async function updateRecord(cfg, fetchImpl, id, fields) {
  return at(cfg, fetchImpl, '', { method: 'PATCH', body: { records: [{ id, fields }], returnFieldsByFieldId: true } })
}

// Idempotent upsert by lowercased email. On an existing row it never touches
// Unsubscribed, Unsubscribed At, Email Verified or Signed Up At, and never
// switches the newsletter off.
export async function upsertSubscriber(cfg, fetchImpl, v, now = new Date()) {
  const existing = await findByEmail(cfg, fetchImpl, v.email)
  if (existing) {
    const fields = { [F.name]: v.name }
    if (v.company) fields[F.company] = v.company
    if (v.newsletter) fields[F.newsletter] = true
    await updateRecord(cfg, fetchImpl, existing.id, fields)
    return { id: existing.id, created: false, unsubscribed: existing.fields?.[F.unsubscribed] === true }
  }
  const data = await at(cfg, fetchImpl, '', {
    method: 'POST',
    body: {
      records: [{ fields: {
        [F.email]: v.email,
        [F.name]: v.name,
        [F.company]: v.company || '',
        [F.newsletter]: v.newsletter,
        [F.signedUpAt]: now.toISOString(),
        [F.source]: v.source
      } }],
      returnFieldsByFieldId: true
    }
  })
  return { id: data.records?.[0]?.id, created: true, unsubscribed: false }
}

// ---- Resend ----
export async function sendEmail(cfg, fetchImpl, { to, subject, html, text, headers }) {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to: [to], subject, html, text, headers })
  })
  if (!res.ok) throw new Error(`resend_${res.status}`)
  return res.json().catch(() => ({}))
}

export function unsubscribeUrl(cfg, email) {
  return `${cfg.site}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken(email, cfg.secret))}`
}

export async function sendMagicLink(cfg, fetchImpl, email, now = Date.now()) {
  const loginUrl = `${cfg.site}/api/auth/verify?token=${encodeURIComponent(loginToken(email, cfg.secret, now))}`
  const unsubUrl = unsubscribeUrl(cfg, email)
  const text = `Sign in to Staffing Signal:\n\n${loginUrl}\n\nThis link works once, for 15 minutes. If you did not ask for it, ignore this email.\n\nUnsubscribe: ${unsubUrl}`
  const html = `<p>Sign in to Staffing Signal:</p><p><a href="${loginUrl}">Sign in</a></p>` +
    '<p>This link works once, for 15 minutes. If you did not ask for it, you can ignore this email.</p>' +
    `<p style="font-size:12px;color:#666"><a href="${unsubUrl}">Unsubscribe</a></p>`
  return sendEmail(cfg, fetchImpl, {
    to: email,
    subject: 'Your Staffing Signal sign-in link',
    text,
    html,
    headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  })
}
