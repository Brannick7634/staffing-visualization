// DEVELOPMENT ONLY. Interaction States Lab scenarios (SYNTHETIC TEST DATA).
//
// Every number here is a synthetic test value attached to an obviously fake
// role and fake places ('Example Role', 'Example State (EX)', 'Example City,
// EX'). No synthetic figure is ever attached to a real place or real role.
//
// Each scenario is produced by running the SAME handlers and service used for
// real requests against a synthetic adapter. Firm counts and shares are set
// on the synthetic cells so the real privacy gate and access policy decide
// the outcome; nothing here hand-writes a response body.
import { DATA_MODE, ACCESS, COVERAGE, FRESHNESS, REQUEST } from '../../shared/signal/contract.js'
import { createSnapshotHandler, createPayHandler } from '../../api/_lib/signal/handlers.js'

export const SYNTHETIC_WATERMARK = 'SYNTHETIC TEST DATA'

const ROLE = Object.freeze({ key: 'example-role', label: 'Example Role', sectorKey: 'example-sector', kind: 'title' })
const STATE = Object.freeze({ code: 'EX', name: 'Example State (EX)', label: 'Example State (EX)', shortName: 'Example State' })
const CITY = Object.freeze({ key: 'EX:example-city', name: 'Example City', state: 'EX', label: 'Example City, EX', shortName: 'Example City' })

export const SYNTHETIC_PLACES = Object.freeze({
  sectors: Object.freeze([Object.freeze({ key: 'example-sector', label: 'Example Sector' })]),
  roles: Object.freeze([ROLE]),
  role(key) {
    return key === ROLE.key ? ROLE : null
  },
  state(code) {
    return code === STATE.code ? { ...STATE } : null
  },
  city(key) {
    return key === CITY.key ? { ...CITY } : null
  }
})

// Synthetic figures in integer cents (exported for the bundle-isolation test).
export const SYNTHETIC_FIGURES = Object.freeze({
  national: Object.freeze({ p25Cents: 1994, typicalCents: 2247, p75Cents: 2561 }),
  state: Object.freeze({ p25Cents: 2063, typicalCents: 2318, p75Cents: 2609 }),
  city: Object.freeze({ p25Cents: 2137, typicalCents: 2419, p75Cents: 2683 })
})

const RATE = Object.freeze({ default: 2200, below: 1980, within: 2400, above: 2900 })

const PASS_NATIONAL = { status: 'verified', distinctFirms: 64, maxFirmShare: 0.08 }
const PASS_STATE = { status: 'verified', distinctFirms: 23, maxFirmShare: 0.14 }
const PASS_CITY = { status: 'verified', distinctFirms: 12, maxFirmShare: 0.21 }

function payCell(level, figures, checks, extra = {}) {
  return {
    roleKey: ROLE.key,
    level,
    state: level === 'nationwide' ? null : STATE.code,
    city: level === 'city' ? CITY.key : null,
    ...figures,
    payBasis: 'hourly',
    currency: 'USD',
    checks,
    ...extra
  }
}

const NATIONAL_CELL = payCell('nationwide', SYNTHETIC_FIGURES.national, PASS_NATIONAL)
const STATE_CELL = payCell('state', SYNTHETIC_FIGURES.state, PASS_STATE)
const cityCell = (checks, extra) => payCell('city', SYNTHETIC_FIGURES.city, checks, extra)

// Synthetic monthly snapshots for the pay trend. The September state cell is
// absent on purpose (a withheld month shows as "Not enough data").
const MONTHLY = Object.freeze([
  {
    month: '2026-08',
    pay: [
      payCell('nationwide', { p25Cents: 1950, typicalCents: 2210, p75Cents: 2530 }, PASS_NATIONAL),
      payCell('state', { p25Cents: 2020, typicalCents: 2280, p75Cents: 2580 }, PASS_STATE)
    ]
  },
  { month: '2026-09', pay: [payCell('nationwide', { p25Cents: 1975, typicalCents: 2230, p75Cents: 2550 }, PASS_NATIONAL)] }
])

function syntheticData({ pay = [NATIONAL_CELL], snapshot = {}, momentum = {}, monthly = MONTHLY } = {}) {
  return {
    snapshot: {
      label: 'Example snapshot',
      exactDate: null,
      freshness: FRESHNESS.CURRENT,
      lastSuccessfulRefresh: null,
      refreshCadence: 'weekly',
      methodologyVersion: null,
      note: 'Synthetic test data for interaction states. Not market data.',
      ...snapshot
    },
    coverage: {},
    issueCards: [],
    cityVolume: {
      metric: 'New staffing-firm postings observed', windowDays: 45, scope: 'Example scope', jobScope: 'all jobs',
      rows: [{ cityKey: CITY.key, postings: 240, checks: { status: 'verified', distinctFirms: 31, maxFirmShare: 0.12 } }]
    },
    momentum: {
      windowDays: 45,
      previousWindowDays: 45,
      basis: 'Synthetic momentum basis for interaction testing.',
      historyNote: 'Synthetic test data.',
      coverage: COVERAGE.PUBLISHABLE,
      rows: [{ code: STATE.code, momentumPct: 18, checks: PASS_STATE }],
      ...momentum
    },
    pay,
    monthly,
    mostPostedFamilies: { labels: [], note: null }
  }
}

