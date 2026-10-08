// POST /api/subscribe  { name, email, password, state, city, company?, newsletter?, source? }
// state + city are required (The Monthly Signal is sent by area): city is a
// listed city key ('TX:houston') or a typed city name. City is stored as
// 'Houston, TX' / '<typed name>, TX' and States as the state code. An
// area-only problem answers 400 with its own code (state_required,
// invalid_state, city_required, invalid_city, links_not_allowed); anything
// else is invalid_fields. Both carry fields (messages) and codes.
// Creates the subscriber with a bcrypt-hashed password and signs them in
// straight away (session cookie). No email is sent. An email that already has
// an account gets 409 and its row is left untouched, so signup can never be
// used to overwrite someone else's password, name or preferences.
// Two signups for one email at the same moment can both pass the first check,
// so after creating the row we look again: when an older row for the email
// exists, ours is deleted and the caller gets the same 409 (no session).
import { loadConfig, readBody, requireJson, RATE_LIMITED, sendJson, sendError, unavailable, methodNotAllowed, validateSignup, fieldErrorCode, findByEmail, findAllByEmail, deleteRecord, createSubscriber, hashPassword, startSession } from '../subscribers.js'
import { rateLimit } from '../security.js'

const exists = (res) => sendError(res, 409, 'account_exists', 'An account with this email already exists. Sign in, or use Forgot password to set a new one.')
const when = (r) => Date.parse(r?.createdTime || '') || 0

// True when another row for this email is at least as old as the one we made.
async function lostRace(cfg, fetchImpl, email, id) {
  let rows
  try {
    rows = await findAllByEmail(cfg, fetchImpl, email, 3)
  } catch {
    console.error('[subscribers] signup: duplicate check failed')
    return false
  }
  const mine = rows.find((r) => r.id === id)
  return rows.some((r) => r.id !== id && (!mine || when(r) <= when(mine)))
}

export function createSubscribeHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  return async function subscribeHandler(req, res) {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    if (!requireJson(req, res)) return
    if (!rateLimit(req, res, { key: 'subscribe', limit: 5, windowMs: 600000, body: RATE_LIMITED })) return
    const conf = loadConfig(env)
    if (!conf.ok) return unavailable(res)
    const checked = validateSignup(readBody(req))
    if (!checked.ok) {
      const { code, message } = fieldErrorCode(checked, 'Please check the highlighted fields.')
      return sendError(res, 400, code, message, { fields: checked.fields, field: checked.field, codes: checked.codes })
    }
    const { password, ...v } = checked.value
    const at = now()
    let created
    let hash
    try {
      if (await findByEmail(conf.cfg, fetchImpl, v.email)) return exists(res)
      hash = await hashPassword(password)
      created = await createSubscriber(conf.cfg, fetchImpl, v, { passwordHash: hash, now: at })
    } catch {
      return sendError(res, 502, 'save_failed', 'We could not save your signup. Please try again.')
    }
    if (created.id && await lostRace(conf.cfg, fetchImpl, v.email, created.id)) {
      try {
        await deleteRecord(conf.cfg, fetchImpl, created.id)
      } catch {
        console.error('[subscribers] signup: could not remove duplicate row')
      }
      return exists(res)
    }
    startSession(res, conf.cfg, v.email, { now: at.getTime(), hash })
    return sendJson(res, 200, { ok: true, signedIn: true, newsletter: v.newsletter })
  }
}

export default createSubscribeHandler()
