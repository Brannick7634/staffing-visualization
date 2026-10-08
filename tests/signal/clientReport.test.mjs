import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_RECIPIENTS,
  PREPARED_TEXT_MAX,
  NOTE_MAX,
  containsLink,
  COMPETITIVENESS_LEVELS,
  classifyCompetitiveness,
  POSITION_LABELS,
  marketGap,
  recommendedRanges,
  formatRangeCents,
  hasFigures,
  buildClientReportModel,
  LIMITED_DATA_MIN_FIRMS,
  limitedDataNote
} from '../../shared/signal/clientReport.js'

// Forklift Operator cells from the 2026-10-06 snapshot (cents).
const HOUSTON = { p25Cents: 1750, typicalCents: 2000, p75Cents: 2420 }
const TEXAS = { p25Cents: 1800, typicalCents: 1875, p75Cents: 2100 }
const NATIONAL = { p25Cents: 1700, typicalCents: 1850, p75Cents: 2000 }
const NOW = new Date('2026-10-08T15:00:00Z')

function figures(values, firmCount) {
  return {
    coverage: 'publishable',
    access: 'public',
    ...values,
    typicalLabel: 'Typical advertised rate',
    payBasis: 'hourly',
    currency: 'USD',
    dataStatus: 'production',
    ...(firmCount === undefined ? {} : { firmCount })
  }
}

function withheld(level, label, coverage = 'insufficient_sample') {
  return { geography: { level, label, requested: true }, coverage, access: 'public', message: 'Not enough data.' }
}

function payResponse({ state = 'TX', city = 'TX:houston', result, fallback = null, national, market, trend } = {}) {
  return {
    contractVersion: 'signal-preview-1',
    dataMode: 'production',
    viewer: { access: 'public' },
    request: { roleKey: 'forklift-operator', roleLabel: 'Forklift Operator', state, city },
    result: result === undefined
      ? { geography: { level: 'city', label: 'Houston, TX', requested: true }, ...figures(HOUSTON, 4) }
      : result,
    fallback,
    national: national === undefined
      ? { roleKey: 'forklift-operator', roleLabel: 'Forklift Operator', sectorKey: 'light-industrial', geography: { level: 'nationwide', label: 'Nationwide' }, ...figures(NATIONAL, 158) }
      : national,
    ...(market === undefined ? {} : { market }),
    ...(trend === undefined ? {} : { trend })
  }
}

const TEXAS_FALLBACK = { geography: { level: 'state', label: 'Texas', requested: false }, ...figures(TEXAS, 19), message: 'A Texas benchmark is available.' }

function model(rateCents, overrides = {}, options = {}) {
  return buildClientReportModel({ payResponse: payResponse(overrides), rateCents, now: NOW, ...options })
}

describe('limits', () => {
  test('constants match the contract', () => {
    assert.equal(MAX_RECIPIENTS, 5)
    assert.equal(PREPARED_TEXT_MAX, 80)
    assert.equal(NOTE_MAX, 500)
  })
})

