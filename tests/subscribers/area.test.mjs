// Sign-up / preferences area (state + city): shared rules, the API routes and
// the dev fakes. No network: Airtable is an in-memory mock.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createSubscribeHandler } from '../../api/_lib/routes/subscribe.js'
import { createPreferencesHandler } from '../../api/_lib/routes/preferences.js'
import { F } from '../../api/_lib/subscribers.js'
import { sessionToken, SESSION_COOKIE } from '../../api/_lib/signalSession.js'
import { _resetRateLimits } from '../../api/_lib/security.js'
import { createDevSignupHandler, createDevAccountStore, createDevPreferencesHandler } from '../../dev/signal/devEndpoints.js'
import {
  CITY_OTHER, AREA_MESSAGES, checkArea, cleanCityText, pickerFromSelection, pickerWithState, pickerToRequest, checkPicker, findListedCity
} from '../../shared/signal/area.js'
import { subscriberArea } from '../../api/_lib/subscribers.js'

beforeEach(() => _resetRateLimits())

const SECRET = 'test-secret-'.padEnd(40, 'x')
const ENV = { AIRTABLE_API_KEY: 'patTEST', SIGNAL_SESSION_SECRET: SECRET, SIGNAL_SITE_URL: 'https://signal.example' }
const PW = 'area password 1'

function mockFetch(rows = []) {
  const calls = { writes: 0 }
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url)
    const ok = (data) => ({ ok: true, status: 200, json: async () => data })
    if (!opts.method || opts.method === 'GET') {
      const email = /="(.*)"$/.exec(u.searchParams.get('filterByFormula'))[1]
      return ok({ records: rows.filter((r) => r.fields[F.email].toLowerCase() === email) })
    }
    calls.writes++
    const body = JSON.parse(opts.body)
    if (opts.method === 'POST') {
      const rec = { id: `rec${rows.length + 1}`, createdTime: new Date(1_800_000_000_000 + rows.length).toISOString(), fields: { ...body.records[0].fields } }
      rows.push(rec)
      return ok({ records: [rec] })
    }
    for (const r of body.records) Object.assign(rows.find((x) => x.id === r.id).fields, r.fields)
    return ok({ records: body.records })
  }
  return { fetchImpl, rows, calls }
}

const call = (handler, { method = 'POST', body, cookie } = {}) => new Promise((resolve) => {
  const headers = {}
  const res = {
    statusCode: 200,
    setHeader: (k, v) => { headers[k.toLowerCase()] = v },
    end: (b) => resolve({ status: res.statusCode, headers, raw: b || '', body: b ? JSON.parse(b) : null })
  }
  Promise.resolve(handler({ method, body, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } }, res))
})

const person = { name: 'Ann', email: 'ann@firm.com', password: PW }

