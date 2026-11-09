// The Inland Empire area: a listed pick that pools Riverside + San Bernardino
// county cities into one city-level pay benchmark. These tests cover the site
// side (picker, sign-up area, pay lookup, gate); the pooling itself is tested
// in tests/python/test_signal_regions.py. ALL FIGURES HERE ARE SYNTHETIC.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  CITIES, citiesForState, cityByKey, isValidSelection, geographyLabel, isArea, pickerLabel
} from '../../shared/signal/geography.js'
import { checkArea, findListedCity, savedArea } from '../../shared/signal/area.js'
import { buildPayResponse, REAL_PLACES } from '../../api/_lib/signal/service.js'
import { validatePaySelection } from '../../api/_lib/signal/handlers.js'
import { buildReport, localFor } from '../../api/_lib/signal/report.js'

const KEY = 'CA:inland-empire'
const ROLE = 'warehouse-associate'

const PASS = { status: 'verified', distinctFirms: 5, maxFirmShare: 0.4 }
const FEW_FIRMS = { status: 'verified', distinctFirms: 2, maxFirmShare: 0.5 }
const ONE_FIRM_DOMINATES = { status: 'verified', distinctFirms: 6, maxFirmShare: 0.6 }

function cell(level, typicalCents, checks, extra = {}) {
  return {
    roleKey: ROLE, level, state: level === 'nationwide' ? null : 'CA', city: level === 'city' ? KEY : null,
    p25Cents: typicalCents - 150, typicalCents, p75Cents: typicalCents + 200,
    payBasis: 'hourly', currency: 'USD', observations: 18, checks, ...extra
  }
}
const NATIONAL = cell('nationwide', 1900, { status: 'verified', distinctFirms: 90, maxFirmShare: 0.05 })
const STATE = cell('state', 2100, { status: 'verified', distinctFirms: 40, maxFirmShare: 0.1 })

function pay(cells, viewerAccess = 'authorized', request = { roleKey: ROLE, state: 'CA', city: KEY }) {
  return buildPayResponse({ data: { pay: cells }, dataMode: 'production', viewer: { access: viewerAccess }, request })
}

describe('picker', () => {
  test('Inland Empire is a listed California pick, keyed like a city', () => {
    const place = cityByKey(KEY)
    assert.ok(place)
    assert.equal(place.state, 'CA')
    assert.equal(place.name, 'Inland Empire')
    assert.equal(isArea(place), true)
    assert.ok(citiesForState('CA').some((c) => c.key === KEY))
    assert.equal(isValidSelection('CA', KEY), true)
    assert.equal(isValidSelection('TX', KEY), false)
    assert.equal(geographyLabel('CA', KEY), 'Inland Empire, CA')
  })

  test('it is one of the listed areas; ordinary cities are not areas', () => {
    assert.ok(CITIES.filter(isArea).some((c) => c.key === KEY))
    assert.equal(isArea(cityByKey('CA:los-angeles')), false)
    assert.equal(isArea(null), false)
  })

  test('the picker text says what it covers', () => {
    assert.equal(pickerLabel(cityByKey(KEY)), 'Inland Empire (Riverside + San Bernardino counties)')
    assert.equal(pickerLabel(cityByKey('CA:los-angeles')), 'Los Angeles')
  })
})

describe('sign-up area and monthly email', () => {
  test('picking it saves the label "Inland Empire, CA", and that label reads back as the area', () => {
    const picked = checkArea('CA', KEY)
    assert.equal(picked.ok, true)
    assert.equal(picked.listed, true)
    assert.equal(picked.cityKey, KEY)
    assert.equal(picked.label, 'Inland Empire, CA')
    const saved = savedArea('California', 'Inland Empire, CA')
    assert.equal(saved.state, 'CA')
    assert.equal(saved.cityKey, KEY)
  })

  test('typing the name finds the listed area', () => {
    assert.equal(findListedCity('CA', 'Inland Empire').key, KEY)
    assert.equal(checkArea('CA', 'inland empire').cityKey, KEY)
  })

  test('another state cannot use it', () => {
    assert.equal(checkArea('TX', KEY).ok, false)
  })
})

