// POST /api/signal/client-report/email (Contract C) + its dev mount and wiring.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { readFileSync } from 'node:fs'
import { createClientReportEmailHandler, validateEmailRequest, dailyCap, DEFAULT_DAILY_CAP } from '../../api/_lib/routes/client-report-email.js'
import { DAILY_RECIPIENT_LIMIT } from '../../shared/signal/clientReport.js'
import { buildReportEmail } from '../../api/_lib/clientReportEmail.js'
import { esc } from '../../api/_lib/html.js'
import { F, sendEmail } from '../../api/_lib/subscribers.js'
import { sessionToken, passwordFingerprint, SESSION_COOKIE } from '../../api/_lib/signalSession.js'
import { _resetRateLimits, sameOrigin, siteOrigins } from '../../api/_lib/security.js'
import { createDevClientReportEmailHandler, devSameOrigin } from '../../dev/signal/devClientReportEmail.js'
import * as plugin from '../../dev/signal/vitePlugin.js'
import { createFixtureAdapter } from '../../dev/signal/fixtureAdapter.js'

beforeEach(() => _resetRateLimits())

const SECRET = 'client-report-test-secret-'.padEnd(48, 'x')
const SITE = 'https://thestaffingsignal.com'
const ENV = Object.freeze({
  SIGNAL_CLIENT_REPORT_EMAIL_ENABLED: '1',
  AIRTABLE_API_KEY: 'patTEST',
  SIGNAL_SESSION_SECRET: SECRET,
  SIGNAL_SITE_URL: SITE,
  RESEND_API_KEY: 're_test',
  SIGNAL_FROM_EMAIL: 'The Staffing Signal <reports@thestaffingsignal.com>',
  SIGNAL_REPORT_EMAIL_DAILY_CAP: '100'
})
const T = Date.parse('2026-10-08T15:00:00Z')
const TODAY = '2026-10-08'
const SENDER = 'pat@agency-example.com'
const HASH = '$2b$10$abcdefghijklmnopqrstuuAbCdEfGhIjKlMnOpQrStUvWxYz01234'
const ok = (firms = 12) => ({ status: 'verified', distinctFirms: firms, maxFirmShare: 0.2 })

// Real role and places (the route validates against the shared lists);
// figures are test values on a synthetic adapter.
const CELLS = [
  { roleKey: 'forklift-operator', level: 'nationwide', state: null, city: null, p25Cents: 1700, typicalCents: 1850, p75Cents: 2000, payBasis: 'hourly', currency: 'USD', checks: ok(158) },
  { roleKey: 'forklift-operator', level: 'state', state: 'TX', city: null, p25Cents: 1650, typicalCents: 1875, p75Cents: 2100, payBasis: 'hourly', currency: 'USD', checks: ok(40) },
  { roleKey: 'forklift-operator', level: 'city', state: 'TX', city: 'TX:houston', p25Cents: 1750, typicalCents: 2000, p75Cents: 2420, payBasis: 'hourly', currency: 'USD', checks: ok(4) }
]
const adapter = {
  dataMode: 'synthetic',
  async load() {
    return { available: true, data: { snapshot: { exactDate: '2026-10-06' }, pay: CELLS, cityVolume: { rows: [] }, momentum: { rows: [] } } }
  }
}

function row(fields = {}) {
  return { id: 'recPAT', fields: { [F.email]: SENDER, [F.name]: 'Pat Lee', [F.passwordHash]: HASH, [F.verified]: true, ...fields } }
}

// In-memory Airtable + Resend. `log` keeps the order of calls.
function mockFetch(rows = [row()], { resendFailAt = null, resend429Once = false, airtable = 'ok' } = {}) {
  const calls = { log: [], emails: [], patches: [] }
  let resendCalls = 0
  let limited = false
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url)
    const reply = (status, data) => ({ ok: status < 400, status, json: async () => data })
    if (u.hostname === 'api.resend.com') {
      resendCalls++
      if (resend429Once && !limited) { limited = true; calls.log.push('resend:429'); return reply(429, {}) }
      if (resendFailAt !== null && resendCalls === resendFailAt) { calls.log.push('resend:500'); return reply(500, {}) }
      const body = JSON.parse(opts.body)
      calls.emails.push(body)
      calls.log.push(`resend:${body.to[0]}`)
      return reply(200, { id: `em_${resendCalls}` })
    }
    if (airtable === 'down' || (airtable === 'patch-down' && opts.method === 'PATCH')) return reply(500, { error: { type: 'SERVER_ERROR' } })
    if (!opts.method || opts.method === 'GET') {
      calls.log.push('airtable:get')
      const email = /="(.*)"$/.exec(u.searchParams.get('filterByFormula'))[1]
      return reply(200, { records: rows.filter((r) => r.fields[F.email] === email) })
    }
    const body = JSON.parse(opts.body)
    calls.patches.push(body.records[0])
    calls.log.push('airtable:patch')
    for (const r of body.records) Object.assign(rows.find((x) => x.id === r.id).fields, r.fields)
    return reply(200, { records: body.records })
  }
  return { fetchImpl, calls, rows }
}

const cookieFor = (email = SENDER, hash = HASH) => `${SESSION_COOKIE}=${sessionToken(email, SECRET, T, passwordFingerprint(hash, SECRET))}`

