import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildSnapshotResponse, buildPayResponse } from '../../api/_lib/signal/service.js'
import { createFixtureAdapter } from '../../dev/signal/fixtureAdapter.js'
import { SYNTHETIC_PLACES, buildScenarios } from '../../dev/signal/syntheticScenarios.js'

const SNAPSHOT_KEYS = [
  'cities', 'contractVersion', 'coverageStrip', 'dataMode', 'extraCoverage', 'issueCards',
  'momentum', 'mostPostedFamilies', 'nationalPay', 'sectors', 'snapshot', 'viewer'
]
const NATIONAL_KEYS = [
  'access', 'coverage', 'currency', 'dataStatus', 'geography', 'p25Cents', 'p75Cents', 'payBasis',
  'roleKey', 'roleLabel', 'sectorKey', 'typicalCents', 'typicalLabel'
]
const FIGURE_KEYS = ['p25Cents', 'typicalCents', 'p75Cents']
const FORBIDDEN_KEY = /firm|share|check|contribut|demand|publication|observation|posting_?id/i

async function fixtureData() {
  const adapter = createFixtureAdapter()
  const { data } = await adapter.load()
  return { data, dataMode: adapter.dataMode }
}

function walk(value, visit, path = '$') {
  if (Array.isArray(value)) value.forEach((item, i) => walk(item, visit, `${path}[${i}]`))
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      visit(key, child, `${path}.${key}`)
      walk(child, visit, `${path}.${key}`)
    }
  }
}

function numericPaths(value) {
  const out = []
  walk(value, (key, child, path) => { if (typeof child === 'number') out.push(path) })
  return out
}

function forbiddenKeys(value) {
  const out = []
  walk(value, (key, child, path) => { if (FORBIDDEN_KEY.test(key)) out.push(path) })
  return out
}

// Synthetic data for direct service tests (fake role and places only).
const PASS = { status: 'verified', distinctFirms: 12, maxFirmShare: 0.2 }
function cell(level, figures, checks, extra = {}) {
  return {
    roleKey: 'example-role', level, state: level === 'nationwide' ? null : 'EX',
    city: level === 'city' ? 'EX:example-city' : null,
    p25Cents: figures[0], typicalCents: figures[1], p75Cents: figures[2],
    payBasis: 'hourly', currency: 'USD', checks, ...extra
  }
}
const NATIONAL = cell('nationwide', [1994, 2247, 2561], { status: 'verified', distinctFirms: 64, maxFirmShare: 0.08 })
const STATE = cell('state', [2063, 2318, 2609], PASS)

function synthPay({ pay, access, scope = 'city' }) {
  return buildPayResponse({
    data: { pay },
    dataMode: 'synthetic',
    viewer: { access, simulated: true },
    request: { roleKey: 'example-role', state: scope === 'nationwide' ? null : 'EX', city: scope === 'city' ? 'EX:example-city' : null },
    places: SYNTHETIC_PLACES
  })
}