describe('pay lookup', () => {
  test('selection is accepted by the pay endpoint validation', () => {
    const ok = validatePaySelection({ role: ROLE, state: 'CA', city: KEY })
    assert.equal(ok.ok, true)
    assert.deepEqual(ok.selection, { roleKey: ROLE, state: 'CA', city: KEY })
    assert.equal(validatePaySelection({ role: ROLE, state: 'TX', city: KEY }).ok, false)
  })

  test('a published area cell answers as an area, with its figures', () => {
    const res = pay([NATIONAL, STATE, cell('city', 1867, PASS)])
    assert.equal(res.request.city, KEY)
    assert.equal(res.result.coverage, 'publishable')
    assert.equal(res.result.geography.label, 'Inland Empire, CA')
    assert.equal(res.result.geography.covers, 'Riverside + San Bernardino counties')
    assert.equal(res.result.typicalCents, 1867)
    assert.equal(res.result.firmCount, 5)
    assert.equal(res.fallback, null)
  })

  test('ordinary cities are not described as areas', () => {
    const la = { ...cell('city', 2300, PASS), city: 'CA:los-angeles' }
    const res = pay([NATIONAL, STATE, la], 'authorized', { roleKey: ROLE, state: 'CA', city: 'CA:los-angeles' })
    assert.equal(res.result.coverage, 'publishable')
    assert.equal('covers' in res.result.geography, false)
  })

  test('too few firms: withheld, and the viewer gets the California figure instead', () => {
    const res = pay([NATIONAL, STATE, cell('city', 1867, FEW_FIRMS)])
    assert.equal(res.result.coverage, 'insufficient_sample')
    assert.equal(res.result.typicalCents, undefined)
    assert.equal(res.result.geography.covers, 'Riverside + San Bernardino counties')
    assert.equal(res.fallback.geography.level, 'state')
    assert.equal(res.fallback.typicalCents, 2100)
  })

  test('one firm over half of the observations: withheld', () => {
    const res = pay([NATIONAL, STATE, cell('city', 1867, ONE_FIRM_DOMINATES)])
    assert.equal(res.result.coverage, 'insufficient_sample')
    assert.equal(JSON.stringify(res.result).includes('1867'), false)
  })

  test('exactly 3 firms at exactly 50% still publishes (the rule is >= 3 and <= 50%)', () => {
    const res = pay([NATIONAL, STATE, cell('city', 1867, { status: 'verified', distinctFirms: 3, maxFirmShare: 0.5 })])
    assert.equal(res.result.coverage, 'publishable')
  })

  test('missing or unverified checks fail closed', () => {
    for (const checks of [undefined, null, {}, { status: 'unverified', distinctFirms: 9, maxFirmShare: 0.1 }]) {
      const res = pay([NATIONAL, STATE, cell('city', 1867, checks)])
      assert.notEqual(res.result.coverage, 'publishable', JSON.stringify(checks))
      assert.equal(res.result.typicalCents, undefined)
    }
  })

  test('no area cell at all: not yet available, California fallback', () => {
    const res = pay([NATIONAL, STATE])
    assert.equal(res.result.coverage, 'not_yet_available')
    assert.equal(res.fallback.typicalCents, 2100)
  })

  test('pay is public site-wide, so a signed-out viewer sees the same published area figure', () => {
    const res = pay([NATIONAL, STATE, cell('city', 1867, PASS)], 'public')
    assert.equal(res.result.coverage, 'publishable')
    assert.equal(res.result.typicalCents, 1867)
  })

  test('the response never carries firm names, shares or the pooled city list', () => {
    const text = JSON.stringify(pay([NATIONAL, STATE, cell('city', 1867, PASS)]))
    for (const word of ['maxFirmShare', 'distinctFirms', 'Fontana', 'Riverside"', 'Corona']) {
      assert.equal(text.includes(word), false, word)
    }
  })

  test('REAL_PLACES resolves the area like a city', () => {
    const p = REAL_PLACES.city(KEY)
    assert.equal(p.label, 'Inland Empire, CA')
    assert.equal(p.covers, 'Riverside + San Bernardino counties')
    assert.equal('covers' in REAL_PLACES.city('CA:los-angeles'), false)
  })
})

describe('monthly email', () => {
  const ok = { status: 'verified', distinctFirms: 8, maxFirmShare: 0.2 }
  const row = (roleKey, typicalCents) => ({
    roleKey, level: 'city', state: 'CA', city: KEY, n: 60, p25Cents: typicalCents - 200, typicalCents, p75Cents: typicalCents + 200, checks: ok
  })
  const month = (m, pay) => ({
    format: 'staffing-signal-monthly-aggregates', schemaVersion: 1, calcVersion: 'signal-month-2.0.0', baseCalcVersion: 'x', month: m,
    reliability: { reliable: true }, totals: { postings: 10000, firms: 900, payObservations: 5000 }, roleStatus: {}, pay,
    demand: { states: [], cities: [], roles: [] }
  })

  test('a subscriber whose area is Inland Empire gets the area section when it has pay moves', () => {
    const report = buildReport(
      month('2026-09', [row('forklift-operator', 2200), row('warehouse-associate', 1900)]),
      month('2026-08', [row('forklift-operator', 2000), row('warehouse-associate', 1900)])
    )
    const local = localFor(report, { state: 'CA', cityKey: KEY })
    assert.equal(local.level, 'city')
    assert.equal(local.section.name, 'Inland Empire, CA')
    assert.deepEqual(local.section.payMoves.map((m) => m.roleKey), ['forklift-operator'])
  })

  test('with no area data that month the email falls back to the state, never to a wrong place', () => {
    const report = buildReport(month('2026-09', []), month('2026-08', []))
    assert.notEqual(localFor(report, { state: 'CA', cityKey: KEY }).level, 'city')
  })

  test('the saved sign-up label maps back to the area key', async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'inland-empire-test-secret-not-real'
    const { cityKeyFromStored } = await import('../../api/_lib/subscribers.js')
    assert.equal(cityKeyFromStored('CA', 'Inland Empire, CA'), KEY)
    assert.equal(cityKeyFromStored('CA', 'Inland Empire'), KEY)
  })
})
