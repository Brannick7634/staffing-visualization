// Client-side service — NO Airtable key here. Computation happens server-side
// in /api/job-signals; this file just calls it. Re-exports the pure helpers
// from jobSignalsCompute.js so existing imports (e.g. CompanyData.jsx) don't break.
export {
  SEGMENT_ICONS,
  computeJobSignalsMetrics,
  isJobSignalsCacheStale,
  getDefaultIndustry,
  JOB_SIGNALS_CACHE_TTL_MS,
} from '../utils/jobSignalsCompute.js'

export async function fetchJobSignalsMetrics() {
  const res = await fetch('/api/job-signals')
  const data = await res.json()
  return data.metrics
}

export async function computeJobSignalsMetricsLive() {
  const res = await fetch('/api/job-signals', { method: 'POST' })
  const data = await res.json()
  return data.metrics
}

export async function storeJobSignalsMetrics() {
  // Storing happens server-side as part of the POST /api/job-signals compute
  // flow — kept only so existing call sites don't break.
  return { success: true }
}