describe('snapshot builder', () => {
  test('emits exactly the contract keys and no internal fields', async () => {
    const { data, dataMode } = await fixtureData()
    for (const access of ['public', 'authorized']) {
      const snap = buildSnapshotResponse({ data, dataMode, viewer: { access, simulated: true } })
      assert.deepEqual(Object.keys(snap).sort(), SNAPSHOT_KEYS)
      assert.equal(snap.contractVersion, 'signal-preview-1')
      assert.equal(snap.dataMode, 'development_example')
      assert.deepEqual(forbiddenKeys(snap), [])
    }
  })

  test('snapshot metadata is honest about unknowns', async () => {
    const { data, dataMode } = await fixtureData()
    const { snapshot } = buildSnapshotResponse({ data, dataMode, viewer: { access: 'public' } })
    assert.deepEqual(snapshot, {
      label: 'Early October 2026', exactDate: null, freshness: 'unknown', lastSuccessfulRefresh: null,
      refreshCadence: 'weekly', methodologyVersion: null,
      note: 'Supplied example figures. Publication checks have not been verified.'
    })
  })

  test('national pay: five supplied roles in integer cents, exact fields', async () => {
    const { data, dataMode } = await fixtureData()
    const { nationalPay } = buildSnapshotResponse({ data, dataMode, viewer: { access: 'public' } })
    assert.deepEqual(nationalPay.map((e) => e.roleKey), ['registered-nurse', 'icu-registered-nurse', 'warehouse-associate', 'forklift-operator', 'software-engineer'])
    for (const entry of nationalPay) {
      assert.deepEqual(Object.keys(entry).sort(), NATIONAL_KEYS)
      for (const key of FIGURE_KEYS) assert.ok(Number.isSafeInteger(entry[key]))
      assert.equal(entry.dataStatus, 'development_example')
      assert.equal(entry.typicalLabel, 'Typical advertised rate')
    }
    const forklift = nationalPay.find((e) => e.roleKey === 'forklift-operator')
    assert.deepEqual([forklift.p25Cents, forklift.typicalCents, forklift.p75Cents], [1713, 1850, 2000])
    assert.equal(nationalPay.find((e) => e.roleKey === 'icu-registered-nurse').typicalCents, 5738)
  })

  test('issue cards use the momentum wording and same-snapshot values', async () => {
    const { data, dataMode } = await fixtureData()
    const { issueCards } = buildSnapshotResponse({ data, dataMode, viewer: { access: 'public' } })
    assert.deepEqual(issueCards.map((c) => [c.key, c.metric, c.geography, c.access]), [
      ['momentum-california', '+135% normalized posting momentum', 'California', 'public'],
      ['pay-icu', 'Typical nationwide advertised pay: $57.38/hour', 'Nationwide', 'public'],
      ['volume-new-york', '3,308 new staffing-firm postings observed in the last 45 days — all jobs.', 'New York, NY', 'public']
    ])
    assert.match(issueCards[0].basis, /relative to all observed states/)
    assert.doesNotMatch(JSON.stringify(issueCards), /collection coverage/)
  })

  test('a pay card names the job its figure belongs to', async () => {
    const { data, dataMode } = await fixtureData()
    const generic = { ...data, issueCards: [{ key: 'pay-software-engineer', kind: 'pay', title: 'Most-advertised pay snapshot.', ref: { roleKey: 'software-engineer' }, basis: 'Staffing-firm postings only. Advertised pay, not actual pay.' }] }
    const [card] = buildSnapshotResponse({ data: generic, dataMode, viewer: { access: 'public' } }).issueCards
    assert.equal(card.title, 'Software Engineer pay snapshot.')
    assert.equal(card.metric, 'Typical nationwide advertised pay: $62.50/hour')
    assert.match(card.basis, /^The job with the most advertised-pay postings from staffing firms nationwide\./)
  })

  test('a city volume card names the city in its title', async () => {
    const { data, dataMode } = await fixtureData()
    const generic = { ...data, issueCards: [{ key: 'volume-top-city', kind: 'volume', title: 'Highest observed city volume.', ref: { cityKey: 'NY:new-york' }, basis: 'Observed postings, not verified open orders.' }] }
    const [card] = buildSnapshotResponse({ data: generic, dataMode, viewer: { access: 'public' } }).issueCards
    assert.equal(card.title, 'New York leads observed city volume.')
  })

  test('an editorial card cannot disclose a gated city to a signed-out viewer', async () => {
    const { data, dataMode } = await fixtureData()
    const leaky = { ...data, issueCards: [...data.issueCards, { key: 'volume-x', kind: 'volume', title: 'Gated city card.', ref: { cityKey: 'IL:chicago' }, basis: 'x' }] }
    const pub = buildSnapshotResponse({ data: leaky, dataMode, viewer: { access: 'public' } })
    assert.equal(pub.issueCards.some((c) => c.key === 'volume-x'), false)
    assert.equal(JSON.stringify(pub).includes('Chicago'), false)
    const auth = buildSnapshotResponse({ data: leaky, dataMode, viewer: { access: 'authorized' } })
    assert.equal(auth.issueCards.find((c) => c.key === 'volume-x').access, 'authorized')
  })

  test('momentum copy is normalized, not raw growth or pay change', async () => {
    const { data, dataMode } = await fixtureData()
    const { momentum } = buildSnapshotResponse({ data, dataMode, viewer: { access: 'public' } })
    assert.equal(momentum.isRawGrowth, false)
    assert.equal(momentum.isPayChange, false)
    assert.equal(momentum.isForecast, false)
    assert.match(momentum.basis, /^Normalized posting momentum: latest 45 days vs\. the previous 45, measured relative to the change across all observed states\./)
  })

  test('the fixture under PRODUCTION mode publishes nothing (unknown fails closed)', async () => {
    const { data } = await fixtureData()
    const snap = buildSnapshotResponse({ data, dataMode: 'production', viewer: { access: 'authorized' } })
    assert.deepEqual(snap.nationalPay, [])
    assert.deepEqual(snap.cities.rows, [])
    assert.deepEqual(snap.momentum.heating.rows, [])
    assert.deepEqual(snap.momentum.cooling.rows, [])
    assert.deepEqual(snap.issueCards, [])
    const pay = buildPayResponse({ data, dataMode: 'production', viewer: { access: 'authorized' }, request: { roleKey: 'forklift-operator' } })
    assert.equal(pay.result.coverage, 'not_yet_available')
    assert.equal(pay.result.message, 'No verified nationwide benchmark is available yet.')
    assert.deepEqual(numericPaths(pay.result), [])
  })

  test('extra adapter fields never reach the response', async () => {
    const { data, dataMode } = await fixtureData()
    const tainted = structuredClone(data)
    tainted.snapshot.firmIds = ['FIRM-SECRET-1']
    tainted.cityVolume.rows[0].firmName = 'Secret Staffing Co'
    tainted.momentum.rows[0].contributors = ['FIRM-SECRET-2']
    tainted.pay[3].firmName = 'Secret Staffing Co'
    tainted.pay[3].postings = [{ id: 'POSTING-SECRET-3' }]
    tainted.issueCards[0].firmName = 'Secret Staffing Co'
    for (const access of ['public', 'authorized']) {
      const json = JSON.stringify([
        buildSnapshotResponse({ data: tainted, dataMode, viewer: { access } }),
        buildPayResponse({ data: tainted, dataMode, viewer: { access }, request: { roleKey: 'forklift-operator' } })
      ])
      assert.doesNotMatch(json, /SECRET|Secret/)
    }
  })

  test('stale snapshot keeps its date and drops fresh-change headlines', async () => {
    const { data, dataMode } = await fixtureData()
    const stale = { ...data, snapshot: { ...data.snapshot, freshness: 'stale', exactDate: '2026-08-02' } }
    const snap = buildSnapshotResponse({ data: stale, dataMode, viewer: { access: 'public' } })
    assert.equal(snap.snapshot.freshness, 'stale')
    assert.equal(snap.snapshot.exactDate, '2026-08-02')
    assert.equal(snap.issueCards.some((c) => c.kind === 'momentum'), false)
  })

  test('no comparable history shows no momentum numbers', async () => {
    const { data, dataMode } = await fixtureData()
    const thin = { ...data, momentum: { ...data.momentum, coverage: 'insufficient_comparable_history' } }
    const { momentum, issueCards } = buildSnapshotResponse({ data: thin, dataMode, viewer: { access: 'authorized' } })
    assert.equal(momentum.coverage, 'insufficient_comparable_history')
    assert.deepEqual(momentum.heating.rows, [])
    assert.deepEqual(momentum.cooling.rows, [])
    assert.equal(issueCards.some((c) => c.kind === 'momentum'), false)
  })
})