function call(handler, { method = 'POST', body, cookie = cookieFor(), origin = SITE, ip = '1.2.3.4', contentType = 'application/json', headers = {} } = {}) {
  return new Promise((resolve) => {
    const out = {}
    const res = {
      statusCode: 200,
      setHeader: (k, v) => { out[k.toLowerCase()] = v },
      end: (b) => resolve({ status: res.statusCode, headers: out, body: b ? JSON.parse(b) : null })
    }
    const reqHeaders = {
      ...(contentType ? { 'content-type': contentType } : {}),
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
      ...(ip ? { 'x-forwarded-for': ip } : {}),
      ...headers
    }
    Promise.resolve(handler({ method, headers: reqHeaders, body }, res))
  })
}

const BODY = Object.freeze({
  roleKey: 'forklift-operator', state: 'TX', city: 'TX:houston', rateCents: 1700,
  recipients: ['client.one@example.org', 'client.two@example.net'], sendCopy: true,
  preparedFor: 'Acme Logistics', preparedBy: 'Pat Lee, Agency', note: 'Here is the market data we discussed.'
})

function setup({ env = ENV, rows, fetchOpts, renderPdf, logger } = {}) {
  const mock = mockFetch(rows, fetchOpts)
  const pdfModels = []
  const logs = []
  const handler = createClientReportEmailHandler({
    env,
    fetchImpl: mock.fetchImpl,
    adapter,
    now: () => T,
    renderPdf: renderPdf || (async (model) => { pdfModels.push(model); return Buffer.from('%PDF-1.4 test report') }),
    logger: logger || { error: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), info: (...a) => logs.push(a.join(' ')) },
    sleep: async () => {}
  })
  return { handler, ...mock, pdfModels, logs }
}

describe('kill switch, method, content type, origin', () => {
  test('404 unless SIGNAL_CLIENT_REPORT_EMAIL_ENABLED=1', async () => {
    for (const flag of [undefined, '0', 'true']) {
      const { handler, calls } = setup({ env: { ...ENV, SIGNAL_CLIENT_REPORT_EMAIL_ENABLED: flag } })
      const r = await call(handler, { body: BODY })
      assert.equal(r.status, 404)
      assert.deepEqual(r.body, { error: 'not_found' })
      assert.equal(calls.log.length, 0)
    }
  })

  test('POST only, JSON only', async () => {
    const { handler } = setup()
    assert.equal((await call(handler, { method: 'GET' })).status, 405)
    const form = await call(handler, { body: BODY, contentType: 'application/x-www-form-urlencoded' })
    assert.equal(form.status, 415)
    assert.equal((await call(handler, { body: BODY, headers: { 'content-length': String(20000) } })).body.error.code, 'payload_too_large')
  })

  test('403 bad_origin unless the site (or its www twin) sent it', async () => {
    const { handler, calls } = setup()
    for (const origin of [null, 'https://evil.example', 'null', 'http://thestaffingsignal.com', 'https://thestaffingsignal.com.evil.example']) {
      const r = await call(handler, { body: BODY, origin })
      assert.equal(r.status, 403, String(origin))
      assert.equal(r.body.error.code, 'bad_origin')
    }
    assert.equal(calls.log.length, 0)
    assert.deepEqual(siteOrigins(SITE), [SITE, 'https://www.thestaffingsignal.com'])
    assert.deepEqual(siteOrigins('https://www.thestaffingsignal.com/'), ['https://www.thestaffingsignal.com', SITE])
    assert.equal(sameOrigin({ headers: { origin: 'https://www.thestaffingsignal.com' } }, ENV), true)
    assert.equal(sameOrigin({ headers: { referer: `${SITE}/client-report` } }, ENV), true)
    assert.equal(sameOrigin({ headers: { origin: SITE } }, { SIGNAL_SITE_URL: 'not a url' }), false)
  })
})

describe('limits and sign-in', () => {
  test('per-IP limit: 10 requests per 10 minutes', async () => {
    const { handler } = setup()
    for (let i = 0; i < 10; i++) assert.equal((await call(handler, { body: BODY, cookie: null })).status, 401)
    const r = await call(handler, { body: BODY, cookie: null })
    assert.equal(r.status, 429)
    assert.equal(r.body.error.code, 'rate_limited')
    assert.equal((await call(handler, { body: BODY, cookie: null, ip: '5.6.7.8' })).status, 401)
  })

  test('503 when mail settings are missing', async () => {
    const { handler } = setup({ env: { ...ENV, RESEND_API_KEY: '' } })
    const r = await call(handler, { body: BODY })
    assert.equal(r.status, 503)
    assert.equal(r.body.error.code, 'email_unavailable')
  })

  test('401 sign_in_required: no cookie, forged cookie, unknown account, session from before a password change', async () => {
    const { handler, calls } = setup()
    for (const cookie of [null, `${cookieFor()}x`, cookieFor('nobody@example.com'), cookieFor(SENDER, 'old-hash')]) {
      const r = await call(handler, { body: BODY, cookie })
      assert.equal(r.status, 401)
      assert.equal(r.body.error.code, 'sign_in_required')
    }
    assert.equal(calls.emails.length, 0)
    assert.equal(calls.patches.length, 0)
  })

  test('Airtable down during sign-in check -> 502 send_failed, nothing sent', async () => {
    const { handler, calls } = setup({ fetchOpts: { airtable: 'down' } })
    const r = await call(handler, { body: BODY })
    assert.equal(r.status, 502)
    assert.deepEqual(r.body.error, { code: 'send_failed', message: 'We could not send the report. Please try again.', sent: 0 })
    assert.equal(calls.emails.length, 0)
  })

  test('per-account limit: 5 sends per 10 minutes, across IPs', async () => {
    const { handler } = setup()
    const body = { ...BODY, recipients: [], sendCopy: true }
    for (let i = 0; i < 5; i++) assert.equal((await call(handler, { body, ip: `10.0.0.${i}` })).status, 200)
    const r = await call(handler, { body, ip: '10.0.0.99' })
    assert.equal(r.status, 429)
    assert.equal(r.body.error.code, 'rate_limited')
  })
})

