// Builds the /api/signal/* response bodies from adapter data.
//
// Order of controls, always: validate the adapter value -> privacy rule
// (suppressed for everyone) -> access policy (locked for signed-out viewers)
// -> emit. Every response object is built from scratch with explicit fields;
// adapter objects are never spread or passed through, so shares, identifiers
// or any other adapter-side field cannot reach the browser.
//
// Firm counts: only two aggregates are emitted (owner-approved 2026-10-08),
// and only for rows that already passed the publication rule: a pay scope's
// `firmCount` (checks.distinctFirms of that pay cell) and a market city's
// `staffingFirms` (checks.distinctFirms of that city's posting row). Shares
// (maxFirmShare) and firm identities are never emitted.
//
// Adapter data shape (all money in integer cents):
// {
//   snapshot: { label, exactDate, freshness, lastSuccessfulRefresh, refreshCadence, methodologyVersion, note },
//   coverage: { postings:{value,approximate,period}, firms:{value,approximate,period},
//               payObservations:{value,approximate,note}, citiesLabel, reliablePayTitles,
//               jobCityPayCombos:{value,approximate,note} },
//   issueCards: [{ key, kind:'momentum'|'pay'|'volume', title, basis, ref:{code}|{roleKey}|{cityKey} }],
//   cityVolume: { metric, windowDays, scope, jobScope, rows:[{ cityKey, postings, checks }] },
//   momentum: { windowDays, previousWindowDays, isRawGrowth, isPayChange, isForecast, basis,
//               historyNote, coverage, rows:[{ code, momentumPct, checks }] },
//   pay: [{ roleKey, level:'nationwide'|'state'|'city', state, city, p25Cents, typicalCents,
//           p75Cents, payBasis:'hourly'|'weekly_package', currency, checks, demand? }],
//   mostPostedFamilies: { labels:[...], note },
//   monthly?: [{ month:'YYYY-MM', pay:[ same cell shape as `pay`, payBasis/currency optional ] }]
// }
// `checks` = { status, distinctFirms, maxFirmShare } (see privacy.js).
//
// Server-only.
import { CONTRACT_VERSION, COVERAGE, ACCESS, FRESHNESS, DATA_MODE } from '../../../shared/signal/contract.js'
import { SECTORS, ROLES, roleByKey, rolesForSector } from '../../../shared/signal/taxonomy.js'
import { stateByCode, cityByKey } from '../../../shared/signal/geography.js'
import { formatCents } from '../../../shared/signal/money.js'
import { evaluatePublication, evaluatePayCell, PRIVACY_REASON } from './privacy.js'
import {
  normalizeViewerAccess, isAuthorizedViewer, canShowFigures, payAccess,
  rankCities, rankHeating, rankCooling, publicAllowlist, visibleRows
} from './access.js'

export const TYPICAL_LABEL = 'Typical advertised rate'

// Most recent monthly snapshots carried in a pay trend (oldest dropped first).
export const TREND_MAX_MONTHS = 12

const NATIONWIDE = 'Nationwide'
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/
const MINUS = '−'
const KNOWN_DATA_MODES = new Set(Object.values(DATA_MODE))
const KNOWN_FRESHNESS = new Set(Object.values(FRESHNESS))
const SAMPLE_FAILURES = new Set([PRIVACY_REASON.TOO_FEW_FIRMS, PRIVACY_REASON.FIRM_SHARE_TOO_HIGH])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/

// Real places: the shared taxonomy and geography picker lists. The synthetic
// States Lab passes its own resolver with obviously fake places.
export const REAL_PLACES = Object.freeze({
  sectors: SECTORS,
  roles: ROLES,
  role(key) {
    return roleByKey(key)
  },
  state(code) {
    const found = stateByCode(code)
    return found ? { code: found.code, name: found.name, label: found.name, shortName: found.name } : null
  },
  city(key) {
    const found = cityByKey(key)
    return found
      ? { key: found.key, name: found.name, state: found.state, label: `${found.name}, ${found.state}`, shortName: found.name }
      : null
  }
})

// ---------------------------------------------------------------- sanitizers

function text(value, max = 400) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= max ? trimmed : null
}