describe('pay builder with the development fixture', () => {
  test('nationwide forklift is public with figures', async () => {
    const { data, dataMode } = await fixtureData()
    const r = buildPayResponse({ data, dataMode, viewer: { access: 'public', simulated: true }, request: { roleKey: 'forklift-operator' } })
    assert.deepEqual(r.request, { roleKey: 'forklift-operator', roleLabel: 'Forklift Operator', state: null, city: null })
    assert.equal(r.result.coverage, 'publishable')
    assert.equal(r.result.access, 'public')
    assert.deepEqual(r.result.geography, { level: 'nationwide', label: 'Nationwide', requested: true })
    assert.deepEqual([r.result.p25Cents, r.result.typicalCents, r.result.p75Cents], [1713, 1850, 2000])
    assert.equal(r.fallback, null)
  })

  test('Houston is never given a number, signed out or signed in', async () => {
    const { data, dataMode } = await fixtureData()
    for (const access of ['public', 'authorized']) {
      const r = buildPayResponse({ data, dataMode, viewer: { access }, request: { roleKey: 'forklift-operator', state: 'TX', city: 'TX:houston' } })
      assert.equal(r.result.coverage, 'not_yet_available')
      assert.notEqual(r.result.access, 'requires_free_account')
      assert.equal(r.result.message, 'No verified Houston benchmark is available in this preview data yet.')
      assert.deepEqual(r.result.geography, { level: 'city', label: 'Houston, TX', requested: true })
      assert.deepEqual(numericPaths(r.result), [])
      assert.equal(r.fallback, null)
      assert.equal(r.national.typicalCents, 1850)
    }
  })

  test('a state request has no local pay in the fixture', async () => {
    const { data, dataMode } = await fixtureData()
    const r = buildPayResponse({ data, dataMode, viewer: { access: 'authorized' }, request: { roleKey: 'registered-nurse', state: 'TX' } })
    assert.equal(r.result.coverage, 'not_yet_available')
    assert.equal(r.result.message, 'No verified Texas benchmark is available in this preview data yet.')
  })

  test('a role without a supplied benchmark has no national figures', async () => {
    const { data, dataMode } = await fixtureData()
    const r = buildPayResponse({ data, dataMode, viewer: { access: 'authorized' }, request: { roleKey: 'or-nurse' } })
    assert.equal(r.result.coverage, 'not_yet_available')
    assert.equal(r.national.coverage, 'not_yet_available')
    assert.deepEqual(numericPaths(r), [])
  })
})

