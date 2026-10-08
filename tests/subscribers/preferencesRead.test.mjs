// GET /api/preferences (the saved settings the Preferences page loads) and
// the round trip: a save made from the loaded values keeps what was saved.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createPreferencesHandler, preferencesFromRecord } from '../../api/_lib/routes/preferences.js'
import { F } from '../../api/_lib/subscribers.js'
import { sessionToken, passwordFingerprint, SESSION_COOKIE } from '../../api/_lib/signalSession.js'
import { createDevPreferencesHandler } from '../../dev/signal/devEndpoints.js'
import { savedArea, pickerFromSavedArea, pickerChanged, pickerToRequest, followedStatesForArea, CITY_OTHER } from '../../shared/signal/area.js'

const SECRET = 'test-secret-'.padEnd(40, 'x')
const ENV = { AIRTABLE_API_KEY: 'patTEST', SIGNAL_SESSION_SECRET: SECRET, SIGNAL_SITE_URL: 'https://signal.example' }
const HASH = '$2a$04$abcdefghijklmnopqrstuuSECRETHASHVALUExxxxxxxxxxxxxxxxx'
const ALLOWED_KEYS = ['name', 'area', 'newsletter', 'unsubscribed', 'sectors', 'states', 'cities']

// A session started with the stored password (fingerprint matches HASH).
const cookieFor = (email, hash = HASH) => `${SESSION_COOKIE}=${sessionToken(email, SECRET, Date.now(), passwordFingerprint(hash, SECRET))}`

function mockAirtable(rows) {
  const calls = { reads: 0, writes: [] }
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url)
    const ok = (data) => ({ ok: true, status: 200, json: async () => data })
    if (!opts.method || opts.method === 'GET') {
      calls.reads++
      const email = /="(.*)"$/.exec(u.searchParams.get('filterByFormula'))[1]
      return ok({ records: rows.filter((r) => r.fields[F.email].toLowerCase() === email) })
    }
    const body = JSON.parse(opts.body)
    calls.writes.push(body)
    for (const r of body.records) Object.assign(rows.find((x) => x.id === r.id).fields, r.fields)
    return ok({ records: body.records })
  }
  return { fetchImpl, rows, calls }
}

const call = (handler, { method = 'GET', body, cookie, contentType } = {}) => new Promise((resolve) => {
  const headers = {}
  const res = {
    statusCode: 200,
    setHeader: (k, v) => { headers[k.toLowerCase()] = v },
    end: (b) => resolve({ status: res.statusCode, headers, raw: b || '', body: b ? JSON.parse(b) : null })
  }
  const type = contentType !== undefined ? contentType : (method === 'POST' ? 'application/json' : null)
  Promise.resolve(handler({ method, body, headers: { ...(type ? { 'content-type': type } : {}), ...(cookie ? { cookie } : {}) } }, res))
})

const row = (fields) => ({ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.passwordHash]: HASH, ...fields } })

// What PreferencesPage sends after loading, with nothing touched: the lists
// as loaded (area state kept on States), no newsletter, no area.
function untouchedPayload(loaded) {
  const picker = pickerFromSavedArea(loaded.area)
  assert.equal(pickerChanged(picker, pickerFromSavedArea(loaded.area)), false)
  const states = picker.state && !loaded.states.includes(picker.state) ? [picker.state, ...loaded.states] : loaded.states
  return { sectors: loaded.sectors, states, cities: loaded.cities.filter((k) => states.includes(k.slice(0, 2))), alerts: 'off' }
}

