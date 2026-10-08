// Measurement stub for the homepage preview (brief §19).
//
// Logs to the dev console only; nothing is sent anywhere. Only whitelisted,
// non-personal properties survive: never a name, email address, recipient,
// note or client pay rate (the report events carry role and place level only).

export const EVENTS = Object.freeze({
  PAY_CHECK_STARTED: 'pay_check_started',
  NATIONAL_RESULT_VIEWED: 'national_result_viewed',
  LOCAL_BENCHMARK_REQUESTED: 'local_benchmark_requested',
  LOCAL_COVERAGE_AVAILABLE: 'local_coverage_available',
  LOCAL_COVERAGE_UNAVAILABLE: 'local_coverage_unavailable',
  GATE_SHOWN: 'gate_shown',
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  FIRST_LOCAL_RESULT_VIEWED: 'first_local_result_viewed',
  PREFERENCES_SAVED: 'preferences_saved',
  MARKET_REPORT_OPENED: 'market_report_opened',
  MONTHLY_ISSUE_OPENED: 'monthly_issue_opened',
  RETURN_VISIT: 'return_visit',
  REPORT_CREATE_CLICKED: 'report_create_clicked',
  REPORT_GATE_SHOWN: 'report_gate_shown',
  SAMPLE_REPORT_VIEWED: 'sample_report_viewed',
  REPORT_VIEWED: 'report_viewed',
  REPORT_PRINTED: 'report_printed',
  REPORT_DOWNLOADED: 'report_downloaded',
  REPORT_EMAILED: 'report_emailed'
})

export const ALLOWED_PROPS = ['roleKey', 'sectorKey', 'geographyLevel', 'coverage', 'access', 'variant']

export function track(event, props = {}) {
  if (!import.meta.env.DEV) return
  if (typeof event !== 'string' || event === '') return
  const safe = {}
  for (const key of ALLOWED_PROPS) {
    const value = props ? props[key] : undefined
    if (typeof value === 'string' && value !== '') safe[key] = value
  }
  console.debug('[ssp-track]', event, safe)
}
