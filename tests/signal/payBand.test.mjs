import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { VERDICT, classifyRate, verdictCopy, bandGeometry, placeLabels } from '../../shared/signal/payBand.js'
import { parseHourlyRate, toCents } from '../../shared/signal/money.js'

// Supplied development example (Forklift Operator, nationwide).
const FORKLIFT = { p25Cents: 1713, typicalCents: 1850, p75Cents: 2000 }

describe('classifyRate', () => {
  test('boundaries 1712 / 1713 / 2000 / 2001', () => {
    assert.equal(classifyRate(1712, 1713, 2000), VERDICT.BELOW)
    assert.equal(classifyRate(1713, 1713, 2000), VERDICT.WITHIN)
    assert.equal(classifyRate(2000, 1713, 2000), VERDICT.WITHIN)
    assert.equal(classifyRate(2001, 1713, 2000), VERDICT.ABOVE)
  })

  test('default example: $17.00 is below a $17.13 lower bound', () => {
    assert.equal(classifyRate(1700, 1713, 2000), 'below')
    assert.equal(classifyRate(1850, 1713, 2000), 'within')
    assert.equal(classifyRate(2500, 1713, 2000), 'above')
  })

  test('float safety: $17.13 typed and $17.13 supplied are equal', () => {
    const typed = parseHourlyRate('17.13')
    assert.equal(typed.ok, true)
    assert.equal(typed.cents, toCents(17.13))
    assert.equal(classifyRate(typed.cents, toCents(17.13), toCents(20)), VERDICT.WITHIN)
    // Dollar floats are unsafe for this: 17.13 - 17 is 0.129999999999999, and
    // 0.29 * 100 is 28.999999999999996. Integer cents give the exact $0.13.
    assert.notEqual(17.13 - 17, 0.13)
    assert.equal(toCents(17.13) - parseHourlyRate('17').cents, 13)
    assert.equal(classifyRate(parseHourlyRate('0.29').cents, toCents(0.29), toCents(0.5)), VERDICT.WITHIN)
    assert.equal(classifyRate(parseHourlyRate('17.12').cents, toCents(17.13), toCents(20)), VERDICT.BELOW)
    assert.equal(classifyRate(parseHourlyRate('20.01').cents, toCents(17.13), toCents(20)), VERDICT.ABOVE)
  })

  test('degenerate band (P25 === P75) is still a valid band', () => {
    assert.equal(classifyRate(1000, 1000, 1000), VERDICT.WITHIN)
    assert.equal(classifyRate(999, 1000, 1000), VERDICT.BELOW)
    assert.equal(classifyRate(1001, 1000, 1000), VERDICT.ABOVE)
  })

  test('null for missing values', () => {
    assert.equal(classifyRate(null, 1713, 2000), null)
    assert.equal(classifyRate(1700, null, 2000), null)
    assert.equal(classifyRate(1700, 1713, null), null)
    assert.equal(classifyRate(undefined, 1713, 2000), null)
    assert.equal(classifyRate(1700, undefined, undefined), null)
    assert.equal(classifyRate(), null)
  })

  test('null for non-integers (dollars passed by mistake, strings, non-finite)', () => {
    assert.equal(classifyRate(17.0001, 1713, 2000), null)
    assert.equal(classifyRate(1700, 17.13, 2000), null)
    assert.equal(classifyRate(1700, 1713, 2000.5), null)
    assert.equal(classifyRate('1700', 1713, 2000), null)
    assert.equal(classifyRate(Number.NaN, 1713, 2000), null)
    assert.equal(classifyRate(Infinity, 1713, 2000), null)
    assert.equal(classifyRate(1700, -Infinity, 2000), null)
  })

  test('null for an inverted band', () => {
    assert.equal(classifyRate(1800, 2000, 1713), null)
    assert.equal(classifyRate(1700, 2001, 2000), null)
  })

  test('null for zero or negative values', () => {
    assert.equal(classifyRate(0, 1713, 2000), null)
    assert.equal(classifyRate(-100, 1713, 2000), null)
    assert.equal(classifyRate(1700, 0, 2000), null)
  })
})

