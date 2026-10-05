// Data contract for The Staffing Signal preview API (/api/signal/*).
//
// Browser-safe (no node: imports). Shared by the server handlers and the
// preview UI. `null` is never used to mean zero, locked or suppressed: those
// states are always expressed with the enums below.

export const CONTRACT_VERSION = 'signal-preview-1'

// Whether a metric may be shown at all for the requested scope.
export const COVERAGE = Object.freeze({
  PUBLISHABLE: 'publishable',
  INSUFFICIENT_SAMPLE: 'insufficient_sample',
  UNSUPPORTED: 'unsupported',
  NOT_YET_AVAILABLE: 'not_yet_available',
  INSUFFICIENT_HISTORY: 'insufficient_comparable_history'
})

// Who may see a publishable metric. Signup never overrides suppression.
export const ACCESS = Object.freeze({
  PUBLIC: 'public',
  REQUIRES_FREE_ACCOUNT: 'requires_free_account',
  AUTHORIZED: 'authorized'
})

export const FRESHNESS = Object.freeze({
  CURRENT: 'current',
  STALE: 'stale',
  UNKNOWN: 'unknown'
})

// Client-side request lifecycle.
export const REQUEST = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error'
})

export const DATA_MODE = Object.freeze({
  DEVELOPMENT_EXAMPLE: 'development_example',
  SYNTHETIC: 'synthetic',
  PRODUCTION: 'production'
})

/**
 * Response shapes (see the implementation spec, section 2, for full examples).
 *
 * @typedef {'public'|'authorized'} ViewerAccess
 * @typedef {{ access: ViewerAccess, simulated?: boolean }} Viewer
 *
 * @typedef {Object} PayFigures  present ONLY when coverage === 'publishable'
 *   AND access is 'public' or 'authorized'
 * @property {number} p25Cents      integer cents
 * @property {number} typicalCents  integer cents ("Typical advertised rate", never "median")
 * @property {number} p75Cents      integer cents
 * @property {string} typicalLabel
 * @property {'hourly'} payBasis
 * @property {'USD'} currency
 * @property {string} dataStatus    a DATA_MODE value
 *
 * @typedef {Object} PayResult
 * @property {{ level: 'nationwide'|'state'|'city', label: string, requested?: boolean }} geography
 * @property {string} coverage      a COVERAGE value
 * @property {string} access        an ACCESS value
 * @property {string} [message]     plain-language explanation for non-publishable or locked states
 *
 * @typedef {Object} PayResponse   GET /api/signal/pay?role=&state=&city=  (the rate is never a parameter)
 * @property {string} contractVersion
 * @property {string} dataMode
 * @property {Viewer} viewer
 * @property {{ roleKey: string, state: string|null, city: string|null }} request
 * @property {PayResult & Partial<PayFigures>} result
 * @property {(PayResult & Partial<PayFigures>)|null} fallback
 * @property {Object} national      same shape as a snapshot nationalPay entry
 *
 * @typedef {Object} SnapshotResponse  GET /api/signal/snapshot
 * @property {string} contractVersion
 * @property {string} dataMode
 * @property {Viewer} viewer
 * @property {Object} snapshot           label, exactDate, freshness, lastSuccessfulRefresh, refreshCadence, methodologyVersion, note
 * @property {Object[]} coverageStrip
 * @property {Object} extraCoverage
 * @property {Object[]} issueCards
 * @property {Object} cities             rows contain only rows the viewer may see; `more` carries no count or names
 * @property {Object} momentum           heating/cooling; cooling rows are [] for signed-out viewers
 * @property {Object[]} sectors
 * @property {Object[]} nationalPay
 * @property {Object} mostPostedFamilies
 *
 * @typedef {Object} ErrorResponse
 * @property {string} [contractVersion]
 * @property {{ code: string, message?: string, field?: string }} error
 */
