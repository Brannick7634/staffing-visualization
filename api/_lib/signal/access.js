// Access policy: what a signed-out visitor may see versus a free account.
//
// Public: every publishable pay benchmark (nationwide, state and city — the
// local pay comparison is free, owner decision 2026-10-08), the market context
// for the place a visitor asks about, plus an explicit preview allowlist taken
// from the DEFAULT nationwide ranking only: the top five heating states and
// the top three cities by observed posting volume. The allowlist is computed
// once from the default ranking, so no filter, sort or offset can widen it.
//
// Free account (authorized): full eligible city rankings, cooling markets,
// and creating / printing / downloading / emailing Client Pay Market Reports
// (the email route checks the real session itself).
//
// Privacy runs BEFORE access: rows reaching this module have already passed
// the publication rule. Access never un-suppresses anything.
//
// Server-only. The preview sizes are configurable here and documented for
// Andy's review (brief section 9: proposed v1 interpretation).
import { ACCESS } from '../../../shared/signal/contract.js'

export const PUBLIC_PREVIEW = Object.freeze({
  heatingStates: 5,
  cities: 3
})

// Anything other than exactly 'authorized' is treated as public.
export function normalizeViewerAccess(access) {
  return access === ACCESS.AUTHORIZED ? ACCESS.AUTHORIZED : ACCESS.PUBLIC
}

export function isAuthorizedViewer(access) {
  return normalizeViewerAccess(access) === ACCESS.AUTHORIZED
}

// Figures may be shown for these access values only.
export function canShowFigures(access) {
  return access === ACCESS.PUBLIC || access === ACCESS.AUTHORIZED
}

// Access state of a pay benchmark at a geography level for this viewer.
// Pay is public at every level: an account is needed only to create, print,
// download or email the report. Privacy still runs first, so a suppressed
// benchmark stays suppressed for everyone. (Both parameters are kept so the
// gate can be reinstated in one place.)
export function payAccess(level, viewerAccess) {
  return ACCESS.PUBLIC
}

// Default nationwide city ranking: postings descending, ties by key so the
// order is stable. Input rows have already passed privacy.
export function rankCities(rows) {
  return [...rows].sort((a, b) => (b.postings - a.postings) || (a.cityKey < b.cityKey ? -1 : a.cityKey > b.cityKey ? 1 : 0))
}

// Heating: positive momentum, strongest first. Cooling: negative momentum,
// ordered by size of decline (largest decline first).
export function rankHeating(rows) {
  return rows.filter((row) => row.momentumPct > 0)
    .sort((a, b) => (b.momentumPct - a.momentumPct) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

export function rankCooling(rows) {
  return rows.filter((row) => row.momentumPct < 0)
    .sort((a, b) => (a.momentumPct - b.momentumPct) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

// The public allowlist, from the default rankings only.
export function publicAllowlist({ rankedCities = [], rankedHeating = [] } = {}) {
  return Object.freeze({
    cityKeys: new Set(rankedCities.slice(0, PUBLIC_PREVIEW.cities).map((row) => row.cityKey)),
    heatingCodes: new Set(rankedHeating.slice(0, PUBLIC_PREVIEW.heatingStates).map((row) => row.code))
  })
}

// Rows a viewer may receive, each tagged with the access level that makes it
// visible ('public' for allowlisted preview entries, 'authorized' otherwise).
export function visibleRows(rankedRows, isAllowlisted, viewerAccess) {
  const authorized = isAuthorizedViewer(viewerAccess)
  const out = []
  for (const row of rankedRows) {
    if (isAllowlisted(row)) out.push({ row, access: ACCESS.PUBLIC })
    else if (authorized) out.push({ row, access: ACCESS.AUTHORIZED })
  }
  return out
}
