// Metro areas (county-pooled pay benchmarks) on the site side: the picker list must match the
// export's registry exactly, every listing must resolve like a city, and pay lookups obey the gate.
// The pooling itself is tested in tests/python/test_signal_areas.py. ALL FIGURES HERE ARE SYNTHETIC.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  CITIES, citiesForState, cityByKey, isValidSelection, geographyLabel, isArea, pickerLabel
} from '../../shared/signal/geography.js'
import { checkArea, findListedCity } from '../../shared/signal/area.js'
import { buildPayResponse, REAL_PLACES } from '../../api/_lib/signal/service.js'
import { validatePaySelection } from '../../api/_lib/signal/handlers.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const python = ['python', 'python3'].find((cmd) => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0)
const areas = CITIES.filter(isArea)

describe('picker list matches the export registry', { skip: python ? false : 'python not installed' }, () => {
  test('same listings, names, states and coverage text (python scripts/signal_regions.py --dump)', () => {
    const r = spawnSync(python, ['scripts/signal_regions.py', '--dump'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
    assert.equal(r.status, 0, (r.stderr || '').slice(-1500))
    const expected = JSON.parse(r.stdout)
    const sort = (list) => [...list].sort((a, b) => (a.key < b.key ? -1 : 1))
    assert.deepEqual(sort(areas.map(({ key, name, state, area }) => ({ key, name, state, area }))), sort(expected))
  })
})

describe('areas in the picker', () => {
  test('there are many areas, each a listed pick in a real state', () => {
    assert.ok(areas.length >= 40)
    for (const place of areas) {
      assert.equal(isValidSelection(place.state, place.key), true, place.key)
      assert.equal(cityByKey(place.key).area, place.area)
      assert.ok(place.area.length > 8)
    }
  })

  test('areas follow a state\'s cities in the list', () => {
    for (const code of new Set(areas.map((a) => a.state))) {
      const list = citiesForState(code)
      const firstArea = list.findIndex(isArea)
      assert.ok(list.slice(firstArea).every(isArea), `${code}: a city appears after an area`)
    }
  })

  test('a metro that crosses a state line is listed under each state, with a label that names that state', () => {
    for (const key of ['DC:greater-washington', 'VA:greater-washington', 'MD:greater-washington']) {
      assert.equal(isArea(cityByKey(key)), true, key)
    }
    assert.equal(geographyLabel('VA', 'VA:greater-washington'), 'Greater Washington, VA')
    assert.equal(geographyLabel('NJ', 'NJ:greater-new-york'), 'Greater New York, NJ')
    assert.equal(isValidSelection('TX', 'VA:greater-washington'), false)
    assert.equal(isValidSelection('VA', 'MD:greater-washington'), false)
  })

  test('picker text names what the area covers', () => {
    assert.equal(pickerLabel(cityByKey('TX:greater-houston')), 'Greater Houston (Harris, Fort Bend, Montgomery + nearby counties)')
  })

  test('area names are unique within a state and never repeat a city name', () => {
    for (const code of new Set(areas.map((a) => a.state))) {
      const names = citiesForState(code).map((c) => c.name.toLowerCase())
      assert.equal(new Set(names).size, names.length, code)
    }
  })

  test('a typed area name finds the listed area; a plain city name still finds the city', () => {
    assert.equal(findListedCity('TX', 'Greater Houston').key, 'TX:greater-houston')
    assert.equal(findListedCity('TX', 'Houston').key, 'TX:houston')
    const picked = checkArea('VA', 'VA:greater-washington')
    assert.equal(picked.ok, true)
    assert.equal(picked.label, 'Greater Washington, VA')
    assert.equal(checkArea('MD', 'VA:greater-washington').ok, false)
  })
})

describe('pay lookup for a metro', () => {
  const KEY = 'VA:greater-washington'
  const PASS = { status: 'verified', distinctFirms: 14, maxFirmShare: 0.2 }
  const FEW = { status: 'verified', distinctFirms: 2, maxFirmShare: 0.5 }
  const cell = (level, typicalCents, checks, extra = {}) => ({
    roleKey: 'warehouse-associate', level, state: level === 'nationwide' ? null : 'VA', city: level === 'city' ? KEY : null,
    p25Cents: typicalCents - 150, typicalCents, p75Cents: typicalCents + 200, payBasis: 'hourly', currency: 'USD', observations: 31, checks, ...extra
  })
  const NATIONAL = cell('nationwide', 1900, { status: 'verified', distinctFirms: 90, maxFirmShare: 0.05 })
  const STATE = cell('state', 2000, { status: 'verified', distinctFirms: 30, maxFirmShare: 0.1 })
  const pay = (cells, request = { roleKey: 'warehouse-associate', state: 'VA', city: KEY }) =>
    buildPayResponse({ data: { pay: cells }, dataMode: 'production', viewer: { access: 'authorized' }, request })

  test('endpoint validation accepts a listing only under its own state', () => {
    assert.equal(validatePaySelection({ role: 'warehouse-associate', state: 'VA', city: KEY }).ok, true)
    assert.equal(validatePaySelection({ role: 'warehouse-associate', state: 'MD', city: KEY }).ok, false)
  })

  test('a published metro cell answers as an area with its figures', () => {
    const res = pay([NATIONAL, STATE, cell('city', 2150, PASS)])
    assert.equal(res.result.coverage, 'publishable')
    assert.equal(res.result.geography.label, 'Greater Washington, VA')
    assert.equal(res.result.geography.covers, 'DC, northern Virginia + Maryland suburbs')
    assert.equal(res.result.typicalCents, 2150)
  })

  test('too few firms: withheld, state figure offered instead', () => {
    const res = pay([NATIONAL, STATE, cell('city', 2150, FEW)])
    assert.equal(res.result.coverage, 'insufficient_sample')
    assert.equal(res.fallback.typicalCents, 2000)
  })

  test('another state\'s listing is a separate cell: a VA cell does not answer for MD', () => {
    const md = { roleKey: 'warehouse-associate', state: 'MD', city: 'MD:greater-washington' }
    const res = pay([NATIONAL, STATE, cell('city', 2150, PASS)], md)
    assert.notEqual(res.result.coverage, 'publishable')
  })

  test('REAL_PLACES resolves every listing', () => {
    for (const place of areas) {
      const p = REAL_PLACES.city(place.key)
      assert.equal(p.covers, place.area, place.key)
      assert.equal(p.label, `${place.name}, ${place.state}`)
    }
  })
})
