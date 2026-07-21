import Airtable from 'airtable'
import { SEGMENT_NAMES, normalizeSegment } from '../constants/segments.js'
import {
  fetchJobSignalsCache,
  storeJobSignalsCache,
} from './airtable.js'

const base = new Airtable({
  apiKey: import.meta.env.VITE_AIRTABLE_API_KEY,
}).base(import.meta.env.VITE_AIRTABLE_BASE_ID)

const COMPANY_TABLE = import.meta.env.VITE_AIRTABLE_COMPANY_TABLE || 'Company Details'
const COMPANY_VIEW_ID = import.meta.env.VITE_AIRTABLE_COMPANY_VIEW || 'Grid view'
const JOBS_TABLE = import.meta.env.VITE_AIRTABLE_JOBS_TABLE || 'Linkedin Jobs'
const COMPANY_URL_FIELD =
  import.meta.env.VITE_AIRTABLE_COMPANY_URL_FIELD || 'Sales Navigator Company URL'

/** Background refresh cadence — same idea as homepage DashboardMetrices, but 7 days. */
export const JOB_SIGNALS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const SEGMENT_ICONS = {
  Admin: 'briefcase',
  Agriculture: 'factory',
  Construction: 'factory',
  Energy: 'bolt',
  EOR: 'briefcase',
  'Executive Recruiting': 'bank',
  Healthcare: 'heart',
  IT: 'screen',
  'Light Industrial': 'factory',
  MGF: 'factory',
  PEO: 'briefcase',
  Professional: 'bank',
  Skilled: 'factory',
  Technical: 'screen',
  Transportation: 'cart',
  USLH: 'briefcase',
}

function extractCompanyId(url) {
  if (!url) return null
  const match = String(url).match(/company\/(\d+)/)
  return match ? match[1] : null
}

