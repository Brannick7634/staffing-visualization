// DEVELOPMENT ONLY. Adapter over the supplied October 2026 example fixture.
//
// Reads dev-fixtures/supplied-october-2026.json from disk at request time, so
// the fixture is never bundled into the browser build. Everything it serves is
// labeled dataMode 'development_example'. The fixture's publication checks are
// "not_verified"; the privacy module lets such figures through ONLY in this
// data mode, and the production adapter can never use this module.
//
// The fixture supplies national pay only. With no local pay, every state or
// city pay request resolves to coverage 'not_yet_available' — no local figure
// is ever inferred from a national one.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { DATA_MODE, COVERAGE } from '../../shared/signal/contract.js'
import { toCents } from '../../shared/signal/money.js'
import { citiesForState } from '../../shared/signal/geography.js'

export const DEFAULT_FIXTURE_PATH = fileURLToPath(new URL('../../dev-fixtures/supplied-october-2026.json', import.meta.url))

const SNAPSHOT_NOTE = 'Supplied example figures. Publication checks have not been verified.'
const HISTORY_NOTE = 'Early signals. Comparable history is still short.'
const FAMILIES_NOTE = 'Mixed granularity; several are broad families, not job titles.'

function momentumBasis(latest, previous) {
  return `Normalized posting momentum: latest ${latest} days vs. the previous ${previous}, measured relative to the change across all observed states. Early signal — not raw growth, a demand forecast or a pay change.`
}

function issueCards(latest, previous) {
  return [
    {
      key: 'momentum-california',
      kind: 'momentum',
      title: 'California: an early upward signal.',
      ref: { code: 'CA' },
      basis: `Latest ${latest} days vs. previous ${previous}, relative to all observed states. Early signal; production calculation not yet verified.`
    },
    {
      key: 'pay-icu',
      kind: 'pay',
      title: 'ICU nurse pay snapshot.',
      ref: { roleKey: 'icu-registered-nurse' },
      basis: 'Staffing-firm postings only. Advertised pay, not actual pay.'
    },
    {
      key: 'volume-new-york',
      kind: 'volume',
      title: 'New York leads observed city volume.',
      ref: { cityKey: 'NY:new-york' },
      basis: 'Observed postings, not verified open orders.'
    }
  ]
}

function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function arr(value) {
  return Array.isArray(value) ? value : []
}

function withThousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Fixture publication_checks -> privacy checks. Unknown stays unknown.
function checksOf(raw) {
  const pc = obj(raw)
  return {
    status: typeof pc.status === 'string' ? pc.status : null,
    distinctFirms: pc.contributing_staffing_firms ?? null,
    maxFirmShare: pc.maximum_single_firm_observation_share ?? null
  }
}

function centsOrNull(value) {
  try {
    return toCents(value)
  } catch {
    return null
  }
}

// 'Washington, DC' + 'DC' -> 'DC:washington' (via the picker list).
function cityKeyFor(name, code) {
  if (typeof name !== 'string' || typeof code !== 'string') return null
  const bare = name.replace(new RegExp(`,\\s*${code}$`), '').trim()
  const found = citiesForState(code).find((item) => item.name === bare)
  return found ? found.key : null
}

function mapPay(examples) {
  const cells = []
  for (const raw of arr(examples)) {
    const ex = obj(raw)
    const geo = obj(ex.geography)
    if (geo.level !== 'nationwide' || geo.country !== 'US') continue
    cells.push({
      roleKey: ex.proposed_role_key,
      level: 'nationwide',
      state: null,
      city: null,
      p25Cents: centsOrNull(ex.middle_half_low),
      typicalCents: centsOrNull(ex.supplied_typical_rate),
      p75Cents: centsOrNull(ex.middle_half_high),
      payBasis: ex.display_unit === 'hour' ? 'hourly' : 'other',
      currency: ex.currency,
      checks: checksOf(ex.publication_checks)
    })
  }
  return cells
}

export function mapFixture(raw) {
  const fx = obj(raw)
  const prov = obj(fx.provenance)
  const cov = obj(fx.reported_dataset_coverage)
  const cve = obj(fx.city_volume_examples)
  const mom = obj(fx.momentum_examples)
  const latest = mom.latest_window_days
  const previous = mom.previous_window_days
  const postings = obj(cov.staffing_firm_postings_last_90_days)
  const firms = obj(cov.staffing_firms_posting_last_90_days)
  const payObs = obj(cov.advertised_pay_observations)
  const combos = obj(cov.job_city_pay_combinations)
  const hours = cov.salary_to_hourly_hours_per_year

  return {
    snapshot: {
      label: prov.snapshot_label,
      exactDate: prov.exact_snapshot_timestamp,
      freshness: 'unknown',
      lastSuccessfulRefresh: null,
      refreshCadence: cov.refresh_cadence,
      methodologyVersion: null,
      note: SNAPSHOT_NOTE
    },
    coverage: {
      postings: { value: postings.value, approximate: postings.approximate === true, period: 'last 90 days' },
      firms: { value: firms.value, approximate: firms.approximate === true, period: 'last 90 days' },
      payObservations: {
        value: payObs.value,
        approximate: payObs.approximate === true,
        note: Number.isSafeInteger(hours) ? `Includes salaries converted at ${withThousands(hours)} hours/year` : null
      },
      citiesLabel: obj(cov.cities_with_demand_counts).reported_label,
      reliablePayTitles: obj(cov.reliable_pay_job_titles).reported_value,
      jobCityPayCombos: {
        value: combos.value,
        approximate: combos.approximate === true,
        note: combos.is_number_of_fully_covered_cities === false ? 'Job/city combinations, not fully covered cities' : null
      }
    },
    issueCards: issueCards(latest, previous),
    cityVolume: {
      metric: cve.metric,
      windowDays: cve.window_days,
      scope: `Nationwide · ${cve.sector_scope} · ${cve.job_scope}`,
      jobScope: cve.job_scope,
      rows: arr(cve.rows).map((raw) => {
        const row = obj(raw)
        return {
          cityKey: cityKeyFor(row.city, row.state_or_district_code),
          postings: row.postings,
          checks: checksOf(row.publication_checks)
        }
      })
    },
    momentum: {
      windowDays: latest,
      previousWindowDays: previous,
      isRawGrowth: mom.is_raw_posting_growth === true,
      isPayChange: mom.is_pay_change === true,
      isForecast: mom.is_forecast === true,
      basis: momentumBasis(latest, previous),
      historyNote: HISTORY_NOTE,
      coverage: COVERAGE.PUBLISHABLE,
      rows: [...arr(mom.heating), ...arr(mom.cooling)].map((raw) => {
        const row = obj(raw)
        return {
          code: row.region_code,
          momentumPct: row.supplied_normalized_relative_momentum_percent,
          checks: checksOf(row.publication_checks)
        }
      })
    },
    pay: mapPay(fx.national_pay_examples),
    mostPostedFamilies: {
      labels: arr(fx.most_posted_nationwide_labels_in_supplied_order),
      note: FAMILIES_NOTE
    }
  }
}

export function createFixtureAdapter({ fixturePath = DEFAULT_FIXTURE_PATH } = {}) {
  return Object.freeze({
    dataMode: DATA_MODE.DEVELOPMENT_EXAMPLE,
    async load() {
      const raw = JSON.parse(await readFile(fixturePath, 'utf8'))
      return { available: true, data: mapFixture(raw) }
    }
  })
}
