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
// Monthly snapshots (api/_lib/signal/data/monthly/YYYY-MM.json, written by the
// monthly export; bundled through vercel.json includeFiles) feed the pay
// trend only. They are optional: a missing folder, an unreadable file or a
// file that fails validation (any bad row) is skipped on its own, and never
// makes the main snapshot unavailable. Loaded once per adapter (the files are
// immutable inside a deployment).
//
// Server-only. Never import dev/ or dev-fixtures/ from here.
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_MODE } from '../../../shared/signal/contract.js'
import { evaluatePublication } from './privacy.js'

export const SNAPSHOT_FORMAT = 'staffing-signal-aggregate-snapshot'
export const SNAPSHOT_SCHEMA_VERSION = 1
export const KNOWN_CALC_VERSIONS = Object.freeze(['signal-agg-1.0.0', 'signal-agg-1.1.0', 'signal-agg-1.2.0'])
export const MAX_AGE_DAYS = 10
export const DEFAULT_SNAPSHOT_PATH = fileURLToPath(new URL('./data/signal-snapshot.json', import.meta.url))
export const MONTHLY_FORMAT = 'staffing-signal-monthly-aggregates'
export const MONTHLY_SCHEMA_VERSION = 1
export const KNOWN_MONTHLY_CALC_VERSIONS = Object.freeze(['signal-month-1.0.0'])
export const DEFAULT_MONTHLY_DIR = fileURLToPath(new URL('./data/monthly/', import.meta.url))
const MONTH_FILE = /^(\d{4}-(?:0[1-9]|1[0-2]))\.json$/

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

// Monthly cells carry no payBasis/currency (the export is hourly USD only);
// when present they must say so.
function validMonthlyPayCell(c) {
  if (!isObj(c)) return false
  if (c.payBasis !== undefined && c.payBasis !== 'hourly') return false
  if (c.currency !== undefined && c.currency !== 'USD') return false
  return validPayCell({ ...c, payBasis: 'hourly', currency: 'USD' })
}

// validateMonthly(raw, expectedMonth) -> { month, pay } (pay cells reduced to
// the fields the trend uses), or null if unusable.
export function validateMonthly(raw, expectedMonth = null) {
  if (!isObj(raw)) return null
  if (raw.format !== MONTHLY_FORMAT || raw.schemaVersion !== MONTHLY_SCHEMA_VERSION) return null
  if (!KNOWN_MONTHLY_CALC_VERSIONS.includes(raw.calcVersion)) return null
  if (typeof raw.month !== 'string' || !MONTH_FILE.test(`${raw.month}.json`)) return null
  if (expectedMonth !== null && raw.month !== expectedMonth) return null
  if (!isObj(raw.reliability) || raw.reliability.reliable !== true) return null
  if (!Array.isArray(raw.pay) || !raw.pay.every(validMonthlyPayCell)) return null
  return {
    month: raw.month,
    pay: raw.pay.map((c) => ({
      roleKey: c.roleKey, level: c.level, state: c.state, city: c.city,
      p25Cents: c.p25Cents, typicalCents: c.typicalCents, p75Cents: c.p75Cents,
      payBasis: 'hourly', currency: 'USD',
      checks: { status: c.checks.status, distinctFirms: c.checks.distinctFirms, maxFirmShare: c.checks.maxFirmShare }
    }))
  }
}

// Every usable monthly snapshot in `dir`, ascending. Never throws.
export async function loadMonthlySnapshots(dir = DEFAULT_MONTHLY_DIR) {
  let names
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const out = []
  for (const name of names.filter((n) => MONTH_FILE.test(n)).sort()) {
    try {
      const month = validateMonthly(JSON.parse(await readFile(path.join(dir, name), 'utf8')), MONTH_FILE.exec(name)[1])
      if (month) out.push(month)
    } catch {
      // unreadable or not JSON: skip this month only
    }
  }
  return out
}

export function createProductionAdapter({
  snapshotPath = DEFAULT_SNAPSHOT_PATH,
  monthlyDir = DEFAULT_MONTHLY_DIR,
  enabled = () => process.env.SIGNAL_FEED_ENABLED === '1',
  now = () => Date.now(),
  maxAgeDays = MAX_AGE_DAYS
} = {}) {
  let monthly = null
  const loadMonthly = () => {
    if (!monthly) monthly = loadMonthlySnapshots(monthlyDir).catch(() => [])
    return monthly
  }
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
      const data = validateSnapshot(raw, { now: now(), maxAgeDays })
      if (!data) return UNAVAILABLE
      return { available: true, data: { ...data, monthly: monthlyDir ? await loadMonthly() : [] } }
    }
  })
}

export const productionAdapter = createProductionAdapter()