describe('containsLink', () => {
  test('finds schemes, www. and bare domains on the listed TLDs', () => {
    const links = [
      'http://x', 'HTTPS://evil.example', 'see www.example', 'example.com', 'Visit Acme.COM today',
      'sub.domain.co.uk', 'evil.ru/path?x=1', 'jane@acme.com', 'go.link', 'a.top', 'name.us', 'b.info',
      'c.biz', 'd.xyz', 'e.cn', 'f.click', 'g.io', 'h.net', 'i.org', 'j.co', 'ends with x.com.', 'café.com'
    ]
    for (const text of links) assert.equal(containsLink(text), true, text)
  })

  test('any ending, odd schemes, look-alike dots and hidden characters still count', () => {
    const links = [
      'bit.ly/abc', 't.me/x', 'example.de/login', 'secure-login.app', 'paypal-secure.support',
      'evil。com', 'evil．com', 'evil｡com', 'evil​.com', 'e‍vil.c​om',
      'ｅｘａｍｐｌｅ．ｃｏｍ', 'name.community', 'ftp://host', 'hxxp://x', 'mailto:me', 'javascript:alert(1)',
      'go to 10.0.0.1 now', 'Hi Jane,\nsee acme.co.uk\nThanks'
    ]
    for (const text of links) assert.equal(containsLink(text), true, JSON.stringify(text))
  })

  test('plain text, prices and near-misses are not links', () => {
    const plain = [
      '', 'Acme Staffing', 'Rate is $17.50.', 'U.S. market', 'e.g. com', 'i.e. the median',
      'the .com era', 'Mr. Top', 'awww. nice', 'Q4 info', 'Houston, TX', 'Dr. Smith, Co. Ltd',
      'Note: pay is low. Thanks, Jane', 'Rate: $17.00/hr. Median: $20.00/hr.', '3.5 hours', 'v1.2'
    ]
    for (const text of plain) assert.equal(containsLink(text), false, text)
  })

  test('non-strings are never links', () => {
    for (const value of [null, undefined, 42, {}, ['x.com']]) assert.equal(containsLink(value), false)
  })
})

describe('COMPETITIVENESS_LEVELS', () => {
  test('five levels, worst to best, with the contract wording', () => {
    assert.deepEqual(COMPETITIVENESS_LEVELS.map((level) => ({ ...level })), [
      { key: 'severe', label: 'Severe recruiting risk', rule: 'More than 10% under the market low' },
      { key: 'below', label: 'Below market', rule: 'Under the market low' },
      { key: 'moderate', label: 'Moderately competitive', rule: 'Market low to market median' },
      { key: 'competitive', label: 'Competitive', rule: 'Market median to market high' },
      { key: 'high', label: 'Highly competitive', rule: 'Above the market high' }
    ])
    assert.ok(Object.isFrozen(COMPETITIVENESS_LEVELS))
    assert.ok(Object.isFrozen(COMPETITIVENESS_LEVELS[0]))
  })

  test('position labels', () => {
    assert.deepEqual({ ...POSITION_LABELS }, { below: 'Below market', within: 'Market range', above: 'Above market' })
  })
})

describe('classifyCompetitiveness', () => {
  const band = [2000, 2200, 2500]

  test('every boundary: 90% of P25, P25, median, P75', () => {
    assert.equal(classifyCompetitiveness(1799, ...band), 'severe')
    assert.equal(classifyCompetitiveness(1800, ...band), 'below', 'exactly 90% of P25 is not severe')
    assert.equal(classifyCompetitiveness(1999, ...band), 'below')
    assert.equal(classifyCompetitiveness(2000, ...band), 'moderate', 'rate == P25')
    assert.equal(classifyCompetitiveness(2199, ...band), 'moderate')
    assert.equal(classifyCompetitiveness(2200, ...band), 'competitive', 'rate == median')
    assert.equal(classifyCompetitiveness(2500, ...band), 'competitive', 'rate == P75')
    assert.equal(classifyCompetitiveness(2501, ...band), 'high')
  })

  test('severe edge is exact when 90% of P25 is not a whole cent', () => {
    // 90% of 1755 is 1579.5.
    assert.equal(classifyCompetitiveness(1579, 1755, 2000, 2400), 'severe')
    assert.equal(classifyCompetitiveness(1580, 1755, 2000, 2400), 'below')
  })

  test('median equal to P75: the competitive band is that single value', () => {
    assert.equal(classifyCompetitiveness(1654, 1500, 1655, 1655), 'moderate')
    assert.equal(classifyCompetitiveness(1655, 1500, 1655, 1655), 'competitive')
    assert.equal(classifyCompetitiveness(1656, 1500, 1655, 1655), 'high')
  })

  test('P25 equal to the median: no moderate band', () => {
    assert.equal(classifyCompetitiveness(1999, 2000, 2000, 2400), 'below')
    assert.equal(classifyCompetitiveness(2000, 2000, 2000, 2400), 'competitive')
  })

  test('all three equal', () => {
    assert.equal(classifyCompetitiveness(2000, 2000, 2000, 2000), 'competitive')
    assert.equal(classifyCompetitiveness(2001, 2000, 2000, 2000), 'high')
    assert.equal(classifyCompetitiveness(1800, 2000, 2000, 2000), 'below')
    assert.equal(classifyCompetitiveness(1799, 2000, 2000, 2000), 'severe')
  })

  test('null for unusable or unordered figures', () => {
    assert.equal(classifyCompetitiveness(null, ...band), null)
    assert.equal(classifyCompetitiveness(0, ...band), null)
    assert.equal(classifyCompetitiveness(17.5, ...band), null)
    assert.equal(classifyCompetitiveness('2000', ...band), null)
    assert.equal(classifyCompetitiveness(2000, 2300, 2200, 2500), null)
    assert.equal(classifyCompetitiveness(2000, 2000, 2600, 2500), null)
    assert.equal(classifyCompetitiveness(2000, 2000, NaN, 2500), null)
  })
})