function syntheticAdapter(data) {
  return { dataMode: DATA_MODE.SYNTHETIC, async load() { return { available: true, data } } }
}

const failingAdapter = { dataMode: DATA_MODE.SYNTHETIC, async load() { return { available: false } } }

const viewerAs = (access) => () => ({ access, simulated: true })

function captureRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this }
  }
}

async function runPay({ data, access, adapter, scope = 'city' }) {
  const handler = createPayHandler({
    adapter: adapter || syntheticAdapter(data),
    resolveAccess: viewerAs(access),
    places: SYNTHETIC_PLACES
  })
  const query = { role: ROLE.key }
  if (scope !== 'nationwide') query.state = STATE.code
  if (scope === 'city') query.city = CITY.key
  const res = captureRes()
  await handler({ method: 'GET', query, headers: {} }, res)
  return res
}

async function runSnapshot({ data, access }) {
  const handler = createSnapshotHandler({ adapter: syntheticAdapter(data), resolveAccess: viewerAs(access), places: SYNTHETIC_PLACES })
  const res = captureRes()
  await handler({ method: 'GET', query: {}, headers: {} }, res)
  if (res.statusCode !== 200) throw new Error('synthetic snapshot failed')
  return res.body
}

async function payScenario({ key, title, description, access, pay, rateCents = RATE.default, scope = 'city' }) {
  const res = await runPay({ data: syntheticData({ pay }), access, scope })
  if (res.statusCode !== 200) throw new Error(`synthetic scenario ${key} failed`)
  return {
    key, title, description, kind: 'pay', dataMode: DATA_MODE.SYNTHETIC,
    viewer: { access, simulated: true }, rateCents, requestState: REQUEST.READY, response: res.body
  }
}

