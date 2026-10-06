// Monthly "Staffing Signal" report: compares month M with month M-1 using the
// archived aggregates in api/_lib/signal/data/monthly/YYYY-MM.json (written by
// scripts/export_signal_monthly.py) and returns the report object that
// scripts/build_monthly_report.mjs saves to data/report/YYYY-MM.json.
//
// Pure and deterministic: same two inputs -> same report (generatedAt aside).
// Headline strings come from fixed templates, never from a language model.
//
// Privacy: a comparison is made only when the cell exists - i.e. passed the
// 3-firm / 50% rule - in BOTH months. Cells are re-checked here (fail closed),
// so an archive that slipped a failing cell in can never surface it.
//
// Noise: see THRESHOLDS. Demand changes are measured as a change in SHARE of
// all staffing-firm postings (not raw counts), because collection volume
// differs month to month; raw growth would mostly measure our crawler.
import { roleByKey } from '../../../shared/signal/taxonomy.js'
import { stateByCode, cityByKey } from '../../../shared/signal/geography.js'
import { formatCents } from '../../../shared/signal/money.js'

export const REPORT_FORMAT = 'staffing-signal-monthly-report'
export const REPORT_CALC_VERSION = 'signal-report-1.0.0'
export const MONTHLY_FORMAT = 'staffing-signal-monthly-aggregates'
export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export const THRESHOLDS = Object.freeze({
  privacy: { minDistinctFirms: 5, maxFirmShare: 0.5, rule: 'cell must pass in BOTH months' },
  pay: {
    minObservations: { nationwide: 30, state: 20, city: 15 },
    minAbsPct: { nationwide: 2, state: 3, city: 5 },
    // Bigger jumps in one month almost always mean the mix of postings changed
    // (different employers / shifts / specialties), not market pay. Not shown.
    maxAbsPct: 20,
    basis: 'typical (median) advertised hourly pay, month vs previous month'
  },
  demand: {
    minPostings: { roleNationwide: 100, state: 200, city: 75, roleState: 40, roleCity: 25 },
    minAbsPct: 10,
    // Larger swings in share usually reflect a change in which firms we
    // collected that month, not the market. Not shown.
    maxAbsPct: 75,
    basis: 'change in share of all staffing-firm postings (normalized for collection volume)'
  },
  headlines: { max: 5 },
  listsMax: 5
})

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}
const shortMonth = (month) => MONTH_NAMES[Number(month.slice(5)) - 1]

export function previousMonth(month) {
  let [y, m] = month.split('-').map(Number)
  m -= 1
  if (m === 0) { m = 12; y -= 1 }
  return `${y}-${String(m).padStart(2, '0')}`
}

const passes = (c) => Boolean(c) && Number.isSafeInteger(c.distinctFirms) && c.distinctFirms >= 3 &&
  typeof c.maxFirmShare === 'number' && c.maxFirmShare >= 0 && c.maxFirmShare <= 0.5

export function roleLabel(key) {
  return roleByKey(key)?.label || key.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}
export function stateName(code) {
  return stateByCode(code)?.name || code
}
export function cityLabel(key) {
  const c = cityByKey(key)
  if (c) return `${c.name}, ${c.state}`
  const [st, slug] = key.split(':')
  return `${slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')}, ${st}`
}

const round1 = (x) => Math.round(x * 10) / 10
const pctText = (p) => `${Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0)}%`

export function validateMonthly(doc, month) {
  if (!doc || doc.format !== MONTHLY_FORMAT || doc.schemaVersion !== 1) throw new Error(`bad_monthly_format:${month}`)
  if (doc.month !== month) throw new Error(`month_mismatch:${month}`)
  if (!doc.reliability?.reliable) throw new Error(`unreliable_month:${month}`)
  if (!Array.isArray(doc.pay) || !doc.demand) throw new Error(`bad_monthly_shape:${month}`)
  return doc
}

const payKey = (c) => `${c.roleKey}|${c.level}|${c.state || ''}|${c.city || ''}`