describe('verdictCopy', () => {
  test('below, nationwide: matches the brief', () => {
    const copy = verdictCopy(VERDICT.BELOW, { rateCents: 1700, p25Cents: 1713, p75Cents: 2000, geographyLabel: 'Nationwide' })
    assert.deepEqual(copy, {
      headline: 'Below the typical advertised range.',
      detail: 'Your rate is $0.13 below the lower end of this nationwide range.'
    })
  })

  test('within', () => {
    const copy = verdictCopy(VERDICT.WITHIN, { rateCents: 1850, p25Cents: 1713, p75Cents: 2000, geographyLabel: 'Nationwide' })
    assert.deepEqual(copy, {
      headline: 'Within the typical advertised range.',
      detail: 'Your rate falls inside the middle half of advertised rates for this nationwide comparison.'
    })
  })

  test('above, with a local geography label', () => {
    const copy = verdictCopy(VERDICT.ABOVE, { rateCents: 2150, p25Cents: 1713, p75Cents: 2000, geographyLabel: 'Houston, TX' })
    assert.deepEqual(copy, {
      headline: 'Above the typical advertised range.',
      detail: 'Your rate is $1.50 above the upper end of this Houston, TX range. That does not make it the highest rate in the market.'
    })
  })

  test('state label is used as given; missing label means nationwide', () => {
    assert.match(verdictCopy('within', { rateCents: 1800, p25Cents: 1713, p75Cents: 2000, geographyLabel: 'Texas' }).detail, /this Texas comparison/)
    assert.match(verdictCopy('below', { rateCents: 1700, p25Cents: 1713, p75Cents: 2000 }).detail, /this nationwide range/)
  })

  test('one-cent differences are exact', () => {
    assert.match(verdictCopy('below', { rateCents: 1712, p25Cents: 1713, p75Cents: 2000 }).detail, /\$0\.01 below/)
    assert.match(verdictCopy('above', { rateCents: 2001, p25Cents: 1713, p75Cents: 2000 }).detail, /\$0\.01 above/)
  })

  test('null when the verdict does not match the figures', () => {
    assert.equal(verdictCopy(VERDICT.WITHIN, { rateCents: 1700, p25Cents: 1713, p75Cents: 2000 }), null)
    assert.equal(verdictCopy(VERDICT.ABOVE, { rateCents: 1850, p25Cents: 1713, p75Cents: 2000 }), null)
  })

  test('null for unknown verdicts or unusable figures', () => {
    assert.equal(verdictCopy('slightly-below', { rateCents: 1700, p25Cents: 1713, p75Cents: 2000 }), null)
    assert.equal(verdictCopy(VERDICT.BELOW, { rateCents: 1700, p25Cents: 2000, p75Cents: 1713 }), null)
    assert.equal(verdictCopy(VERDICT.BELOW, { rateCents: null, p25Cents: 1713, p75Cents: 2000 }), null)
    assert.equal(verdictCopy(VERDICT.BELOW), null)
  })

  test('copy never says median or claims a percentile for the entered rate', () => {
    const cases = [
      ['below', 1700], ['below', 1712], ['within', 1713], ['within', 1850], ['within', 2000], ['above', 2001], ['above', 9999]
    ]
    for (const geographyLabel of ['Nationwide', 'Texas', 'Houston, TX', undefined]) {
      for (const [verdict, rateCents] of cases) {
        const copy = verdictCopy(verdict, { rateCents, p25Cents: 1713, p75Cents: 2000, geographyLabel })
        assert.ok(copy, `${verdict} ${rateCents}`)
        const text = `${copy.headline} ${copy.detail}`
        assert.doesNotMatch(text, /median/i)
        assert.doesNotMatch(text, /percentile/i)
        assert.doesNotMatch(text, /\d+(st|nd|rd|th)\b/i)
        assert.doesNotMatch(text, /%/)
        assert.doesNotMatch(text, /slightly|competitive|top of (the )?market/i)
      }
    }
  })
})