describe('pay builder with synthetic cells (real gate)', () => {
  const CITY_OK = cell('city', [2137, 2419, 2683], PASS)

  test('signed-out publishable local benchmark carries no numeric fields', () => {
    const r = synthPay({ pay: [NATIONAL, STATE, CITY_OK], access: 'public' })
    assert.equal(r.result.coverage, 'publishable')
    assert.equal(r.result.access, 'requires_free_account')
    assert.deepEqual(numericPaths(r.result), [])
    for (const key of FIGURE_KEYS) assert.equal(key in r.result, false)
    assert.equal(r.result.message, 'This Example City benchmark is available with free access.')
    assert.equal(JSON.stringify(r).includes('2419'), false)
  })

  test('authorized publishable local benchmark has figures', () => {
    const r = synthPay({ pay: [NATIONAL, STATE, CITY_OK], access: 'authorized' })
    assert.equal(r.result.access, 'authorized')
    assert.deepEqual([r.result.p25Cents, r.result.typicalCents, r.result.p75Cents], [2137, 2419, 2683])
    assert.equal(r.result.dataStatus, 'synthetic')
  })

  test('suppressed results carry no counts and no figures, for anyone', () => {
    for (const checks of [
      { status: 'verified', distinctFirms: 2, maxFirmShare: 0.3 },
      { status: 'verified', distinctFirms: 5, maxFirmShare: 0.6 },
      { status: 'verified', distinctFirms: 2, maxFirmShare: 0.4 }
    ]) {
      for (const access of ['public', 'authorized']) {
        const r = synthPay({ pay: [NATIONAL, cell('city', [2137, 2419, 2683], checks, { demand: { postings: 2400, checks: { status: 'verified', distinctFirms: 41, maxFirmShare: 0.09 } } })], access })
        assert.equal(r.result.coverage, 'insufficient_sample')
        assert.equal(r.result.message, "We don't have enough comparable Example City pay data to publish this benchmark.")
        assert.deepEqual(numericPaths(r.result), [])
        assert.deepEqual(forbiddenKeys(r), [])
        assert.equal(r.fallback, null)
      }
    }
  })

  test('exactly 50% share is publishable', () => {
    const r = synthPay({ pay: [NATIONAL, cell('city', [2137, 2419, 2683], { status: 'verified', distinctFirms: 5, maxFirmShare: 0.5 })], access: 'authorized' })
    assert.equal(r.result.coverage, 'publishable')
  })

  test('suppressed city offers the state fallback with the state gate applied', () => {
    const thin = cell('city', [2137, 2419, 2683], { status: 'verified', distinctFirms: 2, maxFirmShare: 0.4 })
    const pub = synthPay({ pay: [NATIONAL, STATE, thin], access: 'public' })
    assert.equal(pub.result.coverage, 'insufficient_sample')
    assert.equal(pub.fallback.coverage, 'publishable')
    assert.equal(pub.fallback.access, 'requires_free_account')
    assert.deepEqual(pub.fallback.geography, { level: 'state', label: 'Example State (EX)', requested: false })
    assert.deepEqual(numericPaths(pub.fallback), [])
    const auth = synthPay({ pay: [NATIONAL, STATE, thin], access: 'authorized' })
    assert.equal(auth.fallback.access, 'authorized')
    assert.equal(auth.fallback.typicalCents, 2318)
    assert.equal(auth.fallback.message, 'An Example State benchmark is available.')
  })

  test('weekly travel packages are never compared with hourly pay', () => {
    const r = synthPay({ pay: [NATIONAL, cell('city', [198000, 214000, 231000], PASS, { payBasis: 'weekly_package' })], access: 'authorized' })
    assert.equal(r.result.coverage, 'unsupported')
    assert.deepEqual(numericPaths(r.result), [])
  })

  test('malformed figures are not published', () => {
    for (const figures of [[2683, 2419, 2137], [21.37, 24.19, 26.83], [Number.NaN, 2419, 2683], [0, 2419, 2683]]) {
      const r = synthPay({ pay: [NATIONAL, cell('city', figures, PASS)], access: 'authorized' })
      assert.notEqual(r.result.coverage, 'publishable', JSON.stringify(figures))
      assert.deepEqual(numericPaths(r.result), [])
    }
  })

  test('unknown roles and mismatched geography throw (callers validate first)', () => {
    assert.throws(() => buildPayResponse({ data: {}, dataMode: 'synthetic', viewer: {}, request: { roleKey: 'nope' } }))
    assert.throws(() => buildPayResponse({ data: {}, dataMode: 'synthetic', viewer: {}, request: { roleKey: 'forklift-operator', state: 'TX', city: 'CA:los-angeles' } }))
  })
})