describe('GET /api/preferences', () => {
  test('requires a session started with the current password: 401 sign_in_required, no-store', async () => {
    const m = mockAirtable([row({ [F.states]: 'TX', [F.city]: 'Houston, TX' })])
    const h = createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl })
    const none = await call(h)
    assert.equal(none.status, 401)
    assert.equal(none.body.error.code, 'sign_in_required')
    assert.equal(none.headers['cache-control'], 'no-store')
    assert.equal(m.calls.reads, 0, 'no session, nothing read')
    const forged = await call(h, { cookie: `${cookieFor('ann@firm.com')}x` })
    assert.equal(forged.status, 401)
    // Session from before the current password (fingerprint of another hash).
    const stale = await call(h, { cookie: cookieFor('ann@firm.com', '$2a$04$an.older.password.hash') })
    assert.equal(stale.status, 401)
    assert.equal(stale.body.error.code, 'sign_in_required')
    assert.equal(stale.headers['cache-control'], 'no-store')
    assert.equal(stale.raw.includes('Houston'), false)
    // Pre-password session (no fingerprint) once a password is stored.
    assert.equal((await call(h, { cookie: `${SESSION_COOKIE}=${sessionToken('ann@firm.com', SECRET)}` })).status, 401)
    // No row for the session's email.
    assert.equal((await call(h, { cookie: cookieFor('nobody@firm.com') })).status, 401)
    assert.equal(m.calls.writes.length, 0)
  })

  test('returns the saved listed city, newsletter and followed lists', async () => {
    const m = mockAirtable([row({
      [F.name]: 'Ann Lee',
      [F.states]: 'TX\nCA\nTX:houston\nCA:los-angeles',
      [F.city]: 'Houston, TX',
      [F.newsletter]: true,
      [F.sectors]: 'healthcare\nconstruction'
    })])
    const r = await call(createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl }), { cookie: cookieFor('ann@firm.com') })
    assert.equal(r.status, 200)
    assert.equal(r.headers['cache-control'], 'no-store')
    assert.deepEqual(r.body, {
      name: 'Ann Lee',
      area: { state: 'TX', cityKey: 'TX:houston', typedCity: null, label: 'Houston, TX' },
      newsletter: true,
      sectors: ['healthcare', 'construction'],
      states: ['TX', 'CA'],
      cities: ['TX:houston', 'CA:los-angeles']
    })
  })

  test('returns a typed city as typedCity (shown in the "My city isn’t listed" box)', async () => {
    const m = mockAirtable([row({ [F.states]: 'TX', [F.city]: 'Katy, TX', [F.newsletter]: false })])
    const r = await call(createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl }), { cookie: cookieFor('ann@firm.com') })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.area, { state: 'TX', cityKey: null, typedCity: 'Katy', label: 'Katy, TX' })
    assert.equal(r.body.newsletter, false)
    assert.deepEqual(pickerFromSavedArea(r.body.area), { state: 'TX', city: CITY_OTHER, cityText: 'Katy' })
  })

  test('never returns the password hash, email or any other column', async () => {
    const m = mockAirtable([row({
      [F.name]: 'Ann',
      [F.company]: 'Firm Co',
      [F.source]: 'pay-first',
      [F.verified]: true,
      [F.signedUpAt]: '2026-09-01T00:00:00.000Z',
      [F.lastSignInAt]: '2026-10-01T00:00:00.000Z',
      [F.passwordSetAt]: '2026-09-01T00:00:00.000Z',
      [F.unsubscribed]: true,
      [F.unsubscribedAt]: '2026-09-15T00:00:00.000Z',
      [F.reportEmailDay]: '2026-10-08',
      [F.reportEmailCount]: 3,
      [F.newsletter]: true,
      [F.states]: 'TX',
      [F.city]: 'Houston, TX'
    })])
    const r = await call(createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl }), { cookie: cookieFor('ann@firm.com') })
    assert.equal(r.status, 200)
    for (const key of Object.keys(r.body)) assert.ok(ALLOWED_KEYS.includes(key), key)
    for (const secret of [HASH, 'ann@firm.com', 'Firm Co', 'pay-first', '2026-', 'rec1', 'fld']) assert.equal(r.raw.includes(secret), false, secret)
    // Unsubscribed by link: no email goes out, so the box shows unticked,
    // and the flag lets the page lock it and say why.
    assert.equal(r.body.newsletter, false)
    assert.equal(r.body.unsubscribed, true)
    assert.equal('unsubscribed' in preferencesFromRecord({ [F.newsletter]: true }), false)
  })

  test('no saved area -> area null; an older state-only sign-up -> state, no city', async () => {
    assert.equal(preferencesFromRecord({ [F.states]: '', [F.city]: '' }).area, null)
    assert.deepEqual(preferencesFromRecord({}), { area: null, newsletter: false, sectors: [], states: [], cities: [] })
    assert.deepEqual(preferencesFromRecord({ [F.states]: 'TX\nCA' }).area, { state: 'TX', cityKey: null, typedCity: null, label: 'Texas' })
    assert.deepEqual(pickerFromSavedArea({ state: 'TX', cityKey: null, typedCity: null }), { state: 'TX', city: '', cityText: '' })
    // A state with no listed cities goes straight to the typed-city box.
    assert.deepEqual(pickerFromSavedArea({ state: 'AK', cityKey: null, typedCity: null }), { state: 'AK', city: CITY_OTHER, cityText: '' })
    assert.deepEqual(pickerFromSavedArea(null), { state: '', city: '', cityText: '' })
  })

  test('PUT -> 405 (GET, POST); POST still needs JSON', async () => {
    const h = createPreferencesHandler({ env: ENV, fetchImpl: mockAirtable([]).fetchImpl })
    const put = await call(h, { method: 'PUT', cookie: cookieFor('ann@firm.com') })
    assert.equal(put.status, 405)
    assert.equal(put.headers.allow, 'GET, POST')
    assert.equal((await call(h, { method: 'POST', body: '{}', contentType: 'text/plain', cookie: cookieFor('ann@firm.com') })).status, 415)
    assert.equal((await call(createPreferencesHandler({ env: {}, fetchImpl: mockAirtable([]).fetchImpl }))).status, 503)
  })
})

