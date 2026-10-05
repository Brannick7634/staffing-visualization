// POST /api/preferences  { sectors?, states?, cities?, newsletter? }
// Signed-in subscribers only (session cookie). Stores sectors and states
// (cities are stored with states as "TX:houston"-style keys). Turning the
// newsletter on never clears Unsubscribed.
import { loadConfig, readBody, sendJson, sendError, unavailable, methodNotAllowed, validatePreferences, findByEmail, updateRecord, F } from './_lib/subscribers.js'
import { verifySession } from './_lib/signalSession.js'

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
    if (v.states || v.cities) fields[F.states] = [...(v.states || []), ...(v.cities || [])].join('\n')
    if (typeof v.newsletter === 'boolean') fields[F.newsletter] = v.newsletter
    try {
      const record = await findByEmail(conf.cfg, fetchImpl, session.email)
      if (!record) return sendError(res, 401, 'sign_in_required', 'Please sign in to save preferences.')
      if (Object.keys(fields).length) await updateRecord(conf.cfg, fetchImpl, record.id, fields)
    } catch {
      return sendError(res, 502, 'save_failed', 'We could not save your preferences. Please try again.')
    }
    return sendJson(res, 200, { ok: true, saved: { sectors: v.sectors, states: v.states, cities: v.cities, newsletter: v.newsletter } })
  }
}

export default createPreferencesHandler()
