import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyRecords, makeDaily, dayKey } from '../../api/_lib/analyticsDaily.js'

const res = () => { const r = { headers: {}, setHeader(k, v) { r.headers[k] = v }, end(b) { r.body = JSON.parse(b) } }; return r }
const env = { CRON_SECRET: 'x'.repeat(20), AIRTABLE_API_KEY: 'k' }
const auth = { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }

describe('daily stats', () => {
  test('Eastern day keys, zero-filled days, summed columns', () => {
    const now = new Date('2026-10-18T03:00:00Z') // 10/17 11pm Eastern
    assert.equal(dayKey(now), '2026-10-17')
    const recs = buildDailyRecords([
      { day: '2026-10-17', event: 'page_view', n: 5 },
      { day: '2026-10-17', event: 'report_email_accepted', n: 2 },
      { day: '2026-10-01', event: 'page_view', n: 99 }
    ], now, 3, 'S')
    assert.deepEqual(recs.map((r) => r.fields.Date), ['2026-10-15', '2026-10-16', '2026-10-17'])
    const last = recs[2].fields
    assert.equal(last['Page Views'], 5)
    assert.equal(last['Reports Emailed'], 2)
    assert.equal(last['Total Events'], 7)
    assert.equal(recs[0].fields['Page Views'], 0)
  })
  test('rejects without cron secret', async () => {
    const r = res()
    await makeDaily({ env, getDb: () => ({}) })({ headers: {} }, r)
    assert.equal(r.statusCode, 401)
  })
  test('upserts by Date in batches of 10', async () => {
    const calls = []
    const db = { query: async (sql) => (sql.includes('to_char') ? { rows: [] } : {}) }
    const r = res()
    await makeDaily({ env, getDb: () => db, now: () => new Date('2026-10-18T12:00:00Z'), fetchImpl: async (u, o) => { calls.push(JSON.parse(o.body)); return { ok: true } } })(auth, r)
    assert.equal(r.statusCode, 200)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].performUpsert, { fieldsToMergeOn: ['Date'] })
    assert.equal(calls[0].records.length, 8)
  })
  test('Airtable failure returns 500', async () => {
    const db = { query: async () => ({ rows: [] }) }
    const r = res()
    await makeDaily({ env, getDb: () => db, fetchImpl: async () => ({ ok: false, status: 422 }) })(auth, r)
    assert.equal(r.statusCode, 500)
  })
})
