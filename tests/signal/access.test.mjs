import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  PUBLIC_PREVIEW, normalizeViewerAccess, canShowFigures, payAccess,
  rankCities, rankHeating, rankCooling, publicAllowlist
} from '../../api/_lib/signal/access.js'
import { buildSnapshotResponse } from '../../api/_lib/signal/service.js'
import { createFixtureAdapter } from '../../dev/signal/fixtureAdapter.js'

const GATED_CITY_NAMES = ['Chicago', 'Baltimore', 'Houston', 'Atlanta', 'Charlotte']
const GATED_STATE_NAMES = ['Virginia', 'Maryland']
const GATED_VALUES = ['611', '559', '534', '502', '498', '-37', '-40', '-42']

async function fixtureSnapshot(access) {
  const adapter = createFixtureAdapter()
  const { data } = await adapter.load()
  return buildSnapshotResponse({ data, dataMode: adapter.dataMode, viewer: { access, simulated: true } })
}

describe('access policy primitives', () => {
  test('public preview sizes are top 5 heating states and top 3 cities', () => {
    assert.equal(PUBLIC_PREVIEW.heatingStates, 5)
    assert.equal(PUBLIC_PREVIEW.cities, 3)
  })

  test('anything other than "authorized" is public', () => {
    for (const value of [undefined, null, '', 'AUTHORIZED', 'requires_free_account', 'admin', 1, {}]) {
      assert.equal(normalizeViewerAccess(value), 'public')
    }
    assert.equal(normalizeViewerAccess('authorized'), 'authorized')
  })

  test('pay is public at every level, signed out or in (local pay is free)', () => {
    for (const level of ['nationwide', 'state', 'city']) {
      for (const viewer of ['public', 'authorized', undefined]) {
        assert.equal(payAccess(level, viewer), 'public', `${level}/${viewer}`)
      }
    }
  })

  test('figures only for public or authorized access', () => {
    assert.equal(canShowFigures('public'), true)
    assert.equal(canShowFigures('authorized'), true)
    assert.equal(canShowFigures('requires_free_account'), false)
    assert.equal(canShowFigures(undefined), false)
  })

  test('cooling is ranked by size of decline; heating by strength', () => {
    const rows = [
      { code: 'VA', momentumPct: -37 }, { code: 'DC', momentumPct: -40 }, { code: 'MD', momentumPct: -42 },
      { code: 'AL', momentumPct: 142 }, { code: 'IN', momentumPct: 90 }, { code: 'XX', momentumPct: 0 }
    ]
    assert.deepEqual(rankCooling(rows).map((r) => r.code), ['MD', 'DC', 'VA'])
    assert.deepEqual(rankHeating(rows).map((r) => r.code), ['AL', 'IN'])
  })

  test('allowlist comes from the top of the default rankings only', () => {
    const cities = rankCities([
      { cityKey: 'B', postings: 10 }, { cityKey: 'A', postings: 30 }, { cityKey: 'C', postings: 20 }, { cityKey: 'D', postings: 5 }
    ])
    const heating = rankHeating([
      { code: 'S1', momentumPct: 1 }, { code: 'S2', momentumPct: 2 }, { code: 'S3', momentumPct: 3 },
      { code: 'S4', momentumPct: 4 }, { code: 'S5', momentumPct: 5 }, { code: 'S6', momentumPct: 6 }
    ])
    const allow = publicAllowlist({ rankedCities: cities, rankedHeating: heating })
    assert.deepEqual([...allow.cityKeys], ['A', 'C', 'B'])
    assert.deepEqual([...allow.heatingCodes], ['S6', 'S5', 'S4', 'S3', 'S2'])
  })
})

describe('signed-out snapshot (development fixture)', () => {
  test('exactly 3 city rows, 5 heating rows and no cooling rows', async () => {
    const snap = await fixtureSnapshot('public')
    assert.equal(snap.viewer.access, 'public')
    assert.deepEqual(snap.cities.rows.map((r) => r.key), ['NY:new-york', 'DC:washington', 'CA:los-angeles'])
    assert.deepEqual(snap.cities.rows.map((r) => r.postings), [3308, 1852, 810])
    assert.ok(snap.cities.rows.every((r) => r.access === 'public'))
    assert.deepEqual(snap.cities.more, { access: 'requires_free_account', description: 'Unlock the full city rankings.' })
    assert.deepEqual(snap.momentum.heating.rows.map((r) => [r.code, r.momentumPct]), [['AL', 142], ['CA', 135], ['AZ', 121], ['IL', 93], ['IN', 90]])
    assert.deepEqual(snap.momentum.cooling, { access: 'requires_free_account', rows: [] })
  })

  test('payload contains no gated city or state names or values', async () => {
    const json = JSON.stringify(await fixtureSnapshot('public'))
    for (const word of [...GATED_CITY_NAMES, ...GATED_STATE_NAMES, ...GATED_VALUES]) {
      assert.equal(json.includes(word), false, `signed-out snapshot leaked ${word}`)
    }
  })

  test('the gated "more" entry carries no count', async () => {
    const { more } = (await fixtureSnapshot('public')).cities
    assert.deepEqual(Object.keys(more).sort(), ['access', 'description'])
  })
})

describe('authorized snapshot (development fixture)', () => {
  test('all 8 cities and 3 cooling rows ordered by decline', async () => {
    const snap = await fixtureSnapshot('authorized')
    assert.equal(snap.cities.rows.length, 8)
    assert.deepEqual(snap.cities.rows.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7, 8])
    assert.deepEqual(snap.cities.rows.slice(3).map((r) => r.access), ['authorized', 'authorized', 'authorized', 'authorized', 'authorized'])
    assert.equal(snap.cities.more, null)
    assert.equal(snap.momentum.cooling.access, 'authorized')
    assert.deepEqual(snap.momentum.cooling.rows.map((r) => [r.rank, r.code, r.momentumPct]), [[1, 'MD', -42], [2, 'DC', -40], [3, 'VA', -37]])
  })
})
