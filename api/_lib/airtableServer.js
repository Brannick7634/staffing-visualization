// Server-only Airtable access. Never import this from src/ (client bundle) —
// only from files under /api. Uses process.env, NOT import.meta.env, so the
// real API key never ships to the browser.
import Airtable from 'airtable'
import bcrypt from 'bcryptjs'
import { SEGMENT_NAMES, firmHasPrimarySegment } from '../../src/constants/segments.js'
import { US_STATES } from '../../src/constants/usStates.js'
import {
  countFirmsInSegment,
  findTopStateForSegment,
  calculateSegmentGrowth,
  formatGrowthPercentage,
  formatNumber,
  calculateTopStatesByGrowth,
  calculateTopSegmentsByGrowth,
  convertDecimalToPercentage,
} from '../../src/utils/formulas.js'
import { getFirmStateAbbr } from '../../src/utils/stateNormalization.js'

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY,
}).base(process.env.AIRTABLE_BASE_ID)

const COMPANY_TABLE = process.env.AIRTABLE_COMPANY_TABLE || 'Company Details'
const COMPANY_VIEW_ID = process.env.AIRTABLE_COMPANY_VIEW || 'Grid view'
const DASHBOARD_METRICS_TABLE = 'DashboardMetrices'
const DASHBOARD_METRICS_VIEW = 'Grid view'
const LEADS_TABLE = 'Staffing Signal Leads Table (Test)'

export const METRICS_CACHE_TYPE = { DASHBOARD: 'dashboard', JOB_SIGNALS: 'job_signals' }

// Escape a user-supplied value for use inside a double-quoted Airtable
// formula string literal. Backslashes first, then quotes; newlines are
// collapsed so a value can never terminate the literal and inject formula.
export function escapeFormulaValue(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ')
}
// Build `{Field} = "value"` with the value escaped.
export function formulaEquals(field, value) {
  return `{${field}} = "${escapeFormulaValue(value)}"`
}

const HEATMAP_SIZE_FILTERS = ['all', '1-5', '6-10', '11-20', '21-50', '51-100', '101-250', '251-500', '501-1000', '>1000']

const METRICS_FIELDS = {
  TYPE: 'type', SEGMENT: 'segment', STATS: 'stats',
  HEATMAP_DATA_1: 'heatmap_data_1', HEATMAP_DATA_2: 'heatmap_data_2', HEATMAP_DATA_3: 'heatmap_data_3',
  HEATMAP_DATA_4: 'heatmap_data_4', HEATMAP_DATA_5: 'heatmap_data_5', HEATMAP_DATA_6: 'heatmap_data_6',
  HEATMAP_DATA_7: 'heatmap_data_7', HEATMAP_DATA_8: 'heatmap_data_8', HEATMAP_DATA_9: 'heatmap_data_9',
  HEATMAP_DATA_10: 'heatmap_data_10',
  TABLE_DEFAULT: 'table_default', TABLE_BY_SIZE: 'table_by_size',
  TABLE_STATE_1: 'table_state_1', TABLE_STATE_2: 'table_state_2',
  COUNTY_DATA_1: 'county_data_1', COUNTY_DATA_2: 'county_data_2', COUNTY_DATA_3: 'county_data_3',
  COUNTY_DATA_4: 'county_data_4', COUNTY_DATA_5: 'county_data_5', COUNTY_DATA_6: 'county_data_6',
  COUNTY_DATA_7: 'county_data_7', COUNTY_DATA_8: 'county_data_8', COUNTY_DATA_9: 'county_data_9',
  COUNTY_DATA_10: 'county_data_10', COUNTY_DATA_11: 'county_data_11', COUNTY_DATA_12: 'county_data_12',
  COUNTY_DATA_13: 'county_data_13', COUNTY_DATA_14: 'county_data_14', COUNTY_DATA_15: 'county_data_15',
  COUNTY_DATA_16: 'county_data_16', COUNTY_DATA_17: 'county_data_17', COUNTY_DATA_18: 'county_data_18',
  COUNTY_DATA_19: 'county_data_19', COUNTY_DATA_20: 'county_data_20', COUNTY_DATA_21: 'county_data_21',
  COUNTY_DATA_22: 'county_data_22', COUNTY_DATA_23: 'county_data_23', COUNTY_DATA_24: 'county_data_24',
  COUNTY_DATA_25: 'county_data_25', COUNTY_DATA_26: 'county_data_26',
  COMPUTED_AT: 'computed_at', IS_RECOMPUTING: 'is_recomputing',
}

