// Browser client for the /api/signal/* endpoints used by the homepage preview.
//
// The client pay rate stays in the browser: it is never put in a URL, storage,
// analytics or logs. fetchPay asks only for the benchmark bounds of a role and
// geography, and the comparison is computed in the browser
// (shared/signal/clientReport.js). The one exception is emailClientReport: the
// rate goes to the server inside that POST body only, to build the emailed
// report. Names, emails and passwords are sent only in POST bodies and are
// never logged here.

export class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message || code || 'Request failed')
    this.name = 'ApiError'
    this.status = status
    this.code = code || 'request_failed'
    this.details = details
  }
}

// Dev-simulation endpoints exist only under vite dev; production builds drop
// these paths (devRequest's body is dead code when DEV is false).
function devRequest(path, options) {
  if (!import.meta.env.DEV) return Promise.reject(new ApiError(404, 'not_available', 'Not available.'))
  return request(`/api/signal/dev/${path}`, options)
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch {
    throw new ApiError(0, 'network_error', 'The request could not reach the server.')
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const error = data && typeof data === 'object' ? data.error : null
    throw new ApiError(
      res.status,
      error?.code || 'http_error',
      error?.message || `Request failed with status ${res.status}.`,
      error || null
    )
  }
  if (!data || typeof data !== 'object') {
    throw new ApiError(res.status, 'bad_response', 'The server returned an unreadable response.')
  }
  return data
}

export async function fetchSnapshot() {
  return request('/api/signal/snapshot')
}

// GET /api/signal/pay?role=..&state=..&city=.. (empty values omitted).
// There is deliberately no rate parameter.
export async function fetchPay({ roleKey, state, city } = {}) {
  const params = new URLSearchParams()
  if (roleKey) params.set('role', roleKey)
  if (state) params.set('state', state)
  if (state && city) params.set('city', city)
  return request(`/api/signal/pay?${params.toString()}`)
}

export async function setSimAccess(access) {
  return devRequest('access', { method: 'POST', body: { access } })
}

export async function simSignup({ name, email, password, newsletter, context, state, city }) {
  return devRequest('signup', {
    method: 'POST',
    body: {
      name,
      email,
      password,
      newsletter: Boolean(newsletter),
      state: state || '',
      city: city || '',
      context: context
        ? { roleKey: context.roleKey || null, state: context.state || null, city: context.city || null }
        : null
    }
  })
}

export async function simNotify({ roleKey, state, city }) {
  return devRequest('notify', {
    method: 'POST',
    body: { roleKey: roleKey || null, state: state || null, city: city || null }
  })
}

export async function simPreferences(prefs) {
  return devRequest('preferences', { method: 'POST', body: prefs })
}

export async function fetchScenarios() {
  return devRequest('scenarios')
}

// ---- Real signup (production) vs dev simulation ----
// Real endpoints are used in a production build, or under `vite dev` when
// VITE_SIGNAL_REAL_SIGNUP=1. Otherwise the dev simulation above is used.
export const REAL_SIGNUP = !import.meta.env.DEV || import.meta.env.VITE_SIGNAL_REAL_SIGNUP === '1'

export async function signup(input) {
  if (!REAL_SIGNUP) return simSignup(input)
  const data = await request('/api/subscribe', {
    method: 'POST',
    body: {
      name: input.name,
      email: input.email,
      password: input.password,
      newsletter: Boolean(input.newsletter),
      source: 'pay-first',
      // Required: city is a listed key ('TX:houston') or a typed city name.
      state: input.state || '',
      city: input.city || ''
    }
  })
  return { ...data, simulated: false }
}

// ---- Password sign-in ----
// Passwords go only in the JSON body of a same-origin POST: never in a URL,
// storage, logs or analytics. Under vite dev without real signup these hit the
// dev simulation (dev/signal/devEndpoints.js), which stores nothing durable.

export async function signIn({ email, password }) {
  if (!REAL_SIGNUP) return devRequest('login', { method: 'POST', body: { email, password } })
  return request('/api/auth/login', { method: 'POST', body: { email, password } })
}

// Always answers neutrally (never says whether the email has an account).
// The dev simulation also returns devResetUrl so the flow can be tested.
export async function forgotPassword(email) {
  if (!REAL_SIGNUP) return devRequest('forgot', { method: 'POST', body: { email } })
  return request('/api/auth/forgot', { method: 'POST', body: { email } })
}

export async function resetPassword({ token, password }) {
  if (!REAL_SIGNUP) return devRequest('reset', { method: 'POST', body: { token, password } })
  return request('/api/auth/reset', { method: 'POST', body: { token, password } })
}

// Email confirmation (production endpoints only; the dev account counts as
// confirmed). Without a token: email the signed-in account a link.
export async function requestEmailConfirmation() {
  return request('/api/auth/confirm', { method: 'POST', body: {} })
}

export async function confirmEmail(token) {
  return request('/api/auth/confirm', { method: 'POST', body: { token } })
}

export async function signOut() {
  if (!REAL_SIGNUP) return devRequest('logout', { method: 'POST', body: {} })
  return request('/api/auth/logout', { method: 'POST', body: {} })
}

// GET /api/preferences (signed-in only): the saved settings,
// { name?, area: { state, cityKey, typedCity, label } | null, newsletter,
//   sectors, states, cities }. 401 sign_in_required without a valid session.
export async function fetchPreferences() {
  if (!REAL_SIGNUP) return devRequest('preferences')
  return request('/api/preferences')
}

export async function savePreferences(prefs) {
  if (!REAL_SIGNUP) return simPreferences(prefs)
  return request('/api/preferences', { method: 'POST', body: prefs })
}

// POST /api/signal/client-report/email (signed-in only). The body carries the
// selection, the client pay rate (integer cents), up to 5 recipients and the
// optional prepared-for/by and note text; the server rebuilds the figures
// itself. Resolves { ok, sent, copySent, remainingToday }.
export async function emailClientReport({ roleKey, state, city, rateCents, recipients, sendCopy, preparedFor, preparedBy, note }) {
  return request('/api/signal/client-report/email', {
    method: 'POST',
    body: {
      roleKey,
      state: state || null,
      city: state && city ? city : null,
      rateCents,
      recipients: Array.isArray(recipients) ? recipients : [],
      sendCopy: Boolean(sendCopy),
      ...(preparedFor ? { preparedFor } : {}),
      ...(preparedBy ? { preparedBy } : {}),
      ...(note ? { note } : {})
    }
  })
}

// GET /api/signal/report?month=YYYY-MM (latest when omitted). State/city are
// only honored for signed-in readers (they pick which local section leads).
export async function fetchReport({ month, state, city } = {}) {
  const params = new URLSearchParams()
  if (month) params.set('month', month)
  if (state) params.set('state', state)
  if (state && city) params.set('city', city)
  const qs = params.toString()
  return request(`/api/signal/report${qs ? `?${qs}` : ''}`)
}
