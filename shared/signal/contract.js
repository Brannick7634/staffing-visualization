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
 * @property {number} p25Cents      integer cents ("Market Low")
 * @property {number} typicalCents  integer cents: the median of advertised pay
 *   (snapshot method.quantile "typical = median"), shown as "Market Median"
 * @property {number} p75Cents      integer cents ("Market High")
 * @property {number} firmCount     distinct staffing firms behind the cell
 *   (checks.distinctFirms; aggregate, owner-approved 2026-10-08)
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
 * @typedef {Object} MarketCity     built only from publishable city rows
 * @property {string} key           'TX:houston'
 * @property {string} label         'Houston, TX'
 * @property {number} newPostings   all-jobs staffing postings in the window
 * @property {number} staffingFirms distinct staffing firms posting in the city
 * @property {number} windowDays
 * @property {string} jobScope      'all jobs'   (no city rank: removed by owner decision)
 *
 * @typedef {Object} MarketState    built only from publishable momentum rows;
 *   the selected state is shown even when it is cooling
 * @property {string} code
 * @property {string} label
 * @property {number} momentumPct
 * @property {number} windowDays
 * @property {number} previousWindowDays
 * @property {boolean} isEarlySignal
 *
 * @typedef {{ city: MarketCity|null, state: MarketState|null }} PayMarket
 *
 * @typedef {{ period: string, label: string, typicalCents: number|null }} TrendPoint
 *   period 'YYYY-MM' for monthly snapshots (ascending), 'now' for the current
 *   snapshot; typicalCents is null when that month's cell is absent or withheld
 * @typedef {{ scope: 'state'|'nationwide', code?: string, label: string, points: TrendPoint[] }} TrendSeries
 * @typedef {{ roleKey: string, snapshotDate: string, series: TrendSeries[] }} PayTrend
 *   the state series is present only when a state was requested
 *
 * @typedef {Object} PayResponse   GET /api/signal/pay?role=&state=&city=  (the rate is never a parameter)
 * @property {string} contractVersion
 * @property {string} dataMode
 * @property {Viewer} viewer
 * @property {{ roleKey: string, roleLabel?: string, state: string|null, city: string|null }} request
 * @property {PayResult & Partial<PayFigures>} result
 * @property {(PayResult & Partial<PayFigures>)|null} fallback
 * @property {Object} national      same shape as a snapshot nationalPay entry (plus firmCount when publishable)
 * @property {PayMarket|null} market  null when nothing publishable
 * @property {PayTrend|null} trend    null when there is no series
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
