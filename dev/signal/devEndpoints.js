// DEVELOPMENT ONLY. Simulated endpoints for the local preview:
//   POST /api/signal/dev/access       set/clear the simulated-access cookie
//   POST /api/signal/dev/signup       simulated signup with a password (signs in);
//                                     state + city required, same rules as production
//   POST /api/signal/dev/login        simulated password sign-in
//   POST /api/signal/dev/forgot       simulated reset request (returns devResetUrl)
//   POST /api/signal/dev/reset        simulated password reset (signs in)
//   POST /api/signal/dev/logout       clears the simulated-access cookie
//   POST /api/signal/dev/notify       "tell me when this benchmark is available"
//   POST /api/signal/dev/preferences  saves followed sectors/markets + home area (in memory)
//   GET  /api/signal/dev/preferences  the saved settings (production shape; signed-in only)
//   GET  /api/signal/dev/scenarios    States Lab synthetic scenarios
//
// Nothing is written anywhere: no Airtable, no email, no files, no logs. The
// saved preferences and the account "store" live in memory for one dev-server
// run. Accounts are keyed by salted hashes of normalized emails and hold only
// bcrypt hashes; names, emails and passwords are never kept, echoed or logged.
import { createHmac, randomBytes } from 'node:crypto'
import { ACCESS } from '../../shared/signal/contract.js'
import { stateByCode, cityByKey } from '../../shared/signal/geography.js'
import { sendJson, validatePaySelection } from '../../api/_lib/signal/handlers.js'
import { validatePassword, hashPassword, checkPassword, validateArea, validatePreferences, fieldErrorCode, F } from '../../api/_lib/subscribers.js'
import { preferencesFromRecord, preferenceFields } from '../../api/_lib/routes/preferences.js'
import { resetToken, passwordFingerprint, verifyToken } from '../../api/_lib/signalSession.js'
import { simAccessCookie, devAccess } from './devAccess.js'
import { buildScenarios } from './syntheticScenarios.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

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

const isEmail = (email) => Boolean(email) && email.length <= 254 && EMAIL.test(email)

export function validateSignup(input) {
  const b = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const fields = {}
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (name.length < 1 || name.length > 100) fields.name = 'Enter your name (up to 100 characters).'
  const email = normalizeEmail(b.email)
  if (!isEmail(email)) fields.email = 'Enter a valid work email address.'
  const passwordError = validatePassword(b.password)
  if (passwordError) fields.password = passwordError
  if (b.newsletter !== undefined && typeof b.newsletter !== 'boolean') fields.newsletter = 'Choose whether to receive The Monthly Signal.'
  // State + city: the production rules (api/_lib/subscribers.js validateArea).
  // The area is checked but never stored or echoed.
  const codes = {}
  const area = validateArea(b.state, b.city)
  if (area.error) {
    fields[area.error] = area.message
    codes[area.error] = area.code
  }
  // `context` (the comparison to return to) is accepted but never stored,
  // echoed or validated: a stale selection must not block a signup.
  const invalid = Object.keys(fields)
  if (invalid.length) return { ok: false, fields, field: invalid[0], codes }
  return { ok: true, email, password: b.password, newsletter: b.newsletter === true }
}

// In-memory accounts shared by the simulated signup, sign-in and password
// reset endpoints. Keys are salted HMACs of normalized emails; values hold
// only a bcrypt hash and when it was set. Everything is lost on restart.
export function createDevAccountStore({ now = () => Date.now() } = {}) {
  // Per-process salt and token secret: ids and links work within one run only.
  const salt = randomBytes(16)
  const secret = randomBytes(32).toString('base64url')
  const accounts = new Map()
  return {
    now,
    secret,
    accounts,
    idFor: (email) => createHmac('sha256', salt).update(email).digest('hex')
  }
}

const signIn = (res) => res.setHeader('Set-Cookie', simAccessCookie(ACCESS.AUTHORIZED))

export function createDevSignupHandler(store = createDevAccountStore()) {
  return async function devSignupHandler(req, res) {
    if (!requireMethod(req, res, 'POST')) return
    const checked = validateSignup(body(req))
    if (!checked.ok) {
      const { code, message } = fieldErrorCode(checked, 'Please check the highlighted fields.')
      return badRequest(res, code, { message, fields: checked.fields, field: checked.field, codes: checked.codes })
    }
    const digest = store.idFor(checked.email)
    if (store.accounts.has(digest)) {
      return sendJson(res, 409, { ok: false, simulated: true, error: { code: 'account_exists', message: 'An account with this email already exists. Sign in, or use Forgot password to set a new one.' } })
    }
    store.accounts.set(digest, { hash: await hashPassword(checked.password), passwordSetAt: store.now() })
    signIn(res)
    return sendJson(res, 200, {
      ok: true,
      simulated: true,
      signedIn: true,
      subscriberId: `dev-sim-${digest.slice(0, 6)}`,
      created: true,
      newsletter: checked.newsletter,
      message: 'Simulated signup — nothing was saved to Airtable and no email was sent.'
    })
  }
}

export function createDevLoginHandler(store = createDevAccountStore()) {
  return async function devLoginHandler(req, res) {
    if (!requireMethod(req, res, 'POST')) return
    const b = body(req) || {}
    const email = normalizeEmail(b.email)
    const account = isEmail(email) ? store.accounts.get(store.idFor(email)) : null
    if (!(await checkPassword(b.password, account?.hash))) {
      return sendJson(res, 401, { ok: false, simulated: true, error: { code: 'invalid_credentials', message: 'Email or password is incorrect.' } })
    }
    signIn(res)
    return sendJson(res, 200, { ok: true, simulated: true, signedIn: true })
  }
}