describe('marketGap', () => {
  test('Houston example: $17.00 against a $20.00 median', () => {
    assert.deepEqual(marketGap(1700, 2000), { gapCents: -300, pct: 15, direction: 'below' })
    assert.deepEqual(marketGap(2300, 2000), { gapCents: 300, pct: 15, direction: 'above' })
    assert.deepEqual(marketGap(2000, 2000), { gapCents: 0, pct: 0, direction: 'at' })
  })

  test('rounds half up, both directions', () => {
    assert.equal(marketGap(1025, 1000).pct, 3) // 2.5%
    assert.equal(marketGap(975, 1000).pct, 3) // 2.5%
    assert.equal(marketGap(1024, 1000).pct, 2) // 2.4%
    assert.equal(marketGap(1015, 1000).pct, 2) // 1.5%
    assert.equal(marketGap(1005, 1000).pct, 1) // 0.5%
    assert.equal(marketGap(1004, 1000).pct, 0) // 0.4%
    assert.equal(marketGap(1407, 1400).pct, 1) // exactly 0.5%
    assert.equal(marketGap(1700, 1850).pct, 8) // 8.1%
    assert.equal(marketGap(1700, 1875).pct, 9) // 9.33%
    assert.equal(marketGap(1999, 2000).pct, 0)
    assert.equal(marketGap(4000, 2000).pct, 100)
  })

  test('null for unusable input', () => {
    assert.equal(marketGap(null, 2000), null)
    assert.equal(marketGap(1700, 0), null)
    assert.equal(marketGap(1700, 20.5), null)
  })
})

describe('recommendedRanges and formatRangeCents', () => {
  test('competitive is median to P75; aggressive is above P75', () => {
    assert.deepEqual(recommendedRanges(2000, 2420), {
      competitive: { fromCents: 2000, toCents: 2420 },
      aggressive: { fromCents: 2420 }
    })
    assert.equal(recommendedRanges(null, 2420), null)
  })

  test('a range with equal ends renders as one value', () => {
    assert.equal(formatRangeCents(2000, 2420), '$20.00–$24.20')
    assert.equal(formatRangeCents(1655, 1655), '$16.55')
  })
})

describe('hasFigures', () => {
  test('publishable, visible, ordered figures', () => {
    assert.equal(hasFigures(figures(HOUSTON)), true)
    assert.equal(hasFigures({ ...figures(HOUSTON), access: 'authorized' }), true)
  })

  test('locked, withheld, missing or malformed scopes have no figures', () => {
    assert.equal(hasFigures({ ...figures(HOUSTON), access: 'requires_free_account' }), false)
    assert.equal(hasFigures({ ...figures(HOUSTON), coverage: 'insufficient_sample' }), false)
    assert.equal(hasFigures(withheld('city', 'Houston, TX')), false)
    assert.equal(hasFigures({ ...figures(HOUSTON), p75Cents: undefined }), false)
    assert.equal(hasFigures({ ...figures(HOUSTON), typicalCents: NaN }), false)
    assert.equal(hasFigures({ ...figures(HOUSTON), p25Cents: Infinity }), false)
    assert.equal(hasFigures({ ...figures(HOUSTON), p25Cents: 2500 }), false)
    assert.equal(hasFigures(null), false)
    assert.equal(hasFigures(undefined), false)
    assert.equal(hasFigures('publishable'), false)
  })
})