describe('synthetic States Lab scenarios', () => {
  test('cover every required state with fake places and a display rate', async () => {
    const out = await buildScenarios()
    assert.equal(out.dataMode, 'synthetic')
    assert.equal(out.watermark, 'SYNTHETIC TEST DATA')
    const keys = out.scenarios.map((s) => s.key)
    for (const key of [
      'city-locked-signed-out', 'city-unlocked-authorized', 'city-insufficient-state-fallback-signed-out',
      'city-insufficient-state-fallback-authorized', 'four-firms-suppressed', 'five-firms-60pct-suppressed',
      'five-firms-50pct-publishable', 'large-demand-small-pay', 'stale-snapshot', 'backend-failure',
      'no-comparable-history', 'weekly-travel-package', 'verdict-above', 'verdict-within', 'verdict-below'
    ]) assert.ok(keys.includes(key), key)
    for (const s of out.scenarios) {
      assert.ok(Number.isSafeInteger(s.rateCents), s.key)
      assert.equal(s.dataMode, 'synthetic')
      if (s.response) {
        assert.equal(s.response.dataMode, 'synthetic')
        assert.equal(s.response.request.roleLabel, 'Example Role')
      }
    }
    const json = JSON.stringify(out)
    for (const real of ['Forklift', 'Nurse', 'Houston', 'Texas', 'New York', 'California', 'development_example']) {
      assert.equal(json.includes(real), false, real)
    }
    assert.deepEqual(forbiddenKeys(out.scenarios.map((s) => [s.response, s.snapshot, s.momentum])), [])
  })

  test('scenario outcomes come from the real gate', async () => {
    const { scenarios } = await buildScenarios()
    const by = Object.fromEntries(scenarios.map((s) => [s.key, s]))
    assert.equal(by['city-locked-signed-out'].response.result.access, 'requires_free_account')
    assert.deepEqual(numericPaths(by['city-locked-signed-out'].response.result), [])
    assert.equal(by['four-firms-suppressed'].response.result.coverage, 'insufficient_sample')
    assert.equal(by['five-firms-60pct-suppressed'].response.result.coverage, 'insufficient_sample')
    assert.equal(by['five-firms-50pct-publishable'].response.result.coverage, 'publishable')
    assert.equal(by['large-demand-small-pay'].response.result.coverage, 'insufficient_sample')
    assert.equal(by['weekly-travel-package'].response.result.coverage, 'unsupported')
    assert.equal(by['stale-snapshot'].snapshot.freshness, 'stale')
    assert.equal(by['backend-failure'].error.status, 503)
    assert.equal(by['backend-failure'].requestState, 'error')
    assert.equal(by['no-comparable-history'].momentum.coverage, 'insufficient_comparable_history')
    const band = by['verdict-within'].response.result
    assert.ok(by['verdict-below'].rateCents < band.p25Cents)
    assert.ok(by['verdict-within'].rateCents >= band.p25Cents && by['verdict-within'].rateCents <= band.p75Cents)
    assert.ok(by['verdict-above'].rateCents > band.p75Cents)
  })
})