describe('bandGeometry', () => {
  const geometry = bandGeometry({ rateCents: 1700, ...FORKLIFT })
  const at = (key) => geometry.markers.find((marker) => marker.key === key)

  test('default example: $17.00 marker is left of the $17.13 P25 tick', () => {
    assert.ok(geometry.x(1700) < geometry.x(1713))
    assert.ok(at('rate').xPct < at('p25').xPct)
  })

  test('markers are in dollar order left to right', () => {
    assert.deepEqual(geometry.markers.map((marker) => marker.key), ['rate', 'p25', 'typical', 'p75'])
    for (let i = 1; i < geometry.markers.length; i += 1) {
      assert.ok(geometry.markers[i - 1].xPct < geometry.markers[i].xPct)
    }
  })

  test('all markers share one linear scale', () => {
    const [lo, hi] = geometry.domain
    for (const marker of geometry.markers) {
      const expected = ((marker.cents - lo) / (hi - lo)) * 100
      assert.ok(Math.abs(marker.xPct - expected) < 1e-9, marker.key)
      assert.equal(marker.xPct, geometry.x(marker.cents))
    }
    // Equal dollar gaps map to equal distances anywhere on the scale.
    const a = geometry.x(1800) - geometry.x(1750)
    const b = geometry.x(1950) - geometry.x(1900)
    assert.ok(Math.abs(a - b) < 1e-9)
    // Distance ratios match dollar ratios: P25->typical is 137c, typical->P75 is 150c.
    const left = at('typical').xPct - at('p25').xPct
    const right = at('p75').xPct - at('typical').xPct
    assert.ok(Math.abs(left / right - 137 / 150) < 1e-9)
    // P25, typical and P75 are NOT forced to be equally spaced.
    assert.notEqual(Math.round(left * 1000), Math.round(right * 1000))
  })

  test('domain: min/max of shown values padded by max(5% of span, 50 cents)', () => {
    // span 2000-1700 = 300c; 5% = 15c < 50c, so pad = 50c.
    assert.deepEqual(geometry.domain, [1650, 2050])
    const wide = bandGeometry({ rateCents: 4000, p25Cents: 4800, typicalCents: 5738, p75Cents: 6500 })
    // span 2500c; 5% = 125c.
    assert.deepEqual(wide.domain, [3875, 6625])
  })

  test('band spans P25 to P75 on the same scale', () => {
    assert.equal(geometry.band.fromPct, at('p25').xPct)
    assert.equal(geometry.band.toPct, at('p75').xPct)
    assert.ok(geometry.band.fromPct < geometry.band.toPct)
  })

  test('every marker is inside 0..100 with room at both ends', () => {
    for (const marker of geometry.markers) {
      assert.ok(marker.xPct > 0 && marker.xPct < 100, marker.key)
    }
  })

  test('rate far above the band extends the domain rather than being clipped', () => {
    const g = bandGeometry({ rateCents: 9000, ...FORKLIFT })
    const rate = g.markers.find((marker) => marker.key === 'rate')
    assert.equal(g.markers[g.markers.length - 1].key, 'rate')
    assert.ok(rate.xPct > g.markers.find((marker) => marker.key === 'p75').xPct)
    assert.ok(rate.xPct < 100)
  })

  test('no rate entered: domain from P25/P75 (and typical) only', () => {
    const g = bandGeometry({ rateCents: null, ...FORKLIFT })
    assert.deepEqual(g.markers.map((marker) => marker.key), ['p25', 'typical', 'p75'])
    assert.deepEqual(g.domain, [1663, 2050])
    assert.ok(g.markers.every((marker) => marker.key !== 'rate'))
    const undefinedRate = bandGeometry({ ...FORKLIFT })
    assert.deepEqual(undefinedRate.domain, g.domain)
  })

  test('typical is optional', () => {
    const g = bandGeometry({ rateCents: 1700, p25Cents: 1713, p75Cents: 2000 })
    assert.deepEqual(g.markers.map((marker) => marker.key), ['rate', 'p25', 'p75'])
  })

  test('domain never goes below $0.00', () => {
    const g = bandGeometry({ rateCents: 10, p25Cents: 20, typicalCents: 25, p75Cents: 30 })
    assert.equal(g.domain[0], 0)
    assert.ok(g.markers[0].xPct > 0)
  })

  test('a rate equal to P25 sits exactly on the P25 tick', () => {
    const g = bandGeometry({ rateCents: 1713, ...FORKLIFT })
    const rate = g.markers.find((marker) => marker.key === 'rate')
    const p25 = g.markers.find((marker) => marker.key === 'p25')
    assert.equal(rate.xPct, p25.xPct)
  })

  test('null for an unusable band or non-integer inputs', () => {
    assert.equal(bandGeometry({ rateCents: 1700, p25Cents: 2000, typicalCents: 1850, p75Cents: 1713 }), null)
    assert.equal(bandGeometry({ rateCents: 1700, p25Cents: null, typicalCents: 1850, p75Cents: 2000 }), null)
    assert.equal(bandGeometry({ rateCents: 17.5, ...FORKLIFT }), null)
    assert.equal(bandGeometry({ rateCents: 1700, p25Cents: 1713, typicalCents: 18.5, p75Cents: 2000 }), null)
    assert.equal(bandGeometry(), null)
  })
})