function normalizeCacheType(type) { return String(type || '').trim().toLowerCase() }
function isDashboardCacheRecord(record) {
  const type = normalizeCacheType(record.get(METRICS_FIELDS.TYPE))
  return !type || type === METRICS_CACHE_TYPE.DASHBOARD
}

const TABLE_STATE_GROUP_1 = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO']
const TABLE_STATE_GROUP_2 = ['MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

function abbreviateFirm(f) {
  return { id: f.id, s: f.primarySegment, sa: f.hqStateAbbr, hl: f.hqLocation, cc: f.companyCity, ec: f.eeCount, eb: f.employeeSizeBucket, g1: f.growth1Y, g6: f.growth6M, g2: f.growth2Y }
}
function abbreviateFirmCompact(f) {
  return [f.primarySegment, f.companyCity, f.eeCount, f.growth1Y, f.growth6M, f.growth2Y, f.employeeSizeBucket || '']
}
function expandFirmCompact(arr, stateAbbr, band) {
  return { primarySegment: arr[0], hqStateAbbr: stateAbbr, hqLocation: stateAbbr, companyCity: arr[1], eeCount: arr[2], employeeSizeBucket: band || arr[6] || '', growth1Y: arr[3], growth6M: arr[4], growth2Y: arr[5] }
}
function expandFirm(f) {
  return { id: f.id, primarySegment: f.s, hqStateAbbr: f.sa, hqLocation: f.hl, companyCity: f.cc, eeCount: f.ec, employeeSizeBucket: f.eb, growth1Y: f.g1, growth6M: f.g6, growth2Y: f.g2 }
}

const STATE_GROUPS = {
  GROUP_1: ['AL','AK'], GROUP_2: ['AZ','AR'], GROUP_3: ['CA','CO'], GROUP_4: ['CT','DE'], GROUP_5: ['DC','FL'],
  GROUP_6: ['GA','HI'], GROUP_7: ['ID','IL'], GROUP_8: ['IN','IA'], GROUP_9: ['KS','KY'], GROUP_10: ['LA','ME'],
  GROUP_11: ['MD','MA'], GROUP_12: ['MI','MN'], GROUP_13: ['MS','MO'], GROUP_14: ['MT','NE'], GROUP_15: ['NV','NH'],
  GROUP_16: ['NJ','NM'], GROUP_17: ['NY','NC'], GROUP_18: ['ND','OH'], GROUP_19: ['OK','OR'], GROUP_20: ['PA','RI'],
  GROUP_21: ['SC','SD'], GROUP_22: ['TN','TX'], GROUP_23: ['UT','VT'], GROUP_24: ['VA','WA'], GROUP_25: ['WV','WI'], GROUP_26: ['WY'],
}

const FIRM_FIELDS = ['Primary Segment','HQ State Abbr','HQ location','company City','# EE Count','Employee Size Bucket','Average Tenure','Tenure Bucket','6M Growth','1Y Growth','2Y Growth']
const FIRM_QUALITY_FILTER = `AND(
  {Primary Segment} != "",
  {HQ location} != "",
  {company City} != "",
  {Employee Size Bucket} != "",
  {1Y Growth} <= 1000,
  {6M Growth} <= 1000,
  {2Y Growth} <= 1000
)`

function mapFirmRecord(record) {
  return {
    id: record.id,
    primarySegment: record.get('Primary Segment') || '',
    hqStateAbbr: record.get('HQ State Abbr') || '',
    hqLocation: record.get('HQ location') || '',
    companyCity: record.get('company City') || '',
    eeCount: record.get('# EE Count') || 0,
    employeeSizeBucket: record.get('Employee Size Bucket') || '',
    averageTenure: record.get('Average Tenure') || 0,
    tenureBucket: record.get('Tenure Bucket') || '',
    growth6M: record.get('6M Growth') || 0,
    growth1Y: record.get('1Y Growth') || 0,
    growth2Y: record.get('2Y Growth') || 0,
  }
}

export async function fetchFirms() {
  try {
    const records = await base(COMPANY_TABLE).select({ view: COMPANY_VIEW_ID, fields: FIRM_FIELDS, filterByFormula: FIRM_QUALITY_FILTER }).all()
    return records.map(mapFirmRecord)
  } catch {
    return []
  }
}

// segment must come from the authenticated user's server-side record, never
// from the request body. Accepts a plain segment string.
export async function fetchProtectedFirms(segment) {
  try {
    const baseConditions = [
      '{Primary Segment} != ""', '{HQ location} != ""', '{company City} != ""', '{Employee Size Bucket} != ""',
      '{1Y Growth} <= 1000', '{6M Growth} <= 1000', '{2Y Growth} <= 1000',
    ]
    if (segment) baseConditions.push(formulaEquals('Primary Segment', segment))
    const records = await base(COMPANY_TABLE).select({ view: COMPANY_VIEW_ID, fields: FIRM_FIELDS, filterByFormula: `AND(${baseConditions.join(', ')})` }).all()
    return records.map(mapFirmRecord)
  } catch {
    return []
  }
}

export async function submitLeadRequest(formData) {
  try {
    const existingRecords = await base(LEADS_TABLE).select({ filterByFormula: formulaEquals('Email', formData.email), maxRecords: 1 }).firstPage()
    if (existingRecords.length > 0) {
      return { success: false, error: 'An account with this email address already exists. Please use a different email or try logging in.' }
    }
    const hashedPassword = await bcrypt.hash(formData.password, 10)
    const record = await base(LEADS_TABLE).create([{
      fields: {
        'First Name': formData.firstName,
        'Email': formData.email,
        'Password': hashedPassword,
        'Employee Band Size': formData.employeeBandSize,
        'HQ State': formData.hqState,
        'Primary Segment': formData.primarySegment,
        'Internal Employee Headcount Growth': formData.internalHeadcountGrowth,
      },
    }])
    return { success: true, record: { id: record[0].id } }
  } catch (error) {
    return { success: false, error: 'Registration failed. Please try again.' }
  }
}

export async function verifyCredentials(email, password) {
  try {
    const records = await base(LEADS_TABLE).select({ filterByFormula: formulaEquals('Email', email), maxRecords: 1 }).firstPage()
    if (records.length === 0) return { success: false, error: 'User not found' }
    const user = records[0]
    const storedHashedPassword = user.get('Password')
    const passwordMatch = await bcrypt.compare(password, storedHashedPassword)
    if (!passwordMatch) return { success: false, error: 'Invalid password' }
    return {
      success: true,
      user: {
        id: user.id,
        firstName: user.get('First Name'),
        email: user.get('Email'),
        employeeBandSize: user.get('Employee Band Size'),
        hqState: user.get('HQ State'),
        primarySegment: user.get('Primary Segment'),
        internalHeadcountGrowth: user.get('Internal Employee Headcount Growth'),
      },
    }
  } catch {
    return { success: false, error: 'Authentication failed' }
  }
}

// Server-side lookup of a user's Primary Segment by Airtable record id
// (the id comes from the signed session, not the client).
export async function fetchUserSegment(userId) {
  if (!userId || !/^rec[A-Za-z0-9]{14}$/.test(userId)) return null
  try {
    const record = await base(LEADS_TABLE).find(userId)
    return record.get('Primary Segment') || null
  } catch {
    return null
  }
}

export async function updateUserProfile(userId, updates) {
  try {
    const record = await base(LEADS_TABLE).update(userId, {
      'First Name': updates.firstName,
      'Employee Band Size': updates.employeeBandSize,
      'HQ State': updates.hqState,
      'Primary Segment': updates.primarySegment,
      'Internal Employee Headcount Growth': updates.internalHeadcountGrowth,
    })
    return {
      success: true,
      user: {
        id: record.id, firstName: record.get('First Name'), email: record.get('Email'),
        employeeBandSize: record.get('Employee Band Size'), hqState: record.get('HQ State'),
        primarySegment: record.get('Primary Segment'), internalHeadcountGrowth: record.get('Internal Employee Headcount Growth'),
      },
    }
  } catch {
    return { success: false, error: 'Failed to update profile. Please try again.' }
  }
}

const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',
  FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',
  LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',
  ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',
  WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia',
}

