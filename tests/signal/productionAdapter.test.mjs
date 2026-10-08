import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createProductionAdapter, validateSnapshot, validateMonthly, loadMonthlySnapshots, DEFAULT_SNAPSHOT_PATH, MAX_AGE_DAYS
} from '../../api/_lib/signal/productionAdapter.js'
import { createSnapshotHandler, createPayHandler } from '../../api/_lib/signal/handlers.js'
import { ROLES, roleByKey } from '../../shared/signal/taxonomy.js'
import { cityByKey } from '../../shared/signal/geography.js'

const NOW = Date.parse('2026-10-04T12:00:00Z')
const ok = (firms = 8, share = 0.2) => ({ status: 'verified', distinctFirms: firms, maxFirmShare: share })

function sample(overrides = {}) {
  return {
    format: 'staffing-signal-aggregate-snapshot',
    schemaVersion: 1,
    calcVersion: 'signal-agg-1.0.0',
    generatedAt: '2026-10-04T10:00:00Z',
    snapshotDate: '2026-10-04',
    data: {
      snapshot: { label: 'Week of October 4, 2026', exactDate: '2026-10-04', refreshCadence: 'weekly', note: 'n' },
      coverage: { postings: { value: 1000, approximate: false, period: 'last 90 days' } },
      issueCards: [],
      cityVolume: { metric: 'm', windowDays: 45, scope: 's', jobScope: 'all jobs', rows: [{ cityKey: 'TX:houston', postings: 120, checks: ok() }] },
      momentum: { windowDays: 45, previousWindowDays: 45, coverage: 'publishable', rows: [{ code: 'TX', momentumPct: 12, checks: ok() }] },
      pay: [{ roleKey: 'forklift-operator', level: 'nationwide', state: null, city: null, p25Cents: 1713, typicalCents: 1850, p75Cents: 2000, payBasis: 'hourly', currency: 'USD', checks: ok() }],
      mostPostedFamilies: { labels: ['Warehouse Associate'], note: 'n' }
    },
    ...overrides
  }
}

function withData(mutate) {
  const s = sample()
  mutate(s.data)
  return s
}

function writeTemp(obj) {
  const dir = mkdtempSync(join(tmpdir(), 'signal-snap-'))
  const file = join(dir, 'snap.json')
  writeFileSync(file, typeof obj === 'string' ? obj : JSON.stringify(obj))
  return file
}

const adapterFor = (obj, { enabled = true } = {}) =>
  createProductionAdapter({ snapshotPath: writeTemp(obj), enabled: () => enabled, now: () => NOW })