describe('validation (400)', () => {
  const cases = [
    ['invalid_selection', { roleKey: 'nope' }],
    ['invalid_selection', { state: null }],
    ['invalid_selection', { city: 'CA:los-angeles' }],
    ['invalid_selection', { state: ['TX'] }],
    ['invalid_rate', { rateCents: 99 }],
    ['invalid_rate', { rateCents: 100000 }],
    ['invalid_rate', { rateCents: 17.5 }],
    ['invalid_rate', { rateCents: '1700' }],
    ['invalid_rate', { rateCents: undefined }],
    ['invalid_recipients', { recipients: 'a@example.com' }],
    ['invalid_recipients', { recipients: ['not-an-email'] }],
    ['invalid_recipients', { recipients: ['a@example.com', 42] }],
    ['invalid_recipients', { recipients: ['Evil <a@example.com>'] }],
    ['too_many_recipients', { recipients: ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com', 'f@x.com'] }],
    ['no_recipients', { recipients: [], sendCopy: false }],
    ['no_recipients', { recipients: [SENDER], sendCopy: true, _expectOk: true }],
    ['no_recipients', { recipients: [SENDER], sendCopy: false, _expectOk: true }],
    ['text_too_long', { preparedFor: 'x'.repeat(81) }],
    ['text_too_long', { preparedBy: 'y'.repeat(81) }],
    ['text_too_long', { note: 'z'.repeat(501) }],
    ['text_too_long', { note: { html: true } }],
    ['links_not_allowed', { note: 'See https://example.com for more' }],
    ['links_not_allowed', { note: 'go to www.example.com' }],
    ['links_not_allowed', { note: 'visit cheap-deals.ru today' }],
    ['links_not_allowed', { preparedFor: 'Acme (acme.io)' }],
    ['links_not_allowed', { preparedBy: 'http://x' }]
  ]
  for (const [code, patch] of cases) {
    const { _expectOk, ...override } = patch
    test(`${_expectOk ? 'accepts' : code}: ${JSON.stringify(override).slice(0, 70)}`, async () => {
      const { handler, calls } = setup()
      const r = await call(handler, { body: { ...BODY, ...override } })
      if (_expectOk) {
        assert.equal(r.status, 200)
        assert.equal(calls.emails.length, 1, 'only the copy, once')
        return
      }
      assert.equal(r.status, 400)
      assert.equal(r.body.error.code, code)
      assert.equal(calls.emails.length, 0)
      assert.equal(calls.patches.length, 0)
    })
  }

  test('limits allow exactly 5 recipients (after de-duplication), 80-char names and a 500-char note', () => {
    const v = validateEmailRequest({
      ...BODY,
      recipients: ['A@x.com', 'a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com'],
      preparedFor: 'p'.repeat(80), preparedBy: 'q'.repeat(80), note: `${'n'.repeat(250)}\r\n\r\n\r\n${'m'.repeat(240)}`
    }, { senderEmail: SENDER })
    assert.equal(v.ok, true)
    assert.deepEqual(v.value.recipients, ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com'])
    assert.equal(v.value.note.includes('\n\n\n'), false)
    assert.equal(validateEmailRequest(null).code, 'invalid_selection')
  })

  test('daily cap comes from SIGNAL_REPORT_EMAIL_DAILY_CAP, default 5 (the shared limit the page shows)', () => {
    assert.equal(DEFAULT_DAILY_CAP, 5)
    assert.equal(DAILY_RECIPIENT_LIMIT, 5)
    assert.equal(dailyCap({}), 5)
    assert.equal(dailyCap({ SIGNAL_REPORT_EMAIL_DAILY_CAP: 'lots' }), 5)
    assert.equal(dailyCap({ SIGNAL_REPORT_EMAIL_DAILY_CAP: '0' }), 5)
    assert.equal(dailyCap({ SIGNAL_REPORT_EMAIL_DAILY_CAP: '30' }), 30)
  })

  test("the sender's own address typed as a recipient becomes the copy, with or without the box ticked", () => {
    for (const sendCopy of [true, false]) {
      const v = validateEmailRequest({ ...BODY, recipients: [` ${SENDER.toUpperCase()} `, 'client.one@example.org'], sendCopy }, { senderEmail: SENDER })
      assert.equal(v.ok, true)
      assert.deepEqual(v.value.recipients, ['client.one@example.org'])
      assert.equal(v.value.sendCopy, true)
    }
    // Five other people plus your own address is still one email's worth.
    const five = ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com']
    const v = validateEmailRequest({ ...BODY, recipients: [...five, SENDER], sendCopy: false }, { senderEmail: SENDER })
    assert.deepEqual([v.ok, v.value.recipients, v.value.sendCopy], [true, five, true])
  })
})

describe('daily cap (other people only; copies to yourself are free)', () => {
  const DEFAULT_ENV = { ...ENV, SIGNAL_REPORT_EMAIL_DAILY_CAP: undefined }
  const usedRows = (n) => [row({ [F.reportEmailDay]: TODAY, [F.reportEmailCount]: n })]

  test('cap of 5 reached -> 429 daily_limit, remainingToday 0; nothing written or sent', async () => {
    const { handler, calls } = setup({ env: DEFAULT_ENV, rows: usedRows(5) })
    const r = await call(handler, { body: { ...BODY, recipients: ['client.one@example.org'], sendCopy: false } })
    assert.equal(r.status, 429)
    assert.equal(r.body.error.code, 'daily_limit')
    assert.equal(r.body.error.remainingToday, 0)
    assert.equal(r.body.error.dailyLimit, 5)
    assert.equal(r.body.error.message, "You've reached today's limit of 5 people. Copies to yourself still work.")
    assert.equal(calls.patches.length, 0)
    assert.equal(calls.emails.length, 0)
  })

  test('4 used + 2 recipients -> 429 with remainingToday 1 (the copy is not what tips it over)', async () => {
    const { handler, calls } = setup({ env: DEFAULT_ENV, rows: usedRows(4) })
    const r = await call(handler, { body: { ...BODY, sendCopy: false } })
    assert.equal(r.status, 429)
    assert.equal(r.body.error.code, 'daily_limit')
    assert.equal(r.body.error.remainingToday, 1)
    assert.equal(calls.patches.length, 0)
    assert.equal(calls.emails.length, 0)
    // 4 used + 1 recipient + a copy fits exactly.
    const ok1 = await call(handler, { body: { ...BODY, recipients: ['client.one@example.org'], sendCopy: true } })
    assert.equal(ok1.status, 200)
    assert.deepEqual(ok1.body, { ok: true, sent: 1, copySent: true, remainingToday: 0 })
    assert.deepEqual(calls.patches.map((p) => p.fields[F.reportEmailCount]), [5])
  })

  test('a copy only to yourself costs 0: allowed at the cap (even over a lowered cap), nothing written', async () => {
    for (const used of [5, 9]) {
      const { handler, calls, rows } = setup({ env: DEFAULT_ENV, rows: usedRows(used) })
      const r = await call(handler, { body: { ...BODY, recipients: [], sendCopy: true } })
      assert.equal(r.status, 200, String(used))
      assert.deepEqual(r.body, { ok: true, sent: 0, copySent: true, remainingToday: 0 })
      assert.equal(calls.patches.length, 0)
      assert.deepEqual(calls.emails.map((e) => e.to[0]), [SENDER])
      assert.equal(rows[0].fields[F.reportEmailCount], used)
    }
  })

  test("your own address typed as a recipient is the copy: sent once, last, and costs 0", async () => {
    const { handler, calls, rows } = setup({ env: DEFAULT_ENV, rows: usedRows(3) })
    const r = await call(handler, { body: { ...BODY, recipients: [SENDER.toUpperCase(), 'client.one@example.org'], sendCopy: false } })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body, { ok: true, sent: 1, copySent: true, remainingToday: 1 })
    assert.deepEqual(calls.emails.map((e) => e.to[0]), ['client.one@example.org', SENDER])
    assert.equal(rows[0].fields[F.reportEmailCount], 4)
    // Only yourself, typed in, at the cap: still a free copy.
    const atCap = setup({ env: DEFAULT_ENV, rows: usedRows(5) })
    const self = await call(atCap.handler, { body: { ...BODY, recipients: [SENDER], sendCopy: false } })
    assert.equal(self.status, 200)
    assert.deepEqual(self.body, { ok: true, sent: 0, copySent: true, remainingToday: 0 })
    assert.equal(atCap.calls.patches.length, 0)
  })

  test('self-only sends: at most 10 a day per account (in memory), then 429 copy_limit; resets the next UTC day', async () => {
    const mock = mockFetch(usedRows(0))
    let clock = T
    const handler = createClientReportEmailHandler({
      env: DEFAULT_ENV, fetchImpl: mock.fetchImpl, adapter, now: () => clock, sleep: async () => {},
      renderPdf: async () => Buffer.from('%PDF-1.4 test'), logger: { error() {}, warn() {}, info() {} }
    })
    const self = { ...BODY, recipients: [], sendCopy: true }
    // Spread over the day so the 5-per-10-minutes account limit never bites.
    for (let i = 0; i < 10; i++) {
      clock = T - 14 * 3600_000 + i * 11 * 60_000
      assert.equal((await call(handler, { body: self, ip: `10.1.0.${i}` })).status, 200, `copy ${i + 1}`)
    }
    clock = T + 3600_000
    const r = await call(handler, { body: self, ip: '10.1.0.99' })
    assert.equal(r.status, 429)
    assert.equal(r.body.error.code, 'copy_limit')
    assert.equal(mock.calls.emails.length, 10)
    // Emailing other people is not blocked by the copy limit.
    const others = await call(handler, { body: { ...BODY, recipients: ['client.one@example.org'], sendCopy: true }, ip: '10.1.0.98' })
    assert.equal(others.status, 200)
    // Next UTC day: copies work again.
    clock = Date.parse('2026-10-09T01:00:00Z')
    assert.equal((await call(handler, { body: self, ip: '10.1.0.97' })).status, 200)
  })

  test("yesterday's count does not carry over; the reservation (other people only) is written BEFORE any email", async () => {
    const rows = [row({ [F.reportEmailDay]: '2026-10-07', [F.reportEmailCount]: 5 })]
    const { handler, calls } = setup({ env: DEFAULT_ENV, rows })
    const r = await call(handler, { body: BODY })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body, { ok: true, sent: 2, copySent: true, remainingToday: 3 })
    assert.deepEqual(calls.patches, [{ id: 'recPAT', fields: { [F.reportEmailDay]: TODAY, [F.reportEmailCount]: 2 } }])
    assert.deepEqual(calls.log, ['airtable:get', 'airtable:patch', 'resend:client.one@example.org', 'resend:client.two@example.net', `resend:${SENDER}`])
    assert.equal(rows[0].fields[F.reportEmailCount], 2)
  })

  test('cap reservation failure -> 502, nothing sent', async () => {
    const { handler, calls } = setup({ fetchOpts: { airtable: 'patch-down' } })
    const r = await call(handler, { body: BODY })
    assert.equal(r.status, 502)
    assert.equal(r.body.error.sent, 0)
    assert.equal(calls.emails.length, 0)
  })
})

describe('sending', () => {
  test('one Resend call per recipient, reply_to the sender, fixed subject, PDF attached', async () => {
    const { handler, calls, pdfModels } = setup()
    const r = await call(handler, { body: { ...BODY, p25Cents: 1, typicalCents: 2, p75Cents: 3, subject: 'Custom subject', from: 'x@evil.example' } })
    assert.equal(r.status, 200)
    assert.equal(calls.emails.length, 3)
    const model = pdfModels[0]
    // Figures rebuilt on the server from the Houston cell, never from the body.
    assert.deepEqual([model.figures.p25Cents, model.figures.typicalCents, model.figures.p75Cents, model.figures.firmCount], [1750, 2000, 2420, 4])
    assert.equal(model.rateCents, 1700)
    assert.equal(model.preparedFor, 'Acme Logistics')
    assert.equal(model.snapshotDate, '2026-10-06')
    const content = Buffer.from('%PDF-1.4 test report').toString('base64')
    for (const email of calls.emails) {
      assert.equal(email.to.length, 1)
      assert.equal(email.from, ENV.SIGNAL_FROM_EMAIL)
      assert.equal(email.reply_to, SENDER)
      assert.equal(email.subject, 'Client Pay Market Report: Forklift Operator in Houston, TX')
      assert.deepEqual(email.attachments, [{ filename: model.fileName, content }])
      assert.match(email.attachments[0].filename, /^Client-Pay-Market-Report_.+\.pdf$/)
      assert.match(email.text, /^Pat Lee shared a Client Pay Market Report with you\./)
      assert.match(email.text, /Market Median: \$20\.00\/hr/)
      assert.match(email.text, /Client pay rate: \$17\.00\/hr/)
      assert.match(email.text, /\$3\.00\/hr below the market median \(about 15% below\)/)
      assert.match(email.text, /Sent via The Staffing Signal \(thestaffingsignal\.com\) on behalf of pat@agency-example\.com\. Replies go to pat@agency-example\.com\./)
    }
    // Recipients never see each other.
    const [one, two] = calls.emails
    assert.equal(JSON.stringify(one).includes('client.two@example.net'), false)
    assert.equal(JSON.stringify(two).includes('client.one@example.org'), false)
  })

  test('the sender is never emailed twice', async () => {
    const { handler, calls } = setup()
    const r = await call(handler, { body: { ...BODY, recipients: ['client.one@example.org', SENDER.toUpperCase()], sendCopy: true } })
    assert.equal(r.status, 200)
    assert.deepEqual(calls.emails.map((e) => e.to[0]), ['client.one@example.org', SENDER])
    assert.deepEqual(r.body, { ok: true, sent: 1, copySent: true, remainingToday: 99 })
  })

  test('a city without a figure falls back to the state; the email says so', async () => {
    const { handler, calls, pdfModels } = setup()
    const r = await call(handler, { body: { ...BODY, city: 'TX:dallas', sendCopy: false } })
    assert.equal(r.status, 200)
    assert.equal(pdfModels[0].scope.label, 'Texas')
    assert.equal(calls.emails[0].subject, 'Client Pay Market Report: Forklift Operator in Texas')
    assert.match(calls.emails[0].text, /There is no reliable Dallas, TX figure yet/)
  })

  test('409 no_benchmark when no scope has figures; nothing reserved or sent', async () => {
    const { handler, calls } = setup()
    const r = await call(handler, { body: { ...BODY, roleKey: 'registered-nurse' } })
    assert.equal(r.status, 409)
    assert.equal(r.body.error.code, 'no_benchmark')
    assert.equal(calls.patches.length, 0)
    assert.equal(calls.emails.length, 0)
  })

  test('a self-only request refused for no_benchmark does not use up a self-only send', async () => {
    const mock = mockFetch([row()])
    let clock = T
    const handler = createClientReportEmailHandler({
      env: ENV, fetchImpl: mock.fetchImpl, adapter, now: () => clock, sleep: async () => {},
      renderPdf: async () => Buffer.from('%PDF-1.4 test'), logger: { error() {}, warn() {}, info() {} }
    })
    const self = { ...BODY, recipients: [], sendCopy: true }
    for (let i = 0; i < 10; i++) {
      clock = T - 14 * 3600_000 + i * 11 * 60_000
      const r = await call(handler, { body: { ...self, roleKey: 'registered-nurse' }, ip: `10.2.0.${i}` })
      assert.equal(r.body.error.code, 'no_benchmark', `try ${i + 1}`)
    }
    clock = T + 3600_000
    assert.equal((await call(handler, { body: self, ip: '10.2.0.99' })).status, 200)
  })

  test('a failed send gives back only its own reservation, not one made in parallel', async () => {
    const s = setup({
      fetchOpts: { resendFailAt: 1 },
      // Another send reserves 3 people while this one is rendering.
      renderPdf: async () => { s.rows[0].fields[F.reportEmailCount] += 3; return Buffer.from('%PDF-1.4 test') }
    })
    const { handler, rows } = s
    const r = await call(handler, { body: BODY })
    assert.equal(r.status, 502)
    assert.equal(r.body.error.sent, 0)
    // Reserved 2, the parallel send added 3, the failure gave back 2.
    assert.equal(rows[0].fields[F.reportEmailCount], 3)
    assert.equal(r.body.error.remainingToday, 97)
  })

  test('503 when the market data feed is unavailable', async () => {
    const mock = mockFetch()
    const handler = createClientReportEmailHandler({ env: ENV, fetchImpl: mock.fetchImpl, adapter: { dataMode: 'production', load: async () => ({ available: false }) }, now: () => T, renderPdf: async () => Buffer.from('x'), logger: { error() {} } })
    const r = await call(handler, { body: BODY })
    assert.equal(r.status, 503)
    assert.equal(r.body.error.code, 'feed_unavailable')
    assert.equal(mock.calls.emails.length, 0)
  })

  test('Resend failure -> 502 send_failed with how many went out; only what was sent is counted', async () => {
    const { handler, calls, rows } = setup({ fetchOpts: { resendFailAt: 2 } })
    const r = await call(handler, { body: BODY })
    assert.equal(r.status, 502)
    assert.equal(r.body.error.code, 'send_failed')
    assert.equal(r.body.error.sent, 1)
    assert.equal(r.body.error.remainingToday, 99)
    assert.deepEqual(r.body.error.unsent, [1])
    assert.equal(calls.emails.length, 1)
    // Reserved the 2 other people before sending (the copy is free), then
    // settled to the 1 that went out.
    assert.deepEqual(calls.patches.map((p) => p.fields[F.reportEmailCount]), [2, 1])
    assert.equal(rows[0].fields[F.reportEmailCount], 1)
  })

  test('rollback after a Resend failure counts only other people actually sent, never your own address', async () => {
    // Your address typed first: it becomes the copy (sent last), so the
    // server sends one, two, then you; "two" fails.
    const { handler, calls, rows } = setup({ fetchOpts: { resendFailAt: 2 }, rows: [row({ [F.reportEmailDay]: TODAY, [F.reportEmailCount]: 1 })] })
    const r = await call(handler, { body: { ...BODY, recipients: [SENDER, 'client.one@example.org', 'client.two@example.net'], sendCopy: false } })
    assert.equal(r.status, 502)
    assert.equal(r.body.error.sent, 1)
    assert.equal(r.body.error.remainingToday, 98)
    // Positions in the submitted list still to send: you (no copy yet) and "two".
    assert.deepEqual(r.body.error.unsent, [0, 2])
    assert.deepEqual(calls.patches.map((p) => p.fields[F.reportEmailCount]), [3, 2])
    assert.equal(rows[0].fields[F.reportEmailCount], 2)
  })

  test('only the copy failing releases nothing (the copy was never counted)', async () => {
    const { handler, calls, rows } = setup({ fetchOpts: { resendFailAt: 2 } })
    const r = await call(handler, { body: { ...BODY, recipients: ['client.one@example.org'], sendCopy: true } })
    assert.equal(r.status, 502)
    assert.equal(r.body.error.sent, 1)
    assert.equal(r.body.error.copySent, false)
    assert.deepEqual(r.body.error.unsent, [])
    assert.equal(r.body.error.remainingToday, 99)
    assert.deepEqual(calls.patches.map((p) => p.fields[F.reportEmailCount]), [1])
    assert.equal(rows[0].fields[F.reportEmailCount], 1)
  })

  test('a failed release keeps the reservation (errs on the safe side)', async () => {
    const mock = mockFetch([row()], { resendFailAt: 1 })
    let patches = 0
    const fetchImpl = async (url, opts = {}) => {
      if (opts.method === 'PATCH' && ++patches === 2) return { ok: false, status: 500, json: async () => ({}) }
      return mock.fetchImpl(url, opts)
    }
    const handler = createClientReportEmailHandler({
      env: ENV, fetchImpl, adapter, now: () => T, sleep: async () => {},
      renderPdf: async () => Buffer.from('%PDF-1.4 test'), logger: { error() {}, warn() {}, info() {} }
    })
    const r = await call(handler, { body: BODY })
    assert.equal(r.status, 502)
    assert.equal(r.body.error.sent, 0)
    assert.equal(r.body.error.remainingToday, 98)
    assert.equal(patches, 2)
    assert.equal(mock.rows[0].fields[F.reportEmailCount], 2)
  })

  test('a Resend 429 is retried once', async () => {
    const { handler, calls } = setup({ fetchOpts: { resend429Once: true } })
    const r = await call(handler, { body: BODY })
    assert.equal(r.status, 200)
    assert.equal(calls.emails.length, 3)
  })

  test('PDF failure -> 500 render_failed, nothing sent, nothing counted', async () => {
    const { handler, calls, rows } = setup({ renderPdf: async () => { throw new Error('boom 1700 pat@agency-example.com') } })
    const r = await call(handler, { body: BODY })
    assert.equal(r.status, 500)
    assert.equal(r.body.error.code, 'render_failed')
    assert.equal(r.body.error.remainingToday, 100)
    assert.equal(calls.emails.length, 0)
    assert.equal(rows[0].fields[F.reportEmailCount], 0)
  })
})

describe('confirmed email', () => {
  test('an unconfirmed account cannot email anyone else: 403 email_not_verified, nothing reserved or sent', async () => {
    for (const verified of [undefined, false, 'true']) {
      const { handler, calls } = setup({ rows: [row({ [F.verified]: verified })] })
      const r = await call(handler, { body: BODY })
      assert.equal(r.status, 403, String(verified))
      assert.equal(r.body.error.code, 'email_not_verified')
      assert.equal(calls.patches.length, 0)
      assert.equal(calls.emails.length, 0)
    }
  })

  test('an unconfirmed account may still send only its own copy', async () => {
    const { handler, calls } = setup({ rows: [row({ [F.verified]: undefined })] })
    const r = await call(handler, { body: { ...BODY, recipients: [], sendCopy: true } })
    assert.equal(r.status, 200)
    assert.equal(r.body.sent, 0)
    assert.equal(r.body.copySent, true)
    assert.deepEqual(calls.emails.map((e) => e.to[0]), [SENDER])
  })
})

describe('escaping and privacy', () => {
  test('every user string is HTML-escaped; a name with a link is replaced by the email', async () => {
    const rows = [row({ [F.name]: '<script>alert(1)</script> Pat' })]
    const { handler, calls } = setup({ rows })
    const note = 'Hi "team" & <b>friends</b>\n<img src=x onerror=alert(1)>'
    await call(handler, { body: { ...BODY, note, preparedFor: '<i>Acme</i>' } })
    const { html, text } = calls.emails[0]
    assert.equal(html.includes('<script>'), false)
    assert.equal(html.includes('<img src=x'), false)
    assert.equal(html.includes('<b>friends'), false)
    assert.ok(html.includes(esc('<script>alert(1)</script> Pat')))
    assert.ok(html.includes('Hi &quot;team&quot; &amp; &lt;b&gt;friends&lt;/b&gt;<br>&lt;img src=x onerror=alert(1)&gt;'))
    assert.ok(text.includes(note))

    const linkName = setup({ rows: [row({ [F.name]: 'Win big at scam-site.ru' })] })
    await call(linkName.handler, { body: BODY })
    assert.match(linkName.calls.emails[0].text, /^pat@agency-example\.com shared a Client Pay Market Report/)
    assert.equal(linkName.calls.emails[0].html.includes('scam-site'), false)
  })

  test('template output for a nationwide report reads naturally', () => {
    const model = {
      roleLabel: 'Forklift Operator', scope: { level: 'nationwide', label: 'Nationwide' }, fallbackNote: null,
      figures: { p25Cents: 1700, typicalCents: 1850, p75Cents: 2000 }, rateCents: 1850, gap: { gapCents: 0, pct: 0, direction: 'at' }
    }
    const mail = buildReportEmail({ model, senderLabel: 'Pat', senderEmail: SENDER, note: '' })
    assert.equal(mail.subject, 'Client Pay Market Report: Forklift Operator across the U.S.')
    assert.match(mail.text, /Market gap: At the market median/)
    assert.equal(mail.text.includes('Message from'), false)
  })

  test('template shows the limited-data note under the figures only when the model is limited', () => {
    const NOTE = 'Based on a small number of staffing firms (3). Treat these figures as a directional guide.'
    const base = {
      roleLabel: 'Forklift Operator', scope: { level: 'city', label: 'Houston, TX' }, fallbackNote: null,
      figures: { p25Cents: 1750, typicalCents: 2000, p75Cents: 2420, firmCount: 3 }, rateCents: 1700, gap: { gapCents: -300, pct: 15, direction: 'below' }
    }
    const limited = buildReportEmail({ model: { ...base, limitedData: true, limitedDataNote: NOTE }, senderLabel: 'Pat', senderEmail: SENDER, note: '' })
    assert.ok(limited.text.includes(`Market gap: $3.00/hr below the market median (about 15% below)
${NOTE}`))
    assert.ok(limited.html.includes(esc(NOTE)))
    assert.ok(limited.html.indexOf(esc(NOTE)) > limited.html.indexOf('</table>'))
    const plain = buildReportEmail({ model: { ...base, figures: { ...base.figures, firmCount: 12 }, limitedData: false, limitedDataNote: null }, senderLabel: 'Pat', senderEmail: SENDER, note: '' })
    assert.equal(plain.text.includes('small number of staffing firms'), false)
    assert.equal(plain.html.includes('small number of staffing firms'), false)
  })

  test('nothing sensitive is logged or stored: rate, recipients, note, names, sender email', async () => {
    const lines = []
    const logger = { error: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push(a.join(' ')), info: (...a) => lines.push(a.join(' ')) }
    const saved = { error: console.error, log: console.log, warn: console.warn, info: console.info }
    Object.keys(saved).forEach((k) => { console[k] = (...a) => lines.push(a.join(' ')) })
    let stored
    try {
      for (const fetchOpts of [{}, { resendFailAt: 1 }, { airtable: 'patch-down' }]) {
        const s = setup({ fetchOpts, logger })
        await call(s.handler, { body: BODY })
        stored = s.rows
      }
      const s = setup({ logger, renderPdf: async () => { throw new Error('render 1700 Acme Logistics') } })
      await call(s.handler, { body: BODY })
    } finally {
      Object.assign(console, saved)
    }
    const logged = lines.join('\n')
    assert.ok(lines.length > 0, 'failures are logged')
    for (const secret of ['1700', '17.00', 'client.one', 'client.two', 'Acme', 'Pat Lee', 'discussed', SENDER]) {
      assert.equal(logged.includes(secret), false, `logged ${secret}`)
    }
    const airtable = JSON.stringify(stored)
    for (const secret of ['1700', 'client.one', 'Acme', 'discussed']) assert.equal(airtable.includes(secret), false, `stored ${secret}`)
  })

  test('sendEmail stays backward compatible: no reply_to or attachments unless given', async () => {
    let body
    const fetchImpl = async (url, opts) => { body = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({}) } }
    await sendEmail({ resendKey: 'k', from: 'f@x.com' }, fetchImpl, { to: 'a@x.com', subject: 's', html: 'h', text: 't' })
    assert.deepEqual(Object.keys(body).sort(), ['from', 'html', 'subject', 'text', 'to'])
    await sendEmail({ resendKey: 'k', from: 'f@x.com' }, fetchImpl, { to: 'a@x.com', subject: 's', html: 'h', text: 't', replyTo: 'r@x.com', attachments: [{ filename: 'a.pdf', content: 'QQ==' }] })
    assert.equal(body.reply_to, 'r@x.com')
    assert.deepEqual(body.attachments, [{ filename: 'a.pdf', content: 'QQ==' }])
  })
})

