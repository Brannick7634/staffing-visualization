import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createSubscribeHandler } from '../../api/_lib/routes/subscribe.js'
import { createPreferencesHandler } from '../../api/_lib/routes/preferences.js'
import { F, validateSignup, validateArea, unsubscribeUrl, cityKeyFromStored } from '../../api/_lib/subscribers.js'
import { areaFromRecord } from '../../api/_lib/routes/signal-report.js'
import { sessionToken, unsubscribeToken, verifyToken, SESSION_COOKIE } from '../../api/_lib/signalSession.js'
import { _resetRateLimits } from '../../api/_lib/security.js'
import { buildReport } from '../../api/_lib/signal/report.js'
import { parseSecrets, eligibleSubscribers, checkApproval, renderEmail, reportHash, DRAFT_TO } from '../../scripts/lib/monthlyEmail.mjs'

beforeEach(() => _resetRateLimits())
const SECRET = 'test-secret-'.padEnd(40, 'x')
const ENV = { AIRTABLE_API_KEY: 'patTEST', SIGNAL_SESSION_SECRET: SECRET, SIGNAL_SITE_URL: 'https://signal.example', RESEND_API_KEY: 're_test', SIGNAL_FROM_EMAIL: 'Signal <hello@signal.example>' }

// In-memory Airtable + Resend mock (no network; nothing real is written or sent).
function mockFetch(rows = []) {
  const calls = { emails: [] }
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url)
    const ok = (data) => ({ ok: true, status: 200, json: async () => data })
    if (u.hostname === 'api.resend.com') { calls.emails.push(JSON.parse(opts.body)); return ok({ id: 'em_1' }) }
    if (!opts.method || opts.method === 'GET') {
      const email = /="(.*)"$/.exec(u.searchParams.get('filterByFormula'))[1]
      return ok({ records: rows.filter((r) => r.fields[F.email].toLowerCase() === email) })
    }
    const body = JSON.parse(opts.body)
    if (opts.method === 'POST') {
      const rec = { id: `rec${rows.length + 1}`, fields: { ...body.records[0].fields } }
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
  const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v }, end: (b) => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }) }
  // Same Content-Type the site's fetch calls send (auth POSTs require JSON).
  Promise.resolve(handler({ method, body, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } }, res))
})

describe('area validation', () => {
  test('state + city required; city is a listed key or a typed name; stored as a label', () => {
    assert.deepEqual(validateArea('tx', 'TX:houston'), { state: 'TX', city: 'Houston, TX' })
    assert.deepEqual(validateArea('TX', '  Katy  '), { state: 'TX', city: 'Katy, TX' })
    assert.deepEqual(validateArea('TX', 'houston'), { state: 'TX', city: 'Houston, TX' }, 'a typed listed name becomes the listed city')
    assert.equal(validateArea(undefined, undefined).code, 'state_required')
    assert.equal(validateArea('XX', 'Katy').code, 'invalid_state')
    assert.equal(validateArea('Texas', 'Katy').code, 'invalid_state')
    assert.equal(validateArea('DC', '').code, 'city_required')
    assert.equal(validateArea('TX', 'a'.repeat(61)).code, 'invalid_city')
    assert.equal(validateArea('', 'Houston').code, 'state_required')
    assert.equal(validateSignup({ name: 'A', email: 'a@b.co', state: 'ZZ' }).fields.state.length > 0, true)
  })

  test('signup stores the 2-letter state and the city label', async () => {
    const m = mockFetch()
    const h = createSubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl })
    const r = await call(h, { body: { name: 'Ann', email: 'ann@firm.com', password: 'area test pw', state: 'tx', city: ' Houston ' } })
    assert.equal(r.status, 200)
    assert.equal(m.rows[0].fields[F.states], 'TX')
    assert.equal(m.rows[0].fields[F.city], 'Houston, TX')
    const m2 = mockFetch()
    const none = await call(createSubscribeHandler({ env: ENV, fetchImpl: m2.fetchImpl }), { body: { name: 'Bo', email: 'bo@firm.com', password: 'area test pw' } })
    assert.equal(none.status, 400)
    assert.equal(none.body.error.code, 'state_required')
    assert.equal(m2.rows.length, 0)
    assert.equal((await call(h, { body: { name: 'Ann', email: 'new@firm.com', password: 'area test pw', state: 'QQ', city: 'Katy' } })).status, 400)
  })

  test('preferences: home state is the first States line; other lines kept; City is the label', async () => {
    const m = mockFetch([{ id: 'rec1', fields: { [F.email]: 'ann@firm.com', [F.states]: 'CA\nNV\nCA:los-angeles' } }])
    const h = createPreferencesHandler({ env: ENV, fetchImpl: m.fetchImpl })
    const cookie = `${SESSION_COOKIE}=${sessionToken('ann@firm.com', SECRET)}`
    const r = await call(h, { cookie, body: { homeState: 'TX', homeCity: 'Houston' } })
    assert.equal(r.status, 200)
    assert.equal(m.rows[0].fields[F.states], 'TX\nNV\nCA:los-angeles')
    assert.equal(m.rows[0].fields[F.city], 'Houston, TX')
    await call(h, { cookie, body: { states: ['NV', 'TX'], cities: [], homeState: 'TX', homeCity: 'Katy' } })
    assert.equal(m.rows[0].fields[F.states], 'TX\nNV')
    assert.equal(m.rows[0].fields[F.city], 'Katy, TX')
    const noCity = await call(h, { cookie, body: { states: ['NV'], homeState: 'TX', homeCity: '' } })
    assert.equal(noCity.status, 400)
    assert.equal(noCity.body.error.code, 'city_required')
    assert.equal(m.rows[0].fields[F.states], 'TX\nNV', 'a rejected save writes nothing')
    assert.equal((await call(h, { cookie, body: { homeState: 'ZZ', homeCity: 'Katy' } })).body.error.code, 'invalid_state')
    assert.equal((await call(h, { cookie, body: { homeCity: 'Houston' } })).body.error.code, 'state_required')
    // Not sent keeps the saved area; both empty clears it (older clients).
    await call(h, { cookie, body: { newsletter: true } })
    assert.equal(m.rows[0].fields[F.city], 'Katy, TX')
    await call(h, { cookie, body: { homeState: '', homeCity: '' } })
    assert.equal(m.rows[0].fields[F.states], 'NV')
    assert.equal(m.rows[0].fields[F.city], '')
  })
})

