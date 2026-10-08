// Pay response market + trend blocks (Client Pay Market Report, 2026-10-08).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildPayResponse, TREND_MAX_MONTHS } from '../../api/_lib/signal/service.js'
import { createPayHandler } from '../../api/_lib/signal/handlers.js'
import { createProductionAdapter } from '../../api/_lib/signal/productionAdapter.js'
import { SYNTHETIC_PLACES } from '../../dev/signal/syntheticScenarios.js'

const ok = (firms = 12, share = 0.2) => ({ status: 'verified', distinctFirms: firms, maxFirmShare: share })
const thin = { status: 'verified', distinctFirms: 2, maxFirmShare: 0.3 }

function cell(level, figures, checks = ok(), extra = {}) {
  return {
    roleKey: 'example-role', level, state: level === 'nationwide' ? null : 'EX',
    city: level === 'city' ? 'EX:example-city' : null,
    p25Cents: figures[0], typicalCents: figures[1], p75Cents: figures[2],
    payBasis: 'hourly', currency: 'USD', checks, ...extra
  }
}

const NATIONAL = cell('nationwide', [1994, 2247, 2561], ok(64, 0.08))
const STATE = cell('state', [2063, 2318, 2609])
const CITY = cell('city', [2137, 2419, 2683])

// City rows: the selected city plus others the picker does not know (never
// named or counted). One more row fails privacy.
const CITY_ROWS = [
  { cityKey: 'ZZ:big-one', postings: 900, checks: ok(80) },
  { cityKey: 'ZZ:big-two', postings: 500, checks: ok(70) },
  { cityKey: 'EX:example-city', postings: 240, checks: ok(31, 0.12) },
  { cityKey: 'ZZ:small', postings: 40, checks: ok(9) },
  { cityKey: 'ZZ:secret-thin', postings: 9999, checks: thin }
]

function data(overrides = {}) {
  return {
    snapshot: { exactDate: '2026-10-06' },
    cityVolume: { windowDays: 45, jobScope: 'all jobs', rows: CITY_ROWS },
    momentum: {
      windowDays: 45, previousWindowDays: 45, coverage: 'publishable',
      historyNote: 'Early signals. Comparable history is still short.',
      rows: [{ code: 'EX', momentumPct: -37.4, checks: ok() }]
    },
    pay: [NATIONAL, STATE, CITY],
    monthly: [
      { month: '2026-09', pay: [cell('nationwide', [1975, 2230, 2550]), cell('state', [2000, 2300, 2600], thin)] },
      { month: '2026-08', pay: [cell('nationwide', [1950, 2210, 2530]), cell('state', [2020, 2280, 2580])] }
    ],
    ...overrides
  }
}

function pay({ d = data(), access = 'public', scope = 'city', mode = 'synthetic' } = {}) {
  return buildPayResponse({
    data: d, dataMode: mode, viewer: { access },
    request: { roleKey: 'example-role', state: scope === 'nationwide' ? null : 'EX', city: scope === 'city' ? 'EX:example-city' : null },
    places: SYNTHETIC_PLACES
  })
}

describe('market block', () => {
  test('city activity and state momentum for the requested place', () => {
    const { market } = pay()
    assert.deepEqual(market, {
      city: {
        key: 'EX:example-city', label: 'Example City, EX', newPostings: 240, staffingFirms: 31,
        windowDays: 45, jobScope: 'all jobs'
      },
      state: { code: 'EX', label: 'Example State (EX)', momentumPct: -37, windowDays: 45, previousWindowDays: 45, isEarlySignal: true }
    })
  })

  test('carries no city rank (owner decision)', () => {
    for (const scope of ['city', 'state']) {
      const { market } = pay({ scope })
      for (const part of [market.city, market.state].filter(Boolean)) {
        for (const key of Object.keys(part)) assert.equal(/rank/i.test(key), false, `${scope}: ${key}`)
      }
      assert.equal(/rank/i.test(JSON.stringify(market)), false)
    }
  })

  test('is the same for signed-out and signed-in viewers, and names no other city', () => {
    const pub = pay({ access: 'public' })
    assert.deepEqual(pub.market, pay({ access: 'authorized' }).market)
    const json = JSON.stringify(pub.market)
    for (const other of ['big-one', 'big-two', 'small', 'secret-thin', '9999', '0.12', 'maxFirmShare', 'distinctFirms', 'checks']) {
      assert.equal(json.includes(other), false, other)
    }
  })

  test('a state request shows only the state; nationwide has no market', () => {
    assert.deepEqual(pay({ scope: 'state' }).market.city, null)
    assert.equal(pay({ scope: 'state' }).market.state.code, 'EX')
    assert.equal(pay({ scope: 'nationwide' }).market, null)
  })

  test('rows that fail the publication rule are never used', () => {
    const d = data({
      cityVolume: { windowDays: 45, jobScope: 'all jobs', rows: [{ cityKey: 'EX:example-city', postings: 240, checks: thin }] },
      momentum: { windowDays: 45, previousWindowDays: 45, coverage: 'publishable', rows: [{ code: 'EX', momentumPct: 12, checks: ok(9, 0.6) }] }
    })
    assert.equal(pay({ d }).market, null)
  })

  test('no momentum without comparable history or window lengths', () => {
    const noHistory = data({ momentum: { ...data().momentum, coverage: 'insufficient_comparable_history' } })
    assert.equal(pay({ d: noHistory }).market.state, null)
    const noWindow = data({ momentum: { ...data().momentum, windowDays: null } })
    assert.equal(pay({ d: noWindow }).market.state, null)
    const noCityWindow = data({ cityVolume: { ...data().cityVolume, windowDays: undefined } })
    assert.equal(pay({ d: noCityWindow }).market.city, null)
  })

  test('development data without supplied counts shows an unknown firm count, not 0', () => {
    const d = data({ cityVolume: { windowDays: 45, rows: [{ cityKey: 'EX:example-city', postings: 240, checks: { status: 'not_verified' } }] } })
    const r = pay({ d, mode: 'development_example' })
    assert.equal(r.market.city.staffingFirms, null)
    assert.equal(r.market.city.newPostings, 240)
    assert.equal('rank' in r.market.city, false)
  })
})