describe('wiring', () => {
  test('vercel.json rewrites the public path to the signal-data function', () => {
    const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
    const rewrite = vercel.rewrites.find((r) => r.source === '/api/signal/client-report/email')
    assert.deepEqual(rewrite, { source: '/api/signal/client-report/email', destination: '/api/signal-data?route=client-report-email' })
    // It must come before the SPA catch-all.
    const catchAll = vercel.rewrites.findIndex((r) => r.source === '/((?!api/).*)')
    assert.ok(vercel.rewrites.indexOf(rewrite) < catchAll)
  })

  test('signal-data dispatches client-report-email; off (404) without the flag', async () => {
    const saved = process.env.SIGNAL_CLIENT_REPORT_EMAIL_ENABLED
    const { default: dispatch } = await import('../../api/signal-data.js')
    const hit = (method) => new Promise((resolve) => {
      const headers = {}
      const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v }, end: (b) => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }) }
      dispatch({ method, query: { route: 'client-report-email' }, headers: { 'content-type': 'application/json' }, body: {} }, res)
    })
    try {
      delete process.env.SIGNAL_CLIENT_REPORT_EMAIL_ENABLED
      assert.deepEqual(await hit('POST'), { status: 404, body: { error: 'not_found' } })
      process.env.SIGNAL_CLIENT_REPORT_EMAIL_ENABLED = '1'
      assert.equal((await hit('GET')).status, 405)
      assert.equal((await hit('POST')).body.error.code, 'bad_origin')
    } finally {
      if (saved === undefined) delete process.env.SIGNAL_CLIENT_REPORT_EMAIL_ENABLED
      else process.env.SIGNAL_CLIENT_REPORT_EMAIL_ENABLED = saved
    }
  })
})