function count(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isoDate(value) {
  const str = text(value, 40)
  return str && ISO_DATE.test(str) ? str : null
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function withThousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// 'Texas' -> 'A Texas', 'Ohio' -> 'An Ohio' (place names only).
function withArticle(name) {
  return /^[AEIO]/.test(name) ? `An ${name}` : `A ${name}`
}

function formatMomentum(pct) {
  const rounded = Math.round(pct)
  return rounded > 0 ? `+${rounded}%` : rounded < 0 ? `${MINUS}${Math.abs(rounded)}%` : '0%'
}

export function resolveDataMode(mode) {
  return KNOWN_DATA_MODES.has(mode) ? mode : DATA_MODE.PRODUCTION
}

function viewerOf(viewer) {
  const v = object(viewer)
  return { access: normalizeViewerAccess(v.access), simulated: v.simulated === true }
}

// ------------------------------------------------------------- pay figures

// Integer-cent figures in a sane order, or null.
function figuresOf(cell) {
  const p25 = cell.p25Cents
  const typical = cell.typicalCents
  const p75 = cell.p75Cents
  const ok = [p25, typical, p75].every((v) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0)
  if (!ok || p25 > typical || typical > p75) return null
  return { p25Cents: p25, typicalCents: typical, p75Cents: p75 }
}

function findPayCell(pay, roleKey, level, state, city) {
  for (const raw of list(pay)) {
    const cell = object(raw)
    if (cell.roleKey !== roleKey || cell.level !== level) continue
    if (level === 'nationwide') return cell
    if (level === 'state' && cell.state === state && !cell.city) return cell
    if (level === 'city' && cell.state === state && cell.city === city) return cell
  }
  return null
}

function notYetMessage(shortName, dataMode) {
  return dataMode === DATA_MODE.PRODUCTION
    ? `No verified ${shortName} benchmark is available yet.`
    : `No verified ${shortName} benchmark is available in this preview data yet.`
}

// Evaluate one pay scope. Returns { body, publishable } where body is the
// response object for that scope (numbers only when allowed).
//
// 'requires_free_account' appears ONLY when a publishable figure exists and is
// withheld from a signed-out viewer. A result with nothing to show carries the
// viewer's own level, so no interface can turn a missing or suppressed local
// benchmark into a signup prompt.
function evaluatePayScope({ cell, level, label, shortName, requested, viewerAccess, dataMode }) {
  const geography = { level, label, requested }
  const access = payAccess(level, viewerAccess)
  const nothingToUnlock = access === ACCESS.REQUIRES_FREE_ACCOUNT ? ACCESS.PUBLIC : access
  const base = (coverage, message) => ({ body: { geography, coverage, access: nothingToUnlock, message }, publishable: false })

  if (!cell) return base(COVERAGE.NOT_YET_AVAILABLE, notYetMessage(shortName, dataMode))
  if (cell.payBasis === 'weekly_package') {
    return base(COVERAGE.UNSUPPORTED, 'Weekly travel packages are total-compensation packages, not hourly base pay, so they are not compared with an hourly rate.')
  }
  if (cell.payBasis !== 'hourly' || cell.currency !== 'USD') {
    return base(COVERAGE.UNSUPPORTED, `This ${shortName} pay data is not comparable with an hourly rate in US dollars.`)
  }
  const figures = figuresOf(cell)
  if (!figures) return base(COVERAGE.NOT_YET_AVAILABLE, notYetMessage(shortName, dataMode))
  const privacy = evaluatePayCell(cell, { mode: dataMode })
  if (!privacy.publishable) {
    // A failed threshold is "not enough comparable data"; unknown, unverified
    // or malformed checks mean no verified benchmark exists yet.
    return SAMPLE_FAILURES.has(privacy.reason)
      ? base(COVERAGE.INSUFFICIENT_SAMPLE, `We don't have enough comparable ${shortName} pay data to publish this benchmark.`)
      : base(COVERAGE.NOT_YET_AVAILABLE, notYetMessage(shortName, dataMode))
  }
  if (!canShowFigures(access)) {
    return {
      body: { geography, coverage: COVERAGE.PUBLISHABLE, access, message: `This ${shortName} benchmark is available with free access.` },
      publishable: true
    }
  }
  return {
    body: {
      geography,
      coverage: COVERAGE.PUBLISHABLE,
      access,
      p25Cents: figures.p25Cents,
      typicalCents: figures.typicalCents,
      p75Cents: figures.p75Cents,
      firmCount: count(object(cell.checks).distinctFirms),
      typicalLabel: TYPICAL_LABEL,
      payBasis: 'hourly',
      currency: 'USD',
      dataStatus: dataMode
    },
    publishable: true
  }
}

// Typical cents of one cell when it would be published today, else null.
function publishedTypical(cell, dataMode) {
  if (!cell) return null
  const basisOk = (cell.payBasis === undefined || cell.payBasis === 'hourly') && (cell.currency === undefined || cell.currency === 'USD')
  if (!basisOk) return null
  const figures = figuresOf(cell)
  if (!figures || !evaluatePayCell(cell, { mode: dataMode }).publishable) return null
  return figures.typicalCents
}

// `withFirmCount` is set for the pay response only; the snapshot's
// nationalPay list keeps its original shape.
function nationalEntry({ role, pay, dataMode, withFirmCount = false }) {
  const cell = findPayCell(pay, role.key, 'nationwide', null, null)
  const { body, publishable } = evaluatePayScope({
    cell, level: 'nationwide', label: NATIONWIDE, shortName: 'nationwide', requested: false,
    viewerAccess: ACCESS.PUBLIC, dataMode
  })
  const entry = {
    roleKey: role.key,
    roleLabel: role.label,
    sectorKey: role.sectorKey,
    geography: { level: 'nationwide', label: NATIONWIDE },
    coverage: body.coverage,
    access: body.access
  }
  if (publishable && body.typicalCents !== undefined) {
    entry.p25Cents = body.p25Cents
    entry.typicalCents = body.typicalCents
    entry.p75Cents = body.p75Cents
    if (withFirmCount) entry.firmCount = body.firmCount
    entry.typicalLabel = body.typicalLabel
    entry.payBasis = body.payBasis
    entry.currency = body.currency
    entry.dataStatus = body.dataStatus
  } else {
    entry.message = body.message
  }
  return { entry, publishable }
}

function buildNationalPay({ places, pay, dataMode }) {
  const out = []
  for (const role of places.roles) {
    const { entry, publishable } = nationalEntry({ role, pay, dataMode })
    if (publishable) out.push(entry)
  }
  return out
}

// --------------------------------------------------------- snapshot pieces

function buildSnapshotMeta(raw) {
  const s = object(raw)
  return {
    label: text(s.label, 80),
    exactDate: isoDate(s.exactDate),
    freshness: KNOWN_FRESHNESS.has(s.freshness) ? s.freshness : FRESHNESS.UNKNOWN,
    lastSuccessfulRefresh: isoDate(s.lastSuccessfulRefresh),
    refreshCadence: text(s.refreshCadence, 40),
    methodologyVersion: text(s.methodologyVersion, 40),
    note: text(s.note, 300)
  }
}

function coverageItem(key, raw, label, period, note) {
  const src = object(raw)
  const value = count(src.value)
  if (value === null) return null
  const item = { key, value, approximate: src.approximate === true, label, period }
  if (note) item.note = note
  return item
}

function buildCoverageStrip(raw) {
  const c = object(raw)
  const items = [
    coverageItem('postings', c.postings, 'staffing-firm postings collected', text(object(c.postings).period, 40)),
    coverageItem('firms', c.firms, 'staffing firms posting', text(object(c.firms).period, 40)),
    coverageItem('payObservations', c.payObservations, 'advertised-pay observations', null, text(object(c.payObservations).note, 120))
  ]
  const citiesLabel = text(c.citiesLabel, 20)
  if (citiesLabel) items.push({ key: 'cities', valueLabel: citiesLabel, label: 'cities with demand counts', period: null })
  return items.filter(Boolean)
}

function buildExtraCoverage(raw) {
  const c = object(raw)
  const out = {}
  const titles = count(c.reliablePayTitles)
  if (titles !== null) out.reliablePayTitles = titles
  const combos = object(c.jobCityPayCombos)
  const combosValue = count(combos.value)
  if (combosValue !== null) {
    out.jobCityPayCombos = {
      value: combosValue,
      approximate: combos.approximate === true,
      note: text(combos.note, 120) || 'Job/city combinations, not fully covered cities'
    }
  }
  return out
}

// City volume rows that pass privacy and map to a known city.
function publishableCityRows({ cityVolume, places, dataMode }) {
  const rows = []
  const seen = new Set()
  for (const raw of list(object(cityVolume).rows)) {
    const row = object(raw)
    const place = typeof row.cityKey === 'string' ? places.city(row.cityKey) : null
    const postings = count(row.postings)
    if (!place || postings === null || seen.has(place.key)) continue
    if (!evaluatePublication(row.checks, { mode: dataMode }).publishable) continue
    seen.add(place.key)
    // `firms` is internal: only buildMarket emits it, as staffingFirms.
    rows.push({ cityKey: place.key, postings, place, firms: count(object(row.checks).distinctFirms) })
  }
  return rankCities(rows)
}

function publishableMomentumRows({ momentum, places, dataMode }) {
  const rows = []
  const seen = new Set()
  for (const raw of list(object(momentum).rows)) {
    const row = object(raw)
    const place = typeof row.code === 'string' ? places.state(row.code) : null
    const pct = finite(row.momentumPct)
    if (!place || pct === null || seen.has(place.code)) continue
    if (!evaluatePublication(row.checks, { mode: dataMode }).publishable) continue
    seen.add(place.code)
    rows.push({ code: place.code, momentumPct: Math.round(pct), place })
  }
  return rows
}

function buildCities({ cityVolume, rankedCities, allow, viewerAccess }) {
  const cv = object(cityVolume)
  const authorized = isAuthorizedViewer(viewerAccess)
  const visible = visibleRows(rankedCities, (row) => allow.cityKeys.has(row.cityKey), viewerAccess)
  return {
    metric: text(cv.metric, 120),
    windowDays: count(cv.windowDays),
    scope: text(cv.scope, 120),
    rows: visible.map(({ row, access }) => ({
      rank: rankedCities.indexOf(row) + 1,
      key: row.place.key,
      city: row.place.name,
      state: row.place.state,
      postings: row.postings,
      access
    })),
    more: authorized
      ? null
      : { access: ACCESS.REQUIRES_FREE_ACCOUNT, description: 'Unlock the full city rankings.' }
  }
}

function momentumCoverage(momentum) {
  return object(momentum).coverage === COVERAGE.INSUFFICIENT_HISTORY ? COVERAGE.INSUFFICIENT_HISTORY : COVERAGE.PUBLISHABLE
}

function buildMomentum({ momentum, rankedHeating, rankedCooling, allow, viewerAccess }) {
  const m = object(momentum)
  const coverage = momentumCoverage(m)
  const authorized = isAuthorizedViewer(viewerAccess)
  const hasHistory = coverage === COVERAGE.PUBLISHABLE
  const heatingVisible = hasHistory
    ? visibleRows(rankedHeating, (row) => allow.heatingCodes.has(row.code), viewerAccess)
    : []
  const out = {
    windowDays: count(m.windowDays),
    previousWindowDays: count(m.previousWindowDays),
    isRawGrowth: m.isRawGrowth === true,
    isPayChange: m.isPayChange === true,
    isForecast: m.isForecast === true,
    basis: text(m.basis, 400),
    historyNote: text(m.historyNote, 200),
    coverage,
    heating: {
      rows: heatingVisible.map(({ row, access }, index) => ({
        rank: index + 1, code: row.code, name: row.place.name, momentumPct: row.momentumPct, access
      }))
    },
    cooling: authorized
      ? {
          access: ACCESS.AUTHORIZED,
          rows: hasHistory
            ? rankedCooling.map((row, index) => ({ rank: index + 1, code: row.code, name: row.place.name, momentumPct: row.momentumPct }))
            : []
        }
      : { access: ACCESS.REQUIRES_FREE_ACCOUNT, rows: [] }
  }
  if (!hasHistory) out.message = 'Not enough comparable history to show momentum yet.'
  return out
}

function buildIssueCards({ issueCards, rankedCities, momentumRows, momentum, nationalPay, allow, viewerAccess, cityVolume, freshness }) {
  const authorized = isAuthorizedViewer(viewerAccess)
  const cv = object(cityVolume)
  const windowDays = count(cv.windowDays)
  const jobScope = text(cv.jobScope, 40) || 'all jobs'
  const cards = []
  for (const raw of list(issueCards)) {
    const card = object(raw)
    const ref = object(card.ref)
    const key = text(card.key, 60)
    let title = text(card.title, 120)
    let basis = text(card.basis, 300)
    if (!key || !title) continue
    let metric = null
    let geography = null
    let access = null

    if (card.kind === 'momentum') {
      // A stale snapshot suppresses fresh-change headlines.
      if (freshness === FRESHNESS.STALE || momentumCoverage(momentum) !== COVERAGE.PUBLISHABLE) continue
      const row = momentumRows.find((r) => r.code === ref.code)
      if (!row) continue
      if (row.momentumPct > 0 && allow.heatingCodes.has(row.code)) access = ACCESS.PUBLIC
      else if (authorized) access = ACCESS.AUTHORIZED
      else continue
      metric = `${formatMomentum(row.momentumPct)} normalized posting momentum`
      geography = row.place.name
    } else if (card.kind === 'pay') {
      const entry = nationalPay.find((e) => e.roleKey === ref.roleKey)
      if (!entry) continue
      // Name the job in the title. The weekly snapshot's generic title
      // ("Most-advertised pay snapshot.") left visitors asking which role
      // the figure was for; the label comes from the same row as the figure.
      if (/^most-advertised/i.test(title)) {
        basis = `The job with the most advertised-pay postings from staffing firms nationwide. ${basis || ''}`.trim()
      }
      title = `${entry.roleLabel} pay snapshot.`
      metric = `Typical nationwide advertised pay: ${formatCents(entry.typicalCents)}/hour`
      geography = NATIONWIDE
      access = ACCESS.PUBLIC
    } else if (card.kind === 'volume') {
      const row = rankedCities.find((r) => r.cityKey === ref.cityKey)
      if (!row || windowDays === null) continue
      if (allow.cityKeys.has(row.cityKey)) access = ACCESS.PUBLIC
      else if (authorized) access = ACCESS.AUTHORIZED
      else continue
      // Name the city in the title too (the snapshot's generic title only
      // showed it in the small place tag).
      title = `${row.place.name} leads observed city volume.`
      metric = `${withThousands(row.postings)} new staffing-firm postings observed in the last ${windowDays} days — ${jobScope}.`
      geography = row.place.label
    } else {
      continue
    }
    cards.push({ key, kind: card.kind, title, metric, geography, access, basis })
  }
  return cards
}

function buildSectors({ places, nationalPay }) {
  const withBenchmark = new Set(nationalPay.map((e) => e.roleKey))
  return places.sectors.map((sector) => {
    const order = new Map(rolesForSector(sector.key).map((role, index) => [role.key, index]))
    const out = {
      key: sector.key,
      label: sector.label,
      roles: places.roles
        .filter((role) => role.sectorKey === sector.key)
        .sort((a, b) => (order.get(a.key) ?? Infinity) - (order.get(b.key) ?? Infinity))
        .map((role) => {
          const r = { key: role.key, label: role.label }
          if (role.specialtyOf) r.specialtyOf = role.specialtyOf
          if (role.group) r.group = role.group
          r.hasNationalBenchmark = withBenchmark.has(role.key)
          return r
        })
    }
    if (sector.familiesNote) out.familiesNote = sector.familiesNote
    return out
  })
}

function buildFamilies(raw) {
  const f = object(raw)
  return {
    order: 'as supplied',
    countsSupplied: false,
    labels: list(f.labels).map((label) => text(label, 80)).filter(Boolean).slice(0, 20),
    note: text(f.note, 200)
  }
}

// ------------------------------------------------- pay response: market, trend

// Market context for the requested place, from publishable rows only. The
// selected state's momentum is shown whatever its sign. No city rank is
// emitted (owner decision). Null when neither part has anything publishable
// (and always for a nationwide request).
function buildMarket({ data, places, dataMode, statePlace, cityPlace }) {
  if (!statePlace) return null
  let city = null
  if (cityPlace) {
    const cv = object(data.cityVolume)
    const windowDays = count(cv.windowDays)
    const known = publishableCityRows({ cityVolume: cv, places, dataMode })
    const row = known.find((r) => r.cityKey === cityPlace.key) || null
    // staffingFirms is null only in development data whose checks were never
    // supplied; production rows always carry verified counts.
    if (row && windowDays !== null) {
      city = {
        key: row.place.key,
        label: row.place.label,
        newPostings: row.postings,
        staffingFirms: row.firms,
        windowDays,
        jobScope: text(cv.jobScope, 40) || 'all jobs'
      }
    }
  }
  let state = null
  const m = object(data.momentum)
  const windowDays = count(m.windowDays)
  const previousWindowDays = count(m.previousWindowDays)
  if (momentumCoverage(m) === COVERAGE.PUBLISHABLE && windowDays !== null && previousWindowDays !== null) {
    const row = publishableMomentumRows({ momentum: m, places, dataMode }).find((r) => r.code === statePlace.code)
    if (row) {
      state = {
        code: row.code,
        label: row.place.label,
        momentumPct: row.momentumPct,
        windowDays,
        previousWindowDays,
        isEarlySignal: /early signal/i.test(`${text(m.historyNote, 200) || ''} ${text(m.basis, 400) || ''}`)
      }
    }
  }
  return city || state ? { city, state } : null
}

function monthLabel(month) {
  const [, year, mm] = MONTH.exec(month)
  return `${MONTH_NAMES[Number(mm) - 1]} ${year}`
}

// Valid monthly snapshots, ascending, de-duplicated, most recent TREND_MAX_MONTHS.
function monthlySnapshots(monthly) {
  const byMonth = new Map()
  for (const raw of list(monthly)) {
    const m = object(raw)
    if (typeof m.month === 'string' && MONTH.test(m.month) && Array.isArray(m.pay) && !byMonth.has(m.month)) byMonth.set(m.month, m.pay)
  }
  return [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-TREND_MAX_MONTHS)
}

// Typical advertised pay over time for the role: one series for the requested
// state (when a state was asked for) and one nationwide. Each point is a
// monthly snapshot (null when that month's cell is absent or withheld) and the
// final point is the current snapshot. A series with no figure at all is
// dropped; null when there are no monthly snapshots or no series.
function buildTrend({ data, role, statePlace, dataMode }) {
  const months = monthlySnapshots(data.monthly)
  if (months.length === 0) return null
  const scopes = []
  if (statePlace) scopes.push({ head: { scope: 'state', code: statePlace.code, label: statePlace.label }, level: 'state', state: statePlace.code })
  scopes.push({ head: { scope: 'nationwide', label: NATIONWIDE }, level: 'nationwide', state: null })
  const series = []
  for (const { head, level, state } of scopes) {
    const points = months.map(([month, pay]) => ({
      period: month,
      label: monthLabel(month),
      typicalCents: publishedTypical(findPayCell(pay, role.key, level, state, null), dataMode)
    }))
    points.push({ period: 'now', label: 'Now', typicalCents: publishedTypical(findPayCell(data.pay, role.key, level, state, null), dataMode) })
    if (points.some((p) => p.typicalCents !== null)) series.push({ ...head, points })
  }
  if (series.length === 0) return null
  const exact = isoDate(object(data.snapshot).exactDate)
  return { roleKey: role.key, snapshotDate: exact ? exact.slice(0, 10) : null, series }
}

// ---------------------------------------------------------------- builders

export function buildSnapshotResponse({ data, dataMode, viewer, places = REAL_PLACES }) {
  const mode = resolveDataMode(dataMode)
  const v = viewerOf(viewer)
  const d = object(data)
  const nationalPay = buildNationalPay({ places, pay: d.pay, dataMode: mode })
  const rankedCities = publishableCityRows({ cityVolume: d.cityVolume, places, dataMode: mode })
  const momentumRows = publishableMomentumRows({ momentum: d.momentum, places, dataMode: mode })
  const rankedHeating = rankHeating(momentumRows)
  const rankedCooling = rankCooling(momentumRows)
  const allow = publicAllowlist({ rankedCities, rankedHeating })
  const snapshot = buildSnapshotMeta(d.snapshot)

  return {
    contractVersion: CONTRACT_VERSION,
    dataMode: mode,
    viewer: v,
    snapshot,
    coverageStrip: buildCoverageStrip(d.coverage),
    extraCoverage: buildExtraCoverage(d.coverage),
    issueCards: buildIssueCards({
      issueCards: d.issueCards, rankedCities, momentumRows, momentum: d.momentum, nationalPay, allow,
      viewerAccess: v.access, cityVolume: d.cityVolume, freshness: snapshot.freshness
    }),
    cities: buildCities({ cityVolume: d.cityVolume, rankedCities, allow, viewerAccess: v.access }),
    momentum: buildMomentum({ momentum: d.momentum, rankedHeating, rankedCooling, allow, viewerAccess: v.access }),
    sectors: buildSectors({ places, nationalPay }),
    nationalPay,
    mostPostedFamilies: buildFamilies(d.mostPostedFamilies)
  }
}

// request: { roleKey, state, city } already validated by the caller against
// `places`. Throws on an unknown role (callers must validate first).
export function buildPayResponse({ data, dataMode, viewer, request, places = REAL_PLACES }) {
  const mode = resolveDataMode(dataMode)
  const v = viewerOf(viewer)
  const d = object(data)
  const req = object(request)
  const role = places.role(req.roleKey)
  if (!role) throw new Error('buildPayResponse: unknown role')
  const stateCode = req.state || null
  const cityKey = stateCode && req.city ? req.city : null
  const statePlace = stateCode ? places.state(stateCode) : null
  const cityPlace = cityKey ? places.city(cityKey) : null
  if ((stateCode && !statePlace) || (cityKey && (!cityPlace || cityPlace.state !== statePlace.code))) {
    throw new Error('buildPayResponse: invalid geography')
  }

  const national = nationalEntry({ role, pay: d.pay, dataMode: mode, withFirmCount: true }).entry
  let result
  let fallback = null

  if (!statePlace) {
    result = evaluatePayScope({
      cell: findPayCell(d.pay, role.key, 'nationwide', null, null),
      level: 'nationwide', label: NATIONWIDE, shortName: 'nationwide', requested: true,
      viewerAccess: v.access, dataMode: mode
    }).body
  } else if (!cityPlace) {
    result = evaluatePayScope({
      cell: findPayCell(d.pay, role.key, 'state', statePlace.code, null),
      level: 'state', label: statePlace.label, shortName: statePlace.shortName, requested: true,
      viewerAccess: v.access, dataMode: mode
    }).body
  } else {
    result = evaluatePayScope({
      cell: findPayCell(d.pay, role.key, 'city', statePlace.code, cityPlace.key),
      level: 'city', label: cityPlace.label, shortName: cityPlace.shortName, requested: true,
      viewerAccess: v.access, dataMode: mode
    }).body
    if (result.coverage !== COVERAGE.PUBLISHABLE) {
      const stateScope = evaluatePayScope({
        cell: findPayCell(d.pay, role.key, 'state', statePlace.code, null),
        level: 'state', label: statePlace.label, shortName: statePlace.shortName, requested: false,
        viewerAccess: v.access, dataMode: mode
      })
      if (stateScope.publishable) {
        fallback = stateScope.body
        if (!fallback.message) fallback.message = `${withArticle(statePlace.shortName)} benchmark is available.`
      }
    }
  }

  return {
    contractVersion: CONTRACT_VERSION,
    dataMode: mode,
    viewer: v,
    request: { roleKey: role.key, roleLabel: role.label, state: statePlace ? statePlace.code : null, city: cityPlace ? cityPlace.key : null },
    result,
    fallback,
    national,
    market: buildMarket({ data: d, places, dataMode: mode, statePlace, cityPlace }),
    trend: buildTrend({ data: d, role, statePlace, dataMode: mode })
  }
}
