// POST /api/preferences  { sectors?, states?, cities?, newsletter?, homeState?, homeCity? }
// Signed-in subscribers only (session cookie). Stores sectors and states
// (cities are stored with states as "TX:houston"-style keys). Turning the
// newsletter on never clears Unsubscribed.
import { loadConfig, readBody, sendJson, sendError, unavailable, methodNotAllowed, validatePreferences, findByEmail, updateRecord, F } from '../subscribers.js'
import { verifySession } from '../signalSession.js'

export function createPreferencesHandler({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return async function preferencesHandler(req, res) {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    const conf = loadConfig(env)
    if (!conf.ok) return unavailable(res)
    const session = verifySession(req, { env })
    if (!session) return sendError(res, 401, 'sign_in_required', 'Please sign in to save preferences.')
    const checked = validatePreferences(readBody(req))
    if (!checked.ok) return sendError(res, 400, 'invalid_fields', 'Please check your selections.', { fields: checked.fields, field: checked.field })
    const v = checked.value
    const fields = {}
    if (v.sectors) fields[F.sectors] = v.sectors.join('\n')
    // The home state (monthly report area) is always the FIRST line of States.
    const home = v.homeState !== undefined ? v.homeState : null
    const setStates = (existing) => {
      if (!(v.states || v.cities || home !== null)) return
      // Lists not sent keep their saved lines (minus the old home line).
      const saved = String(existing || '').split('\n').map((x) => x.trim()).filter(Boolean)
      const kept = (v.states || v.cities)
        ? [...(v.states || []), ...(v.cities || [])]
        : saved.slice(home !== null && /^[A-Z]{2}$/.test(saved[0] || '') ? 1 : 0)
      const rest = kept.filter((x) => x !== home)
      fields[F.states] = [...(home ? [home] : []), ...rest].join('\n')
    }
    if (v.homeCity !== undefined) fields[F.city] = v.homeCity
    if (typeof v.newsletter === 'boolean') fields[F.newsletter] = v.newsletter
    try {
      const record = await findByEmail(conf.cfg, fetchImpl, session.email)
      if (!record) return sendError(res, 401, 'sign_in_required', 'Please sign in to save preferences.')
      setStates(record.fields?.[F.states])
      if (Object.keys(fields).length) await updateRecord(conf.cfg, fetchImpl, record.id, fields)
    } catch {
      return sendError(res, 502, 'save_failed', 'We could not save your preferences. Please try again.')
    }
    return sendJson(res, 200, { ok: true, saved: { sectors: v.sectors, states: v.states, cities: v.cities, newsletter: v.newsletter, homeState: v.homeState, homeCity: v.homeCity } })
  }
}

export default createPreferencesHandler()