// Pay moves for one level/place filter. Returns rows sorted by |pct| desc.
function payMoves(cur, prev, level, where = () => true) {
  const prevIdx = new Map(prev.pay.filter((c) => c.level === level && passes(c.checks)).map((c) => [payKey(c), c]))
  const minN = THRESHOLDS.pay.minObservations[level]
  const minPct = THRESHOLDS.pay.minAbsPct[level]
  const out = []
  for (const c of cur.pay) {
    if (c.level !== level || !where(c) || !passes(c.checks)) continue
    const p = prevIdx.get(payKey(c))
    if (!p || c.n < minN || p.n < minN) continue
    const pct = (c.typicalCents / p.typicalCents - 1) * 100
    if (Math.abs(pct) < minPct || Math.abs(pct) > THRESHOLDS.pay.maxAbsPct) continue
    out.push({ roleKey: c.roleKey, label: roleLabel(c.roleKey), state: c.state, city: c.city, fromCents: p.typicalCents, toCents: c.typicalCents, pct: round1(pct), direction: pct > 0 ? 'up' : 'down' })
  }
  return out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.roleKey.localeCompare(b.roleKey))
}

// Share-normalized demand change for rows identified by keyFn.
function demandMoves(curRows, prevRows, curTotal, prevTotal, keyFn, minPostings) {
  const prevIdx = new Map(prevRows.filter((r) => passes(r.checks)).map((r) => [keyFn(r), r]))
  const out = []
  for (const r of curRows) {
    if (!passes(r.checks)) continue
    const p = prevIdx.get(keyFn(r))
    if (!p || r.postings < minPostings || p.postings < minPostings) continue
    const pct = ((r.postings / curTotal) / (p.postings / prevTotal) - 1) * 100
    if (Math.abs(pct) < THRESHOLDS.demand.minAbsPct || Math.abs(pct) > THRESHOLDS.demand.maxAbsPct) continue
    out.push({ key: keyFn(r), postings: r.postings, previousPostings: p.postings, pct: round1(pct), direction: pct > 0 ? 'up' : 'down' })
  }
  return out.sort((a, b) => b.pct - a.pct || a.key.localeCompare(b.key))
}

function split(moves, labelFn) {
  const n = THRESHOLDS.listsMax
  const withLabel = (m) => ({ ...m, label: labelFn(m.key) })
  return {
    hottest: moves.filter((m) => m.pct > 0).slice(0, n).map(withLabel),
    cooling: moves.filter((m) => m.pct < 0).reverse().slice(0, n).map(withLabel)
  }
}

// ---- headline templates (deterministic) ----
export function payHeadline(m, cmp, place = '') {
  const verb = m.direction === 'up' ? 'rose' : 'fell'
  return `${place}${m.label} typical advertised pay ${verb} ${pctText(m.pct)} to ${formatCents(m.toCents)}/hr (from ${formatCents(m.fromCents)} in ${cmp}).`
}
export function roleDemandHeadline(m, cmp, place = '') {
  return m.direction === 'up'
    ? `${place}${m.label} postings gained ground: ${pctText(m.pct)} larger share of staffing-firm postings than in ${cmp}.`
    : `${place}${m.label} postings cooled: ${pctText(m.pct)} smaller share of staffing-firm postings than in ${cmp}.`
}
export function placeDemandHeadline(m, cmp) {
  return m.direction === 'up'
    ? `${m.label} heated up: its share of staffing-firm postings grew ${pctText(m.pct)} vs ${cmp}.`
    : `${m.label} cooled: its share of staffing-firm postings fell ${pctText(m.pct)} vs ${cmp}.`
}
export function newlyPublishableHeadline(list) {
  const names = list.slice(0, 3).map((r) => r.label).join(', ')
  const more = list.length > 3 ? ` and ${list.length - 3} more` : ''
  return list.length === 1
    ? `New this month: ${names} now has a reliable national pay range.`
    : `New this month: ${list.length} roles now have a reliable national pay range (${names}${more}).`
}

