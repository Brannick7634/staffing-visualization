// Signal Subscribers table (Airtable REST via fetch, field IDs only) plus the
// validation, config, password, Resend and response helpers for the signup
// and sign-in endpoints. Passwords are only ever held in memory long enough to
// hash or compare them; they are never stored, logged or echoed.
import bcrypt from 'bcryptjs'
import { sessionSecret, unsubscribeToken, resetToken, confirmToken, passwordFingerprint, sessionToken, sessionCookie } from './signalSession.js'
import { stateByCode } from '../../shared/signal/geography.js'
import { checkArea, cleanCityText, findListedCity } from '../../shared/signal/area.js'
import { cityKeyFor } from './signal/report.js'

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
  source: 'fldPEkhn5c7rf5wVG',
  city: 'fldlcjpoi2omNmM18',
  passwordHash: 'fld79K4mK8Zsxb4Xx', // bcrypt hash only, never returned to a browser
  passwordSetAt: 'fld3iY8vBcRw9X3rz',
  // Client report email daily cap: the UTC day ('YYYY-MM-DD') and how many
  // emails were sent that day. Never the rate, recipients or message.
  reportEmailDay: 'fldfs4He3PM9Lb049',
  reportEmailCount: 'fldiZYx4EQBb2dz1k'
}
const DEFAULT_TABLE = 'tbl3V33K9WVjadzMQ'
const DEFAULT_BASE = 'appFkwB2Aei2oblnz'
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i

// Returns { ok: true, cfg } or { ok: false, missing }. Values are never logged.
export function loadConfig(env = process.env, { needMail = false } = {}) {
  const missing = []
  if (!env.SIGNAL_AIRTABLE_API_KEY && !env.AIRTABLE_API_KEY) missing.push('AIRTABLE_API_KEY')
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
      apiKey: env.SIGNAL_AIRTABLE_API_KEY || env.AIRTABLE_API_KEY,
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
// Auth POSTs must be JSON. A cross-site HTML form can only send urlencoded,
// multipart or text/plain bodies, and a JSON request from another site needs a
// CORS preflight we never answer, so this stops login/logout CSRF.
export function requireJson(req, res) {
  const type = String(req?.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase()
  if (type === 'application/json') return true
  sendError(res, 415, 'unsupported_media_type', 'Send the request as JSON.')
  return false
}
// Body for 429s from these endpoints, in the same { error } shape as the rest.
export const RATE_LIMITED = { error: { code: 'rate_limited', message: 'Too many attempts. Please wait a few minutes and try again.' } }

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

// The reader's area (shared/signal/area.js has the rules). Returns
// { state: 'TX', city: 'Houston, TX' } with the label to store in City, or
// { error: 'state' | 'city', code, message }. Both are required.
export function validateArea(stateIn, cityIn) {
  const a = checkArea(stateIn, cityIn)
  if (!a.ok) return { error: a.field, code: a.code, message: a.message }
  return { state: a.state, city: a.label }
}

const AREA_FIELDS = new Set(['state', 'city', 'homeState', 'homeCity'])
// Code + message for a 400 from validateSignup/validatePreferences: the area's
// own code (state_required, invalid_state, city_required, invalid_city,
// links_not_allowed) when only the area is wrong, else invalid_fields.
export function fieldErrorCode(checked, fallbackMessage) {
  const areaOnly = Object.keys(checked.fields).every((k) => AREA_FIELDS.has(k))
  if (areaOnly && checked.codes?.[checked.field]) return { code: checked.codes[checked.field], message: checked.fields[checked.field] }
  return { code: 'invalid_fields', message: fallbackMessage }
}

const CITY_KEY_LINE = /^[A-Z]{2}:[a-z0-9-]{1,60}$/
// City text as stored ('Houston, TX', 'Katy, TX', or an older bare 'Houston')
// -> the report's city key ('TX:houston', 'TX:katy'). A label for another
// state ('Houston, TX' when the home state is CA) gives null.
export function cityKeyFromStored(state, text) {
  if (!state || typeof text !== 'string' || !text.trim()) return null
  const m = /,\s*([A-Za-z]{2})\.?\s*$/.exec(text)
  if (m && m[1].toUpperCase() !== state && stateByCode(m[1].toUpperCase())) return null
  const name = cleanCityText(text, state)
  if (!name) return null
  const listed = findListedCity(state, name)
  return listed ? listed.key : cityKeyFor(state, name)
}

// The reader's area for the monthly report page and email:
// state = the first States line that is a state code (the home state);
// city = the City field, else a 'TX:houston' line in States for that state.
export function subscriberArea(fields) {
  const lines = String(fields?.[F.states] || '').split('\n').map((s) => s.trim())
  const state = lines.find((s) => /^[A-Z]{2}$/.test(s) && stateByCode(s)) || null
  const cityText = typeof fields?.[F.city] === 'string' ? fields[F.city] : ''
  let cityKey = state && cityText ? cityKeyFromStored(state, cityText) : null
  if (!cityKey && state) cityKey = lines.find((s) => CITY_KEY_LINE.test(s) && s.startsWith(`${state}:`)) || null
  return { state, cityKey }
}

// ---- Passwords ----
export const PASSWORD_MIN_CHARS = 8
export const PASSWORD_MAX_BYTES = 72 // bcrypt ignores everything past 72 bytes
const BCRYPT_COST = 10
// bcrypt hash of a random value nobody knows. Compared against when there is
// no account (or no password yet) so every failed sign-in costs the same time.
const DUMMY_HASH = '$2b$10$wSudbY//k3I3gUECsPYkeeMNoOIpB0LqPMd1iKGBKWA2LD1B/9Zt6'

// Returns an error message, or '' when the password is acceptable. Not trimmed:
// spaces are part of the password.
export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw === '') return `Enter a password (at least ${PASSWORD_MIN_CHARS} characters).`
  if ([...pw].length < PASSWORD_MIN_CHARS) return `Use at least ${PASSWORD_MIN_CHARS} characters.`
  if (Buffer.byteLength(pw, 'utf8') > PASSWORD_MAX_BYTES) return 'That password is too long. Use at most 72 bytes (emoji and accented letters count as 2 to 4 each).'
  return ''
}