describe('buildClientReportModel', () => {
  test('Houston, $17.00: the full model', () => {
    const market = { city: { key: 'TX:houston', label: 'Houston, TX', newPostings: 468, staffingFirms: 204, windowDays: 45, jobScope: 'all jobs' }, state: null }
    const trend = { roleKey: 'forklift-operator', snapshotDate: '2026-10-06', series: [] }
    const m = model(1700, { market, trend })
    assert.equal(m.sample, false)
    assert.equal(m.reportDateIso, '2026-10-08')
    assert.equal(m.reportDateLabel, 'October 8, 2026')
    assert.equal(m.snapshotDate, '2026-10-06')
    assert.equal(m.roleKey, 'forklift-operator')
    assert.equal(m.roleLabel, 'Forklift Operator')
    assert.deepEqual(m.requested, { level: 'city', label: 'Houston, TX' })
    assert.deepEqual(m.scope, { level: 'city', label: 'Houston, TX' })
    assert.equal(m.usedFallback, false)
    assert.equal(m.fallbackNote, null)
    assert.deepEqual(m.figures, { ...HOUSTON, firmCount: 4 })
    assert.equal(m.limitedData, true)
    assert.equal(m.limitedDataNote, 'Based on a small number of staffing firms (4). Treat these figures as a directional guide.')
    assert.equal(m.rateCents, 1700)
    assert.deepEqual(m.gap, { gapCents: -300, pct: 15, direction: 'below' })
    assert.deepEqual(m.position, { key: 'below', label: 'Below market' })
    assert.deepEqual(m.competitiveness, { key: 'below', label: 'Below market' })
    assert.deepEqual(m.levels.map((level) => [level.key, level.active]), [
      ['severe', false], ['below', true], ['moderate', false], ['competitive', false], ['high', false]
    ])
    assert.equal(m.levels[0].rule, 'More than 10% under the market low')
    assert.deepEqual(m.ranges, { competitive: { fromCents: 2000, toCents: 2420 }, aggressive: { fromCents: 2420 } })
    assert.equal(m.executiveSummary,
      'Staffing firms in the Houston, TX area are advertising Forklift Operator positions in a middle range of about $17.50 to $24.20 per hour, with a median of $20.00. ' +
      'A client pay rate of $17.00 per hour falls below that range and is about 15% under the median, which may make the position more difficult to fill.')
    assert.equal(m.takeaway,
      'A client pay rate of $17.00/hr is about 15% below the current market median for Forklift Operator in Houston, TX. ' +
      'Moving the rate into the competitive range ($20.00–$24.20) may improve the client’s ability to attract qualified candidates. ' +
      'Higher pay does not guarantee an order will fill.')
    assert.equal(m.market, market)
    assert.equal(m.trend, trend)
    assert.equal(m.preparedFor, '')
    assert.equal(m.preparedBy, '')
    assert.equal(m.fileName, 'Client-Pay-Market-Report_Forklift-Operator_Houston-TX.pdf')
    assert.equal(m.disclaimer, 'Market data is based on aggregated advertised pay in staffing-firm job postings and is intended for informational purposes only. It is advertised pay, not actual pay. Market conditions may vary based on employer, experience, shift, industry, geography and other factors.')
    assert.equal(m.methodNote, 'Local figures are published only when at least 3 staffing firms report and no single firm accounts for more than half of the data. Figures from fewer than 5 firms are marked as a directional guide. Full method: thestaffingsignal.com/methodology')
  })

  test('limited-data note: a known firm count under 5 only', () => {
    assert.equal(LIMITED_DATA_MIN_FIRMS, 5)
    const cell = (firmCount) => ({ geography: { level: 'city', label: 'Houston, TX', requested: true }, ...figures(HOUSTON, firmCount) })
    for (const [firmCount, limited] of [[3, true], [4, true], [5, false], [6, false], [158, false], [null, false], [undefined, false]]) {
      const m = model(1700, { result: cell(firmCount) })
      assert.equal(m.limitedData, limited, `firmCount ${firmCount}`)
      assert.equal(m.limitedDataNote, limited
        ? `Based on a small number of staffing firms (${firmCount}). Treat these figures as a directional guide.`
        : null, `firmCount ${firmCount}`)
    }
    // The note follows the figures actually used: a 19-firm Texas fallback is not limited.
    const fallback = model(1700, { result: withheld('city', 'Houston, TX'), fallback: TEXAS_FALLBACK })
    assert.equal(fallback.limitedData, false)
    assert.equal(fallback.limitedDataNote, null)
    for (const bad of [-1, 2.5, '3', NaN, Infinity]) assert.equal(limitedDataNote(bad), null, String(bad))
    assert.equal(limitedDataNote(4), 'Based on a small number of staffing firms (4). Treat these figures as a directional guide.')
  })

  test('market and trend default to null; explicit snapshotDate wins over the trend date', () => {
    const plain = model(1700)
    assert.equal(plain.market, null)
    assert.equal(plain.trend, null)
    assert.equal(plain.snapshotDate, null)
    const dated = model(1700, { trend: { snapshotDate: '2026-10-06', series: [] } }, { snapshotDate: '2026-10-05' })
    assert.equal(dated.snapshotDate, '2026-10-05')
  })

  test('report date is the UTC day', () => {
    const late = model(1700, {}, { now: new Date('2026-10-08T23:30:00-04:00') })
    assert.equal(late.reportDateIso, '2026-10-09')
    assert.equal(late.reportDateLabel, 'October 9, 2026')
    const newYear = model(1700, {}, { now: new Date('2027-01-01T00:00:00Z') })
    assert.equal(newYear.reportDateLabel, 'January 1, 2027')
  })

  test('city without figures falls back to the state, with a note', () => {
    const m = model(1700, { result: withheld('city', 'Houston, TX'), fallback: TEXAS_FALLBACK })
    assert.deepEqual(m.requested, { level: 'city', label: 'Houston, TX' })
    assert.deepEqual(m.scope, { level: 'state', label: 'Texas' })
    assert.equal(m.usedFallback, true)
    assert.equal(m.fallbackNote, 'There is no reliable Houston, TX figure yet, so this report uses Texas.')
    assert.deepEqual(m.figures, { ...TEXAS, firmCount: 19 })
    assert.equal(m.competitiveness.key, 'below') // 1700*10 = 17000 is not under 1800*9 = 16200
    assert.match(m.executiveSummary, /^Staffing firms in Texas are advertising Forklift Operator positions/)
    assert.match(m.takeaway, /median for Forklift Operator in Texas\. /)
    assert.equal(m.fileName, 'Client-Pay-Market-Report_Forklift-Operator_Texas.pdf')
  })

  test('nothing local: nationwide figures, phrased as across the U.S.', () => {
    const m = model(1700, { result: withheld('city', 'Houston, TX', 'not_yet_available') })
    assert.deepEqual(m.scope, { level: 'nationwide', label: 'Nationwide' })
    assert.equal(m.usedFallback, true)
    assert.equal(m.fallbackNote, 'There is no reliable Houston, TX figure yet, so this report uses nationwide figures.')
    assert.deepEqual(m.figures, { ...NATIONAL, firmCount: 158 })
    assert.match(m.executiveSummary, /^Staffing firms across the U\.S\. are advertising/)
    assert.match(m.takeaway, /median for Forklift Operator across the U\.S\. Moving the rate/)
    assert.doesNotMatch(m.takeaway, /\.\./)
    assert.equal(m.fileName, 'Client-Pay-Market-Report_Forklift-Operator_Nationwide.pdf')
  })

  test('state request without a state figure falls back to nationwide', () => {
    const m = model(1700, { city: null, result: withheld('state', 'Texas') })
    assert.deepEqual(m.requested, { level: 'state', label: 'Texas' })
    assert.equal(m.fallbackNote, 'There is no reliable Texas figure yet, so this report uses nationwide figures.')
  })

  test('nationwide request is not a fallback', () => {
    const national = payResponse({ state: null, city: null }).national
    const m = model(1850, { state: null, city: null, result: { ...national, geography: { level: 'nationwide', label: 'Nationwide', requested: true } } })
    assert.equal(m.usedFallback, false)
    assert.equal(m.fallbackNote, null)
    assert.match(m.executiveSummary, /^Staffing firms across the U\.S\./)
  })

  test('a locked scope is skipped, never shown', () => {
    const locked = { geography: { level: 'city', label: 'Houston, TX', requested: true }, coverage: 'publishable', access: 'requires_free_account', message: 'Locked.' }
    const m = model(1700, { result: { ...locked, ...HOUSTON }, fallback: { ...TEXAS_FALLBACK, access: 'requires_free_account' } })
    assert.equal(m.scope.level, 'nationwide')
    assert.deepEqual(m.figures, { ...NATIONAL, firmCount: 158 })
  })

  test('null when no scope has figures or the rate is unusable', () => {
    assert.equal(model(1700, { result: withheld('city', 'Houston, TX'), national: { coverage: 'not_yet_available', access: 'public' } }), null)
    for (const rate of [null, undefined, 0, -100, 17.5, '1700', NaN]) assert.equal(model(rate), null, String(rate))
    assert.equal(buildClientReportModel({ rateCents: 1700 }), null)
    assert.equal(buildClientReportModel(), null)
  })

  test('copy for every competitiveness level', () => {
    const severe = model(1500) // 15000 < 1750*9 = 15750
    assert.equal(severe.competitiveness.key, 'severe')
    assert.equal(severe.competitiveness.label, 'Severe recruiting risk')
    assert.match(severe.executiveSummary, /A client pay rate of \$15\.00 per hour falls below that range and is about 25% under the median, which may make the position more difficult to fill\.$/)

    const moderate = model(1900)
    assert.equal(moderate.competitiveness.key, 'moderate')
    assert.deepEqual(moderate.position, { key: 'within', label: 'Market range' })
    assert.match(moderate.executiveSummary, /A client pay rate of \$19\.00 per hour is within that range but about 5% under the median, so many competing offers for the same work advertise more\.$/)
    assert.match(moderate.takeaway, /^A client pay rate of \$19\.00\/hr is about 5% below the current market median/)

    const atMedian = model(2000)
    assert.equal(atMedian.competitiveness.key, 'competitive')
    assert.match(atMedian.executiveSummary, /A client pay rate of \$20\.00 per hour is at or above the median and within that range, in line with most competing offers\.$/)
    assert.equal(atMedian.takeaway, 'A client pay rate of $20.00/hr is at the current market median for Forklift Operator in Houston, TX. Pay is one factor in filling an order; it does not guarantee a fill.')

    const atHigh = model(2420)
    assert.equal(atHigh.competitiveness.key, 'competitive')
    assert.deepEqual(atHigh.position, { key: 'within', label: 'Market range' })
    assert.match(atHigh.takeaway, /^A client pay rate of \$24\.20\/hr is about 21% above the current market median/)

    const high = model(2500)
    assert.equal(high.competitiveness.key, 'high')
    assert.deepEqual(high.position, { key: 'above', label: 'Above market' })
    assert.match(high.executiveSummary, /A client pay rate of \$25\.00 per hour is above that range, higher than at least three in four advertised rates\.$/)
    assert.equal(high.takeaway, 'A client pay rate of $25.00/hr is about 25% above the current market median for Forklift Operator in Houston, TX. Pay is one factor in filling an order; it does not guarantee a fill.')

    for (const m of [severe, moderate, atMedian, atHigh, high]) {
      assert.equal(m.levels.filter((level) => level.active).length, 1)
      assert.equal(m.levels.find((level) => level.active).key, m.competitiveness.key)
    }
  })

  test('a real gap that rounds to 0% says "less than 1%"', () => {
    const under = model(1999)
    assert.match(under.executiveSummary, /within that range but less than 1% under the median/)
    assert.match(under.takeaway, /is less than 1% below the current market median/)
    const over = model(2001)
    assert.match(over.takeaway, /is less than 1% above the current market median/)
    for (const m of [under, over]) assert.doesNotMatch(`${m.executiveSummary} ${m.takeaway}`, /about 0%/)
  })

  test('median equal to P75: ranges render as one value', () => {
    const cell = { geography: { level: 'city', label: 'Altavista, VA', requested: true }, ...figures({ p25Cents: 1500, typicalCents: 1655, p75Cents: 1655 }) }
    const m = model(1600, { state: 'VA', city: 'VA:altavista', result: cell })
    assert.equal(m.competitiveness.key, 'moderate')
    assert.match(m.takeaway, /competitive range \(\$16\.55\) may improve/)
    assert.equal(m.figures.firmCount, null)
    assert.equal(model(1655, { state: 'VA', city: 'VA:altavista', result: cell }).competitiveness.key, 'competitive')
  })

  test('a single-value market reads "about $X per hour"', () => {
    const cell = { geography: { level: 'city', label: 'Houston, TX', requested: true }, ...figures({ p25Cents: 2000, typicalCents: 2000, p75Cents: 2000 }) }
    assert.match(model(2000, { result: cell }).executiveSummary, /in a middle range of about \$20\.00 per hour, with a median of \$20\.00\./)
  })

  test('prepared for / by: one trimmed line, at most 80 characters', () => {
    const long = 'A'.repeat(100)
    const m = model(1700, {}, { preparedFor: '  Acme\n  Logistics\t Inc.  ', preparedBy: long })
    assert.equal(m.preparedFor, 'Acme Logistics Inc.')
    assert.equal(m.preparedBy, 'A'.repeat(PREPARED_TEXT_MAX))
    const emoji = model(1700, {}, { preparedBy: `${'B'.repeat(79)}😀😀` })
    assert.equal(emoji.preparedBy, `${'B'.repeat(79)}😀`)
    const junk = model(1700, {}, { preparedFor: 42, preparedBy: null })
    assert.equal(junk.preparedFor, '')
    assert.equal(junk.preparedBy, '')
  })

  test('sample flag', () => {
    assert.equal(model(1700, {}, { sample: true }).sample, true)
    assert.equal(model(1700, {}, { sample: 1 }).sample, true)
  })

  test('taxonomy label wins; file name slugs punctuation and accents', () => {
    const response = payResponse({
      result: { geography: { level: 'city', label: "Coeur d'Alene, ID", requested: true }, ...figures(HOUSTON) },
      state: 'ID',
      city: 'ID:coeur-d-alene'
    })
    response.request.roleKey = 'not-in-taxonomy'
    response.request.roleLabel = 'Nurse (RN) / ICU & Step-down Café'
    const m = buildClientReportModel({ payResponse: response, rateCents: 1700, now: NOW })
    assert.equal(m.roleLabel, 'Nurse (RN) / ICU & Step-down Café')
    assert.equal(m.fileName, 'Client-Pay-Market-Report_Nurse-RN-ICU-Step-down-Cafe_Coeur-d-Alene-ID.pdf')

    const known = payResponse()
    known.request.roleLabel = 'Something stale'
    assert.equal(buildClientReportModel({ payResponse: known, rateCents: 1700, now: NOW }).roleLabel, 'Forklift Operator')
  })

  test('the client rate never reaches the file name', () => {
    for (const rate of [1700, 2000, 2420, 99999]) {
      assert.doesNotMatch(model(rate).fileName, /\d/)
    }
  })

  test('does not mutate the pay response', () => {
    const response = payResponse({ result: withheld('city', 'Houston, TX'), fallback: TEXAS_FALLBACK })
    const before = JSON.stringify(response)
    buildClientReportModel({ payResponse: response, rateCents: 1700, now: NOW, preparedFor: 'X' })
    assert.equal(JSON.stringify(response), before)
  })
})
