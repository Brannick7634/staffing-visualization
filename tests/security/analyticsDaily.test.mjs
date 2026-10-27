import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyRecords, makeDaily, dayKey, buildOpenUpdates } from '../../api/_lib/analyticsDaily.js'

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
    assert.deepEqual(calls[0].performUpsert, { fieldsToMergeOn: ['Day Key'] })
    assert.equal(calls[0].records.length, 8)
  })
  test('Airtable failure returns 500', async () => {
    const db = { query: async () => ({ rows: [] }) }
    const r = res()
    await makeDaily({ env, getDb: () => db, fetchImpl: async () => ({ ok: false, status: 422 }) })(auth, r)
    assert.equal(r.statusCode, 500)
  })
})

describe('Valley link opens', () => {
  const opens = [{ ref: 'recA', n: 2, first: '2026-10-26T14:00:00Z', last: '2026-10-27T09:00:00Z' }, { ref: 'recB', n: 1, first: '2026-10-26T15:00:00Z', last: '2026-10-26T15:00:00Z' }]
  test('fills counts, dates and a blank follow-up only', () => {
    const u = buildOpenUpdates(opens, [
      { id: 'r1', fields: { 'Link Ref': 'recA' } },
      { id: 'r2', fields: { 'Link Ref': 'recB', 'Link Opens': 0, 'Insurance Follow-up': 'Contacted' } },
      { id: 'r3', fields: { 'Link Ref': 'recZ' } }
    ])
    assert.equal(u.length, 2)
    assert.deepEqual(u[0].fields, { 'Link Opens': 2, 'First Link Open': '2026-10-26T14:00:00.000Z', 'Last Link Open': '2026-10-27T09:00:00.000Z', 'Insurance Follow-up': 'To contact' })
    assert.equal(u[1].fields['Insurance Follow-up'], undefined)
  })
  test('skips rows whose count has not changed', () => {
    assert.equal(buildOpenUpdates(opens, [{ id: 'r1', fields: { 'Link Ref': 'recA', 'Link Opens': 2 } }]).length, 0)
  })
  test('a link-opens failure never fails the stats run', async () => {
    const db = { query: async (sql) => { if (sql.includes('smart_link_opened')) throw new Error('boom'); return { rows: [] } } }
    const r = { headers: {}, setHeader () {}, end (b) { this.body = b } }
    await makeDaily({ env, getDb: () => db, fetchImpl: async () => ({ ok: true }) })(auth, r)
    assert.equal(r.statusCode, 200)
    assert.equal(JSON.parse(r.body).linkOpens, 'failed')
  })
})