function computeSegmentStats(firms, segment) {
  const filteredFirms = segment === 'All segments' ? firms : firms.filter((firm) => firmHasPrimarySegment(firm, segment))
  const totalFirms = countFirmsInSegment(filteredFirms, segment)
  const topStateCode = findTopStateForSegment(filteredFirms, segment)
  const topStateName = topStateCode !== 'N/A' ? (US_STATES.find((s) => s.value === topStateCode)?.label || topStateCode) : 'N/A'
  const avgGrowth = calculateSegmentGrowth(filteredFirms, segment)
  return { segment, totalFirms: formatNumber(totalFirms), topState: topStateName, yearGrowth: formatGrowthPercentage(avgGrowth), yearGrowthRaw: Math.round(avgGrowth * 1000) / 1000 }
}

const TIMEFRAMES = ['6M Growth', '1Y Growth', '2Y Growth']

function computeTopStatesByGrowth(firms, timeframe = '1Y Growth') {
  return calculateTopStatesByGrowth(firms, 5, timeframe).map((item, index) => ({
    rank: index + 1, name: STATE_NAMES[item.state] || item.state, stateCode: item.state,
    growth: formatGrowthPercentage(item.avgGrowth), growthRaw: Math.round(item.avgGrowth * 1000) / 1000,
  }))
}
function computeTopStatesByGrowthAllTimeframes(firms) {
  const result = {}
  TIMEFRAMES.forEach((tf) => { result[tf] = computeTopStatesByGrowth(firms, tf) })
  return result
}
function computeTopSegmentsByGrowth(firms, timeframe = '1Y Growth') {
  return calculateTopSegmentsByGrowth(firms, 3, timeframe).map((item) => ({
    name: item.name, growth: formatGrowthPercentage(item.avgGrowth), growthRaw: Math.round(item.avgGrowth * 1000) / 1000, firmCount: item.firmCount,
  }))
}
function computeTopSegmentsByGrowthAllTimeframes(firms) {
  const result = {}
  TIMEFRAMES.forEach((tf) => { result[tf] = computeTopSegmentsByGrowth(firms, tf) })
  return result
}

