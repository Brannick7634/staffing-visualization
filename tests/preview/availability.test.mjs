import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localAvailabilityNote } from '../../shared/signal/availability.js'
import { validateSnapshot } from '../../api/_lib/signal/productionAdapter.js'
import { buildSnapshotResponse } from '../../api/_lib/signal/service.js'

const raw = JSON.parse(readFileSync(new URL('../../api/_lib/signal/data/signal-snapshot.json', import.meta.url), 'utf8'))
const data = validateSnapshot(raw, { now: Date.parse(raw.generatedAt) })
const avail = buildSnapshotResponse({ data, dataMode: 'production', viewer: null }).localAvailability

test('bundled snapshot: local availability for the audited roles matches roleCoverage', () => {
  for (const key of ['forklift-operator', 'general-laborer', 'warehouse-associate', 'registered-nurse']) {
    const rc = raw.roleCoverage[key]
    const a = avail[key] || { states: [], cities: [] }
    assert.equal(a.states.length, rc.stateCells, key)
    assert.equal(a.cities.length, rc.cityCells, key)
  }
})

test('notes never promise a local value that is not published', () => {
  const n = (o) => localAvailabilityNote({ availability: avail, roleLabel: 'Job', ...o })
  assert.match(n({ roleKey: 'forklift-operator', state: 'TX', stateName: 'Texas' }), /No Texas benchmark .* nationwide figure/)
  assert.match(n({ roleKey: 'forklift-operator', state: 'OH', stateName: 'Ohio' }), /Ohio has a published benchmark/)
  assert.match(n({ roleKey: 'warehouse-associate', state: 'NY', city: 'NY:new-york', stateName: 'New York', cityName: 'New York' }), /New York has a published benchmark/)
  assert.match(n({ roleKey: 'registered-nurse', state: 'CA', city: 'CA:los-angeles', stateName: 'California', cityName: 'Los Angeles' }), /No Los Angeles benchmark .* California figure instead/)
  assert.match(n({ roleKey: 'general-laborer', state: 'VA', city: 'VA:richmond', stateName: 'Virginia', cityName: 'Richmond' }), /Virginia figure instead/)
  assert.match(n({ roleKey: 'general-laborer' }), /1 state \(Virginia\), no cities yet/)
  assert.match(n({ roleKey: 'no-such-role' }), /nationwide figure only/)
  assert.equal(localAvailabilityNote({ availability: undefined, roleKey: 'x' }), null)
})
