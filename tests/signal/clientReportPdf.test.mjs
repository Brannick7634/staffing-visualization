import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { buildClientReportModel } from '../../shared/signal/clientReport.js'
import {
  ClientReportPdf,
  PAGE_COUNT,
  pdfText,
  renderClientReportPdfBuffer,
  reportView,
  snapshotWeekLabel
} from '../../shared/signal/clientReportPdf.js'

const NOW = new Date('2026-10-08T15:00:00Z')
const LIMITED_NOTE = 'Based on a small number of staffing firms (4). Treat these figures as a directional guide.'

function figures(values, firmCount) {
  return { coverage: 'publishable', access: 'public', ...values, firmCount }
}

const MARKET = {
  city: { key: 'TX:houston', label: 'Houston, TX', newPostings: 1468, staffingFirms: 204, windowDays: 45, jobScope: 'all jobs' },
  state: { code: 'TX', label: 'Texas', momentumPct: 64, windowDays: 45, previousWindowDays: 45, isEarlySignal: true }
}

const TREND = {
  roleKey: 'forklift-operator',
  snapshotDate: '2026-10-06',
  series: [
    { scope: 'state', code: 'TX', label: 'Texas', points: [{ period: '2026-08', label: 'Aug 2026', typicalCents: 1800 }, { period: '2026-09', label: 'Sep 2026', typicalCents: null }, { period: 'now', label: 'Now', typicalCents: 1875 }] },
    { scope: 'nationwide', label: 'Nationwide', points: [{ period: '2026-08', label: 'Aug 2026', typicalCents: 1825 }, { period: '2026-09', label: 'Sep 2026', typicalCents: 1840 }, { period: 'now', label: 'Now', typicalCents: 1850 }] }
  ]
}

function payResponse(overrides = {}) {
  return {
    request: { roleKey: 'forklift-operator', state: 'TX', city: 'TX:houston' },
    result: { geography: { level: 'city', label: 'Houston, TX' }, ...figures({ p25Cents: 1750, typicalCents: 2000, p75Cents: 2420 }, 4) },
    fallback: null,
    national: { roleKey: 'forklift-operator', geography: { level: 'nationwide', label: 'Nationwide' }, ...figures({ p25Cents: 1700, typicalCents: 1850, p75Cents: 2000 }, 158) },
    market: MARKET,
    trend: TREND,
    ...overrides
  }
}

function sampleModel(options = {}) {
  return buildClientReportModel({ payResponse: payResponse(), rateCents: 1700, now: NOW, sample: true, ...options })
}

// The longest content a real report can carry: fallback note, limited-data
// note (a 4-firm fallback), both prepared lines at the 80-character cap, the
// longest role label and six trend points per series. Not a sample: the
// /sample-report page never passes prepared lines, so the EXAMPLE band and
// prepared lines never appear together (that pairing does not fit).
// Callers loop the rate over every competitiveness level, because the
// summary and gap wording differ in length by level.
const WORST_CASE_RATES = { severe: 1000, below: 98999, moderate: 99499, competitive: 99899, high: 99901 }

function worstCaseModel(rateCents = WORST_CASE_RATES.severe, options = {}) {
  const points = ['2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07'].map((period, i) => ({ period, label: `Month ${i + 1} 2027`, typicalCents: 99000 - i }))
  return buildClientReportModel({
    payResponse: payResponse({
      request: { roleKey: 'accounts-payable-receivable', state: 'NC', city: 'NC:winston-salem' },
      result: { geography: { level: 'city', label: 'Winston-Salem, NC' }, coverage: 'insufficient_sample', access: 'public' },
      fallback: { geography: { level: 'state', label: 'North Carolina' }, ...figures({ p25Cents: 99000, typicalCents: 99500, p75Cents: 99900 }, 4) },
      market: {
        city: { ...MARKET.city, label: 'Winston-Salem, NC', newPostings: 123456, staffingFirms: 12345 },
        state: { ...MARKET.state, label: 'North Carolina', momentumPct: -64 }
      },
      trend: { ...TREND, series: [{ scope: 'state', code: 'NC', label: 'North Carolina', points }, { scope: 'nationwide', label: 'Nationwide', points }] }
    }),
    rateCents,
    now: NOW,
    preparedFor: 'W'.repeat(80),
    preparedBy: 'M'.repeat(80),
    ...options
  })
}