function computeHeatmapData(firms, timeframe, sizeFilter) {
  let filtered = firms
  if (sizeFilter !== 'all') filtered = firms.filter((r) => r.employeeSizeBucket?.trim() === sizeFilter)
  const ALL_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']
  const stateData = {}
  ALL_STATES.forEach((state) => { stateData[state] = { firms: [], headcount: 0, growths: [] } })
  filtered.forEach((firm) => {
    const state = getFirmStateAbbr(firm)
    if (!state || !stateData[state]) return
    stateData[state].firms.push(firm)
    stateData[state].headcount += Number(firm.eeCount) || 0
    let growthDecimal = 0
    if (timeframe === '1Y Growth') growthDecimal = Number(firm.growth1Y) || 0
    else if (timeframe === '6M Growth') growthDecimal = Number(firm.growth6M) || 0
    else if (timeframe === '2Y Growth') growthDecimal = Number(firm.growth2Y) || 0
    const growth = convertDecimalToPercentage(growthDecimal)
    if (!isNaN(growth)) stateData[state].growths.push(growth)
  })
  const result = {}
  Object.entries(stateData).forEach(([stateCode, data]) => {
    const avgGrowth = data.growths.length > 0 ? data.growths.reduce((a, b) => a + b, 0) / data.growths.length : 0
    result[stateCode] = { g: Math.round(avgGrowth * 1000) / 1000, f: data.firms.length }
  })
  return result
}

function getSegmentTableFirms(firms, segment) {
  const segmentFirms = segment === 'All segments' ? firms : firms.filter((firm) => firmHasPrimarySegment(firm, segment))
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5)
  const defaultFirms = shuffle(segmentFirms).slice(0, 5).map(abbreviateFirm)
  const bySize = {}
  const BANDS = ['1-5','6-10','11-20','21-50','51-100','101-250','251-500','501-1000','>1000']
  for (const band of BANDS) {
    const bandFirms = segmentFirms.filter((f) => f.employeeSizeBucket?.trim() === band)
    bySize[band] = shuffle(bandFirms).slice(0, 5).map(abbreviateFirm)
  }
  const byStateExt = {}
  for (const firm of segmentFirms) {
    const abbr = getFirmStateAbbr(firm)
    if (!abbr) continue
    if (!byStateExt[abbr]) byStateExt[abbr] = { _: [] }
    if (byStateExt[abbr]._.length < 5) byStateExt[abbr]._.push(abbreviateFirmCompact(firm))
    const band = firm.employeeSizeBucket?.trim()
    if (band) {
      if (!byStateExt[abbr][band]) byStateExt[abbr][band] = []
      if (byStateExt[abbr][band].length < 5) byStateExt[abbr][band].push(abbreviateFirmCompact(firm))
    }
  }
  const byState1 = {}
  const byState2 = {}
  for (const [abbr, stateData] of Object.entries(byStateExt)) {
    if (TABLE_STATE_GROUP_1.includes(abbr)) byState1[abbr] = stateData
    else byState2[abbr] = stateData
  }
  return { default: defaultFirms, bySize, byState1, byState2 }
}