describe('placeLabels', () => {
  const geometry = bandGeometry({ rateCents: 1700, ...FORKLIFT })

  function assertSeparated(labels, gap) {
    const sorted = [...labels].sort((a, b) => a.labelPct - b.labelPct)
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(sorted[i].labelPct - sorted[i - 1].labelPct >= gap - 1e-9, `${sorted[i - 1].key} / ${sorted[i].key}`)
    }
  }

  test('de-collides the default example while marker xPct is unchanged', () => {
    const before = JSON.parse(JSON.stringify(geometry.markers))
    const labels = placeLabels(geometry.markers, { minGapPct: 14 })
    assert.equal(labels.length, geometry.markers.length)
    labels.forEach((label, i) => {
      assert.equal(label.key, geometry.markers[i].key)
      assert.equal(label.cents, geometry.markers[i].cents)
      assert.equal(label.xPct, geometry.markers[i].xPct)
    })
    assertSeparated(labels, 14)
    // The rate ($17.00) and P25 ($17.13) markers are 13 cents apart, so at
    // least one of their labels must have moved.
    assert.ok(labels[0].shifted || labels[1].shifted)
    // Inputs are not mutated.
    assert.deepEqual(geometry.markers, before)
  })

  test('labels keep the left-to-right order of their markers', () => {
    const labels = placeLabels(geometry.markers, { minGapPct: 14 })
    for (let i = 1; i < labels.length; i += 1) {
      assert.ok(labels[i - 1].labelPct < labels[i].labelPct)
    }
  })

  test('labels are clamped to [0, 100]', () => {
    const crowded = [
      { key: 'a', xPct: 0 }, { key: 'b', xPct: 1 }, { key: 'c', xPct: 99 }, { key: 'd', xPct: 100 }
    ]
    const labels = placeLabels(crowded, { minGapPct: 20 })
    for (const label of labels) {
      assert.ok(label.labelPct >= 0 && label.labelPct <= 100, `${label.key} ${label.labelPct}`)
    }
    assertSeparated(labels, 20)
    assert.equal(labels[0].labelPct, 0)
    assert.equal(labels[3].labelPct, 100)
  })

  test('well-separated markers are not shifted', () => {
    const spaced = [{ key: 'a', xPct: 10 }, { key: 'b', xPct: 50 }, { key: 'c', xPct: 90 }]
    const labels = placeLabels(spaced, { minGapPct: 14 })
    assert.deepEqual(labels.map((label) => label.labelPct), [10, 50, 90])
    assert.ok(labels.every((label) => label.shifted === false))
  })

  test('a colliding pair moves apart symmetrically (least movement)', () => {
    const labels = placeLabels([{ key: 'a', xPct: 50 }, { key: 'b', xPct: 52 }], { minGapPct: 10 })
    assert.ok(Math.abs(labels[0].labelPct - 46) < 1e-9)
    assert.ok(Math.abs(labels[1].labelPct - 56) < 1e-9)
    assert.ok(labels.every((label) => label.shifted))
  })

  test('identical marker positions still get distinct, ordered labels', () => {
    const labels = placeLabels([{ key: 'rate', xPct: 30 }, { key: 'p25', xPct: 30 }], { minGapPct: 14 })
    assert.equal(labels[0].xPct, 30)
    assert.equal(labels[1].xPct, 30)
    assert.ok(labels[1].labelPct - labels[0].labelPct >= 14 - 1e-9)
  })

  test('output follows input order even when input is unsorted', () => {
    const input = [{ key: 'p75', xPct: 80 }, { key: 'rate', xPct: 20 }, { key: 'p25', xPct: 22 }]
    const labels = placeLabels(input, { minGapPct: 14 })
    assert.deepEqual(labels.map((label) => label.key), ['p75', 'rate', 'p25'])
    assert.deepEqual(labels.map((label) => label.xPct), [80, 20, 22])
    assert.ok(labels[1].labelPct < labels[2].labelPct)
    assert.ok(labels[2].labelPct + 14 - 1e-9 <= labels[0].labelPct)
  })

  test('gap shrinks to fit when markers cannot fit at the requested gap', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ key: `m${i}`, xPct: 50 }))
    const labels = placeLabels(many, { minGapPct: 40 })
    assertSeparated(labels, 20)
    assert.ok(labels.every((label) => label.labelPct >= 0 && label.labelPct <= 100))
  })

  test('default gap is 14 and options are optional', () => {
    const labels = placeLabels([{ key: 'a', xPct: 40 }, { key: 'b', xPct: 41 }])
    assertSeparated(labels, 14)
  })

  test('empty or single input', () => {
    assert.deepEqual(placeLabels([], {}), [])
    assert.deepEqual(placeLabels(undefined), [])
    const [only] = placeLabels([{ key: 'rate', xPct: 42 }], {})
    assert.equal(only.labelPct, 42)
    assert.equal(only.shifted, false)
  })

  test('works across a range of rates on the forklift band', () => {
    for (let rate = 1500; rate <= 2300; rate += 7) {
      const g = bandGeometry({ rateCents: rate, ...FORKLIFT })
      const labels = placeLabels(g.markers, { minGapPct: 14 })
      labels.forEach((label, i) => assert.equal(label.xPct, g.markers[i].xPct))
      assertSeparated(labels, 14)
      for (let i = 1; i < labels.length; i += 1) assert.ok(labels[i - 1].labelPct < labels[i].labelPct)
      assert.ok(labels.every((label) => label.labelPct >= 0 && label.labelPct <= 100))
    }
  })
})
