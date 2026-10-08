import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MINUS, formatSignedPerHour, gapHeadline, gapSentence, clientTileNote, competitivenessExplanation,
  formatCount, firmsPhrase, formatIsoDay, formatMomentum, rangeTexts, marketActivityItems, trendRows, nextTabIndex
} from '../../src/preview/components/insights/format.js'
import { buildClientReportModel, COMPETITIVENESS_LEVELS } from '../../shared/signal/clientReport.js'

const below = { gapCents: -300, pct: 15, direction: 'below' }
const above = { gapCents: 150, pct: 8, direction: 'above' }
const at = { gapCents: 0, pct: 0, direction: 'at' }
const tiny = { gapCents: -5, pct: 0, direction: 'below' }

describe('market gap wording', () => {
  test('signed per-hour amounts use a true minus sign', () => {
    assert.equal(formatSignedPerHour(-300), `${MINUS}$3.00/hr`)
    assert.equal(formatSignedPerHour(150), '+$1.50/hr')
    assert.equal(formatSignedPerHour(0), '$0.00/hr')
    assert.equal(formatSignedPerHour(null), null)
  })

  test('headline, sentence and tile note follow the direction', () => {
    assert.equal(gapHeadline(below), '15% below market median')
    assert.equal(gapHeadline(above), '8% above market median')
    assert.equal(gapHeadline(at), 'At the market median')
    assert.equal(gapHeadline(tiny), 'Less than 1% below market median')
    assert.equal(gapSentence(below), 'Your client’s pay rate is about 15% below the current market median.')
    assert.equal(gapSentence(at), 'Your client’s pay rate is at the current market median.')
    assert.equal(gapSentence(tiny), 'Your client’s pay rate is less than 1% below the current market median.')
    assert.equal(clientTileNote(below), '15% below median')
    assert.equal(clientTileNote(at), 'At the median')
    assert.equal(clientTileNote(tiny), '<1% below median')
    assert.equal(gapHeadline(null), null)
  })

  test('every competitiveness level has a one-line explanation', () => {
    for (const level of COMPETITIVENESS_LEVELS) assert.match(competitivenessExplanation(level.key), /^The client rate is /)
    assert.equal(competitivenessExplanation('nope'), null)
  })
})

describe('counts, dates and momentum', () => {
  test('counts and firm phrases', () => {
    assert.equal(formatCount(1234567), '1,234,567')
    assert.equal(formatCount(-1), null)
    assert.equal(firmsPhrase(204), 'from 204 staffing firms')
    assert.equal(firmsPhrase(1), 'from 1 staffing firm')
    assert.equal(firmsPhrase(null), null)
    assert.equal(firmsPhrase(0), null)
  })

  test('ISO days render in UTC', () => {
    assert.equal(formatIsoDay('2026-10-06'), 'October 6, 2026')
    assert.equal(formatIsoDay('2026-10-06T23:30:00Z'), 'October 6, 2026')
    assert.equal(formatIsoDay('Oct 6'), null)
    assert.equal(formatIsoDay(null), null)
  })

  test('momentum is signed and rounded', () => {
    assert.equal(formatMomentum(64), '+64%')
    assert.equal(formatMomentum(-12.4), `${MINUS}12%`)
    assert.equal(formatMomentum(0.2), '0%')
    assert.equal(formatMomentum(Number.NaN), null)
  })
})

describe('recommended ranges', () => {
  test('competitive range collapses to one value when median equals high', () => {
    assert.deepEqual(rangeTexts({ competitive: { fromCents: 2000, toCents: 2420 }, aggressive: { fromCents: 2420 } }),
      { competitive: '$20.00–$24.20', aggressive: '$24.20+' })
    assert.deepEqual(rangeTexts({ competitive: { fromCents: 2000, toCents: 2000 }, aggressive: { fromCents: 2000 } }),
      { competitive: '$20.00', aggressive: '$20.00+' })
    assert.equal(rangeTexts(null), null)
  })
})