function pick(candidates, max) {
  // Round-robin across kinds so one kind cannot fill every slot.
  const out = []
  let i = 0
  while (out.length < max && candidates.some((c) => c.length > i)) {
    for (const c of candidates) if (c[i] && out.length < max) out.push(c[i])
    i += 1
  }
  return out
}

function localSection(cur, prev, { level, state, city }, cmp) {
  const isCity = level === 'city'
  const match = (c) => (isCity ? c.city === city : c.state === state)
  const moves = payMoves(cur, prev, level, match).slice(0, THRESHOLDS.listsMax)
  const roleLevel = isCity ? 'city' : 'state'
  const roleRows = (doc) => doc.demand.roles.filter((r) => r.level === roleLevel && match(r))
  const rd = split(demandMoves(roleRows(cur), roleRows(prev), cur.totals.postings, prev.totals.postings, (r) => r.roleKey,
    isCity ? THRESHOLDS.demand.minPostings.roleCity : THRESHOLDS.demand.minPostings.roleState), roleLabel)
  const placeRows = (doc) => (isCity ? doc.demand.cities.filter((r) => r.cityKey === city) : doc.demand.states.filter((r) => r.code === state))
  const pk = (r) => (isCity ? r.cityKey : r.code)
  const pm = demandMoves(placeRows(cur), placeRows(prev), cur.totals.postings, prev.totals.postings, pk,
    isCity ? THRESHOLDS.demand.minPostings.city : THRESHOLDS.demand.minPostings.state)[0] || null
  const name = isCity ? cityLabel(city) : stateName(state)
  const placePrefix = `${name}: `
  const headlines = pick([
    moves.map((m) => ({ kind: 'pay', direction: m.direction, pct: m.pct, text: payHeadline(m, cmp, placePrefix), ref: { roleKey: m.roleKey } })),
    pm ? [{ kind: 'place-demand', direction: pm.direction, pct: pm.pct, text: placeDemandHeadline({ ...pm, label: name }, cmp), ref: isCity ? { cityKey: city } : { state } }] : [],
    rd.hottest.map((m) => ({ kind: 'role-demand', direction: 'up', pct: m.pct, text: roleDemandHeadline(m, cmp, placePrefix), ref: { roleKey: m.key } })),
    rd.cooling.map((m) => ({ kind: 'role-demand', direction: 'down', pct: m.pct, text: roleDemandHeadline(m, cmp, placePrefix), ref: { roleKey: m.key } }))
  ], THRESHOLDS.headlines.max)
  if (!headlines.length) return null
  return { name, ...(isCity ? { cityKey: city, state } : { state }), headlines, payMoves: moves, demand: pm, hottestRoles: rd.hottest, coolingRoles: rd.cooling }
}