describe('trend block', () => {
  test('state and nationwide series: months ascending, withheld months null, then now', () => {
    const { trend } = pay()
    assert.deepEqual(trend, {
      roleKey: 'example-role',
      snapshotDate: '2026-10-06',
      series: [
        {
          scope: 'state', code: 'EX', label: 'Example State (EX)',
          points: [
            { period: '2026-08', label: 'Aug 2026', typicalCents: 2280 },
            { period: '2026-09', label: 'Sep 2026', typicalCents: null },
            { period: 'now', label: 'Now', typicalCents: 2318 }
          ]
        },
        {
          scope: 'nationwide', label: 'Nationwide',
          points: [
            { period: '2026-08', label: 'Aug 2026', typicalCents: 2210 },
            { period: '2026-09', label: 'Sep 2026', typicalCents: 2230 },
            { period: 'now', label: 'Now', typicalCents: 2247 }
          ]
        }
      ]
    })
  })

  test('no state series for a nationwide request', () => {
    assert.deepEqual(pay({ scope: 'nationwide' }).trend.series.map((s) => s.scope), ['nationwide'])
  })

  test('null without monthly snapshots; a series with no figure at all is dropped', () => {
    assert.equal(pay({ d: data({ monthly: undefined }) }).trend, null)
    assert.equal(pay({ d: data({ monthly: [{ month: 'nope', pay: [] }, null, { month: '2026-13', pay: [] }] }) }).trend, null)
    const noState = data({ pay: [NATIONAL, CITY], monthly: [{ month: '2026-08', pay: [cell('nationwide', [1950, 2210, 2530])] }] })
    assert.deepEqual(pay({ d: noState }).trend.series.map((s) => s.scope), ['nationwide'])
    assert.equal(pay({ d: data({ pay: [], monthly: [{ month: '2026-08', pay: [] }] }) }).trend, null)
  })

  test('only figures that pass the publication rule and are hourly appear', () => {
    const d = data({
      pay: [cell('nationwide', [1994, 2247, 2561], thin), STATE],
      monthly: [{ month: '2026-08', pay: [cell('nationwide', [190000, 210000, 230000], ok(), { payBasis: 'weekly_package' }), cell('state', [2300, 2200, 2400])] }]
    })
    const { trend } = pay({ d })
    assert.deepEqual(trend.series.map((s) => [s.scope, s.points.map((p) => p.typicalCents)]), [['state', [null, 2318]]])
  })

  test('keeps at most the most recent months', () => {
    const months = Array.from({ length: TREND_MAX_MONTHS + 3 }, (_, i) => {
      const y = 2025 + Math.floor(i / 12)
      const m = String((i % 12) + 1).padStart(2, '0')
      return { month: `${y}-${m}`, pay: [cell('nationwide', [1900, 2000 + i, 2500])] }
    })
    const series = pay({ d: data({ monthly: months }), scope: 'nationwide' }).trend.series[0]
    assert.equal(series.points.length, TREND_MAX_MONTHS + 1)
    assert.equal(series.points[0].typicalCents, 2003)
  })

  test('carries only period, label and typical (no low/high, counts or checks)', () => {
    for (const s of pay().trend.series) {
      for (const p of s.points) assert.deepEqual(Object.keys(p).sort(), ['label', 'period', 'typicalCents'])
    }
  })
})

describe('real committed snapshot + monthly files', () => {
  const adapter = createProductionAdapter({ enabled: () => true, maxAgeDays: 3650 })

  test('Houston forklift: public pay with market and trend, rate never echoed', async () => {
    const loaded = await adapter.load()
    if (!loaded.available) return
    const handler = createPayHandler({ adapter, resolveAccess: () => ({ access: 'public' }) })
    const res = { statusCode: 200, headers: {}, setHeader(n, v) { this.headers[n.toLowerCase()] = v }, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this } }
    await handler({ method: 'GET', query: { role: 'forklift-operator', state: 'TX', city: 'TX:houston', rate: '17.13' }, headers: {} }, res)
    assert.equal(res.statusCode, 200)
    const body = res.body
    assert.equal(body.viewer.access, 'public')
    if (body.result.coverage === 'publishable') {
      assert.ok(Number.isSafeInteger(body.result.typicalCents))
      assert.ok(body.result.firmCount >= 3)
    }
    if (body.market?.city) {
      assert.equal('rank' in body.market.city || 'rankedCities' in body.market.city, false)
      assert.ok(body.market.city.staffingFirms >= 3)
    }
    if (body.trend) {
      assert.equal(body.trend.series.at(-1).scope, 'nationwide')
      for (const s of body.trend.series) assert.equal(s.points.at(-1).period, 'now')
    }
    assert.equal(JSON.stringify(body).includes('17.13'), false)
    assert.equal(/maxFirmShare|distinctFirms|"n":/.test(JSON.stringify(body)), false)
  })
})