describe('shared area rules', () => {
  test('listed key, typed name, typed listed name, state suffix dropped', () => {
    assert.deepEqual(checkArea('TX', 'TX:houston'), { ok: true, state: 'TX', cityKey: 'TX:houston', cityName: 'Houston', label: 'Houston, TX', listed: true })
    assert.deepEqual(checkArea('tx', 'Katy'), { ok: true, state: 'TX', cityKey: null, cityName: 'Katy', label: 'Katy, TX', listed: false })
    assert.equal(checkArea('TX', 'HOUSTON').label, 'Houston, TX')
    assert.equal(checkArea('TX', 'Katy, TX').label, 'Katy, TX')
    assert.equal(checkArea('TX', 'Katy, Texas').label, 'Katy, TX')
    assert.equal(checkArea('TX', 'Katy TX').label, 'Katy, TX')
    assert.equal(checkArea('TX', 'Katy\u0007\u0000  Town').label, 'Katy Town, TX', 'control characters removed, spaces collapsed')
    assert.equal(cleanCityText('  Fort   Worth , TX ', 'TX'), 'Fort Worth')
    assert.equal(checkArea('AK', 'Juneau').label, 'Juneau, AK')
  })

  test('errors: codes and messages', () => {
    const code = (s, c) => checkArea(s, c).code
    assert.equal(code(undefined, 'Katy'), 'state_required')
    assert.equal(code('', ''), 'state_required')
    assert.equal(code('ZZ', 'Katy'), 'invalid_state')
    assert.equal(code(42, 'Katy'), 'invalid_state')
    assert.equal(code('TX', ''), 'city_required')
    assert.equal(code('TX', '   '), 'city_required')
    assert.equal(code('TX', 'CA:los-angeles'), 'invalid_city', 'a listed key from another state')
    assert.equal(code('TX', 'TX:nowhere'), 'invalid_city')
    assert.equal(code('TX', 'K'), 'invalid_city', 'under 2 characters')
    assert.equal(code('TX', 'a'.repeat(61)), 'invalid_city', 'over 60 characters')
    assert.equal(code('TX', 'x'.repeat(500)), 'invalid_city')
    assert.equal(code('TX', '12345'), 'invalid_city', 'needs a letter')
    assert.equal(code('TX', '<b>Katy</b>'), 'invalid_city')
    assert.equal(code('TX', 42), 'invalid_city')
    for (const link of ['https://evil.example', 'www.katy.tx', 'katy.com', 'bit.ly/x', 'me@katy.org', 'javascript:alert(1)']) {
      assert.equal(code('TX', link), 'links_not_allowed', link)
    }
    assert.equal(checkArea('TX', 'katy.com').field, 'city')
    assert.equal(checkArea('', '').field, 'state')
    assert.equal(checkArea('TX', '').message, AREA_MESSAGES.city_required)
  })

  test('picker: prefill from a search, state changes, request fields, form errors', () => {
    assert.deepEqual(pickerFromSelection({ state: 'TX', city: 'TX:houston' }), { state: 'TX', city: 'TX:houston', cityText: '' })
    assert.deepEqual(pickerFromSelection({ state: 'TX', city: null }), { state: 'TX', city: '', cityText: '' })
    assert.deepEqual(pickerFromSelection({ state: 'TX', city: 'CA:los-angeles' }), { state: 'TX', city: '', cityText: '' })
    assert.deepEqual(pickerFromSelection({ state: 'AK' }), { state: 'AK', city: CITY_OTHER, cityText: '' }, 'no listed cities: straight to "Your city"')
    assert.deepEqual(pickerFromSelection({ state: 'ZZ', city: 'TX:houston' }), { state: '', city: '', cityText: '' })
    assert.deepEqual(pickerFromSelection(null), { state: '', city: '', cityText: '' })
    assert.deepEqual(pickerWithState({ state: 'TX', city: 'TX:houston', cityText: '' }, 'CA'), { state: 'CA', city: '', cityText: '' })
    assert.deepEqual(pickerWithState({ state: 'TX', city: CITY_OTHER, cityText: 'Katy' }, 'OK'), { state: 'OK', city: CITY_OTHER, cityText: 'Katy' })
    assert.deepEqual(pickerWithState({ state: 'TX', city: CITY_OTHER, cityText: 'Katy' }, ''), { state: '', city: '', cityText: 'Katy' })
    assert.deepEqual(pickerToRequest({ state: 'TX', city: 'TX:houston', cityText: 'ignored' }), { state: 'TX', city: 'TX:houston' })
    assert.deepEqual(pickerToRequest({ state: 'TX', city: CITY_OTHER, cityText: '  Katy ' }), { state: 'TX', city: 'Katy' })
    assert.deepEqual(checkPicker({ state: '', city: '', cityText: '' }).errors, { state: AREA_MESSAGES.state_required })
    assert.deepEqual(checkPicker({ state: 'TX', city: '', cityText: '' }).errors, { city: AREA_MESSAGES.city_required })
    assert.deepEqual(checkPicker({ state: 'TX', city: CITY_OTHER, cityText: ' ' }).errors, { cityText: AREA_MESSAGES.city_text_required })
    assert.deepEqual(checkPicker({ state: 'TX', city: CITY_OTHER, cityText: 'katy.com' }).errors, { cityText: AREA_MESSAGES.links_not_allowed })
    assert.equal(checkPicker({ state: 'TX', city: CITY_OTHER, cityText: 'Katy' }).area.label, 'Katy, TX')
    assert.equal(checkPicker({ state: 'TX', city: 'TX:dallas', cityText: '' }).area.label, 'Dallas, TX')
  })
})