describe('market activity', () => {
  const market = {
    city: { key: 'TX:houston', label: 'Houston, TX', newPostings: 4680, staffingFirms: 204, windowDays: 45, jobScope: 'all jobs' },
    state: { code: 'TX', label: 'Texas', momentumPct: 64, windowDays: 45, previousWindowDays: 45, isEarlySignal: true }
  }

  test('city and state aggregates become tiles', () => {
    const items = marketActivityItems(market)
    assert.deepEqual(items.map((i) => i.key), ['postings', 'firms', 'momentum'])
    assert.equal(items[0].value, '4,680')
    assert.equal(items[0].note, 'Houston, TX · last 45 days')
    assert.equal(items[1].value, '204')
    assert.equal(items[2].label, 'Texas posting momentum')
    assert.equal(items[2].value, '+64%')
    assert.equal(items[2].tone, 'heat')
    assert.equal(items[2].early, true)
  })

  test('a city rank is never shown, even if a response still carries one', () => {
    const items = marketActivityItems({ ...market, city: { ...market.city, rank: 4, rankedCities: 300 } })
    assert.deepEqual(items.map((i) => i.key), ['postings', 'firms', 'momentum'])
    assert.doesNotMatch(JSON.stringify(items), /rank|#4|300/i)
  })

  test('missing or partial market data degrades without inventing numbers', () => {
    assert.deepEqual(marketActivityItems(null), [])
    const items = marketActivityItems({ city: { ...market.city, staffingFirms: null }, state: { ...market.state, momentumPct: -8 } })
    assert.deepEqual(items.map((i) => i.key), ['postings', 'momentum'])
    assert.equal(items[1].tone, 'cool')
    assert.equal(items[1].value, `${MINUS}8%`)
  })

  test('only aggregate fields are read (no names, no difficulty, no p90)', () => {
    const items = marketActivityItems({ ...market, city: { ...market.city, employerNames: ['Acme'], p90Cents: 9999 } })
    const text = JSON.stringify(items)
    assert.doesNotMatch(text, /Acme|9999|99\.99/)
  })
})

describe('pay trend', () => {
  const trend = {
    roleKey: 'forklift-operator',
    snapshotDate: '2026-10-06',
    series: [
      { scope: 'state', code: 'TX', label: 'Texas', points: [
        { period: '2026-08', label: 'Aug 2026', typicalCents: 1800 },
        { period: '2026-09', label: 'Sep 2026', typicalCents: null },
        { period: 'now', label: 'Now', typicalCents: 2000 }
      ] },
      { scope: 'nationwide', label: 'Nationwide', points: [{ period: 'now', label: 'Now', typicalCents: 1900 }] }
    ]
  }

  test('bars are zero-based shares of the largest figure across series', () => {
    const rows = trendRows(trend)
    assert.equal(rows.length, 2)
    assert.deepEqual(rows[0].points.map((p) => p.widthPct), [90, 0, 100])
    assert.equal(rows[0].points[1].valueText, 'Not enough data')
    assert.equal(rows[0].points[2].valueText, '$20.00')
    assert.equal(rows[1].points[0].widthPct, 95)
    assert.equal(rows[1].label, 'Nationwide')
  })

  test('no usable series -> null', () => {
    assert.equal(trendRows(null), null)
    assert.equal(trendRows({ series: [] }), null)
    assert.equal(trendRows({ series: [{ scope: 'nationwide', label: 'Nationwide', points: [{ period: 'now', label: 'Now', typicalCents: null }] }] }), null)
  })
})

describe('tab keyboard model', () => {
  test('arrows wrap, Home/End jump, other keys are ignored', () => {
    assert.equal(nextTabIndex(0, 'ArrowRight', 2), 1)
    assert.equal(nextTabIndex(1, 'ArrowRight', 2), 0)
    assert.equal(nextTabIndex(0, 'ArrowLeft', 2), 1)
    assert.equal(nextTabIndex(1, 'Home', 2), 0)
    assert.equal(nextTabIndex(0, 'End', 2), 1)
    assert.equal(nextTabIndex(0, 'Enter', 2), null)
    assert.equal(nextTabIndex(0, 'ArrowRight', 0), null)
  })
})

describe('homepage wording agrees with the report model', () => {
  test('a below-median Houston model yields the documented gap card', () => {
    const payResponse = {
      request: { roleKey: 'forklift-operator', state: 'TX', city: 'TX:houston' },
      result: { coverage: 'publishable', access: 'public', geography: { level: 'city', label: 'Houston, TX' }, p25Cents: 1800, typicalCents: 2000, p75Cents: 2300, firmCount: 12 },
      fallback: null,
      national: null
    }
    const model = buildClientReportModel({ payResponse, rateCents: 1700 })
    assert.ok(model)
    assert.equal(formatSignedPerHour(model.gap.gapCents), `${MINUS}$3.00/hr`)
    assert.equal(gapHeadline(model.gap), '15% below market median')
    assert.equal(gapSentence(model.gap), 'Your client’s pay rate is about 15% below the current market median.')
    assert.equal(firmsPhrase(model.figures.firmCount), 'from 12 staffing firms')
  })
})