export async function buildScenarios() {
  const A = ACCESS.AUTHORIZED
  const P = ACCESS.PUBLIC
  const scenarios = []

  scenarios.push(await payScenario({
    key: 'city-public-signed-out',
    title: 'Publishable city benchmark, signed out',
    description: 'Local pay is free: the Example City benchmark passes the publication rule and is shown without an account, with its market activity and pay trend. Creating the report needs a free account.',
    access: P, pay: [NATIONAL_CELL, STATE_CELL, cityCell(PASS_CITY)]
  }))
  scenarios.push(await payScenario({
    key: 'city-unlocked-authorized',
    title: 'Publishable city benchmark, signed in',
    description: 'The same Example City benchmark for a free account (same figures; the report can be created).',
    access: A, pay: [NATIONAL_CELL, STATE_CELL, cityCell(PASS_CITY)]
  }))
  const thinCity = cityCell({ status: 'verified', distinctFirms: 2, maxFirmShare: 0.4 })
  scenarios.push(await payScenario({
    key: 'city-insufficient-state-fallback-signed-out',
    title: 'City suppressed, state available (signed out)',
    description: 'Too few firms advertise comparable Example City pay. The Example State benchmark is shown instead, free.',
    access: P, pay: [NATIONAL_CELL, STATE_CELL, thinCity]
  }))
  scenarios.push(await payScenario({
    key: 'city-insufficient-state-fallback-authorized',
    title: 'City suppressed, state available (signed in)',
    description: 'Signing in does not unlock the suppressed city; the Example State fallback is shown with its own scope.',
    access: A, pay: [NATIONAL_CELL, STATE_CELL, thinCity]
  }))
  scenarios.push(await payScenario({
    key: 'four-firms-suppressed',
    title: 'Four firms: suppressed',
    description: 'Only 2 distinct firms contribute, below the 3-firm minimum. Suppressed for everyone, including signed-in visitors.',
    access: A, pay: [NATIONAL_CELL, cityCell({ status: 'verified', distinctFirms: 2, maxFirmShare: 0.3 })]
  }))
  scenarios.push(await payScenario({
    key: 'five-firms-60pct-suppressed',
    title: 'Five firms, one at 60%: suppressed',
    description: 'Five firms contribute, but one supplies 60% of the observations (above the 50% limit). Suppressed for everyone.',
    access: A, pay: [NATIONAL_CELL, cityCell({ status: 'verified', distinctFirms: 5, maxFirmShare: 0.6 })]
  }))
  scenarios.push(await payScenario({
    key: 'five-firms-50pct-publishable',
    title: 'Five firms, one at exactly 50%: publishable',
    description: 'Five firms contribute and the largest supplies exactly 50%. The rule is "no more than 50%", so this passes.',
    access: A, pay: [NATIONAL_CELL, cityCell({ status: 'verified', distinctFirms: 5, maxFirmShare: 0.5 })]
  }))
  scenarios.push(await payScenario({
    key: 'large-demand-small-pay',
    title: 'Large demand, small pay subset: suppressed',
    description: 'Example City has heavy observed demand from many firms, but only 3 firms advertise comparable pay. Demand volume never authorizes a pay benchmark.',
    access: A,
    pay: [NATIONAL_CELL, cityCell(
      { status: 'verified', distinctFirms: 2, maxFirmShare: 0.45 },
      { demand: { postings: 2400, checks: { status: 'verified', distinctFirms: 41, maxFirmShare: 0.09 } } }
    )]
  }))
  scenarios.push(await payScenario({
    key: 'city-not-yet-available',
    title: 'No local benchmark yet',
    description: 'No Example City or Example State benchmark exists. The nationwide comparison stays visible; signup is not offered as a way to get a local answer.',
    access: A, pay: [NATIONAL_CELL]
  }))
  scenarios.push(await payScenario({
    key: 'weekly-travel-package',
    title: 'Weekly travel package: not comparable',
    description: 'The only Example City pay is a weekly travel total-compensation package. It is never mixed with an hourly base-pay comparison.',
    access: A,
    pay: [NATIONAL_CELL, cityCell(PASS_CITY, { payBasis: 'weekly_package', p25Cents: 198000, typicalCents: 214000, p75Cents: 231000 })]
  }))
  for (const [verdict, rateCents] of [['below', RATE.below], ['within', RATE.within], ['above', RATE.above]]) {
    scenarios.push(await payScenario({
      key: `verdict-${verdict}`,
      title: `Verdict: ${verdict} the typical range`,
      description: `A synthetic rate ${verdict} the middle half of Example City advertised rates.`,
      access: A, pay: [NATIONAL_CELL, STATE_CELL, cityCell(PASS_CITY)], rateCents
    }))
  }

  // Stale snapshot: last valid information with a prominent date.
  const staleData = syntheticData({
    pay: [NATIONAL_CELL, STATE_CELL, cityCell(PASS_CITY)],
    snapshot: { label: 'Example stale snapshot', exactDate: '2026-08-02', freshness: FRESHNESS.STALE, lastSuccessfulRefresh: '2026-08-02' }
  })
  const staleSnapshot = await runSnapshot({ data: staleData, access: A })
  const stalePay = await runPay({ data: staleData, access: A })
  scenarios.push({
    key: 'stale-snapshot',
    title: 'Stale snapshot',
    description: 'The feed has not refreshed on schedule. The last valid benchmark stays visible with its date; fresh-change headlines are suppressed.',
    kind: 'pay', dataMode: DATA_MODE.SYNTHETIC, viewer: { access: A, simulated: true },
    rateCents: RATE.default, requestState: REQUEST.READY, response: stalePay.body, snapshot: staleSnapshot.snapshot
  })

  // Backend failure: the real handler with an unavailable feed.
  const failed = await runPay({ adapter: failingAdapter, access: A })
  scenarios.push({
    key: 'backend-failure',
    title: 'Backend failure',
    description: 'The benchmark could not load. No figure is shown instead of a guess.',
    kind: 'error', dataMode: DATA_MODE.SYNTHETIC, viewer: { access: A, simulated: true },
    rateCents: RATE.default, requestState: REQUEST.ERROR, response: null,
    error: { status: failed.statusCode, body: failed.body }
  })

  // No comparable history: momentum rows exist but are withheld.
  const noHistoryData = syntheticData({ momentum: { coverage: COVERAGE.INSUFFICIENT_HISTORY } })
  const noHistorySnapshot = await runSnapshot({ data: noHistoryData, access: A })
  const nationalPay = await runPay({ data: noHistoryData, access: A, scope: 'nationwide' })
  scenarios.push({
    key: 'no-comparable-history',
    title: 'Not enough comparable history',
    description: 'Momentum needs steady comparable collection in both windows. With too little history no momentum number is shown (not 0%, not "steady").',
    kind: 'momentum', dataMode: DATA_MODE.SYNTHETIC, viewer: { access: A, simulated: true },
    rateCents: RATE.default, requestState: REQUEST.READY, response: nationalPay.body, momentum: noHistorySnapshot.momentum
  })

  return {
    dataMode: DATA_MODE.SYNTHETIC,
    watermark: SYNTHETIC_WATERMARK,
    note: 'Synthetic test values on a fake role and fake places. Not market data.',
    scenarios
  }
}