describe('production adapter fails closed', () => {
  test('valid snapshot is served only when the feed is switched on', async () => {
    assert.deepEqual(await adapterFor(sample(), { enabled: false }).load(), { available: false })
    const on = await adapterFor(sample()).load()
    assert.equal(on.available, true)
    assert.equal(on.data.snapshot.freshness, 'current')
    assert.equal(on.data.snapshot.methodologyVersion, 'signal-agg-1.0.0')
  })

  test('default entrypoint stays off without SIGNAL_FEED_ENABLED', async () => {
    const saved = process.env.SIGNAL_FEED_ENABLED
    delete process.env.SIGNAL_FEED_ENABLED
    try {
      assert.deepEqual(await createProductionAdapter().load(), { available: false })
    } finally {
      if (saved !== undefined) process.env.SIGNAL_FEED_ENABLED = saved
    }
  })

  test('missing, unreadable and non-JSON files are unavailable', async () => {
    const missing = createProductionAdapter({ snapshotPath: join(tmpdir(), 'no-such-signal.json'), enabled: () => true, now: () => NOW })
    assert.deepEqual(await missing.load(), { available: false })
    assert.deepEqual(await adapterFor('{not json').load(), { available: false })
  })

  test('stale, future-dated or undated snapshots are unavailable', async () => {
    const stale = new Date(NOW - (MAX_AGE_DAYS + 1) * 86400000).toISOString()
    for (const generatedAt of [stale, '2026-10-09T00:00:00Z', undefined, 'yesterday']) {
      assert.deepEqual(await adapterFor(sample({ generatedAt })).load(), { available: false }, String(generatedAt))
    }
  })

  test('unknown format, schema or calculation version is unavailable', async () => {
    for (const o of [{ format: 'x' }, { schemaVersion: 2 }, { calcVersion: 'signal-agg-9.9.9' }]) {
      assert.equal(validateSnapshot(sample(o), { now: NOW }), null)
    }
  })

  test('one pay cell failing the privacy rule rejects the whole snapshot', () => {
    const bad = [ok(2, 0.2), ok(5, 0.51), { ...ok(), status: 'not_verified' }, { status: 'verified' }, null]
    for (const checks of bad) {
      const s = withData((d) => d.pay.push({ ...d.pay[0], level: 'city', state: 'TX', city: 'TX:houston', checks }))
      assert.equal(validateSnapshot(s, { now: NOW }), null, JSON.stringify(checks))
    }
    assert.ok(validateSnapshot(withData((d) => { d.pay[0].checks = ok(5, 0.5) }), { now: NOW }), 'exactly 5 firms / 50% passes')
  })

  test('demand rows (city volume and momentum) need passing checks too', () => {
    assert.equal(validateSnapshot(withData((d) => { d.cityVolume.rows[0].checks = ok(2) }), { now: NOW }), null)
    assert.equal(validateSnapshot(withData((d) => { d.momentum.rows[0].checks = ok(9, 0.6) }), { now: NOW }), null)
  })

  test('malformed pay figures are rejected', () => {
    const cases = [
      (c) => { c.p25Cents = 1900 },
      (c) => { c.typicalCents = 18.5 },
      (c) => { c.level = 'county' },
      (c) => { c.level = 'city'; c.state = 'TX'; c.city = 'CA:los-angeles' },
      (c) => { c.payBasis = 'weekly_package' }
    ]
    for (const m of cases) assert.equal(validateSnapshot(withData((d) => m(d.pay[0])), { now: NOW }), null)
  })

  test('served responses never carry raw checks or shares (firmCount is the only approved count)', async () => {
    const adapter = adapterFor(sample())
    const resolveAccess = () => ({ access: 'authorized', simulated: false })
    for (const [handler, query] of [[createSnapshotHandler({ adapter, resolveAccess }), {}],
      [createPayHandler({ adapter, resolveAccess }), { role: 'forklift-operator' }]]) {
      const res = { statusCode: 200, headers: {}, setHeader(n, v) { this.headers[n.toLowerCase()] = v }, getHeader(n) { return this.headers[n.toLowerCase()] }, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this } }
      await handler({ method: 'GET', query, headers: {} }, res)
      assert.equal(res.statusCode, 200)
      const text = JSON.stringify(res.body)
      assert.ok(!/distinctFirms|maxFirmShare|verified/.test(text))
    }
  })
})

