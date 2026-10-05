// Production data adapter for /api/signal/*.
//
// Serves the verified aggregate snapshot written by
// scripts/export_signal_snapshot.py to api/_lib/signal/data/signal-snapshot.json.
// The file ships inside the function bundle (it sits beside this module and is
// read via import.meta.url, which Vercel's file tracing follows); it is never a
// static asset, so the browser can only reach it through these handlers.
//
// Fails closed — { available: false }, so the handlers answer 503
// feed_unavailable — when ANY of these hold:
//   * the feed is not switched on (SIGNAL_FEED_ENABLED !== '1');
//   * the file is missing, unreadable or not JSON;
//   * format / schema / calculation version are not the ones this code knows;
//   * generatedAt is missing, in the future, or older than MAX_AGE_DAYS;
//   * any row is malformed or its privacy checks are not verified passes.
// One bad row rejects the whole snapshot: a broken export is not partly trusted.
//
// Server-only. Never import dev/ or dev-fixtures/ from here.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { DATA_MODE } from '../../../shared/signal/contract.js'
import { evaluatePublication } from './privacy.js'

export const SNAPSHOT_FORMAT = 'staffing-signal-aggregate-snapshot'
export const SNAPSHOT_SCHEMA_VERSION = 1
export const KNOWN_CALC_VERSIONS = Object.freeze(['signal-agg-1.0.0'])
export const MAX_AGE_DAYS = 10
export const DEFAULT_SNAPSHOT_PATH = fileURLToPath(new URL('./data/signal-snapshot.json', import.meta.url))

const DAY_MS = 86400000
const UNAVAILABLE = Object.freeze({ available: false })
const PROD = { mode: DATA_MODE.PRODUCTION }
const LEVELS = new Set(['nationwide', 'state', 'city'])
const STATE = /^[A-Z]{2}$/
const CITY = /^[A-Z]{2}:[a-z0-9-]+$/

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isCount = (v) => Number.isSafeInteger(v) && v >= 0
const isCents = (v) => Number.isSafeInteger(v) && v > 0
const verified = (checks) => evaluatePublication(checks, PROD).publishable

function validPayCell(c) {
  if (!isObj(c) || typeof c.roleKey !== 'string' || !LEVELS.has(c.level)) return false
  if (c.level === 'nationwide' && (c.state !== null || c.city !== null)) return false
  if (c.level === 'state' && (!STATE.test(c.state ?? '') || c.city !== null)) return false
  if (c.level === 'city' && (!STATE.test(c.state ?? '') || !CITY.test(c.city ?? '') || !c.city.startsWith(`${c.state}:`))) return false
  if (![c.p25Cents, c.typicalCents, c.p75Cents].every(isCents)) return false
  if (c.p25Cents > c.typicalCents || c.typicalCents > c.p75Cents) return false
  return c.payBasis === 'hourly' && c.currency === 'USD' && verified(c.checks)
}

function validCityRow(r) {
  return isObj(r) && CITY.test(r.cityKey ?? '') && isCount(r.postings) && r.postings > 0 && verified(r.checks)
}

function validMomentumRow(r) {
  return isObj(r) && STATE.test(r.code ?? '') && Number.isFinite(r.momentumPct) && verified(r.checks)
}

// validateSnapshot(raw, { now }) -> adapter data object, or null if unusable.
export function validateSnapshot(raw, { now = Date.now(), maxAgeDays = MAX_AGE_DAYS } = {}) {
  if (!isObj(raw)) return null
  if (raw.format !== SNAPSHOT_FORMAT || raw.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) return null
  if (!KNOWN_CALC_VERSIONS.includes(raw.calcVersion)) return null
  const generated = typeof raw.generatedAt === 'string' ? Date.parse(raw.generatedAt) : NaN
  if (!Number.isFinite(generated)) return null
  const age = now - generated
  if (age < -DAY_MS || age > maxAgeDays * DAY_MS) return null

  const d = raw.data
  if (!isObj(d) || !isObj(d.snapshot) || !isObj(d.coverage) || !isObj(d.cityVolume) || !isObj(d.momentum)) return null
  if (!Array.isArray(d.pay) || !Array.isArray(d.cityVolume.rows) || !Array.isArray(d.momentum.rows)) return null
  if (d.pay.length === 0 || !d.pay.every(validPayCell)) return null
  if (!d.cityVolume.rows.every(validCityRow)) return null
  if (!d.momentum.rows.every(validMomentumRow)) return null
  if (d.issueCards !== undefined && !Array.isArray(d.issueCards)) return null

  return {
    ...d,
    snapshot: {
      ...d.snapshot,
      freshness: 'current',
      lastSuccessfulRefresh: new Date(generated).toISOString(),
      methodologyVersion: raw.calcVersion
    }
  }
}

export function createProductionAdapter({
  snapshotPath = DEFAULT_SNAPSHOT_PATH,
  enabled = () => process.env.SIGNAL_FEED_ENABLED === '1',
  now = () => Date.now()
} = {}) {
  return Object.freeze({
    dataMode: DATA_MODE.PRODUCTION,
    async load() {
      if (!enabled()) return UNAVAILABLE
      let raw
      try {
        raw = JSON.parse(await readFile(snapshotPath, 'utf8'))
      } catch {
        return UNAVAILABLE
      }
      const data = validateSnapshot(raw, { now: now() })
      return data ? { available: true, data } : UNAVAILABLE
    }
  })
}

export const productionAdapter = createProductionAdapter()