describe('saved area parsing (shared/signal/area.js)', () => {
  test('stored labels and lines -> the area the form shows', () => {
    assert.deepEqual(savedArea('TX', 'Houston, TX'), { state: 'TX', cityKey: 'TX:houston', typedCity: null, label: 'Houston, TX' })
    assert.deepEqual(savedArea('MO', 'St. Louis, MO'), { state: 'MO', cityKey: 'MO:st-louis', typedCity: null, label: 'St. Louis, MO' })
    assert.deepEqual(savedArea('OK\nTX', 'Broken Arrow, OK'), { state: 'OK', cityKey: null, typedCity: 'Broken Arrow', label: 'Broken Arrow, OK' })
    // An older bare city name: the first States line is the home state.
    assert.deepEqual(savedArea('TX\nCA', 'Dallas'), { state: 'TX', cityKey: 'TX:dallas', typedCity: null, label: 'Dallas, TX' })
    // The City label's state wins over a first line saved from a search.
    assert.equal(savedArea('CA\nTX', 'Katy, TX').state, 'TX')
    assert.equal(savedArea('', ''), null)
    assert.equal(savedArea(undefined, undefined), null)
  })

  test('pickerChanged: untouched (or a re-typed same city) is not a change', () => {
    const typed = { state: 'TX', city: CITY_OTHER, cityText: 'Katy' }
    assert.equal(pickerChanged({ ...typed, cityText: ' Katy ' }, typed), false)
    assert.equal(pickerChanged({ ...typed, cityText: 'Cypress' }, typed), true)
    assert.equal(pickerChanged({ state: 'TX', city: 'TX:dallas', cityText: 'old' }, { state: 'TX', city: 'TX:dallas', cityText: '' }), false)
    assert.equal(pickerChanged({ state: '', city: '', cityText: '' }, typed), true)
  })
})

describe('followed states when the area moves (followedStatesForArea)', () => {
  test('the old area state leaves unless followed in its own right; the new one joins first', () => {
    // Houston, TX -> Denver, CO: TX was only there as the area.
    assert.deepEqual(followedStatesForArea(['TX'], [], 'TX', 'CO', []), ['CO'])
    assert.deepEqual(followedStatesForArea(['TX', 'CA'], ['CA:los-angeles'], 'TX', 'CO', ['CA']), ['CO', 'CA'])
    // A followed city in the old state keeps it.
    assert.deepEqual(followedStatesForArea(['TX'], ['TX:dallas'], 'TX', 'CO', []), ['CO', 'TX'])
    // Moving onto a followed state, then back: that state stays followed.
    const onto = followedStatesForArea(['TX', 'CO'], [], 'TX', 'CO', ['CO'])
    assert.deepEqual(onto, ['CO'])
    assert.deepEqual(followedStatesForArea(onto, [], 'CO', 'TX', ['CO']), ['TX', 'CO'])
    // Same state, or the state cleared.
    const same = ['TX', 'CA']
    assert.equal(followedStatesForArea(same, [], 'TX', 'TX', []), same)
    assert.deepEqual(followedStatesForArea(['TX', 'CA'], [], 'TX', '', ['CA']), ['CA'])
    assert.deepEqual(followedStatesForArea([], [], '', 'TX', []), ['TX'])
  })
})

