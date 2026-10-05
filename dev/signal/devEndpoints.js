// DEVELOPMENT ONLY. Simulated endpoints for the local preview:
//   POST /api/signal/dev/access       set/clear the simulated-access cookie
//   POST /api/signal/dev/signup       simulated free-access signup
//   POST /api/signal/dev/notify       "tell me when this benchmark is available"
//   POST /api/signal/dev/preferences  echo of followed sectors/markets
//   GET  /api/signal/dev/scenarios    States Lab synthetic scenarios
//
// Nothing is written anywhere: no Airtable, no email, no files, no logs. The
// signup "store" is an in-memory set of salted hashes of normalized emails so
// repeat signups are idempotent within one dev-server run; names and emails
// are never kept or logged.
import { createHmac, randomBytes } from 'node:crypto'
import { ACCESS } from '../../shared/signal/contract.js'
import { SECTORS } from '../../shared/signal/taxonomy.js'
import { stateByCode, cityByKey } from '../../shared/signal/geography.js'
import { sendJson, validatePaySelection } from '../../api/_lib/signal/handlers.js'
import { simAccessCookie } from './devAccess.js'
import { buildScenarios } from './syntheticScenarios.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const SECTOR_KEYS = new Set(SECTORS.map((s) => s.key))

function body(req) {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null
}

function badRequest(res, code, extra = {}) {
  return sendJson(res, 400, { ok: false, simulated: true, error: { code, ...extra } })
}

function requireMethod(req, res, method) {
  if (req.method === method) return true
  res.setHeader('Allow', method)
  sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed' } })
  return false
}

// {roleKey,state,city}, validated like a pay request.
function validSelection(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return false
  return validatePaySelection({ role: context.roleKey, state: context.state || undefined, city: context.city || undefined }).ok
}

export function createDevAccessHandler() {
  return function devAccessHandler(req, res) {
    if (!requireMethod(req, res, 'POST')) return
    const b = body(req)
    const access = b ? b.access : null
    if (access !== ACCESS.PUBLIC && access !== ACCESS.AUTHORIZED) return badRequest(res, 'invalid_access', { field: 'access' })
    res.setHeader('Set-Cookie', simAccessCookie(access))
    return sendJson(res, 200, { simulated: true, access })
  }
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function validateSignup(input) {
  const b = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const fields = {}
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (name.length < 1 || name.length > 100) fields.name = 'Enter your name (up to 100 characters).'
  const email = normalizeEmail(b.email)
  if (!email || email.length > 254 || !EMAIL.test(email)) fields.email = 'Enter a valid work email address.'
  if (b.newsletter !== undefined && typeof b.newsletter !== 'boolean') fields.newsletter = 'Choose whether to receive The Monthly Signal.'
  // `context` (the comparison to return to) is accepted but never stored,
  // echoed or validated: a stale selection must not block a signup.
  const invalid = Object.keys(fields)
  if (invalid.length) return { ok: false, fields, field: invalid[0] }
  return { ok: true, email, newsletter: b.newsletter === true }
}

export function createDevSignupHandler() {
  // Per-process salt: ids are stable within one dev-server run only.
  const salt = randomBytes(16)
  const seen = new Set()
  return function devSignupHandler(req, res) {
    if (!requireMethod(req, res, 'POST')) return
    const checked = validateSignup(body(req))
    if (!checked.ok) return badRequest(res, 'invalid_fields', { fields: checked.fields, field: checked.field })
    const digest = createHmac('sha256', salt).update(checked.email).digest('hex')
    const created = !seen.has(digest)
    seen.add(digest)
    res.setHeader('Set-Cookie', simAccessCookie(ACCESS.AUTHORIZED))
    return sendJson(res, 200, {
      ok: true,
      simulated: true,
      subscriberId: `dev-sim-${digest.slice(0, 6)}`,
      created,
      newsletter: checked.newsletter,
      message: 'Simulated signup — nothing was saved to Airtable and no email was sent.'
    })
  }
}

export function createDevNotifyHandler() {
  return function devNotifyHandler(req, res) {
    if (!requireMethod(req, res, 'POST')) return
    const b = body(req)
    if (!b || !validSelection(b)) return badRequest(res, 'invalid_selection')
    return sendJson(res, 200, { ok: true, simulated: true })
  }
}

function stringList(value, isValid, max) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > max) return null
  const out = []
  for (const item of value) {
    if (typeof item !== 'string' || !isValid(item)) return null
    if (!out.includes(item)) out.push(item)
  }
  return out
}

export function createDevPreferencesHandler() {
  return function devPreferencesHandler(req, res) {
    if (!requireMethod(req, res, 'POST')) return
    const b = body(req)
    if (!b) return badRequest(res, 'invalid_fields', { field: 'body' })
    const sectors = stringList(b.sectors, (k) => SECTOR_KEYS.has(k), SECTOR_KEYS.size)
    if (!sectors) return badRequest(res, 'invalid_fields', { field: 'sectors' })
    const states = stringList(b.states, (c) => Boolean(stateByCode(c)), 51)
    if (!states) return badRequest(res, 'invalid_fields', { field: 'states' })
    const cities = stringList(b.cities, (k) => Boolean(cityByKey(k)), 200)
    if (!cities) return badRequest(res, 'invalid_fields', { field: 'cities' })
    if (b.newsletter !== undefined && typeof b.newsletter !== 'boolean') return badRequest(res, 'invalid_fields', { field: 'newsletter' })
    const alerts = b.alerts === undefined ? 'off' : b.alerts
    if (alerts !== 'off' && alerts !== 'weekly') return badRequest(res, 'invalid_fields', { field: 'alerts' })
    return sendJson(res, 200, {
      ok: true,
      simulated: true,
      saved: { sectors, states, cities, newsletter: b.newsletter === true, alerts }
    })
  }
}

export function createDevScenariosHandler() {
  return async function devScenariosHandler(req, res) {
    if (!requireMethod(req, res, 'GET')) return
    try {
      return sendJson(res, 200, await buildScenarios())
    } catch (error) {
      console.error(`[signal] dev scenarios failed (${error && error.name ? error.name : 'Error'})`)
      return sendJson(res, 500, { error: { code: 'internal_error', message: 'Could not build the synthetic scenarios.' } })
    }
  }
}
