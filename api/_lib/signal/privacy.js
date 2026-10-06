// Publication rule for every metric The Staffing Signal shows.
//
// A metric may be published only when at least three distinct staffing firms
// contribute AND no single firm contributes more than half of the metric's
// underlying observations (exactly 50% passes). The rule is applied to each
// metric after filtering: a pay benchmark is judged on the firms that actually
// advertise comparable pay, never on the demand count for the same place.
//
// Unknown is not a pass. In production (and for synthetic test data, which
// must exercise the real gate) a metric with missing, unverified or malformed
// checks fails closed. Only the development-example data mode may show
// supplied figures whose checks were never supplied, and those figures are
// always labeled "Development example". Numbers that ARE supplied still decide
// in every mode, and signup never overrides suppression.
//
// Server-only. Firm counts and shares are inputs here; they are never copied
// into any response.
import { DATA_MODE } from '../../../shared/signal/contract.js'

export const PRIVACY_RULE = Object.freeze({
  minDistinctFirms: 3,
  maxFirmShare: 0.5
})

export const PRIVACY_REASON = Object.freeze({
  PASSED: 'passed',
  UNVERIFIED_EXAMPLE: 'development_example_unverified',
  UNKNOWN: 'unknown',
  NOT_VERIFIED: 'not_verified',
  INVALID: 'invalid',
  TOO_FEW_FIRMS: 'too_few_firms',
  FIRM_SHARE_TOO_HIGH: 'firm_share_too_high'
})

function isUnset(value) {
  return value === null || value === undefined
}

function result(publishable, reason) {
  return Object.freeze({ publishable, reason })
}

// evaluatePublication(checks, { mode }) -> { publishable, reason }
//   checks: { status?: 'verified'|'not_verified'|..., distinctFirms, maxFirmShare }
//   mode:   a DATA_MODE value; anything other than 'development_example' is
//           treated as production (strict).
export function evaluatePublication(checks, { mode = DATA_MODE.PRODUCTION } = {}) {
  const lenient = mode === DATA_MODE.DEVELOPMENT_EXAMPLE
  if (!checks || typeof checks !== 'object') {
    return result(false, PRIVACY_REASON.UNKNOWN)
  }
  const { status, distinctFirms, maxFirmShare } = checks
  const firmsUnset = isUnset(distinctFirms)
  const shareUnset = isUnset(maxFirmShare)

  if (firmsUnset || shareUnset) {
    // Half-supplied checks are never enough to publish.
    if (!(firmsUnset && shareUnset)) return result(false, PRIVACY_REASON.UNKNOWN)
    if (lenient && status === 'not_verified') return result(true, PRIVACY_REASON.UNVERIFIED_EXAMPLE)
    return result(false, status === 'not_verified' ? PRIVACY_REASON.NOT_VERIFIED : PRIVACY_REASON.UNKNOWN)
  }

  // Supplied numbers must be well-formed finite values; anything else fails.
  if (typeof distinctFirms !== 'number' || !Number.isSafeInteger(distinctFirms) || distinctFirms < 0) {
    return result(false, PRIVACY_REASON.INVALID)
  }
  if (typeof maxFirmShare !== 'number' || !Number.isFinite(maxFirmShare) || maxFirmShare < 0 || maxFirmShare > 1) {
    return result(false, PRIVACY_REASON.INVALID)
  }
  if (distinctFirms < PRIVACY_RULE.minDistinctFirms) return result(false, PRIVACY_REASON.TOO_FEW_FIRMS)
  if (maxFirmShare > PRIVACY_RULE.maxFirmShare) return result(false, PRIVACY_REASON.FIRM_SHARE_TOO_HIGH)

  // Strict modes also require the checks to be marked verified.
  if (!lenient && status !== 'verified') {
    return result(false, status === 'not_verified' ? PRIVACY_REASON.NOT_VERIFIED : PRIVACY_REASON.UNKNOWN)
  }
  return result(true, PRIVACY_REASON.PASSED)
}

export function isPublishable(checks, options) {
  return evaluatePublication(checks, options).publishable
}

// Pay cells carry their own pay-subset checks (`checks`). Demand checks for
// the same place (`demand.checks`) are deliberately ignored: a large demand
// sample never authorizes a small pay subset.
export function evaluatePayCell(cell, options) {
  if (!cell || typeof cell !== 'object') return result(false, PRIVACY_REASON.UNKNOWN)
  return evaluatePublication(cell.checks, options)
}
