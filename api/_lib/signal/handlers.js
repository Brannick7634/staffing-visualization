// Vercel-style (req, res) handlers for /api/signal/snapshot and /api/signal/pay.
//
// Handlers are built from an adapter (where data comes from) and a
// resolveAccess(req) function (who is asking). Production wires the
// not-yet-connected production adapter and the real JWT session; the Vite dev
// plugin wires the development fixture and a simulated-access cookie.
//
// Every response: Cache-Control: private, no-store + Vary: Authorization,
// Cookie. Client-facing error messages are fixed strings; internal error
// details are never sent. The visitor's pay rate is not a parameter: a `rate`
// query value is ignored and never read or logged.
//
// Server-only.
import { CONTRACT_VERSION, ACCESS } from '../../../shared/signal/contract.js'
import { buildSnapshotResponse, buildPayResponse, REAL_PLACES } from './service.js'

export const SIGNAL_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, Cookie',
  'X-Content-Type-Options': 'nosniff'
})

const MAX_PARAM_LENGTH = 64

export function applySignalHeaders(res) {
  for (const [name, value] of Object.entries(SIGNAL_HEADERS)) res.setHeader(name, value)
}

export function sendJson(res, status, body) {
  applySignalHeaders(res)
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(body)
  }
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function feedUnavailableBody() {
  return { contractVersion: CONTRACT_VERSION, error: { code: 'feed_unavailable', message: 'Market data is not connected yet.' } }
}

function internalErrorBody() {
  return { contractVersion: CONTRACT_VERSION, error: { code: 'internal_error', message: 'Something went wrong loading market data.' } }
}

function methodNotAllowed(res) {
  res.setHeader('Allow', 'GET')
  return sendJson(res, 405, { contractVersion: CONTRACT_VERSION, error: { code: 'method_not_allowed', message: 'Use GET.' } })
}

function logFailure(where, error) {
  // Server-side only; never includes request data.
  const name = error && error.name ? error.name : 'Error'
  console.error(`[signal] ${where} failed (${name})`)
}

function resolveViewer(resolveAccess, req) {
  try {
    const resolved = resolveAccess(req) || {}
    return {
      access: resolved.access === ACCESS.AUTHORIZED ? ACCESS.AUTHORIZED : ACCESS.PUBLIC,
      simulated: resolved.simulated === true
    }
  } catch {
    return { access: ACCESS.PUBLIC, simulated: false }
  }
}

// Returns adapter data, or null when the feed is unavailable or failed.
async function loadData(adapter, where) {
  try {
    const loaded = adapter && typeof adapter.load === 'function' ? await adapter.load() : null
    if (!loaded || loaded.available !== true || !loaded.data || typeof loaded.data !== 'object') return null
    return loaded.data
  } catch (error) {
    logFailure(`${where} feed`, error)
    return null
  }
}

// Read one query parameter. Returns undefined when absent or empty, the string
// when it is a single short string, and false when it is malformed (repeated,
// too long or not a string).
function queryParam(query, name) {
  if (!query || typeof query !== 'object' || !Object.prototype.hasOwnProperty.call(query, name)) return undefined
  const value = query[name]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > MAX_PARAM_LENGTH) return false
  return value
}

// validatePaySelection(query) -> { ok:true, selection } | { ok:false, field }
// role must be a known role; state a known code; city a known key in that
// state. Any other parameter (including `rate`) is ignored.
export function validatePaySelection(query, places = REAL_PLACES) {
  const role = queryParam(query, 'role')
  const state = queryParam(query, 'state')
  const city = queryParam(query, 'city')
  if (!role || !places.role(role)) return { ok: false, field: 'role' }
  if (state === false) return { ok: false, field: 'state' }
  if (city === false) return { ok: false, field: 'city' }
  if (state !== undefined && !places.state(state)) return { ok: false, field: 'state' }
  if (city !== undefined) {
    const place = places.city(city)
    if (state === undefined || !place || place.state !== state) return { ok: false, field: 'city' }
  }
  return { ok: true, selection: { roleKey: role, state: state || null, city: city || null } }
}

function invalidSelection(res, field) {
  return sendJson(res, 400, {
    contractVersion: CONTRACT_VERSION,
    error: { code: 'invalid_selection', field, message: 'Choose a job and location from the list.' }
  })
}

export function createSnapshotHandler({ adapter, resolveAccess, places = REAL_PLACES }) {
  return async function snapshotHandler(req, res) {
    try {
      if (req.method !== 'GET') return methodNotAllowed(res)
      const viewer = resolveViewer(resolveAccess, req)
      const data = await loadData(adapter, 'snapshot')
      if (!data) return sendJson(res, 503, feedUnavailableBody())
      const body = buildSnapshotResponse({ data, dataMode: adapter.dataMode, viewer, places })
      return sendJson(res, 200, body)
    } catch (error) {
      logFailure('snapshot', error)
      return sendJson(res, 500, internalErrorBody())
    }
  }
}

export function createPayHandler({ adapter, resolveAccess, places = REAL_PLACES }) {
  return async function payHandler(req, res) {
    try {
      if (req.method !== 'GET') return methodNotAllowed(res)
      const checked = validatePaySelection(req.query, places)
      if (!checked.ok) return invalidSelection(res, checked.field)
      const viewer = resolveViewer(resolveAccess, req)
      const data = await loadData(adapter, 'pay')
      if (!data) return sendJson(res, 503, feedUnavailableBody())
      const body = buildPayResponse({ data, dataMode: adapter.dataMode, viewer, request: checked.selection, places })
      return sendJson(res, 200, body)
    } catch (error) {
      logFailure('pay', error)
      return sendJson(res, 500, internalErrorBody())
    }
  }
}