// Always answers the same way. DEV ONLY: the reset link comes back in the JSON
// (devResetUrl) instead of by email, for any valid email, so the "signed up
// before passwords" path can be tried too. The link carries the salted id,
// never the email.
export function createDevForgotHandler(store = createDevAccountStore()) {
  return function devForgotHandler(req, res) {
    if (!requireMethod(req, res, 'POST')) return
    const email = normalizeEmail(body(req)?.email)
    if (!isEmail(email)) return badRequest(res, 'invalid_fields', { fields: { email: 'Enter a valid work email address.' }, field: 'email' })
    const digest = store.idFor(email)
    const h = passwordFingerprint(store.accounts.get(digest)?.hash, store.secret)
    const token = resetToken(digest, store.secret, { now: store.now(), h })
    return sendJson(res, 200, {
      ok: true,
      simulated: true,
      message: 'If that email has an account, a password reset link is on its way.',
      devResetUrl: `/reset-password?token=${encodeURIComponent(token)}`
    })
  }
}

export function createDevResetHandler(store = createDevAccountStore()) {
  return async function devResetHandler(req, res) {
    if (!requireMethod(req, res, 'POST')) return
    const b = body(req) || {}
    const t = store.now()
    const payload = verifyToken(b.token, store.secret, { purpose: 'reset', now: t })
    if (!payload || typeof payload.iat !== 'number' || typeof payload.h !== 'string') {
      return badRequest(res, 'link_expired', { message: 'This reset link has expired or is not valid. Ask for a new one.' })
    }
    const account = store.accounts.get(payload.email)
    if ((account && account.passwordSetAt >= payload.iat) || passwordFingerprint(account?.hash, store.secret) !== payload.h) {
      return badRequest(res, 'link_used', { message: 'This reset link has already been used. Ask for a new one if you need to.' })
    }
    const problem = validatePassword(b.password)
    if (problem) return badRequest(res, 'invalid_fields', { fields: { password: problem }, field: 'password' })
    store.accounts.set(payload.email, { hash: await hashPassword(b.password), passwordSetAt: t })
    signIn(res)
    return sendJson(res, 200, { ok: true, simulated: true, signedIn: true })
  }
}

export function createDevLogoutHandler() {
  return function devLogoutHandler(req, res) {
    if (!requireMethod(req, res, 'POST')) return
    res.setHeader('Set-Cookie', simAccessCookie(ACCESS.PUBLIC))
    return sendJson(res, 200, { ok: true, simulated: true })
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

// The dev reader's saved settings, as production stores them on the
// subscriber row (States lines + City label). Starts as Houston, TX (the dev
// report area) and lives in memory for one dev-server run.
export const DEV_SAVED_PREFERENCES = Object.freeze({
  [F.states]: 'TX',
  [F.city]: 'Houston, TX',
  [F.newsletter]: true,
  [F.sectors]: 'light-industrial'
})

// GET: the saved settings in the production shape (needs the simulated
// signed-in cookie, else 401 sign_in_required). POST: validated like before,
// applied to the in-memory row with the production merge, and echoed.
export function createDevPreferencesHandler({ saved = DEV_SAVED_PREFERENCES } = {}) {
  const row = { ...saved }
  return function devPreferencesHandler(req, res) {
    if (req.method === 'GET') {
      if (devAccess(req).access !== ACCESS.AUTHORIZED) {
        return sendJson(res, 401, { error: { code: 'sign_in_required', message: 'Please sign in to see your preferences.' } })
      }
      return sendJson(res, 200, preferencesFromRecord(row))
    }
    if (!requireMethod(req, res, 'POST')) return
    // Like production (401 without a session): the simulated sign-in.
    if (devAccess(req).access !== ACCESS.AUTHORIZED) {
      return sendJson(res, 401, { error: { code: 'sign_in_required', message: 'Please sign in to save preferences.' } })
    }
    const b = body(req)
    if (!b) return badRequest(res, 'invalid_fields', { field: 'body' })
    const states = stringList(b.states, (c) => Boolean(stateByCode(c)), 51)
    if (!states) return badRequest(res, 'invalid_fields', { field: 'states' })
    const cities = stringList(b.cities, (k) => Boolean(cityByKey(k)), 200)
    if (!cities) return badRequest(res, 'invalid_fields', { field: 'cities' })
    if (b.newsletter !== undefined && typeof b.newsletter !== 'boolean') return badRequest(res, 'invalid_fields', { field: 'newsletter' })
    const alerts = b.alerts === undefined ? 'off' : b.alerts
    if (alerts !== 'off' && alerts !== 'weekly') return badRequest(res, 'invalid_fields', { field: 'alerts' })
    // Home area (homeState + homeCity) and the merge: the production rules;
    // the area is echoed as the label production would store ('Houston, TX').
    const checked = validatePreferences({ sectors: b.sectors, states: b.states, cities: b.cities, newsletter: b.newsletter, homeState: b.homeState, homeCity: b.homeCity })
    if (!checked.ok) {
      const { code, message } = fieldErrorCode(checked, 'Please check your selections.')
      return badRequest(res, code, { message, fields: checked.fields, field: checked.field, codes: checked.codes })
    }
    const v = checked.value
    // Sectors follow production's rule (any well-formed key): the page sends
    // back saved keys it does not list, and those must save here too.
    const sectors = v.sectors || []
    Object.assign(row, preferenceFields(v, row))
    const area = v.homeState !== undefined ? { homeState: v.homeState, homeCity: v.homeCity } : {}
    return sendJson(res, 200, {
      ok: true,
      simulated: true,
      // Like production, a newsletter choice not sent is left unchanged.
      saved: { sectors, states, cities, ...(typeof b.newsletter === 'boolean' ? { newsletter: b.newsletter } : {}), alerts, ...area }
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