describe('dev server mount', () => {
  test('the dev plugin mounts the email route', () => {
    const routes = plugin.createSignalRoutes()
    assert.equal(typeof routes.get('/api/signal/client-report/email'), 'function')
  })

  test('real handler, simulated sign-in, fake sender (nothing leaves the machine)', async () => {
    const info = []
    const handler = createDevClientReportEmailHandler({
      adapter: createFixtureAdapter(),
      renderPdf: async () => Buffer.from('%PDF-dev'),
      logger: { info: (m) => info.push(m), error: (m) => info.push(m), warn: () => {} },
      env: {}
    })
    const devCall = (cookie, origin = 'http://localhost:5173') => call(handler, { body: { ...BODY, state: null, city: null }, cookie, origin, headers: { host: 'localhost:5173' } })
    assert.equal((await devCall(null)).status, 401)
    assert.equal((await devCall('ssp_sim_access=authorized', 'http://evil.example')).status, 403)
    const r = await devCall('ssp_sim_access=authorized')
    assert.equal(r.status, 200)
    assert.deepEqual(r.body, { ok: true, sent: 2, copySent: true, remainingToday: 3 })
    assert.ok(info.every((m) => m === '[signal dev] simulated client report email (nothing was sent)'))
    assert.equal(devSameOrigin({ headers: { host: 'localhost:5173', origin: 'http://localhost:5173' } }), true)
    assert.equal(devSameOrigin({ headers: { host: 'localhost:5173' } }), false)
  })

  test('the email route accepts a 16 kB body; other routes keep 10 kB', async () => {
    const seen = []
    const stub = (req, res) => { seen.push(req.url); res.statusCode = 200; res.end('{}') }
    const routes = new Map([['/api/signal/client-report/email', stub], ['/api/signal/dev/notify', stub]])
    const middleware = plugin.createSignalMiddleware(routes)
    const body = JSON.stringify({ note: 'x'.repeat(12 * 1024) })
    const send = (url) => new Promise((resolve) => {
      const req = Object.assign(Readable.from([Buffer.from(body)]), { url, method: 'POST', headers: { 'content-type': 'application/json' } })
      const res = { statusCode: 200, headers: {}, headersSent: false, setHeader(n, v) { this.headers[n] = v }, getHeader(n) { return this.headers[n] }, end() { this.headersSent = true; resolve(this.statusCode) } }
      middleware(req, res, () => resolve('next'))
    })
    assert.equal(await send('/api/signal/client-report/email'), 200)
    assert.equal(await send('/api/signal/dev/notify'), 413)
    assert.equal(plugin.EMAIL_BODY_LIMIT_BYTES, 16 * 1024)
  })

  test('SIGNAL_DEV_DATA=snapshot serves the committed snapshot without SIGNAL_FEED_ENABLED', async () => {
    const saved = process.env.SIGNAL_FEED_ENABLED
    delete process.env.SIGNAL_FEED_ENABLED
    try {
      const real = plugin.createDevAdapter({ dataSource: 'snapshot' })
      assert.equal(real.dataMode, 'production')
      const loaded = await real.load()
      assert.equal(loaded.available, true)
      assert.ok(Array.isArray(loaded.data.monthly))
      assert.equal(plugin.createDevAdapter({ dataSource: undefined }).dataMode, 'development_example')
    } finally {
      if (saved !== undefined) process.env.SIGNAL_FEED_ENABLED = saved
    }
  })
})
