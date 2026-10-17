// Analytics value allowlists shared by the browser (src/preview/lib/track.js)
// and the collector (api/_lib/analytics.js). Every property is limited to a
// known enum or taxonomy key, and paths to known routes, so free text (names,
// emails, rates, tokens) cannot be stored even inside an allowed key.
import { ACCESS, COVERAGE } from './contract.js'
import { ROLES, SECTORS } from './taxonomy.js'

export const ALLOWED_PROPS = ['roleKey', 'sectorKey', 'geographyLevel', 'coverage', 'access', 'variant', 'reason']

// Error codes the site itself produces (API codes + client copy keys).
export const REASONS = Object.freeze([
  'error', 'account_exists', 'rate_limited', 'network_error', 'daily_limit', 'send_failed',
  'too_many_recipients', 'no_recipients', 'links_not_allowed', 'text_too_long', 'invalid_selection',
  'invalid_rate', 'no_benchmark', 'copy_limit', 'bad_origin', 'email_unavailable', 'feed_unavailable',
  'invalid_fields', 'internal_error', 'method_not_allowed', 'report_method_superseded', 'report_not_found'
])

const VALUES = {
  roleKey: new Set(ROLES.map((r) => r.key)),
  sectorKey: new Set(SECTORS.map((s) => s.key)),
  geographyLevel: new Set(['nationwide', 'state', 'city']),
  coverage: new Set(Object.values(COVERAGE)),
  access: new Set(Object.values(ACCESS)),
  variant: new Set(['a', 'b']),
  reason: new Set(REASONS)
}

export function allowedValue(key, value) {
  return typeof value === 'string' && Boolean(VALUES[key]?.has(value))
}

// Route words the site serves (PreviewApp.jsx). Anything else -> '/other'.
const SEGMENTS = new Set([
  'b', 'free-access', 'sign-in', 'forgot-password', 'reset-password', 'confirm-email', 'preferences',
  'email-preferences', 'methodology', 'privacy', 'states', 'sample-report', 'client-report', 'report',
  'market-report', 'hot-jobs', 'my-market', 'monthly-signal', 'about', 'contact'
])
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

// Normalizes a pathname to a known route, or '/other'. Never returns raw text.
export function routePath(pathname) {
  if (typeof pathname !== 'string' || pathname.length > 200 || pathname[0] !== '/') return '/other'
  const parts = pathname.split('/').filter(Boolean)
  if (!parts.length) return '/'
  if (parts.length > 2) return '/other'
  if (!SEGMENTS.has(parts[0])) return '/other'
  if (parts.length === 2 && !(parts[0] === 'report' && MONTH.test(parts[1]))) return '/other'
  return '/' + parts.join('/')
}
