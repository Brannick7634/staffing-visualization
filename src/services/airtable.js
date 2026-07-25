// Client-side service — NO Airtable key here. Every function calls a
// serverless /api endpoint that holds the real credentials server-side.
// Exported names/signatures match the old direct-Airtable version exactly,
// so no consuming component needs to change.

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function getJson(url) {
  const res = await fetch(url)
  return res.json()
}

export const METRICS_CACHE_TYPE = { DASHBOARD: 'dashboard', JOB_SIGNALS: 'job_signals' }

export async function fetchFirms() {
  try {
    const data = await getJson('/api/firms')
    return data.firms || []
  } catch {
    return []
  }
}

export async function fetchProtectedFirms(user) {
  try {
    const data = await postJson('/api/protected-firms', { user })
    return data.firms || []
  } catch {
    return []
  }
}

export async function submitLeadRequest(formData) {
  try {
    return await postJson('/api/lead-request', formData)
  } catch {
    return { success: false, error: 'Registration failed. Please try again.' }
  }
}

export async function verifyCredentials(email, password) {
  try {
    return await postJson('/api/verify-credentials', { email, password })
  } catch {
    return { success: false, error: 'Authentication failed' }
  }
}

export async function updateUserProfile(userId, updates) {
  try {
    return await postJson('/api/update-profile', { userId, updates })
  } catch {
    return { success: false, error: 'Failed to update profile. Please try again.' }
  }
}

export function isAirtableConfigured() {
  // The client no longer holds the key — configuration lives server-side.
  // API calls will surface a clear error if the server isn't configured.
  return true
}

export function getViewId() {
  return 'Grid view'
}

export async function computeDashboardMetrics() {
  const data = await postJson('/api/dashboard-metrics', {})
  return data.metrics
}

export async function storeDashboardMetrics() {
  // Storing happens server-side as part of the POST /api/dashboard-metrics
  // recompute flow — this is kept only so existing call sites don't break.
  return { success: true }
}

export async function fetchDashboardMetrics() {
  const data = await getJson('/api/dashboard-metrics')
  return data.metrics
}

export async function markDashboardRecomputing() {
  // Handled server-side inside /api/dashboard-metrics now.
  return { success: true }
}

export async function fetchJobSignalsCache() {
  const data = await getJson('/api/job-signals')
  return data.metrics
}

export async function storeJobSignalsCache() {
  return { success: true }
}