describe('typed city edge cases', () => {
  test('lowercase state suffix dropped; another state named -> invalid_city', () => {
    assert.equal(checkArea('TX', 'Katy tx').label, 'Katy, TX')
    assert.equal(checkArea('IN', 'Gary in').label, 'Gary, IN')
    for (const typed of ['Houston, CA', 'Houston, California', 'Houston, ca.']) {
      const r = checkArea('TX', typed)
      assert.equal(r.ok, false, typed)
      assert.equal(r.code, 'invalid_city')
      assert.match(r.message, /California/)
    }
    assert.equal(checkArea('DC', 'Washington, DC').ok, true)
  })

  test('spelling variants match the listed city (Saint/St., NYC)', () => {
    assert.equal(checkArea('MO', 'Saint Louis').cityKey, 'MO:st-louis')
    assert.equal(checkArea('MO', 'St Louis').cityKey, 'MO:st-louis')
    assert.equal(checkArea('MN', 'St. Paul').cityKey, 'MN:saint-paul')
    assert.equal(checkArea('NY', 'New York City').cityKey, 'NY:new-york')
    assert.equal(checkArea('NY', 'NYC').label, 'New York, NY')
    assert.equal(findListedCity('TX', 'Katy'), null)
    // Older stored labels resolve the same way for the monthly email.
    assert.deepEqual(subscriberArea({ [F.states]: 'MO', [F.city]: 'Saint Louis, MO' }), { state: 'MO', cityKey: 'MO:st-louis' })
  })

  test('St./Ft./Mt. with no space are city names, not links', () => {
    assert.equal(checkArea('FL', 'St.Petersburg').label, 'St. Petersburg, FL')
    assert.equal(checkArea('FL', 'Ft.Myers').ok, true)
    assert.equal(checkArea('SC', 'Mt.Pleasant').ok, true)
    assert.equal(checkArea('FL', 'st.example.com').code, 'links_not_allowed')
    assert.equal(checkArea('FL', 'www.evil.com').code, 'links_not_allowed')
  })
})

describe('POST /api/subscribe area', () => {
  // Each case is its own visitor (the route allows 5 signups per IP per 10 minutes).
  const signup = async (area, m = mockFetch()) => ({ m, r: (_resetRateLimits(), await call(createSubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl }), { body: { ...person, ...area } })) })

  test('missing state / city, bad state, unlisted key, link -> 400 with its own code, nothing written, no cookie', async () => {
    for (const [area, code, field] of [
      [{}, 'state_required', 'state'],
      [{ city: 'Katy' }, 'state_required', 'state'],
      [{ state: 'TX' }, 'city_required', 'city'],
      [{ state: 'TX', city: '' }, 'city_required', 'city'],
      [{ state: 'ZZ', city: 'Katy' }, 'invalid_state', 'state'],
      [{ state: 'TX', city: 'CA:los-angeles' }, 'invalid_city', 'city'],
      [{ state: 'TX', city: 'K' }, 'invalid_city', 'city'],
      [{ state: 'TX', city: 'https://katy.example' }, 'links_not_allowed', 'city'],
      [{ state: 'TX', city: 'katy.com' }, 'links_not_allowed', 'city']
    ]) {
      const { m, r } = await signup(area)
      assert.equal(r.status, 400, JSON.stringify(area))
      assert.equal(r.body.error.code, code, JSON.stringify(area))
      assert.equal(r.body.error.field, field)
      assert.equal(r.body.error.codes[field], code)
      assert.equal(typeof r.body.error.fields[field], 'string')
      assert.equal(r.body.error.message, r.body.error.fields[field])
      assert.equal(m.calls.writes, 0)
      assert.equal(r.headers['set-cookie'], undefined)
    }
  })

  test('other bad fields too -> invalid_fields, with the area code alongside', async () => {
    const m = mockFetch()
    const r = await call(createSubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl }), { body: { name: 'Ann', email: 'nope', password: PW, state: 'TX' } })
    assert.equal(r.status, 400)
    assert.equal(r.body.error.code, 'invalid_fields')
    assert.equal(r.body.error.field, 'email')
    assert.deepEqual(r.body.error.codes, { city: 'city_required' })
    assert.deepEqual(Object.keys(r.body.error.fields).sort(), ['city', 'email'])
  })

  test('stored values: States = state code, City = "Houston, TX" (listed) or "<typed>, TX"', async () => {
    for (const [area, city] of [
      [{ state: 'TX', city: 'TX:houston' }, 'Houston, TX'],
      [{ state: 'tx', city: 'houston' }, 'Houston, TX'],
      [{ state: 'TX', city: '  Katy ' }, 'Katy, TX'],
      [{ state: 'TX', city: 'Katy, TX' }, 'Katy, TX'],
      [{ state: 'MO', city: 'MO:st-louis' }, 'St. Louis, MO'],
      [{ state: 'AK', city: 'Juneau' }, 'Juneau, AK']
    ]) {
      const { m, r } = await signup(area)
      assert.equal(r.status, 200, JSON.stringify(area))
      assert.deepEqual(r.body, { ok: true, signedIn: true, newsletter: true })
      assert.equal(m.rows[0].fields[F.states], area.state.toUpperCase())
      assert.equal(m.rows[0].fields[F.city], city)
    }
  })
})