export function hashPassword(pw) {
  return bcrypt.hash(pw, BCRYPT_COST)
}

const isBcryptHash = (h) => typeof h === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(h)

// True only for a stored hash that matches. Always runs one bcrypt compare.
export async function checkPassword(pw, hash) {
  const usable = typeof pw === 'string' && pw !== '' && Buffer.byteLength(pw, 'utf8') <= PASSWORD_MAX_BYTES
  const real = usable && isBcryptHash(hash)
  const match = await bcrypt.compare(usable ? pw : 'x', real ? hash : DUMMY_HASH)
  return real && match
}

// Sets the 30-day signed session cookie for this email, tied to the password
// hash it was started with (a later reset ends it for record-level actions).
export function startSession(res, cfg, email, { now = Date.now(), hash = '' } = {}) {
  res.setHeader('Set-Cookie', sessionCookie(sessionToken(email, cfg.secret, now, passwordFingerprint(hash, cfg.secret))))
}

export function validateSignup(input) {
  const b = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const fields = {}
  const name = cleanText(b.name, 100)
  if (!name) fields.name = 'Enter your name (up to 100 characters).'
  const email = normalizeEmail(b.email)
  if (!isEmail(email)) fields.email = 'Enter a valid work email address.'
  const passwordError = validatePassword(b.password)
  if (passwordError) fields.password = passwordError
  const company = cleanText(b.company, 150)
  if (company === null) fields.company = 'Company name is too long.'
  if (b.newsletter !== undefined && typeof b.newsletter !== 'boolean') fields.newsletter = 'Choose whether to receive The Monthly Signal.'
  const source = cleanText(b.source, 60)
  // State and city are required: The Monthly Signal is sent by area.
  const codes = {}
  const area = validateArea(b.state, b.city)
  if (area.error) {
    fields[area.error] = area.message
    codes[area.error] = area.code
  }
  const keys = Object.keys(fields)
  if (keys.length) return { ok: false, fields, field: keys[0], codes }
  // Newsletter defaults to checked (Andy's decision).
  return { ok: true, value: { name, email, password: b.password, company: company || '', newsletter: b.newsletter !== false, source: source || 'pay-first', state: area.state, city: area.city } }
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
  // homeState / homeCity: the reader's own area for the monthly report, with
  // the same rules as signup (a state needs a city). Both empty clears it;
  // neither sent leaves the saved area alone.
  const codes = {}
  const blank = (v) => v === undefined || v === null || v === ''
  let home = null
  if (!blank(b.homeState) || !blank(b.homeCity)) {
    const a = validateArea(b.homeState, b.homeCity)
    if (a.error) {
      const key = a.error === 'state' ? 'homeState' : 'homeCity'
      fields[key] = a.message
      codes[key] = a.code
    } else home = a
  } else if (b.homeState !== undefined || b.homeCity !== undefined) home = { state: '', city: '' }
  const keys = Object.keys(fields)
  if (keys.length) return { ok: false, fields, field: keys[0], codes }
  return { ok: true, value: { sectors, states, cities, newsletter: b.newsletter, ...(home ? { homeState: home.state, homeCity: home.city } : {}) } }
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

// Every row for this email (up to `max`), oldest first. Used after signup to
// catch two signups for the same email that raced past findByEmail.
export async function findAllByEmail(cfg, fetchImpl, email, max = 2) {
  const formula = `LOWER({Email})="${escapeFormulaString(normalizeEmail(email))}"`
  const q = new URLSearchParams({ filterByFormula: formula, maxRecords: String(max), returnFieldsByFieldId: 'true' })
  const data = await at(cfg, fetchImpl, `?${q}`)
  const rows = Array.isArray(data.records) ? data.records : []
  const when = (r) => Date.parse(r.createdTime || '') || 0
  return rows.slice().sort((a, b) => when(a) - when(b))
}

export async function deleteRecord(cfg, fetchImpl, id) {
  return at(cfg, fetchImpl, `/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function updateRecord(cfg, fetchImpl, id, fields) {
  return at(cfg, fetchImpl, '', { method: 'PATCH', body: { records: [{ id, fields }], returnFieldsByFieldId: true } })
}

// Creates a new subscriber row. The caller has already checked that no row
// exists for this email; existing rows are never modified by signup.
export async function createSubscriber(cfg, fetchImpl, v, { passwordHash, now = new Date() }) {
  const stamp = now.toISOString()
  const data = await at(cfg, fetchImpl, '', {
    method: 'POST',
    body: {
      records: [{ fields: {
        [F.email]: v.email,
        [F.name]: v.name,
        [F.company]: v.company || '',
        [F.newsletter]: v.newsletter,
        [F.signedUpAt]: stamp,
        [F.lastSignInAt]: stamp,
        [F.passwordHash]: passwordHash,
        [F.passwordSetAt]: stamp,
        [F.source]: v.source,
        ...(v.state ? { [F.states]: v.state } : {}),
        ...(v.city ? { [F.city]: v.city } : {})
      } }],
      returnFieldsByFieldId: true
    }
  })
  return { id: data.records?.[0]?.id, createdTime: data.records?.[0]?.createdTime }
}

// ---- Resend ----
// One recipient per call. Optional `reply_to` (or `replyTo`) and
// `attachments` ([{ filename, content: base64 }]) are added only when given.
export async function sendEmail(cfg, fetchImpl, { to, subject, html, text, headers, reply_to: replyToRaw, replyTo = replyToRaw, attachments }) {
  const payload = { from: cfg.from, to: [to], subject, html, text, headers }
  if (replyTo) payload.reply_to = replyTo
  if (Array.isArray(attachments) && attachments.length) payload.attachments = attachments
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`resend_${res.status}`)
  return res.json().catch(() => ({}))
}

export function unsubscribeUrl(cfg, email) {
  return `${cfg.site}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken(email, cfg.secret))}`
}

// Emails a 24-hour link that confirms the reader owns this address. The link
// opens a page with a Confirm button (a POST), so mail scanners that follow
// links cannot confirm an address on their own.
export async function sendEmailConfirmation(cfg, fetchImpl, email, { now = Date.now() } = {}) {
  const token = confirmToken(email, cfg.secret, { now })
  const confirmUrl = `${cfg.site}/confirm-email?token=${encodeURIComponent(token)}`
  const text = `Confirm your email address for The Staffing Signal:

${confirmUrl}

Confirming lets you email Client Pay Market Reports to other people. This link works for 24 hours. If you did not ask for it, ignore this email.`
  const html = '<p>Confirm your email address for The Staffing Signal:</p>' +
    `<p><a href="${confirmUrl}">Confirm your email</a></p>` +
    '<p>Confirming lets you email Client Pay Market Reports to other people. This link works for 24 hours. If you did not ask for it, you can ignore this email.</p>'
  return sendEmail(cfg, fetchImpl, { to: email, subject: 'Confirm your email for The Staffing Signal', text, html })
}

// Emails a one-time, 60-minute password reset link. `currentHash` is the
// stored hash (or '') so the link dies as soon as any password is set.
export async function sendPasswordReset(cfg, fetchImpl, email, { currentHash = '', now = Date.now() } = {}) {
  const token = resetToken(email, cfg.secret, { now, h: passwordFingerprint(currentHash, cfg.secret) })
  const resetUrl = `${cfg.site}/reset-password?token=${encodeURIComponent(token)}`
  const unsubUrl = unsubscribeUrl(cfg, email)
  const text = `Set a new password for Staffing Signal:

${resetUrl}

This link works once, for 60 minutes. If you did not ask for it, ignore this email and your password stays the same.

Unsubscribe: ${unsubUrl}`
  const html = `<p>Set a new password for Staffing Signal:</p><p><a href="${resetUrl}">Reset your password</a></p>` +
    '<p>This link works once, for 60 minutes. If you did not ask for it, you can ignore this email and your password stays the same.</p>' +
    `<p style="font-size:12px;color:#666"><a href="${unsubUrl}">Unsubscribe</a></p>`
  return sendEmail(cfg, fetchImpl, {
    to: email,
    subject: 'Reset your Staffing Signal password',
    text,
    html,
    headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  })
}
