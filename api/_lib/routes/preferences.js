// GET  /api/preferences  -> the signed-in reader's saved settings:
//   { name?, area: { state, cityKey|null, typedCity|null, label } | null,
//     newsletter, unsubscribed?: true, sectors, states, cities }
// Only these fields: never the password hash, email, tokens or any other
// column. The Preferences page loads it so the form shows what is saved.
// POST /api/preferences  { sectors?, states?, cities?, newsletter?, homeState?, homeCity? }
// Signed-in subscribers only (session cookie), and only a session started with
// the password currently stored: after a password reset, older sessions get
// 401 here. Stores sectors and states
// (cities are stored with states as "TX:houston"-style keys). Turning the
// newsletter on never clears Unsubscribed.
// homeState + homeCity (the reader's area for The Monthly Signal) follow the
// signup rules: homeCity is a listed city key or a typed name, both required
// together; stored as the first States line and City ('Houston, TX'). Not
// sent = the saved area is kept; both '' = cleared.
import { loadConfig, readBody, requireJson, sendJson, sendError, unavailable, methodNotAllowed, validatePreferences, fieldErrorCode, findByEmail, updateRecord, F } from '../subscribers.js'
import { verifySession, sessionMatchesHash } from '../signalSession.js'
import { stateByCode } from '../../../shared/signal/geography.js'
import { storedLines, savedHomeState, savedArea } from '../../../shared/signal/area.js'

const STATE_LINE = /^[A-Z]{2}$/
const CITY_LINE = /^[A-Z]{2}:[a-z0-9-]{1,60}$/
const CODE_LINE = /^[a-z0-9_:.-]{1,64}$/i
const unique = (list) => [...new Set(list)]

// The GET body from a subscriber row's fields. Followed states include the
// home state (it is always the first States line).
export function preferencesFromRecord(fields = {}) {
  const lines = storedLines(fields[F.states])
  const name = typeof fields[F.name] === 'string' ? fields[F.name].trim() : ''
  return {
    ...(name ? { name } : {}),
    area: savedArea(fields[F.states], fields[F.city]),
    // An unsubscribe link also sets Newsletter off; either way no email goes out.
    newsletter: fields[F.newsletter] === true && fields[F.unsubscribed] !== true,
    // Unsubscribed by link: the page locks the box and says why (ticking it
    // would not restart the email, see the POST note above).
    ...(fields[F.unsubscribed] === true ? { unsubscribed: true } : {}),
    sectors: unique(storedLines(fields[F.sectors]).filter((x) => CODE_LINE.test(x))),
    states: unique(lines.filter((x) => STATE_LINE.test(x) && stateByCode(x))),
    cities: unique(lines.filter((x) => CITY_LINE.test(x)))
  }
}

// Airtable fields to write for a validated save (`v` from validatePreferences)
// over the saved row's fields.
export function preferenceFields(v, saved = {}) {
  const fields = {}
  if (v.sectors) fields[F.sectors] = v.sectors.join('\n')
  // The home state (monthly report area) is always the FIRST line of States.
  // Home area not sent: the saved home state stays first (the state of the
  // saved City label, else the first state line), so saving followed
  // states never moves or drops the reader's monthly-email area.
  const sentHome = v.homeState !== undefined ? v.homeState : null
  if (v.states || v.cities || sentHome !== null) {
    const lines = storedLines(saved[F.states])
    const home = sentHome !== null ? sentHome : savedHomeState(lines, saved[F.city])
    // Lists not sent keep their saved lines (minus the old home line).
    const kept = (v.states || v.cities)
      ? [...(v.states || []), ...(v.cities || [])]
      : lines.slice(sentHome !== null && STATE_LINE.test(lines[0] || '') ? 1 : 0)
    const rest = kept.filter((x) => x !== home)
    fields[F.states] = [...(home ? [home] : []), ...rest].join('\n')
  }
  if (v.homeCity !== undefined) fields[F.city] = v.homeCity
  if (typeof v.newsletter === 'boolean') fields[F.newsletter] = v.newsletter
  return fields
}

export function createPreferencesHandler({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  // The signed-in reader's row, or null (no session, no row, or a session
  // from before the current password).
  async function signedInRecord(conf, session) {
    const record = await findByEmail(conf.cfg, fetchImpl, session.email)
    return record && sessionMatchesHash(session, record.fields?.[F.passwordHash], conf.cfg.secret) ? record : null
  }

  async function readPreferences(req, res, conf) {
    const session = verifySession(req, { env })
    if (!session) return sendError(res, 401, 'sign_in_required', 'Please sign in to see your preferences.')
    let record
    try {
      record = await signedInRecord(conf, session)
    } catch {
      return sendError(res, 502, 'load_failed', 'We could not load your preferences. Please try again.')
    }
    if (!record) return sendError(res, 401, 'sign_in_required', 'Please sign in to see your preferences.')
    return sendJson(res, 200, preferencesFromRecord(record.fields || {}))
  }

  return async function preferencesHandler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, 'GET, POST')
    if (req.method === 'POST' && !requireJson(req, res)) return
    const conf = loadConfig(env)
    if (!conf.ok) return unavailable(res)
    if (req.method === 'GET') return readPreferences(req, res, conf)
    const session = verifySession(req, { env })
    if (!session) return sendError(res, 401, 'sign_in_required', 'Please sign in to save preferences.')
    const checked = validatePreferences(readBody(req))
    if (!checked.ok) {
      const { code, message } = fieldErrorCode(checked, 'Please check your selections.')
      return sendError(res, 400, code, message, { fields: checked.fields, field: checked.field, codes: checked.codes })
    }
    const v = checked.value
    try {
      const record = await signedInRecord(conf, session)
      if (!record) return sendError(res, 401, 'sign_in_required', 'Please sign in to save preferences.')
      const fields = preferenceFields(v, record.fields || {})
      if (Object.keys(fields).length) await updateRecord(conf.cfg, fetchImpl, record.id, fields)
    } catch {
      return sendError(res, 502, 'save_failed', 'We could not save your preferences. Please try again.')
    }
    return sendJson(res, 200, { ok: true, saved: { sectors: v.sectors, states: v.states, cities: v.cities, newsletter: v.newsletter, homeState: v.homeState, homeCity: v.homeCity } })
  }
}

export default createPreferencesHandler()
