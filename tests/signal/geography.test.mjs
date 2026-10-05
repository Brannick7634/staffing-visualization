import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  STATES, CITIES, stateByCode, citiesForState, cityByKey, isValidSelection, geographyLabel
} from '../../shared/signal/geography.js'

const CITY_KEY = /^[A-Z]{2}:[a-z0-9]+(?:-[a-z0-9]+)*$/

// The eight supplied city-volume rows (city, state code).
const SUPPLIED_CITIES = [
  ['NY:new-york', 'New York', 'NY'],
  ['DC:washington', 'Washington', 'DC'],
  ['CA:los-angeles', 'Los Angeles', 'CA'],
  ['IL:chicago', 'Chicago', 'IL'],
  ['MD:baltimore', 'Baltimore', 'MD'],
  ['TX:houston', 'Houston', 'TX'],
  ['GA:atlanta', 'Atlanta', 'GA'],
  ['NC:charlotte', 'Charlotte', 'NC']
]

describe('states', () => {
  test('50 states plus DC, unique codes and names', () => {
    assert.equal(STATES.length, 51)
    const codes = STATES.map((state) => state.code)
    assert.equal(new Set(codes).size, 51)
    assert.equal(new Set(STATES.map((state) => state.name)).size, 51)
    assert.ok(codes.includes('DC'))
    for (const code of codes) assert.match(code, /^[A-Z]{2}$/)
  })

  test('alphabetical by name for the picker', () => {
    const names = STATES.map((state) => state.name)
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')))
  })

  test('shape is { code, name } only', () => {
    for (const state of STATES) assert.deepEqual(Object.keys(state).sort(), ['code', 'name'])
  })

  test('no territories', () => {
    for (const code of ['PR', 'GU', 'VI', 'AS', 'MP']) assert.equal(stateByCode(code), null, code)
  })

  test('stateByCode', () => {
    assert.deepEqual({ ...stateByCode('TX') }, { code: 'TX', name: 'Texas' })
    assert.equal(stateByCode('DC').name, 'District of Columbia')
    assert.equal(stateByCode('tx'), null)
    assert.equal(stateByCode('XX'), null)
    assert.equal(stateByCode(''), null)
    assert.equal(stateByCode(undefined), null)
  })
})

describe('cities', () => {
  test('unique, well-formed keys whose prefix is the city state', () => {
    const keys = CITIES.map((city) => city.key)
    assert.equal(new Set(keys).size, keys.length)
    for (const city of CITIES) {
      assert.match(city.key, CITY_KEY)
      assert.equal(city.key.split(':')[0], city.state, city.key)
      assert.deepEqual(Object.keys(city).sort(), ['key', 'name', 'state'])
      assert.ok(city.name.length > 0)
    }
  })

  test('every city state exists', () => {
    for (const city of CITIES) assert.ok(stateByCode(city.state), city.key)
  })

  test('no duplicate city name within a state', () => {
    const seen = new Set()
    for (const city of CITIES) {
      const id = `${city.state}|${city.name.toLowerCase()}`
      assert.equal(seen.has(id), false, id)
      seen.add(id)
    }
  })

  test('includes the eight supplied cities with stable keys', () => {
    for (const [key, name, state] of SUPPLIED_CITIES) {
      const city = cityByKey(key)
      assert.ok(city, key)
      assert.equal(city.name, name)
      assert.equal(city.state, state)
    }
  })

  test('same-named cities in different states stay distinct', () => {
    assert.equal(cityByKey('IL:aurora').state, 'IL')
    assert.equal(cityByKey('CO:aurora').state, 'CO')
    assert.notEqual(cityByKey('SC:columbia'), cityByKey('MD:columbia'))
  })

  test('populous states have 3 to 6 picker cities', () => {
    for (const code of ['CA', 'TX', 'FL', 'NY', 'PA', 'IL', 'OH', 'GA', 'NC']) {
      const count = citiesForState(code).length
      assert.ok(count >= 3 && count <= 6, `${code}: ${count}`)
    }
  })

  test('citiesForState', () => {
    assert.equal(citiesForState('TX')[0].key, 'TX:houston')
    assert.ok(citiesForState('TX').every((city) => city.state === 'TX'))
    assert.deepEqual(citiesForState('DC').map((city) => city.key), ['DC:washington'])
    assert.deepEqual(citiesForState('WY'), [])
    assert.deepEqual(citiesForState('XX'), [])
    assert.deepEqual(citiesForState(undefined), [])
  })

  test('cityByKey', () => {
    assert.equal(cityByKey('TX:houston').name, 'Houston')
    assert.equal(cityByKey('houston'), null)
    assert.equal(cityByKey('tx:houston'), null)
    assert.equal(cityByKey('TX:nowhere'), null)
    assert.equal(cityByKey(undefined), null)
  })

  test('constants are frozen', () => {
    assert.ok(Object.isFrozen(STATES))
    assert.ok(Object.isFrozen(CITIES))
    assert.ok(CITIES.every((city) => Object.isFrozen(city)))
  })
})

describe('isValidSelection', () => {
  test('nationwide', () => {
    assert.equal(isValidSelection(null, null), true)
    assert.equal(isValidSelection(undefined, undefined), true)
    assert.equal(isValidSelection('', ''), true)
    assert.equal(isValidSelection(), true)
  })

  test('state only', () => {
    assert.equal(isValidSelection('TX', null), true)
    assert.equal(isValidSelection('DC', ''), true)
    assert.equal(isValidSelection('WY'), true)
  })

  test('state and matching city', () => {
    assert.equal(isValidSelection('TX', 'TX:houston'), true)
    assert.equal(isValidSelection('DC', 'DC:washington'), true)
    assert.equal(isValidSelection('NY', 'NY:new-york'), true)
  })

  test('rejects unknown states and cities', () => {
    assert.equal(isValidSelection('XX', null), false)
    assert.equal(isValidSelection('tx', null), false)
    assert.equal(isValidSelection('TX', 'TX:nowhere'), false)
    assert.equal(isValidSelection('TX', 'houston'), false)
  })

  test('rejects a city whose state prefix does not match', () => {
    assert.equal(isValidSelection('CA', 'TX:houston'), false)
    assert.equal(isValidSelection('CO', 'IL:aurora'), false)
  })

  test('rejects a city without its state', () => {
    assert.equal(isValidSelection(null, 'TX:houston'), false)
    assert.equal(isValidSelection('', 'TX:houston'), false)
  })
})

describe('geographyLabel', () => {
  test('labels by level', () => {
    assert.equal(geographyLabel(null, null), 'Nationwide')
    assert.equal(geographyLabel('TX', null), 'Texas')
    assert.equal(geographyLabel('TX', 'TX:houston'), 'Houston, TX')
    assert.equal(geographyLabel('DC', 'DC:washington'), 'Washington, DC')
    assert.equal(geographyLabel('NY', 'NY:new-york'), 'New York, NY')
  })

  test('null for an invalid selection', () => {
    assert.equal(geographyLabel('CA', 'TX:houston'), null)
    assert.equal(geographyLabel('XX', null), null)
    assert.equal(geographyLabel(null, 'TX:houston'), null)
  })
})