export async function computeDashboardMetrics() {
  const firms = await fetchFirms()
  const uniqueSegments = ['All segments', ...Array.from(new Set(SEGMENT_NAMES)).sort()]
  const segments = uniqueSegments
  const segmentStats = {}
  const segmentTopStates = {}
  const segmentTableFirms = {}
  segments.forEach((segment) => {
    segmentStats[segment] = computeSegmentStats(firms, segment)
    const segmentFirms = segment === 'All segments' ? firms : firms.filter((firm) => firmHasPrimarySegment(firm, segment))
    segmentTopStates[segment] = computeTopStatesByGrowthAllTimeframes(segmentFirms)
    segmentTableFirms[segment] = getSegmentTableFirms(firms, segment)
  })
  const topSegmentsByGrowth = computeTopSegmentsByGrowthAllTimeframes(firms)
  const timeframes = ['6M Growth', '1Y Growth', '2Y Growth']
  const sizeFilters = ['all','1-5','6-10','11-20','21-50','51-100','101-250','251-500','501-1000','>1000']
  const heatmapData = {}
  segments.forEach((segment) => {
    const segmentFirms = segment === 'All segments' ? firms : firms.filter((firm) => firmHasPrimarySegment(firm, segment))
    const segmentData = {}
    timeframes.forEach((timeframe) => {
      sizeFilters.forEach((sizeFilter) => {
        const key = `${timeframe}_${sizeFilter}`
        const filterData = computeHeatmapData(segmentFirms, timeframe, sizeFilter)
        Object.entries(filterData).forEach(([stateCode, metrics]) => {
          if (!segmentData[stateCode]) segmentData[stateCode] = {}
          segmentData[stateCode][key] = metrics
        })
      })
    })
    heatmapData[segment] = segmentData
  })
  const countyDataBySegment = {}
  segments.forEach((segment) => {
    const segmentFirms = segment === 'All segments' ? firms : firms.filter((firm) => firmHasPrimarySegment(firm, segment))
    const countyData = {}
    segmentFirms.forEach((f) => {
      const stateAbbr = f.hqStateAbbr
      const city = Array.isArray(f.companyCity) ? f.companyCity[0] : f.companyCity
      if (!stateAbbr || !city) return
      if (!countyData[stateAbbr]) countyData[stateAbbr] = {}
      if (!countyData[stateAbbr][city]) countyData[stateAbbr][city] = { firmCount: 0, totalHeadcount: 0, firms: [] }
      countyData[stateAbbr][city].firmCount++
      countyData[stateAbbr][city].totalHeadcount += f.eeCount || 0
      countyData[stateAbbr][city].firms.push({ id: f.id, segment: f.primarySegment, headcount: f.eeCount || 0, growth1Y: f.growth1Y || 0, growth6M: f.growth6M || 0, growth2Y: f.growth2Y || 0 })
    })
    countyDataBySegment[segment] = countyData
  })
  return { segmentStats, segmentTopStates, segmentTableFirms, topSegmentsByGrowth, heatmapData, tableFirms: [], countyDataBySegment, computedAt: new Date().toISOString() }
}