describe('save after load keeps untouched values', () => {
  for (const [label, fields] of [
    ['listed city', { [F.states]: 'TX\nCA\nTX:houston', [F.city]: 'Houston, TX', [F.newsletter]: true, [F.sectors]: 'healthcare\nlegacy-sector' }],
    ['typed city', { [F.states]: 'OK\nTX\nTX:dallas', [F.city]: 'Broken Arrow, OK', [F.newsletter]: false, [F.sectors]: 'construction' }],
    ['state only (older sign-up)', { [F.states]: 'TX\nNV', [F.newsletter]: true }],
    ['unsubscribed', { [F.states]: 'TX', [F.city]: 'Katy, TX', [F.newsletter]: false, [F.unsubscribed]: true }]
  ]) {
    test(label, async () => {
      const m = mockAirtable([row(fields)])
      const before = { ...m.rows[0].fields }
      const h = createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl })
      const cookie = cookieFor('ann@firm.com')
      const loaded = (await call(h, { cookie })).body
      const saved = await call(h, { method: 'POST', cookie, body: untouchedPayload(loaded) })
      assert.equal(saved.status, 200)
      for (const f of [F.states, F.city, F.newsletter, F.unsubscribed]) assert.equal(m.rows[0].fields[f], before[f], f)
      assert.equal(m.rows[0].fields[F.sectors] || '', before[F.sectors] || '')
      assert.deepEqual((await call(h, { cookie })).body, loaded)
    })
  }

  test('changing only sectors keeps the area, newsletter and followed markets', async () => {
    const m = mockAirtable([row({ [F.states]: 'TX\nCA\nCA:los-angeles', [F.city]: 'Katy, TX', [F.newsletter]: true, [F.sectors]: 'healthcare' })])
    const h = createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl })
    const cookie = cookieFor('ann@firm.com')
    const loaded = (await call(h, { cookie })).body
    await call(h, { method: 'POST', cookie, body: { ...untouchedPayload(loaded), sectors: ['healthcare', 'construction'] } })
    const after = (await call(h, { cookie })).body
    assert.deepEqual(after, { ...loaded, sectors: ['healthcare', 'construction'] })
    assert.equal(m.rows[0].fields[F.states], 'TX\nCA\nCA:los-angeles')
  })

  test('adding a city to a state-only area: the edited area is saved, the rest kept', async () => {
    const m = mockAirtable([row({ [F.states]: 'TX\nNV', [F.newsletter]: true, [F.sectors]: 'healthcare' })])
    const h = createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl })
    const cookie = cookieFor('ann@firm.com')
    const loaded = (await call(h, { cookie })).body
    const picker = { ...pickerFromSavedArea(loaded.area), city: CITY_OTHER, cityText: 'Katy' }
    assert.equal(pickerChanged(picker, pickerFromSavedArea(loaded.area)), true)
    const home = pickerToRequest(picker)
    const r = await call(h, { method: 'POST', cookie, body: { ...untouchedPayload(loaded), homeState: home.state, homeCity: home.city } })
    assert.equal(r.status, 200)
    const after = (await call(h, { cookie })).body
    assert.deepEqual(after.area, { state: 'TX', cityKey: null, typedCity: 'Katy', label: 'Katy, TX' })
    assert.deepEqual({ ...after, area: null }, { ...loaded, area: null })
  })
})

describe('dev fake serves the same GET', () => {
  const SIGNED_IN = 'ssp_sim_access=authorized'
  test('401 without the simulated sign-in; seed is Houston, TX; saves are read back', async () => {
    const h = createDevPreferencesHandler()
    const out = await call(h)
    assert.equal(out.status, 401)
    assert.equal(out.body.error.code, 'sign_in_required')
    const first = await call(h, { cookie: SIGNED_IN })
    assert.equal(first.status, 200)
    assert.deepEqual(first.body.area, { state: 'TX', cityKey: 'TX:houston', typedCity: null, label: 'Houston, TX' })
    for (const key of Object.keys(first.body)) assert.ok(ALLOWED_KEYS.includes(key), key)
    // Like production, a save without the (simulated) sign-in is refused and changes nothing.
    const refused = await call(h, { method: 'POST', body: { ...untouchedPayload(first.body), states: ['CA'], homeState: 'CA', homeCity: 'CA:los-angeles' } })
    assert.equal(refused.status, 401)
    assert.equal(refused.body.error.code, 'sign_in_required')
    assert.deepEqual((await call(h, { cookie: SIGNED_IN })).body, first.body)
    // Untouched save keeps everything.
    assert.equal((await call(h, { method: 'POST', cookie: SIGNED_IN, body: untouchedPayload(first.body) })).status, 200)
    assert.deepEqual((await call(h, { cookie: SIGNED_IN })).body, first.body)
    // Typed city + newsletter off + another state followed.
    await call(h, { method: 'POST', cookie: SIGNED_IN, body: { ...untouchedPayload(first.body), states: ['TX', 'CA'], newsletter: false, homeState: 'TX', homeCity: 'Katy' } })
    const after = (await call(h, { cookie: SIGNED_IN })).body
    assert.deepEqual(after.area, { state: 'TX', cityKey: null, typedCity: 'Katy', label: 'Katy, TX' })
    assert.equal(after.newsletter, false)
    assert.deepEqual(after.states, ['TX', 'CA'])
    // A fresh handler starts from the seed (state is per handler, in memory).
    assert.equal((await call(createDevPreferencesHandler({ saved: {} }), { cookie: SIGNED_IN })).body.area, null)
  })
})