// Page objects in pdfkit output are plain dictionaries: '/Type /Page' (not /Pages).
function pageCount(buffer) {
  return (buffer.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length
}

// All text drawn on the pages, from the Flate-compressed content streams.
// pdfkit writes Helvetica text as hex strings (<48656c6c6f>).
function drawnText(buffer) {
  let text = ''
  for (const match of buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let data
    try {
      data = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1')
    } catch {
      continue // not a Flate stream (fonts, images)
    }
    for (const m of data.matchAll(/<([0-9a-fA-F]+)>/g)) text += Buffer.from(m[1], 'hex').toString('latin1')
  }
  return text
}

describe('reportView', () => {
  test('builds page-one strings from the model', () => {
    const view = reportView(sampleModel())
    assert.deepEqual(view.tiles.map((tile) => [tile.label, tile.value]), [
      ['Market Low', '$17.50'], ['Market Median', '$20.00'], ['Market High', '$24.20'], ['Client Pay Rate', '$17.00']
    ])
    assert.equal(view.tiles[3].tone, 'caution')
    assert.equal(view.gap.amount, '−$3.00/hr')
    assert.equal(view.gap.short, '15% below market median')
    assert.equal(view.firmLine, 'from 4 staffing firms')
    assert.equal(view.limitedNote, LIMITED_NOTE)
    assert.equal(view.meta[2].value, 'Week of October 6, 2026')
    assert.deepEqual(view.ranges.map((range) => range.value), ['$20.00–$24.20/hr', '$24.20+/hr'])
    assert.ok(view.sampleBand)
    assert.equal(view.levels.filter((level) => level.active).length, 1)
    assert.equal(view.bar.zones.length, 3)
    assert.deepEqual(view.bar.ticks.map((tick) => tick.name), ['Low', 'Median', 'High'])
  })

  test('market activity and trend degrade gracefully', () => {
    const view = reportView(sampleModel())
    assert.deepEqual(view.market.cards.map((card) => card.key), ['postings', 'firms', 'momentum'])
    assert.deepEqual(view.market.cards.map((card) => card.value), ['1,468', '204', '+64%'])
    // A city block that still carries rank fields never shows them.
    const legacy = reportView(sampleModel({ payResponse: payResponse({ market: { ...MARKET, city: { ...MARKET.city, rank: 4, rankedCities: 300 } } }) }))
    assert.deepEqual(legacy.market.cards.map((card) => card.key), ['postings', 'firms', 'momentum'])
    assert.ok(!JSON.stringify(legacy.market).includes('ranked'))
    assert.equal(view.trend.series.length, 2)
    assert.equal(view.trend.series[0].points[1].value, 'Not enough data')

    const bare = reportView(buildClientReportModel({ payResponse: payResponse({ market: null, trend: null }), rateCents: 2100, now: NOW }))
    assert.equal(bare.market.cards.length, 0)
    assert.match(bare.market.empty, /not available/)
    assert.equal(bare.trend.series.length, 0)
    assert.match(bare.trend.empty, /August 2026/)
    assert.equal(bare.sampleBand, null)
    assert.equal(bare.gap.short, '5% above market median')
    assert.equal(bare.limitedNote, LIMITED_NOTE)
    const wide = reportView(buildClientReportModel({ payResponse: payResponse({ result: { geography: { level: 'city', label: 'Houston, TX' }, ...figures({ p25Cents: 1750, typicalCents: 2000, p75Cents: 2420 }, 5) } }), rateCents: 2100, now: NOW }))
    assert.equal(wide.limitedNote, null)
    assert.equal(wide.firmLine, 'from 5 staffing firms')
  })

  test('snapshot week label tolerates bad input', () => {
    assert.equal(snapshotWeekLabel('2026-10-06'), 'Week of October 6, 2026')
    assert.equal(snapshotWeekLabel(null), 'Latest weekly snapshot')
    assert.equal(snapshotWeekLabel('2026-13-01'), 'Latest weekly snapshot')
  })

  test('pdfText keeps WinAnsi text and replaces what Helvetica cannot draw', () => {
    assert.equal(pdfText('$20.00–$24.20 · client’s café'), '$20.00–$24.20 · client’s café')
    assert.equal(pdfText('−$3.00'), '-$3.00')
    assert.equal(pdfText('李 Acme'), '? Acme')
  })
})

describe('ClientReportPdf', () => {
  test('primitive fallbacks match @react-pdf/renderer exports', async () => {
    const lib = await import('@react-pdf/renderer')
    const doc = ClientReportPdf({ model: sampleModel() })
    assert.equal(doc.type, lib.Document)
    const pages = [].concat(doc.props.children)
    assert.equal(pages.length, PAGE_COUNT)
    for (const page of pages) {
      assert.equal(page.type, lib.Page)
      assert.equal(page.props.size, 'LETTER')
    }
  })

  test('node render produces a two-page PDF', async () => {
    const buffer = await renderClientReportPdfBuffer(sampleModel({ preparedFor: 'Acme Logistics', preparedBy: 'Jordan Lee, Example Staffing' }))
    assert.ok(Buffer.isBuffer(buffer) || buffer instanceof Uint8Array)
    assert.equal(Buffer.from(buffer).subarray(0, 5).toString('latin1'), '%PDF-')
    assert.equal(pageCount(Buffer.from(buffer)), 2)
    const text = drawnText(Buffer.from(buffer))
    for (const expected of ['Client Pay Market Report', 'Market Median', 'EXAMPLE REPORT', 'Acme Logistics', 'Page 1 of 2', 'Page 2 of 2', 'Observed postings, not verified open orders.', LIMITED_NOTE, 'directional guide. Full method']) {
      assert.ok(text.includes(expected), `missing "${expected}"`)
    }
    assert.ok(!/cities ranked|Market rank/i.test(text), 'no city rank')
    for (const banned of ['p90', '90th', 'time to fill', 'active postings', 'difficulty']) {
      assert.ok(!text.toLowerCase().includes(banned), `must not show "${banned}"`)
    }
  })

  test('worst-case content still fits on two pages without clipping, at every level', async () => {
    for (const [level, rateCents] of Object.entries(WORST_CASE_RATES)) {
      const model = worstCaseModel(rateCents)
      assert.ok(model, `worst-case model builds (${level})`)
      assert.equal(model.competitiveness.key, level)
      assert.ok(model.usedFallback)
      assert.ok(model.limitedData)
      // wrap: true lets overflowing content spill onto a third page, so a
      // page count of 2 proves nothing was cut off.
      const wrapped = await renderClientReportPdfBuffer(model, { wrap: true })
      assert.equal(pageCount(Buffer.from(wrapped)), 2, `${level}: spilled past two pages`)
    }
    const fixed = await renderClientReportPdfBuffer(worstCaseModel())
    assert.equal(pageCount(Buffer.from(fixed)), 2)
    assert.ok(drawnText(Buffer.from(fixed)).includes(LIMITED_NOTE))
  })

  test('the sample report (EXAMPLE band, no prepared lines) fits at every level', async () => {
    for (const [level, rateCents] of Object.entries(WORST_CASE_RATES)) {
      const model = worstCaseModel(rateCents, { sample: true, preparedFor: undefined, preparedBy: undefined })
      assert.ok(model.limitedData)
      const wrapped = await renderClientReportPdfBuffer(model, { wrap: true })
      assert.equal(pageCount(Buffer.from(wrapped)), 2, `sample ${level}: spilled past two pages`)
    }
  })

  test('the limited-data note appears only for a small firm count', async () => {
    const limited = sampleModel()
    assert.equal(limited.limitedData, true)
    const withNote = Buffer.from(await renderClientReportPdfBuffer(limited, { wrap: true }))
    assert.equal(pageCount(withNote), 2)
    assert.ok(drawnText(withNote).includes(LIMITED_NOTE))

    const plenty = buildClientReportModel({
      payResponse: payResponse({ result: { geography: { level: 'city', label: 'Houston, TX' }, ...figures({ p25Cents: 1750, typicalCents: 2000, p75Cents: 2420 }, 204) } }),
      rateCents: 1700,
      now: NOW
    })
    assert.equal(plenty.limitedData, false)
    const without = Buffer.from(await renderClientReportPdfBuffer(plenty))
    assert.equal(pageCount(without), 2)
    assert.ok(!drawnText(without).includes('Based on a small number'))
  })

  test('nationwide-only report renders', async () => {
    const model = buildClientReportModel({
      payResponse: payResponse({
        request: { roleKey: 'forklift-operator', state: null, city: null },
        result: { geography: { level: 'nationwide', label: 'Nationwide' }, ...figures({ p25Cents: 1700, typicalCents: 1850, p75Cents: 1850 }, null) },
        market: null,
        trend: null
      }),
      rateCents: 2500,
      now: NOW
    })
    const buffer = Buffer.from(await renderClientReportPdfBuffer(model))
    assert.equal(pageCount(buffer), 2)
    assert.ok(drawnText(buffer).includes('activity is not available for this location yet'))
  })
})