describe('POST /api/preferences area', () => {
  const cookie = `${SESSION_COOKIE}=${sessionToken('ann@firm.com', SECRET)}`

  test('a subscriber with no city sets one (listed or typed) and can change it', async () => {
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.states]: 'TX\nCA' } }])
    const h = createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl })
    const r = await call(h, { cookie, body: { homeState: 'TX', homeCity: 'TX:dallas' } })
    assert.equal(r.status, 200)
    assert.equal(r.body.saved.homeState, 'TX')
    assert.equal(r.body.saved.homeCity, 'Dallas, TX')
    assert.equal(m.rows[0].fields[F.states], 'TX\nCA')
    assert.equal(m.rows[0].fields[F.city], 'Dallas, TX')
    await call(h, { cookie, body: { homeState: 'OK', homeCity: 'Broken Arrow' } })
    assert.equal(m.rows[0].fields[F.states], 'OK\nCA')
    assert.equal(m.rows[0].fields[F.city], 'Broken Arrow, OK')
  })

  test('the page payload with no area keeps the saved home state, city and newsletter', async () => {
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.states]: 'TX', [F.city]: 'Katy, TX', [F.newsletter]: true } }])
    const h = createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl })
    // Exactly what PreferencesPage sends when State is blank and the
    // newsletter box was not touched.
    let r = await call(h, { cookie, body: { sectors: ['healthcare'], states: [], cities: [], alerts: 'off' } })
    assert.equal(r.status, 200)
    assert.equal(m.rows[0].fields[F.states], 'TX')
    assert.equal(m.rows[0].fields[F.city], 'Katy, TX')
    assert.equal(m.rows[0].fields[F.newsletter], true)
    assert.deepEqual(subscriberArea(m.rows[0].fields), { state: 'TX', cityKey: 'TX:katy' })
    // Following another state keeps the home state first.
    r = await call(h, { cookie, body: { sectors: [], states: ['CA'], cities: ['CA:los-angeles'] } })
    assert.equal(r.status, 200)
    assert.equal(m.rows[0].fields[F.states], 'TX\nCA\nCA:los-angeles')
    assert.deepEqual(subscriberArea(m.rows[0].fields), { state: 'TX', cityKey: 'TX:katy' })
  })

  test('same validation as signup; a rejected save writes nothing', async () => {
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.states]: 'TX', [F.city]: 'Houston, TX' } }])
    const h = createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl })
    for (const [body, code, field] of [
      [{ homeState: 'TX' }, 'city_required', 'homeCity'],
      [{ homeState: 'TX', homeCity: 'katy.com' }, 'links_not_allowed', 'homeCity'],
      [{ homeState: 'TX', homeCity: 'CA:los-angeles' }, 'invalid_city', 'homeCity'],
      [{ homeState: 'ZZ', homeCity: 'Katy' }, 'invalid_state', 'homeState'],
      [{ homeCity: 'Katy' }, 'state_required', 'homeState']
    ]) {
      const r = await call(h, { cookie, body })
      assert.equal(r.status, 400, JSON.stringify(body))
      assert.equal(r.body.error.code, code)
      assert.equal(r.body.error.field, field)
    }
    assert.equal(m.calls.writes, 0)
    assert.equal(m.rows[0].fields[F.city], 'Houston, TX')
  })
})

describe('dev fakes apply the production rules', () => {
  test('dev/signup: same codes, valid area signs in, area never echoed', async () => {
    const h = createDevSignupHandler(createDevAccountStore())
    for (const [area, code] of [[{}, 'state_required'], [{ state: 'TX' }, 'city_required'], [{ state: 'TX', city: 'katy.com' }, 'links_not_allowed'], [{ state: 'TX', city: 'CA:los-angeles' }, 'invalid_city']]) {
      const r = await call(h, { body: { ...person, ...area } })
      assert.equal(r.status, 400, JSON.stringify(area))
      assert.equal(r.body.error.code, code)
      assert.equal(r.headers['set-cookie'], undefined)
    }
    const ok = await call(h, { body: { ...person, state: 'TX', city: 'Katy' } })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.simulated, true)
    assert.equal(ok.raw.toLowerCase().includes('katy'), false)
  })

  test('dev/preferences: echoes the stored label; rejects a state without a city', async () => {
    const h = createDevPreferencesHandler()
    const cookie = 'ssp_sim_access=authorized'
    const ok = await call(h, { cookie, body: { homeState: 'TX', homeCity: 'TX:houston' } })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.saved.homeCity, 'Houston, TX')
    const typed = await call(h, { cookie, body: { homeState: 'TX', homeCity: 'Katy' } })
    assert.equal(typed.body.saved.homeCity, 'Katy, TX')
    const bad = await call(h, { cookie, body: { homeState: 'TX', homeCity: '' } })
    assert.equal(bad.status, 400)
    assert.equal(bad.body.error.code, 'city_required')
    const none = await call(h, { cookie, body: { sectors: [] } })
    assert.equal(none.body.saved.homeState, undefined)
  })
})