describe('monthly email helpers', () => {
  const ok = { status: 'verified', distinctFirms: 9, maxFirmShare: 0.2 }
  const pay = (roleKey, typ, extra = {}) => ({ roleKey, level: 'nationwide', state: null, city: null, n: 60, p25Cents: typ - 100, typicalCents: typ, p75Cents: typ + 100, checks: ok, ...extra })
  const mk = (m, rows, tx) => ({ format: 'staffing-signal-monthly-aggregates', schemaVersion: 1, month: m, reliability: { reliable: true }, totals: { postings: 10000 }, roleStatus: {}, pay: rows, demand: { states: [{ code: 'TX', postings: tx, checks: ok }], cities: [], roles: [] } })
  const report = buildReport(mk('2026-09', [pay('welder', 2800), pay('cna', 1800), pay('server', 1700), pay('welder', 2800, { level: 'state', state: 'TX' })], 1300),
    mk('2026-08', [pay('welder', 2400), pay('cna', 2000), pay('server', 1500), pay('welder', 2500, { level: 'state', state: 'TX' })], 1000))

  test('secrets parser', () => {
    assert.deepEqual(parseSecrets('# c\nRESEND_API_KEY="re_x"\n\nSIGNAL_FROM_EMAIL=Signal <a@b.co>\nbad line'), { RESEND_API_KEY: 're_x', SIGNAL_FROM_EMAIL: 'Signal <a@b.co>' })
  })

  test('eligible = Newsletter true AND not Unsubscribed, deduped', () => {
    const rec = (id, email, f = {}) => ({ id, fields: { [F.email]: email, [F.newsletter]: true, ...f } })
    const subs = eligibleSubscribers([rec('1', 'A@x.co', { [F.states]: 'TX', [F.city]: 'Houston' }), rec('2', 'a@x.co'), rec('3', 'b@x.co', { [F.unsubscribed]: true }),
      rec('4', 'c@x.co', { [F.newsletter]: false }), rec('5', 'not-an-email')])
    assert.deepEqual(subs.map((s) => s.email), ['a@x.co'])
    assert.deepEqual(subs[0].area, { state: 'TX', cityKey: 'TX:houston' })
  })

  test('area targeting reads both stored City formats (listed label, typed label) and older bare names', () => {
    const rec = (id, f) => ({ id, fields: { [F.email]: `s${id}@x.co`, [F.newsletter]: true, ...f } })
    const subs = eligibleSubscribers([
      rec(1, { [F.states]: 'TX', [F.city]: 'Houston, TX' }), // listed city, as signup stores it
      rec(2, { [F.states]: 'TX', [F.city]: 'Katy, TX' }), // typed city
      rec(3, { [F.states]: 'TX', [F.city]: 'Houston' }), // older free text
      rec(4, { [F.states]: 'MO', [F.city]: 'St. Louis, MO' }),
      rec(5, { [F.states]: 'DC', [F.city]: 'Washington, DC' }),
      rec(6, { [F.states]: 'CA\nCA:los-angeles', [F.city]: 'Houston, TX' }), // label for another state: ignored
      rec(7, { [F.states]: 'TX' }), // state only
      rec(8, {}) // no area
    ])
    assert.deepEqual(subs.map((s) => s.area), [
      { state: 'TX', cityKey: 'TX:houston' },
      { state: 'TX', cityKey: 'TX:katy' },
      { state: 'TX', cityKey: 'TX:houston' },
      { state: 'MO', cityKey: 'MO:st-louis' },
      { state: 'DC', cityKey: 'DC:washington' },
      { state: 'CA', cityKey: 'CA:los-angeles' },
      { state: 'TX', cityKey: null },
      { state: null, cityKey: null }
    ])
    // The report page reads the area the same way.
    assert.deepEqual(areaFromRecord({ [F.states]: 'TX', [F.city]: 'Katy, TX' }), { state: 'TX', cityKey: 'TX:katy' })
    assert.equal(cityKeyFromStored('TX', 'Houston, TX'), 'TX:houston')
    assert.equal(cityKeyFromStored('TX', 'Katy'), 'TX:katy')
    assert.equal(cityKeyFromStored('CA', 'Houston, TX'), null)
  })

  test('signup -> stored fields -> email area, for a listed and a typed city', async () => {
    const m = mockFetch()
    const h = createSubscribeHandler({ env: ENV, fetchImpl: m.fetchImpl })
    await call(h, { body: { name: 'Ann', email: 'ann@firm.com', password: 'area test pw', state: 'TX', city: 'TX:houston' } })
    await call(h, { body: { name: 'Bo', email: 'bo@firm.com', password: 'area test pw', state: 'TX', city: 'Katy, TX' } })
    assert.deepEqual(m.rows.map((r) => r.fields[F.city]), ['Houston, TX', 'Katy, TX'])
    const subs = eligibleSubscribers(m.rows.map((r) => ({ ...r, fields: { ...r.fields, [F.newsletter]: true } })))
    assert.deepEqual(subs.map((s) => [s.email, s.area.cityKey]), [['ann@firm.com', 'TX:houston'], ['bo@firm.com', 'TX:katy']])
  })

  test('approval requires a draft and marker for the same unchanged report', () => {
    const h = reportHash(report)
    const draft = { month: '2026-09', reportHash: h }
    const marker = { month: '2026-09', reportHash: h }
    assert.match(checkApproval({ month: '2026-09', approvedFlag: undefined, report, draftRecord: draft, marker }), /--approved/)
    assert.match(checkApproval({ month: '2026-09', approvedFlag: '2026-09', report, draftRecord: null, marker }), /draft/)
    assert.match(checkApproval({ month: '2026-09', approvedFlag: '2026-09', report, draftRecord: draft, marker: null }), /approval marker/)
    assert.match(checkApproval({ month: '2026-09', approvedFlag: '2026-09', report: { ...report, label: 'changed' }, draftRecord: draft, marker }), /changed/)
    assert.equal(checkApproval({ month: '2026-09', approvedFlag: '2026-09', report: { ...report, generatedAt: 'later' }, draftRecord: draft, marker }), null)
  })

  test('render: area first, national next, real unsubscribe token, draft label', () => {
    const cfg = { site: 'https://signal.example', secret: SECRET }
    const unsub = unsubscribeUrl(cfg, 'ann@firm.com')
    const token = new URL(unsub).searchParams.get('token')
    assert.equal(token, unsubscribeToken('ann@firm.com', SECRET))
    assert.equal(verifyToken(token, SECRET, { purpose: 'unsub' }).email, 'ann@firm.com')
    const m = renderEmail(report, { area: { state: 'TX', cityKey: 'TX:houston' }, name: 'Ann Lee', site: cfg.site, unsubUrl: unsub })
    assert.equal(m.subject, 'The Monthly Signal: September 2026')
    assert.ok(m.text.indexOf('TEXAS') < m.text.indexOf('NATIONAL'))
    assert.match(m.text, /No reliable Houston, TX comparison/)
    assert.ok(m.html.includes(unsub.replace(/&/g, '&amp;')))
    assert.match(m.text, /Hi Ann,/)
    const typed = renderEmail(report, { area: { state: 'TX', cityKey: 'TX:katy' }, name: 'Bo', site: cfg.site, unsubUrl: unsub })
    assert.match(typed.text, /No reliable Katy, TX comparison/)
    assert.ok(typed.text.indexOf('TEXAS') < typed.text.indexOf('NATIONAL'))
    const d = renderEmail(report, { site: cfg.site, unsubUrl: unsub, draft: true })
    assert.match(d.subject, /^\[DRAFT\] /)
    assert.match(d.text, /Add|Tell us your state/)
    assert.equal(DRAFT_TO, 'andy.kohler@marshmma.us')
  })
})