export async function storeDashboardMetrics(metrics) {
  try {
    const computedAt = new Date().toISOString()
    const segments = Object.keys(metrics.segmentStats)
    const allExistingRecords = await base(DASHBOARD_METRICS_TABLE).select().all()
    const dashboardRecords = allExistingRecords.filter(isDashboardCacheRecord)
    if (dashboardRecords.length > 0) {
      const idsToDelete = dashboardRecords.map((r) => r.id)
      for (let i = 0; i < idsToDelete.length; i += 10) {
        await base(DASHBOARD_METRICS_TABLE).destroy(idsToDelete.slice(i, i + 10))
      }
    }
    const recordsToCreate = []
    for (const segment of segments) {
      const statsData = {
        segmentStats: metrics.segmentStats[segment],
        topStatesByGrowth: metrics.segmentTopStates[segment] || {},
        topSegmentsByGrowth: segment === 'All segments' ? metrics.topSegmentsByGrowth : {},
      }
      const tf = metrics.segmentTableFirms[segment] || {}
      const tableDefaultJson = JSON.stringify(tf.default || [])
      const tableBySizeJson = JSON.stringify(tf.bySize || {})
      const tableState1Json = JSON.stringify(tf.byState1 || {})
      const tableState2Json = JSON.stringify(tf.byState2 || {})
      const heatmapFull = metrics.heatmapData[segment] || {}
      const heatmapSlices = HEATMAP_SIZE_FILTERS.map((sizeFilter) => {
        const slice = {}
        const suffix = `_${sizeFilter}`
        Object.entries(heatmapFull).forEach(([stateCode, filterData]) => {
          slice[stateCode] = {}
          Object.entries(filterData).forEach(([key, val]) => {
            if (key.endsWith(suffix)) slice[stateCode][key.slice(0, key.length - suffix.length)] = val
          })
        })
        return slice
      })
      const statsJson = JSON.stringify(statsData)
      const heatmapFields = Object.fromEntries(HEATMAP_SIZE_FILTERS.map((_, i) => [METRICS_FIELDS[`HEATMAP_DATA_${i + 1}`], JSON.stringify(heatmapSlices[i])]))
      const fields = {
        [METRICS_FIELDS.TYPE]: METRICS_CACHE_TYPE.DASHBOARD, [METRICS_FIELDS.SEGMENT]: segment, [METRICS_FIELDS.STATS]: statsJson,
        ...heatmapFields,
        [METRICS_FIELDS.TABLE_DEFAULT]: tableDefaultJson, [METRICS_FIELDS.TABLE_BY_SIZE]: tableBySizeJson,
        [METRICS_FIELDS.TABLE_STATE_1]: tableState1Json, [METRICS_FIELDS.TABLE_STATE_2]: tableState2Json,
        [METRICS_FIELDS.COMPUTED_AT]: computedAt, [METRICS_FIELDS.IS_RECOMPUTING]: 'false',
      }
      if (metrics.countyDataBySegment && metrics.countyDataBySegment[segment]) {
        const segmentCountyData = metrics.countyDataBySegment[segment]
        const countyGroups = Array.from({ length: 26 }, () => ({}))
        Object.keys(segmentCountyData).forEach((stateCode) => {
          for (let i = 1; i <= 26; i++) {
            if (STATE_GROUPS[`GROUP_${i}`].includes(stateCode)) { countyGroups[i - 1][stateCode] = segmentCountyData[stateCode]; break }
          }
        })
        for (let i = 0; i < 26; i++) fields[METRICS_FIELDS[`COUNTY_DATA_${i + 1}`]] = JSON.stringify(countyGroups[i])
      }
      recordsToCreate.push({ fields })
    }
    for (const record of recordsToCreate) await base(DASHBOARD_METRICS_TABLE).create([record])
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export async function fetchDashboardMetrics() {
  try {
    const allRecords = await base(DASHBOARD_METRICS_TABLE).select({ view: DASHBOARD_METRICS_VIEW }).all()
    const records = allRecords.filter(isDashboardCacheRecord)
    if (records.length === 0) return null
    const metrics = { segmentStats: {}, segmentTopStates: {}, segmentTableFirms: {}, topSegmentsByGrowth: [], tableFirms: [], countyDataBySegment: {}, heatmapData: {}, computedAt: records[0].get(METRICS_FIELDS.COMPUTED_AT) }
    for (const record of records) {
      const segment = record.get(METRICS_FIELDS.SEGMENT)
      const statsJson = record.get(METRICS_FIELDS.STATS)
      const heatmapJsons = HEATMAP_SIZE_FILTERS.map((_, i) => record.get(METRICS_FIELDS[`HEATMAP_DATA_${i + 1}`]))
      if (statsJson) {
        const statsData = JSON.parse(statsJson)
        metrics.segmentStats[segment] = statsData.segmentStats
        metrics.segmentTopStates[segment] = statsData.topStatesByGrowth || {}
        if (segment === 'All segments') metrics.topSegmentsByGrowth = statsData.topSegmentsByGrowth || {}
      }
      const tableDefaultJson = record.get(METRICS_FIELDS.TABLE_DEFAULT)
      const tableBySizeJson = record.get(METRICS_FIELDS.TABLE_BY_SIZE)
      const tableState1Json = record.get(METRICS_FIELDS.TABLE_STATE_1)
      const tableState2Json = record.get(METRICS_FIELDS.TABLE_STATE_2)
      const defaultFirms = tableDefaultJson ? JSON.parse(tableDefaultJson).map(expandFirm) : []
      const bySize = tableBySizeJson ? Object.fromEntries(Object.entries(JSON.parse(tableBySizeJson)).map(([band, list]) => [band, list.map(expandFirm)])) : {}
      const expandStateGroup = (raw) => {
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        const out = {}
        for (const [abbr, bandMap] of Object.entries(parsed)) {
          out[abbr] = {}
          for (const [key, list] of Object.entries(bandMap)) {
            const band = key === '_' ? '' : key
            out[abbr][key] = list.map((arr) => expandFirmCompact(arr, abbr, band))
          }
        }
        return out
      }
      const state1 = expandStateGroup(tableState1Json)
      const state2 = expandStateGroup(tableState2Json)
      metrics.segmentTableFirms[segment] = { default: defaultFirms, bySize, byState: { ...state1, ...state2 } }
      if (segment === 'All segments') metrics.tableFirms = defaultFirms
      const countyDataFields = []
      for (let i = 1; i <= 26; i++) countyDataFields.push(record.get(METRICS_FIELDS[`COUNTY_DATA_${i}`]))
      if (countyDataFields.some((field) => field)) {
        const segmentCountyData = {}
        countyDataFields.forEach((field) => { if (field) Object.assign(segmentCountyData, JSON.parse(field)) })
        metrics.countyDataBySegment[segment] = segmentCountyData
      }
      if (heatmapJsons.some(Boolean)) {
        const merged = {}
        heatmapJsons.forEach((json, i) => {
          if (!json) return
          const sizeFilter = HEATMAP_SIZE_FILTERS[i]
          Object.entries(JSON.parse(json)).forEach(([stateCode, timeframeMap]) => {
            if (!merged[stateCode]) merged[stateCode] = {}
            Object.entries(timeframeMap).forEach(([timeframe, val]) => { merged[stateCode][`${timeframe}_${sizeFilter}`] = val })
          })
        })
        metrics.heatmapData[segment] = merged
      }
    }
    metrics.countyData = metrics.countyDataBySegment['All segments'] || {}
    metrics.topStatesByGrowth = metrics.segmentTopStates['All segments'] || {}
    return metrics
  } catch {
    return null
  }
}

export async function markDashboardRecomputing(isRecomputing) {
  try {
    let dashboardRecord = null
    try {
      const filtered = await base(DASHBOARD_METRICS_TABLE).select({
        maxRecords: 1,
        filterByFormula: `OR({${METRICS_FIELDS.TYPE}} = '${METRICS_CACHE_TYPE.DASHBOARD}', {${METRICS_FIELDS.TYPE}} = '')`,
        sort: [{ field: METRICS_FIELDS.COMPUTED_AT, direction: 'desc' }],
      }).firstPage()
      dashboardRecord = filtered[0] || null
    } catch {
      const existingRecords = await base(DASHBOARD_METRICS_TABLE).select({ maxRecords: 50, sort: [{ field: METRICS_FIELDS.COMPUTED_AT, direction: 'desc' }] }).firstPage()
      dashboardRecord = existingRecords.find(isDashboardCacheRecord) || null
    }
    if (dashboardRecord) await base(DASHBOARD_METRICS_TABLE).update(dashboardRecord.id, { [METRICS_FIELDS.IS_RECOMPUTING]: isRecomputing ? 'true' : 'false' })
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export async function fetchJobSignalsCache() {
  try {
    const records = await base(DASHBOARD_METRICS_TABLE).select({
      maxRecords: 5,
      fields: [METRICS_FIELDS.TYPE, METRICS_FIELDS.STATS, METRICS_FIELDS.COMPUTED_AT, METRICS_FIELDS.SEGMENT],
      sort: [{ field: METRICS_FIELDS.COMPUTED_AT, direction: 'desc' }],
      filterByFormula: `{${METRICS_FIELDS.TYPE}} = '${METRICS_CACHE_TYPE.JOB_SIGNALS}'`,
    }).firstPage()
    if (!records.length) return null
    const raw = records[0].get(METRICS_FIELDS.STATS)
    const computedAt = records[0].get(METRICS_FIELDS.COMPUTED_AT)
    if (!raw) return null
    const metrics = typeof raw === 'string' ? JSON.parse(raw) : raw
    return { ...metrics, computedAt: computedAt || metrics.computedAt || null, fromAirtableCache: true }
  } catch {
    return null
  }
}

export async function storeJobSignalsCache(metrics) {
  const computedAt = new Date().toISOString()
  const payload = { ...metrics, computedAt }
  const fields = {
    [METRICS_FIELDS.TYPE]: METRICS_CACHE_TYPE.JOB_SIGNALS, [METRICS_FIELDS.SEGMENT]: 'Job Signals',
    [METRICS_FIELDS.STATS]: JSON.stringify(payload), [METRICS_FIELDS.COMPUTED_AT]: computedAt, [METRICS_FIELDS.IS_RECOMPUTING]: 'false',
  }
  try {
    const existing = await base(DASHBOARD_METRICS_TABLE).select({
      maxRecords: 5, fields: [METRICS_FIELDS.TYPE, METRICS_FIELDS.COMPUTED_AT],
      filterByFormula: `{${METRICS_FIELDS.TYPE}} = '${METRICS_CACHE_TYPE.JOB_SIGNALS}'`,
    }).firstPage()
    if (existing.length) {
      await base(DASHBOARD_METRICS_TABLE).update(existing[0].id, fields)
      if (existing.length > 1) {
        const extras = existing.slice(1).map((r) => r.id)
        for (let i = 0; i < extras.length; i += 10) await base(DASHBOARD_METRICS_TABLE).destroy(extras.slice(i, i + 10))
      }
    } else {
      await base(DASHBOARD_METRICS_TABLE).create([{ fields }])
    }
    return { success: true, computedAt }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ---- Job Signals live compute (moved from src/services/jobSignals.js) ----

const JOBS_TABLE = process.env.AIRTABLE_JOBS_TABLE || 'Linkedin Jobs'
const COMPANY_URL_FIELD = process.env.AIRTABLE_COMPANY_URL_FIELD || 'Sales Navigator Company URL'

function extractCompanyId(url) {
  if (!url) return null
  const match = String(url).match(/company\/(\d+)/)
  return match ? match[1] : null
}
function normalizePublishedAt(value) {
  if (!value) return null
  if (typeof value === 'string') return value.includes('T') ? value.slice(0, 10) : value.slice(0, 10)
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

async function fetchCompanyIdToSegment() {
  const records = await base(COMPANY_TABLE).select({
    view: COMPANY_VIEW_ID, fields: ['Primary Segment', COMPANY_URL_FIELD], filterByFormula: `{Primary Segment} != ""`,
  }).all()
  const map = new Map()
  for (const record of records) {
    const segment = record.get('Primary Segment')
    const companyId = extractCompanyId(record.get(COMPANY_URL_FIELD))
    if (!companyId || !segment) continue
    if (!map.has(companyId)) map.set(companyId, segment)
  }
  return map
}

async function fetchJobsForSignals() {
  const records = await base(JOBS_TABLE).select({ fields: ['Company Id', 'Work Type', 'Published At'], pageSize: 100 }).all()
  return records.map((record) => ({
    companyId: record.get('Company Id') != null ? String(record.get('Company Id')) : null,
    workType: record.get('Work Type') ? String(record.get('Work Type')).trim() : '',
    publishedAt: normalizePublishedAt(record.get('Published At')),
  }))
}

export async function computeJobSignalsMetricsLive(computeFn) {
  const started = Date.now()
  const [companyIdToSegment, jobs] = await Promise.all([fetchCompanyIdToSegment(), fetchJobsForSignals()])
  const metrics = computeFn(companyIdToSegment, jobs)
  metrics.loadTimeMs = Date.now() - started
  metrics.computedAt = new Date().toISOString()
  return metrics
}