describe('monthly snapshots (pay trend)', () => {
  const month = (m, overrides = {}) => ({
    format: 'staffing-signal-monthly-aggregates',
    schemaVersion: 1,
    calcVersion: 'signal-month-1.0.0',
    month: m,
    reliability: { reliable: true },
    pay: [{ roleKey: 'forklift-operator', level: 'nationwide', state: null, city: null, n: 41, p25Cents: 1700, typicalCents: 1840, p75Cents: 1990, checks: ok(9) }],
    ...overrides
  })
  function monthlyDir(files) {
    const dir = mkdtempSync(join(tmpdir(), 'signal-monthly-'))
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), typeof body === 'string' ? body : JSON.stringify(body))
    return dir
  }
  const adapterWithMonthly = (dir) => createProductionAdapter({ snapshotPath: writeTemp(sample()), monthlyDir: dir, enabled: () => true, now: () => NOW })

  test('loads valid months ascending, reduced to the fields the trend uses', async () => {
    const months = await loadMonthlySnapshots(monthlyDir({ '2026-09.json': month('2026-09'), '2026-08.json': month('2026-08'), 'notes.txt': 'x' }))
    assert.deepEqual(months.map((m) => m.month), ['2026-08', '2026-09'])
    assert.deepEqual(Object.keys(months[0].pay[0]).sort(), ['checks', 'city', 'currency', 'level', 'p25Cents', 'p75Cents', 'payBasis', 'roleKey', 'state', 'typicalCents'])
  })

  test('a bad file is skipped on its own; the snapshot stays available', async () => {
    const dir = monthlyDir({
      '2026-05.json': '{not json',
      '2026-06.json': month('2026-06', { format: 'other' }),
      '2026-07.json': month('2026-07', { reliability: { reliable: false } }),
      '2026-08.json': month('2026-09'),
      '2026-09.json': month('2026-09', { pay: [{ ...month('x').pay[0], checks: ok(2) }] }),
      '2026-10.json': month('2026-10', { pay: [{ ...month('x').pay[0], payBasis: 'weekly_package' }] }),
      '2026-11.json': month('2026-11')
    })
    const loaded = await adapterWithMonthly(dir).load()
    assert.equal(loaded.available, true)
    assert.deepEqual(loaded.data.monthly.map((m) => m.month), ['2026-11'])
  })

  test('a missing folder means no trend, never an error', async () => {
    const loaded = await adapterWithMonthly(join(tmpdir(), 'no-such-monthly-dir')).load()
    assert.equal(loaded.available, true)
    assert.deepEqual(loaded.data.monthly, [])
    assert.equal(validateMonthly(null), null)
  })

  test('the committed monthly files validate', async () => {
    const months = await loadMonthlySnapshots()
    assert.ok(months.length >= 1)
    assert.ok(months.every((m) => /^\d{4}-\d{2}$/.test(m.month) && m.pay.length > 0))
  })

  test('vercel.json bundles the monthly files with the pay function', () => {
    const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
    const glob = vercel.functions['api/signal-data.js'].includeFiles
    assert.match(glob, /monthly/)
    assert.match(glob, /report/)
  })
})

describe('exported snapshot file', { skip: existsSync(DEFAULT_SNAPSHOT_PATH) ? false : 'no exported snapshot' }, () => {
  const raw = existsSync(DEFAULT_SNAPSHOT_PATH) ? JSON.parse(readFileSync(DEFAULT_SNAPSHOT_PATH, 'utf8')) : null

  test('validates as of its own generation time', () => {
    assert.ok(validateSnapshot(raw, { now: Date.parse(raw.generatedAt) }))
  })

  test('every metric passes the privacy rule and is labeled with its method', () => {
    const all = [...raw.data.pay, ...raw.data.cityVolume.rows, ...raw.data.momentum.rows]
    assert.ok(all.length > 0)
    for (const m of all) {
      assert.equal(m.checks.status, 'verified')
      assert.ok(m.checks.distinctFirms >= 3 && m.checks.maxFirmShare <= 0.5)
    }
    assert.match(raw.method.quantile, /exclusive/)
    assert.match(raw.method.newPosting, /COALESCE\(posting_date, first_seen_date\)/)
  })

  test('pay roles exist in the taxonomy and no withheld cell slips through', () => {
    for (const c of raw.data.pay) assert.ok(roleByKey(c.roleKey), c.roleKey)
    for (const key of Object.keys(raw.roleCoverage)) assert.ok(roleByKey(key), key)
    assert.ok(!raw.data.pay.some((c) => c.checks.distinctFirms < 3 || c.checks.maxFirmShare > 0.5))
  })

  test('every taxonomy role publishes a nationwide pay range', () => {
    const nationwide = new Set(raw.data.pay.filter((c) => c.level === 'nationwide').map((c) => c.roleKey))
    const missing = ROLES.map((r) => r.key).filter((key) => !nationwide.has(key))
    assert.deepEqual(missing, [])
  })

  test('every new-sector role is accounted for in roleCoverage or reported as no data', () => {
    const newSectors = new Set(['construction', 'skilled-trades', 'transportation', 'hospitality'])
    const covered = ROLES.filter((r) => newSectors.has(r.sectorKey) && raw.roleCoverage[r.key]?.nationwide === 'publishable')
    assert.ok(covered.length >= 10)
  })

  test('city keys use the shared geography key format', () => {
    const known = raw.data.cityVolume.rows.filter((r) => cityByKey(r.cityKey))
    assert.ok(known.length >= 10)
  })

  test('contains no company names or posting-level fields', () => {
    const text = JSON.stringify(raw)
    assert.ok(!/"(company|employer|job_title|canonical_job_id|shared_company_id)"\s*:/.test(text))
  })
})