function normalizePublishedAt(value) {
  if (!value) return null
  if (typeof value === 'string') {
    return value.includes('T') ? value.slice(0, 10) : value.slice(0, 10)
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return String(value).slice(0, 10)
}

function emptySegmentBucket() {
  return {
    activeJobs: 0,
    companies: new Set(),
    workTypes: new Map(),
  }
}

function momentumPercent(current, previous, hasPrevious) {
  if (!hasPrevious) {
    return { value: null, isBaseline: true }
  }
  if (previous === 0) {
    if (current === 0) return { value: 0, isBaseline: false }
    return { value: 100, isBaseline: false }
  }
  return {
    value: ((current - previous) / previous) * 100,
    isBaseline: false,
  }
}

function statusFromMomentum(momentum, isBaseline) {
  if (isBaseline || momentum == null) return 'Baseline scrape — awaiting next cycle'
  if (momentum >= 8) return 'Strong hiring momentum'
  if (momentum >= 2) return 'Steady hiring momentum'
  if (momentum > -2) return 'Stable hiring activity'
  if (momentum > -8) return 'Softening hiring momentum'
  return 'Declining hiring momentum'
}

function topWorkTypes(workTypeMap, limit = 5) {
  const sorted = [...workTypeMap.entries()]
    .filter(([name]) => name && name !== '(empty)')
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  const max = sorted[0]?.[1] || 1
  return sorted.map(([name, value]) => ({
    name,
    value,
    width: Math.max(8, Math.round((value / max) * 100)),
  }))
}

async function fetchCompanyIdToSegment() {
  const records = await base(COMPANY_TABLE)
    .select({
      view: COMPANY_VIEW_ID,
      fields: ['Primary Segment', COMPANY_URL_FIELD],
      filterByFormula: `{Primary Segment} != ""`,
    })
    .all()

  const map = new Map()
  for (const record of records) {
    const segment = normalizeSegment(record.get('Primary Segment'))
    const companyId = extractCompanyId(record.get(COMPANY_URL_FIELD))
    if (!companyId || !segment) continue
    // Prefer first mapping; segments are firm attributes
    if (!map.has(companyId)) map.set(companyId, segment)
  }
  return map
}

async function fetchJobs() {
  const records = await base(JOBS_TABLE)
    .select({
      fields: ['Company Id', 'Work Type', 'Published At'],
      pageSize: 100,
    })
    .all()

  return records.map((record) => ({
    companyId: record.get('Company Id') != null ? String(record.get('Company Id')) : null,
    workType: record.get('Work Type') ? String(record.get('Work Type')).trim() : '',
    publishedAt: normalizePublishedAt(record.get('Published At')),
  }))
}

/**
 * Aggregate Linkedin Jobs into segment metrics keyed by scrape date (Published At).
 */
export function computeJobSignalsMetrics(companyIdToSegment, jobs) {
  const periodSegment = new Map() // date -> Map(segment -> bucket)
  const scrapeDates = new Set()

  for (const job of jobs) {
    if (!job.companyId || !job.publishedAt) continue
    const segment = companyIdToSegment.get(job.companyId)
    if (!segment) continue

    scrapeDates.add(job.publishedAt)
    if (!periodSegment.has(job.publishedAt)) {
      periodSegment.set(job.publishedAt, new Map())
    }
    const bySegment = periodSegment.get(job.publishedAt)
    if (!bySegment.has(segment)) bySegment.set(segment, emptySegmentBucket())
    const bucket = bySegment.get(segment)
    bucket.activeJobs += 1
    bucket.companies.add(job.companyId)
    const wt = job.workType || '(empty)'
    bucket.workTypes.set(wt, (bucket.workTypes.get(wt) || 0) + 1)
  }

  const sortedDates = [...scrapeDates].sort()
  const latestDate = sortedDates[sortedDates.length - 1] || null
  const previousDate =
    sortedDates.length >= 2 ? sortedDates[sortedDates.length - 2] : null
  const hasPrevious = Boolean(previousDate)

  const latestBySegment = periodSegment.get(latestDate) || new Map()
  const previousBySegment = periodSegment.get(previousDate) || new Map()

  const segments = {}
  const momentumRows = []

  for (const name of SEGMENT_NAMES) {
    const latest = latestBySegment.get(name) || emptySegmentBucket()
    const previous = previousBySegment.get(name) || emptySegmentBucket()
    const prevJobs = previous.activeJobs
    const currJobs = latest.activeJobs
    const { value: momentum, isBaseline } = momentumPercent(currJobs, prevJobs, hasPrevious)

    const prevCompanies = previous.companies.size
    const currCompanies = latest.companies.size
    const companiesChange = momentumPercent(currCompanies, prevCompanies, hasPrevious)

    // v1: New Jobs = jobs in latest scrape snapshot (no open/close history)
    const newJobs = currJobs
    const newJobsChange = momentum

    segments[name] = {
      icon: SEGMENT_ICONS[name] || 'briefcase',
      activeJobs: currJobs,
      newJobs,
      companies: currCompanies,
      momentum,
      isBaseline,
      changes: {
        activeJobs: momentum,
        newJobs: newJobsChange,
        companies: companiesChange.value,
      },
      status: statusFromMomentum(momentum, isBaseline),
      functions: topWorkTypes(latest.workTypes),
      trend: {
        'Active Jobs': sortedDates.map((date) => {
          const bucket = periodSegment.get(date)?.get(name)
          return bucket?.activeJobs || 0
        }),
        'New Jobs': sortedDates.map((date) => {
          const bucket = periodSegment.get(date)?.get(name)
          return bucket?.activeJobs || 0
        }),
        'Companies Hiring': sortedDates.map((date) => {
          const bucket = periodSegment.get(date)?.get(name)
          return bucket?.companies.size || 0
        }),
      },
    }

    momentumRows.push({
      name,
      value: isBaseline || momentum == null ? 0 : momentum,
      isBaseline,
      icon: SEGMENT_ICONS[name] || 'briefcase',
    })
  }

  momentumRows.sort((a, b) => b.value - a.value)

  const growing = momentumRows.filter((r) => !r.isBaseline && r.value > 0).length
  const declining = momentumRows.filter((r) => !r.isBaseline && r.value < 0).length
  const totalActiveJobs = Object.values(segments).reduce((sum, s) => sum + s.activeJobs, 0)
  const hottestByJobs = Object.entries(segments).sort((a, b) => b[1].activeJobs - a[1].activeJobs)[0]?.[0]
  const hottest = !hasPrevious
    ? (hottestByJobs || SEGMENT_NAMES[0])
    : (momentumRows[0]?.name || hottestByJobs || SEGMENT_NAMES[0])

  // Axis: pad around observed momentum, or default demo scale for baseline
  const absMax = Math.max(
    5,
    ...momentumRows.map((r) => Math.abs(r.value || 0)),
  )
  const axisStep = Math.ceil(absMax / 3)
  const axisValues = [-axisStep * 3, -axisStep * 2, -axisStep, 0, axisStep, axisStep * 2, axisStep * 3]

  return {
    scrapeDates: sortedDates,
    latestDate,
    previousDate,
    hasPrevious,
    isBaseline: !hasPrevious,
    segments,
    momentumRows,
    summary: {
      totalActiveJobs,
      growing,
      declining,
      hottest,
    },
    axisValues,
    companyMapSize: companyIdToSegment.size,
    jobCount: jobs.length,
    matchedJobCount: jobs.filter(
      (j) => j.companyId && j.publishedAt && companyIdToSegment.has(j.companyId),
    ).length,
  }
}

/**
 * Load precomputed Job Signals metrics from DashboardMetrices (type=job_signals).
 */
export async function fetchJobSignalsMetrics() {
  return fetchJobSignalsCache()
}

/**
 * Upsert Job Signals metrics into DashboardMetrices (type=job_signals).
 */
export async function storeJobSignalsMetrics(metrics) {
  return storeJobSignalsCache(metrics)
}

/**
 * Live compute from Company Details + Linkedin Jobs.
 */
export async function computeJobSignalsMetricsLive() {
  const started = Date.now()
  const [companyIdToSegment, jobs] = await Promise.all([
    fetchCompanyIdToSegment(),
    fetchJobs(),
  ])
  const metrics = computeJobSignalsMetrics(companyIdToSegment, jobs)
  metrics.loadTimeMs = Date.now() - started
  metrics.computedAt = new Date().toISOString()
  return metrics
}

export function isJobSignalsCacheStale(computedAt) {
  if (!computedAt) return true
  const ageMs = Date.now() - new Date(computedAt).getTime()
  return !Number.isFinite(ageMs) || ageMs > JOB_SIGNALS_CACHE_TTL_MS
}

export function getDefaultIndustry(userSegment) {
  const normalized = userSegment ? normalizeSegment(userSegment) : ''
  if (normalized && SEGMENT_NAMES.includes(normalized)) return normalized
  if (SEGMENT_NAMES.includes('Healthcare')) return 'Healthcare'
  return [...SEGMENT_NAMES].sort()[0]
}

export { SEGMENT_ICONS }