export function buildReport(cur, prev, { now = new Date() } = {}) {
  const month = cur.month
  if (prev.month !== previousMonth(month)) throw new Error('months_not_consecutive')
  const cmp = shortMonth(prev.month)

  const natPay = payMoves(cur, prev, 'nationwide')
  const roleNat = (doc) => doc.demand.roles.filter((r) => r.level === 'nationwide')
  const roles = split(demandMoves(roleNat(cur), roleNat(prev), cur.totals.postings, prev.totals.postings, (r) => r.roleKey, THRESHOLDS.demand.minPostings.roleNationwide), roleLabel)
  const states = split(demandMoves(cur.demand.states, prev.demand.states, cur.totals.postings, prev.totals.postings, (r) => r.code, THRESHOLDS.demand.minPostings.state), stateName)
  const newly = Object.entries(cur.roleStatus || {})
    .filter(([k, s]) => s === 'publishable' && prev.roleStatus?.[k] !== 'publishable' &&
      cur.pay.some((c) => c.level === 'nationwide' && c.roleKey === k && passes(c.checks)))
    .map(([k]) => ({ roleKey: k, label: roleLabel(k) }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const up = natPay.filter((m) => m.pct > 0)
  const down = natPay.filter((m) => m.pct < 0)
  const H = (kind, m, text, ref) => ({ kind, direction: m.direction, pct: m.pct, text, ref })
  const headlines = pick([
    up.slice(0, 2).map((m) => H('pay', m, payHeadline(m, cmp), { roleKey: m.roleKey })),
    roles.hottest.slice(0, 1).map((m) => H('role-demand', m, roleDemandHeadline(m, cmp), { roleKey: m.key })),
    states.hottest.slice(0, 1).map((m) => H('state-demand', m, placeDemandHeadline(m, cmp), { state: m.key })),
    down.slice(0, 1).map((m) => H('pay', m, payHeadline(m, cmp), { roleKey: m.roleKey })),
    roles.cooling.slice(0, 1).map((m) => H('role-demand', m, roleDemandHeadline(m, cmp), { roleKey: m.key })),
    newly.length ? [{ kind: 'new-roles', direction: 'new', pct: null, text: newlyPublishableHeadline(newly), ref: null }] : []
  ], THRESHOLDS.headlines.max)

  const stateCodes = new Set([...cur.demand.states.map((r) => r.code), ...cur.pay.filter((c) => c.state).map((c) => c.state)])
  const stateSections = {}
  for (const st of [...stateCodes].sort()) {
    const s = localSection(cur, prev, { level: 'state', state: st }, cmp)
    if (s) stateSections[st] = s
  }
  const cityKeys = new Set([...cur.demand.cities.map((r) => r.cityKey), ...cur.pay.filter((c) => c.city).map((c) => c.city)])
  const citySections = {}
  for (const ck of [...cityKeys].sort()) {
    const s = localSection(cur, prev, { level: 'city', state: ck.slice(0, 2), city: ck }, cmp)
    if (s) citySections[ck] = s
  }

  return {
    format: REPORT_FORMAT,
    schemaVersion: 1,
    calcVersion: REPORT_CALC_VERSION,
    month,
    previousMonth: prev.month,
    label: monthLabel(month),
    generatedAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    sources: { month: cur.calcVersion, previous: prev.calcVersion, base: cur.baseCalcVersion },
    thresholds: THRESHOLDS,
    notes: [
      'Staffing-firm postings only. Advertised pay, not actual pay.',
      `Compares ${monthLabel(month)} with ${monthLabel(prev.month)}. A figure appears only when it met the privacy rule (at least 3 firms, no firm over half) in both months.`,
      'Demand changes are shifts in share of all staffing-firm postings, so they are not distorted by how many postings we collected.'
    ],
    national: {
      headlines,
      payMoves: natPay.slice(0, 10),
      hottestRoles: roles.hottest,
      coolingRoles: roles.cooling,
      hottestStates: states.hottest,
      coolingStates: states.cooling,
      newlyPublishable: newly
    },
    states: stateSections,
    cities: citySections
  }
}

// Which local section a reader should see first, with an honest fallback.
// prefs: { state?, cityKey? }. Returns { level, section, note }.
export function localFor(report, { state, cityKey } = {}) {
  if (cityKey && report.cities?.[cityKey]) return { level: 'city', section: report.cities[cityKey], note: null }
  if (state && report.states?.[state]) {
    const note = cityKey ? `No reliable ${cityLabel(cityKey)} comparison this month (too few firms or postings in one of the two months), so here is ${stateName(state)}.` : null
    return { level: 'state', section: report.states[state], note }
  }
  if (state || cityKey) {
    const where = cityKey ? cityLabel(cityKey) : stateName(state)
    return { level: 'national', section: null, note: `No reliable ${where} comparison this month (too few firms or postings in one of the two months), so here is the national picture.` }
  }
  return { level: 'national', section: null, note: null }
}

// Turn a free-text city + state into the pipeline's city key ('TX:houston').
export function cityKeyFor(state, city) {
  if (!state || !city) return null
  let c = String(city).normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ')
  c = c.replace(/^(greater|city of)\s+/i, '').replace(/\s+(county|metropolitan area|metro area|metro|area)$/i, '').replace(/^[ ,]+|[ ,]+$/g, '')
  if (state === 'DC') c = 'washington'
  const slug = c.toLowerCase().replace('st.', 'st').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug ? `${state}:${slug}` : null
}
