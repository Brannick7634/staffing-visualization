import Airtable from 'airtable'
import bcrypt from 'bcryptjs'
import { SEGMENT_NAMES, firmHasPrimarySegment, normalizeSegment } from '../constants/segments.js'
import { US_STATES } from '../constants/usStates.js'
import { 
  countFirmsInSegment, 
  findTopStateForSegment, 
  calculateSegmentGrowth,
  formatGrowthPercentage,
  formatNumber,
  calculateTopStatesByGrowth,
  calculateTopSegmentsByGrowth,
  convertDecimalToPercentage,
  calculateStateAverageGrowth,
  countFirmsInState,
  calculateStateTotalHeadcount
} from '../utils/formulas.js'
import { getFirmStateAbbr, normalizeStateAbbr } from '../utils/stateNormalization.js'

const base = new Airtable({
  apiKey: import.meta.env.VITE_AIRTABLE_API_KEY,
}).base(import.meta.env.VITE_AIRTABLE_BASE_ID)
const COMPANY_TABLE = import.meta.env.VITE_AIRTABLE_COMPANY_TABLE || 'Company Details'
const COMPANY_VIEW_ID = import.meta.env.VITE_AIRTABLE_COMPANY_VIEW || 'Grid view'
const DASHBOARD_METRICS_TABLE = 'DashboardMetrices'
const DASHBOARD_METRICS_VIEW = 'Grid view'  // View name for DashboardMetrices table

// Size filters for heatmap — order must stay in sync with heatmap_data_1..10 fields
const HEATMAP_SIZE_FILTERS = ['all', '1-5', '6-10', '11-20', '21-50', '51-100', '101-250', '251-500', '501-1000', '>1000']

// Field names in DashboardMetrices table
const METRICS_FIELDS = {
  SEGMENT: 'segment',          // Single line text - segment name
  STATS: 'stats',              // Long text - segment stats and rankings (NO tableFirms)
  HEATMAP_DATA_1:  'heatmap_data_1',   // size=all
  HEATMAP_DATA_2:  'heatmap_data_2',   // size=1-5
  HEATMAP_DATA_3:  'heatmap_data_3',   // size=6-10
  HEATMAP_DATA_4:  'heatmap_data_4',   // size=11-20
  HEATMAP_DATA_5:  'heatmap_data_5',   // size=21-50
  HEATMAP_DATA_6:  'heatmap_data_6',   // size=51-100
  HEATMAP_DATA_7:  'heatmap_data_7',   // size=101-250
  HEATMAP_DATA_8:  'heatmap_data_8',   // size=251-500
  HEATMAP_DATA_9:  'heatmap_data_9',   // size=501-1000
  HEATMAP_DATA_10: 'heatmap_data_10',  // size=>1000
  TABLE_DEFAULT: 'table_default',   // Long text - 5 default firms (no filter)
  TABLE_BY_SIZE: 'table_by_size',   // Long text - 5 firms per size band
  TABLE_STATE_1: 'table_state_1',   // Long text - byState firms: AL-MO (26 states)
  TABLE_STATE_2: 'table_state_2',   // Long text - byState firms: MT-WY (25 states)
  COUNTY_DATA_1: 'county_data_1',
  COUNTY_DATA_2: 'county_data_2',
  COUNTY_DATA_3: 'county_data_3',
  COUNTY_DATA_4: 'county_data_4',
  COUNTY_DATA_5: 'county_data_5',
  COUNTY_DATA_6: 'county_data_6',
  COUNTY_DATA_7: 'county_data_7',
  COUNTY_DATA_8: 'county_data_8',
  COUNTY_DATA_9: 'county_data_9',
  COUNTY_DATA_10: 'county_data_10',
  COUNTY_DATA_11: 'county_data_11',
  COUNTY_DATA_12: 'county_data_12',
  COUNTY_DATA_13: 'county_data_13',
  COUNTY_DATA_14: 'county_data_14',
  COUNTY_DATA_15: 'county_data_15',
  COUNTY_DATA_16: 'county_data_16',
  COUNTY_DATA_17: 'county_data_17',
  COUNTY_DATA_18: 'county_data_18',
  COUNTY_DATA_19: 'county_data_19',
  COUNTY_DATA_20: 'county_data_20',
  COUNTY_DATA_21: 'county_data_21',
  COUNTY_DATA_22: 'county_data_22',
  COUNTY_DATA_23: 'county_data_23',
  COUNTY_DATA_24: 'county_data_24',
  COUNTY_DATA_25: 'county_data_25',
  COUNTY_DATA_26: 'county_data_26',
  COMPUTED_AT: 'computed_at',
  IS_RECOMPUTING: 'is_recomputing'
}

// State split for table_state_1 (26 states: AL–MO)
const TABLE_STATE_GROUP_1 = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO']
// State split for table_state_2 (25 states: MT–WY)
const TABLE_STATE_GROUP_2 = ['MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

// Abbreviate a firm object for compact storage (used in default + bySize lists)
function abbreviateFirm(f) {
  return {
    id: f.id,
    s:  f.primarySegment,
    sa: f.hqStateAbbr,
    hl: f.hqLocation,
    cc: f.companyCity,
    ec: f.eeCount,
    eb: f.employeeSizeBucket,
    g1: f.growth1Y,
    g6: f.growth6M,
    g2: f.growth2Y
  }
}

// Ultra-compact array encoding for byState per-band slices.
// State and band are already known from the key structure so they are omitted.
// Shape: [primarySegment, companyCity, eeCount, growth1Y, growth6M, growth2Y]
function abbreviateFirmCompact(f) {
  return [f.primarySegment, f.companyCity, f.eeCount, f.growth1Y, f.growth6M, f.growth2Y]
}

// Expand compact array back to a full firm object.
// stateAbbr and band must be supplied from the surrounding key context.
function expandFirmCompact(arr, stateAbbr, band) {
  return {
    primarySegment:     arr[0],
    hqStateAbbr:        stateAbbr,
    hqLocation:         stateAbbr,
    companyCity:        arr[1],
    eeCount:            arr[2],
    employeeSizeBucket: band || '',
    growth1Y:           arr[3],
    growth6M:           arr[4],
    growth2Y:           arr[5],
  }
}

// Expand an abbreviated firm back to full keys for the UI
function expandFirm(f) {
  return {
    id:                f.id,
    primarySegment:    f.s,
    hqStateAbbr:       f.sa,
    hqLocation:        f.hl,
    companyCity:       f.cc,
    eeCount:           f.ec,
    employeeSizeBucket: f.eb,
    growth1Y:          f.g1,
    growth6M:          f.g6,
    growth2Y:          f.g2
  }
}

// State groupings for county data split (2 states per group for 26 fields)
const STATE_GROUPS = {
  GROUP_1: ['AL', 'AK'],       // 2 states
  GROUP_2: ['AZ', 'AR'],       // 2 states
  GROUP_3: ['CA', 'CO'],       // 2 states
  GROUP_4: ['CT', 'DE'],       // 2 states
  GROUP_5: ['DC', 'FL'],       // 2 states
  GROUP_6: ['GA', 'HI'],       // 2 states
  GROUP_7: ['ID', 'IL'],       // 2 states
  GROUP_8: ['IN', 'IA'],       // 2 states
  GROUP_9: ['KS', 'KY'],       // 2 states
  GROUP_10: ['LA', 'ME'],      // 2 states
  GROUP_11: ['MD', 'MA'],      // 2 states
  GROUP_12: ['MI', 'MN'],      // 2 states
  GROUP_13: ['MS', 'MO'],      // 2 states
  GROUP_14: ['MT', 'NE'],      // 2 states
  GROUP_15: ['NV', 'NH'],      // 2 states
  GROUP_16: ['NJ', 'NM'],      // 2 states
  GROUP_17: ['NY', 'NC'],      // 2 states
  GROUP_18: ['ND', 'OH'],      // 2 states
  GROUP_19: ['OK', 'OR'],      // 2 states
  GROUP_20: ['PA', 'RI'],      // 2 states
  GROUP_21: ['SC', 'SD'],      // 2 states
  GROUP_22: ['TN', 'TX'],      // 2 states
  GROUP_23: ['UT', 'VT'],      // 2 states
  GROUP_24: ['VA', 'WA'],      // 2 states
  GROUP_25: ['WV', 'WI'],      // 2 states
  GROUP_26: ['WY']             // 1 state
}
export async function fetchFirms() {
  try {
    const records = await base(COMPANY_TABLE).select({
      view: COMPANY_VIEW_ID,
      fields: [
        'Primary Segment',
        'HQ State Abbr',
        'HQ location',
        'company City',
        '# EE Count',
        'Employee Size Bucket',
        'Average Tenure',
        'Tenure Bucket',
        '6M Growth',
        '1Y Growth',
        '2Y Growth'
    ],
    filterByFormula: `AND(
      {Primary Segment} != "",
      {HQ location} != "",
      {company City} != "",
      {Employee Size Bucket} != "",
      {1Y Growth} <= 1000,
      {6M Growth} <= 1000,
      {2Y Growth} <= 1000
    )`
  }).all()
  const allFirms = records.map((record) => ({
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
    }))
    return allFirms
  } catch (error) {
    return []
  }
}
export async function fetchProtectedFirms(user) {
  try {
    let baseConditions = [
      '{Primary Segment} != ""',
      '{HQ location} != ""',
      '{company City} != ""',
      '{Employee Size Bucket} != ""',
      '{1Y Growth} <= 1000',
      '{6M Growth} <= 1000',
      '{2Y Growth} <= 1000'
    ]
    
    // Filter by user's primary segment to reduce data transfer
    if (user?.primarySegment) {
      baseConditions.push(`{Primary Segment} = "${user.primarySegment}"`)
    }
    
    const filterFormula = `AND(${baseConditions.join(', ')})`
    
    const records = await base(COMPANY_TABLE).select({
      view: COMPANY_VIEW_ID,
      fields: [
        'Primary Segment',
        'HQ State Abbr',
        'HQ location',
        'company City',
        '# EE Count',
        'Employee Size Bucket',
        'Average Tenure',
        'Tenure Bucket',
        '6M Growth',
        '1Y Growth',
        '2Y Growth'
      ],
      filterByFormula: filterFormula
    }).all()
    
    const firms = records.map((record) => ({
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
    }))
    return firms
  } catch (error) {
    return []
  }
}
export async function submitLeadRequest(formData) {
  try {
    const existingRecords = await base('Staffing Signal Leads Table (Test)').select({
      filterByFormula: `{Email} = '${formData.email}'`,
      maxRecords: 1
    }).firstPage()
    if (existingRecords.length > 0) {
      return { 
        success: false, 
        error: 'An account with this email address already exists. Please use a different email or try logging in.' 
      }
    }
    const hashedPassword = await bcrypt.hash(formData.password, 10)
    const record = await base('Staffing Signal Leads Table (Test)').create([
      {
        fields: {
          'First Name': formData.firstName,
          'Email': formData.email,
          'Password': hashedPassword,
          'Employee Band Size': formData.employeeBandSize,
          'HQ State': formData.hqState,
          'Primary Segment': formData.primarySegment,
          'Internal Employee Headcount Growth': formData.internalHeadcountGrowth,
        },
      },
    ])
    return { success: true, record }
  } catch (error) {
    return { success: false, error: 'Registration failed. Please try again.' }
  }
}
export async function verifyCredentials(email, password) {
  try {
    const records = await base('Staffing Signal Leads Table (Test)').select({
      filterByFormula: `{Email} = '${email}'`,
      maxRecords: 1
    }).firstPage()
    if (records.length === 0) {
      return { success: false, error: 'User not found' }
    }
    const user = records[0]
    const storedHashedPassword = user.get('Password')
    const passwordMatch = await bcrypt.compare(password, storedHashedPassword)
    if (passwordMatch) {
      return {
        success: true,
        user: {
          id: user.id,
          firstName: user.get('First Name'),
          email: user.get('Email'),
          employeeBandSize: user.get('Employee Band Size'),
          hqState: user.get('HQ State'),
          primarySegment: user.get('Primary Segment'),
          internalHeadcountGrowth: user.get('Internal Employee Headcount Growth')
        }
      }
    } else {
      return { success: false, error: 'Invalid password' }
    }
  } catch (error) {
    return { success: false, error: 'Authentication failed' }
  }
}

export async function updateUserProfile(userId, updates) {
  try {
    const record = await base('Staffing Signal Leads Table (Test)').update(userId, {
      'First Name': updates.firstName,
      'Employee Band Size': updates.employeeBandSize,
      'HQ State': updates.hqState,
      'Primary Segment': updates.primarySegment,
      'Internal Employee Headcount Growth': updates.internalHeadcountGrowth,
    })
    
    return {
      success: true,
      user: {
        id: record.id,
        firstName: record.get('First Name'),
        email: record.get('Email'),
        employeeBandSize: record.get('Employee Band Size'),
        hqState: record.get('HQ State'),
        primarySegment: record.get('Primary Segment'),
        internalHeadcountGrowth: record.get('Internal Employee Headcount Growth')
      }
    }
  } catch (error) {
    return { success: false, error: 'Failed to update profile. Please try again.' }
  }
}

export function isAirtableConfigured() {
  try {
    return !!(
      import.meta.env.VITE_AIRTABLE_API_KEY &&
      import.meta.env.VITE_AIRTABLE_BASE_ID
    )
  } catch {
    // In Node.js environment, always return true since we have hardcoded values
    return true
  }
}
export function getViewId() {
  return COMPANY_VIEW_ID
}

// ============================================================================
// DASHBOARD METRICS COMPUTATION AND STORAGE
// ============================================================================

const STATE_NAMES = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
  'DC': 'District of Columbia'
}

/**
 * Compute dashboard stats for a given segment
 */
function computeSegmentStats(firms, segment) {
  const filteredFirms = segment === 'All segments' 
    ? firms 
    : firms.filter(firm => firmHasPrimarySegment(firm, segment))
  
  const totalFirms = countFirmsInSegment(filteredFirms, segment)
  const topStateCode = findTopStateForSegment(filteredFirms, segment)
  const topStateName = topStateCode !== 'N/A' 
    ? (US_STATES.find(s => s.value === topStateCode)?.label || topStateCode)
    : 'N/A'
  const avgGrowth = calculateSegmentGrowth(filteredFirms, segment)
  
  return {
    segment,
    totalFirms: formatNumber(totalFirms),
    topState: topStateName,
    yearGrowth: formatGrowthPercentage(avgGrowth),
    yearGrowthRaw: Math.round(avgGrowth * 1000) / 1000  // Max 3 decimals
  }
}

const TIMEFRAMES = ['6M Growth', '1Y Growth', '2Y Growth']

/**
 * Compute top 5 states by average growth for a given timeframe
 */
function computeTopStatesByGrowth(firms, timeframe = '1Y Growth') {
  const topStatesData = calculateTopStatesByGrowth(firms, 5, timeframe)
  
  return topStatesData.map((item, index) => ({
    rank: index + 1,
    name: STATE_NAMES[item.state] || item.state,
    stateCode: item.state,
    growth: formatGrowthPercentage(item.avgGrowth),
    growthRaw: Math.round(item.avgGrowth * 1000) / 1000
  }))
}

/**
 * Compute top 5 states for all timeframes, returns object keyed by timeframe
 */
function computeTopStatesByGrowthAllTimeframes(firms) {
  const result = {}
  TIMEFRAMES.forEach(tf => {
    result[tf] = computeTopStatesByGrowth(firms, tf)
  })
  return result
}

/**
 * Compute top 3 segments by growth for a given timeframe
 */
function computeTopSegmentsByGrowth(firms, timeframe = '1Y Growth') {
  const topSegmentsData = calculateTopSegmentsByGrowth(firms, 3, timeframe)
  
  return topSegmentsData.map(item => ({
    name: item.name,
    growth: formatGrowthPercentage(item.avgGrowth),
    growthRaw: Math.round(item.avgGrowth * 1000) / 1000,
    firmCount: item.firmCount
  }))
}

/**
 * Compute top 3 segments for all timeframes, returns object keyed by timeframe
 */
function computeTopSegmentsByGrowthAllTimeframes(firms) {
  const result = {}
  TIMEFRAMES.forEach(tf => {
    result[tf] = computeTopSegmentsByGrowth(firms, tf)
  })
  return result
}

/**
 * Compute heatmap data for given filters
 * Returns data grouped by state to minimize repetition
 * Includes ALL 51 states (even if 0 firms)
 */
function computeHeatmapData(firms, timeframe, sizeFilter) {
  // Apply size filter — sizeFilter matches employeeSizeBucket exactly (e.g. '1-5', '101-250')
  let filtered = firms
  if (sizeFilter !== 'all') {
    filtered = firms.filter(r => r.employeeSizeBucket?.trim() === sizeFilter)
  }
  
  // Initialize ALL 51 states with empty data
  const ALL_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 
                      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
                      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
                      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
                      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC']
  
  const stateData = {}
  ALL_STATES.forEach(state => {
    stateData[state] = {
      firms: [],
      headcount: 0,
      growths: []
    }
  })
  
  filtered.forEach(firm => {
    const state = getFirmStateAbbr(firm)
    if (!state || !stateData[state]) return
    
    stateData[state].firms.push(firm)
    stateData[state].headcount += Number(firm.eeCount) || 0
    
    // Get growth based on timeframe
    let growthDecimal = 0
    if (timeframe === '1Y Growth') {
      growthDecimal = Number(firm.growth1Y) || 0
    } else if (timeframe === '6M Growth') {
      growthDecimal = Number(firm.growth6M) || 0
    } else if (timeframe === '2Y Growth') {
      growthDecimal = Number(firm.growth2Y) || 0
    }
    
    const growth = convertDecimalToPercentage(growthDecimal)
    if (!isNaN(growth)) {
      stateData[state].growths.push(growth)
    }
  })
  
  // Return data as state -> metrics (including states with 0 firms)
  const result = {}
  Object.entries(stateData).forEach(([stateCode, data]) => {
    const avgGrowth = data.growths.length > 0 
      ? data.growths.reduce((a, b) => a + b, 0) / data.growths.length 
      : 0
    
    result[stateCode] = {
      g: Math.round(avgGrowth * 1000) / 1000,  // growth (abbreviated key)
      f: data.firms.length  // firmCount (abbreviated key)
    }
  })
  
  return result
}

/**
 * Get up to 5 firms per filter combination for a specific segment.
 * All firm objects are abbreviated to minimise stored characters.
 */
function getSegmentTableFirms(firms, segment) {
  const segmentFirms = segment === 'All segments'
    ? firms
    : firms.filter(firm => firmHasPrimarySegment(firm, segment))

  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5)

  // Default: 5 random firms (abbreviated)
  const defaultFirms = shuffle(segmentFirms).slice(0, 5).map(abbreviateFirm)

  // Flat: up to 5 random firms per size band (any state) — used for size-only filter.
  // Kept small (~6 KB) so table_by_size never causes a 413.
  const bySize = {}
  const BANDS = ['1-5', '6-10', '11-20', '21-50', '51-100', '101-250', '251-500', '501-1000', '>1000']
  for (const band of BANDS) {
    const bandFirms = segmentFirms.filter(f => f.employeeSizeBucket?.trim() === band)
    bySize[band] = shuffle(bandFirms).slice(0, 5).map(abbreviateFirm)
  }

  // Extended per-state map using ultra-compact array encoding.
  // Shape: { stateAbbr: { _: [compactFirm, ...], "101-250": [compactFirm, ...], ... } }
  //   _   → up to 5 default firms for that state (state-only filter)
  //   band → up to 5 firms for that state + band combo (both-filters case)
  // Using compact arrays instead of objects cuts size ~3× vs abbreviateFirm.
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

  // Split byStateExt into two groups matching TABLE_STATE_GROUP_1 / _2
  const byState1 = {}
  const byState2 = {}
  for (const [abbr, stateData] of Object.entries(byStateExt)) {
    if (TABLE_STATE_GROUP_1.includes(abbr)) byState1[abbr] = stateData
    else byState2[abbr] = stateData
  }

  return { default: defaultFirms, bySize, byState1, byState2 }
}

/**
 * Compute all dashboard metrics
 */
export async function computeDashboardMetrics() {
  try {
    const firms = await fetchFirms()
    
    // Compute stats for all segments - deduplicate segments
    const uniqueSegments = ['All segments', ...Array.from(new Set(SEGMENT_NAMES)).sort()]
    const segments = uniqueSegments
    const segmentStats = {}
    const segmentTopStates = {}  // Store per-segment top states
    const segmentTableFirms = {}  // Store 5 example firms per segment
    
    segments.forEach(segment => {
      segmentStats[segment] = computeSegmentStats(firms, segment)
      
      // Compute top states for each segment across all timeframes
      const segmentFirms = segment === 'All segments' 
        ? firms 
        : firms.filter(firm => firmHasPrimarySegment(firm, segment))
      segmentTopStates[segment] = computeTopStatesByGrowthAllTimeframes(segmentFirms)
      
      // Get 5 example firms for each segment
      segmentTableFirms[segment] = getSegmentTableFirms(firms, segment)
    })
    
    // Compute top segments across all timeframes (only for "All segments")
    const topSegmentsByGrowth = computeTopSegmentsByGrowthAllTimeframes(firms)
    
    // Compute heatmap data - restructured by state to minimize repetition
    // Structure: { segment: { state: { filter1: {g, f}, filter2: {g, f}, ... } } }
    const timeframes = ['6M Growth', '1Y Growth', '2Y Growth']
    const sizeFilters = ['all', '1-5', '6-10', '11-20', '21-50', '51-100', '101-250', '251-500', '501-1000', '>1000']
    const heatmapData = {}
    
    segments.forEach(segment => {
      const segmentFirms = segment === 'All segments' 
        ? firms 
        : firms.filter(firm => firmHasPrimarySegment(firm, segment))
      
      // Collect all data for this segment first
      const segmentData = {}
      
      timeframes.forEach(timeframe => {
        sizeFilters.forEach(sizeFilter => {
          const key = `${timeframe}_${sizeFilter}`
          const filterData = computeHeatmapData(segmentFirms, timeframe, sizeFilter)
          
          // Restructure: for each state, add this filter's data
          Object.entries(filterData).forEach(([stateCode, metrics]) => {
            if (!segmentData[stateCode]) {
              segmentData[stateCode] = {}
            }
            segmentData[stateCode][key] = metrics
          })
        })
      })
      
      heatmapData[segment] = segmentData
    })
    
    // Note: tableFirms is empty for protected page (fetched directly from API)
    // This is only used for public page DashboardMetrics
    const tableFirms = []
    
    // Create county-level aggregated data PER SEGMENT
    // This way each segment gets its own county data
    const countyDataBySegment = {}
    
    segments.forEach(segment => {
      const segmentFirms = segment === 'All segments' 
        ? firms 
        : firms.filter(firm => firmHasPrimarySegment(firm, segment))
      
      const countyData = {}
      let countyDataFirmCount = 0
      
      segmentFirms.forEach(f => {
        const stateAbbr = f.hqStateAbbr
        const city = Array.isArray(f.companyCity) ? f.companyCity[0] : f.companyCity
        
        // Skip firms without valid location data
        if (!stateAbbr || !city) return
        
        // Initialize state if not exists
        if (!countyData[stateAbbr]) {
          countyData[stateAbbr] = {}
        }
        
        // Initialize county/city if not exists
        if (!countyData[stateAbbr][city]) {
          countyData[stateAbbr][city] = {
            firmCount: 0,
            totalHeadcount: 0,
            firms: []
          }
        }
        
        // Add firm to county
        countyData[stateAbbr][city].firmCount++
        countyData[stateAbbr][city].totalHeadcount += (f.eeCount || 0)
        countyData[stateAbbr][city].firms.push({
          id: f.id,
          segment: f.primarySegment,
          headcount: f.eeCount || 0,
          growth1Y: f.growth1Y || 0,
          growth6M: f.growth6M || 0,
          growth2Y: f.growth2Y || 0
        })
        countyDataFirmCount++
      })
      
      countyDataBySegment[segment] = countyData
    })
    
    // Construct final metrics object
    const metrics = {
      segmentStats,
      segmentTopStates,  // Per-segment top states
      segmentTableFirms,  // Per-segment example firms (5 each)
      topSegmentsByGrowth,  // Global segments ranking
      heatmapData,
      tableFirms,
      countyDataBySegment,  // County-level data per segment
      computedAt: new Date().toISOString()
    }
    
    return metrics
  } catch (error) {
    throw error
  }
}

/**
 * Store dashboard metrics in Airtable DashboardMetrices table (one row per segment)
 */
export async function storeDashboardMetrics(metrics) {
  try {
    const computedAt = new Date().toISOString()
    const segments = Object.keys(metrics.segmentStats)
    
    const allExistingRecords = await base(DASHBOARD_METRICS_TABLE).select().all()
    
    if (allExistingRecords.length > 0) {
      const idsToDelete = allExistingRecords.map(r => r.id)
      for (let i = 0; i < idsToDelete.length; i += 10) {
        const batch = idsToDelete.slice(i, i + 10)
        await base(DASHBOARD_METRICS_TABLE).destroy(batch)
      }
    }
    
    // Create one record per segment
    const recordsToCreate = []
    
    for (const segment of segments) {
      // Stats data for this segment (no tableFirms — stored in dedicated fields)
      const statsData = {
        segmentStats: metrics.segmentStats[segment],
        topStatesByGrowth: metrics.segmentTopStates[segment] || {},  // Per segment, keyed by timeframe
        topSegmentsByGrowth: segment === 'All segments' ? metrics.topSegmentsByGrowth : {},  // Only for "All segments", keyed by timeframe
      }

      // Table firms — split across dedicated fields to avoid character limits
      const tf = metrics.segmentTableFirms[segment] || {}
      const tableDefaultJson = JSON.stringify(tf.default || [])
      const tableBySizeJson  = JSON.stringify(tf.bySize  || {})
      const tableState1Json  = JSON.stringify(tf.byState1 || {})
      const tableState2Json  = JSON.stringify(tf.byState2 || {})

      // Heatmap data — split by size filter into 10 fields (~3K chars each)
      const heatmapFull = metrics.heatmapData[segment] || {}
      const heatmapSlices = HEATMAP_SIZE_FILTERS.map(sizeFilter => {
        const slice = {}
        const suffix = `_${sizeFilter}`
        Object.entries(heatmapFull).forEach(([stateCode, filterData]) => {
          slice[stateCode] = {}
          Object.entries(filterData).forEach(([key, val]) => {
            if (key.endsWith(suffix)) {
              slice[stateCode][key.slice(0, key.length - suffix.length)] = val
            }
          })
        })
        return slice
      })

      const statsJson = JSON.stringify(statsData)
      const heatmapFields = Object.fromEntries(
        HEATMAP_SIZE_FILTERS.map((_, i) => [METRICS_FIELDS[`HEATMAP_DATA_${i + 1}`], JSON.stringify(heatmapSlices[i])])
      )

      const fields = {
        [METRICS_FIELDS.SEGMENT]: segment,
        [METRICS_FIELDS.STATS]: statsJson,
        ...heatmapFields,
        [METRICS_FIELDS.TABLE_DEFAULT]: tableDefaultJson,
        [METRICS_FIELDS.TABLE_BY_SIZE]: tableBySizeJson,
        [METRICS_FIELDS.TABLE_STATE_1]: tableState1Json,
        [METRICS_FIELDS.TABLE_STATE_2]: tableState2Json,
        [METRICS_FIELDS.COMPUTED_AT]: computedAt,
        [METRICS_FIELDS.IS_RECOMPUTING]: 'false'
      }
      
      if (metrics.countyDataBySegment && metrics.countyDataBySegment[segment]) {
        const segmentCountyData = metrics.countyDataBySegment[segment]
        
        // Create 26 county groups dynamically
        const countyGroups = Array.from({ length: 26 }, () => ({}))
        
        // Distribute states to groups
        Object.keys(segmentCountyData).forEach(stateCode => {
          for (let i = 1; i <= 26; i++) {
            if (STATE_GROUPS[`GROUP_${i}`].includes(stateCode)) {
              countyGroups[i - 1][stateCode] = segmentCountyData[stateCode]
              break
            }
          }
        })
        
        for (let i = 0; i < 26; i++) {
          const fieldName = METRICS_FIELDS[`COUNTY_DATA_${i + 1}`]
          const jsonStr = JSON.stringify(countyGroups[i])
          fields[fieldName] = jsonStr
        }
      }
      
      recordsToCreate.push({ fields })
    }
    
    // Create one record at a time — batching 10 at once can exceed Airtable's
    // request body limit (413) when county_data_* fields are large.
    for (const record of recordsToCreate) {
      await base(DASHBOARD_METRICS_TABLE).create([record])
    }
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Fetch dashboard metrics from Airtable DashboardMetrices table (one row per segment)
 */
export async function fetchDashboardMetrics() {
  try {
    const records = await base(DASHBOARD_METRICS_TABLE).select({
      view: DASHBOARD_METRICS_VIEW
    }).all()
    
    if (records.length === 0) {
      return null
    }
    
    // Merge all segments back together
    const metrics = {
      segmentStats: {},
      segmentTopStates: {},  // Per-segment top states
      segmentTableFirms: {},  // Per-segment example firms
      topSegmentsByGrowth: [],
      tableFirms: [],
      countyDataBySegment: {},  // County-level data per segment
      heatmapData: {},
      computedAt: records[0].get(METRICS_FIELDS.COMPUTED_AT)
    }
    
    for (const record of records) {
      const segment = record.get(METRICS_FIELDS.SEGMENT)
      const statsJson = record.get(METRICS_FIELDS.STATS)
      const heatmapJsons = HEATMAP_SIZE_FILTERS.map((_, i) => record.get(METRICS_FIELDS[`HEATMAP_DATA_${i + 1}`]))
      
      if (statsJson) {
        const statsData = JSON.parse(statsJson)
        metrics.segmentStats[segment] = statsData.segmentStats
        metrics.segmentTopStates[segment] = statsData.topStatesByGrowth || {}  // keyed by timeframe

        // "All segments" contains the global segments ranking
        if (segment === 'All segments') {
          metrics.topSegmentsByGrowth = statsData.topSegmentsByGrowth || {}  // keyed by timeframe
        }
      }

      // Reconstruct table firms from dedicated fields (expand abbreviated keys)
      const tableDefaultJson = record.get(METRICS_FIELDS.TABLE_DEFAULT)
      const tableBySizeJson  = record.get(METRICS_FIELDS.TABLE_BY_SIZE)
      const tableState1Json  = record.get(METRICS_FIELDS.TABLE_STATE_1)
      const tableState2Json  = record.get(METRICS_FIELDS.TABLE_STATE_2)

      const defaultFirms = tableDefaultJson ? JSON.parse(tableDefaultJson).map(expandFirm) : []
      // bySize shape: flat { band: [5 firms] } — for size-only filter
      const bySize = tableBySizeJson
        ? Object.fromEntries(
            Object.entries(JSON.parse(tableBySizeJson)).map(([band, list]) => [band, list.map(expandFirm)])
          )
        : {}
      // state1/2 shape: { stateAbbr: { _: [compactArr], band: [compactArr] } }
      // Expand compact arrays back to full firm objects, supplying state/band from keys.
      const expandStateGroup = (raw) => {
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        const out = {}
        for (const [abbr, bandMap] of Object.entries(parsed)) {
          out[abbr] = {}
          for (const [key, list] of Object.entries(bandMap)) {
            const band = key === '_' ? '' : key
            out[abbr][key] = list.map(arr => expandFirmCompact(arr, abbr, band))
          }
        }
        return out
      }
      const state1 = expandStateGroup(tableState1Json)
      const state2 = expandStateGroup(tableState2Json)

      metrics.segmentTableFirms[segment] = {
        default: defaultFirms,
        bySize,
        byState: { ...state1, ...state2 }
      }

      if (segment === 'All segments') {
        metrics.tableFirms = defaultFirms
      }
      
      // County data - load for EACH segment from its 26 fields
      const countyDataFields = []
      for (let i = 1; i <= 26; i++) {
        countyDataFields.push(record.get(METRICS_FIELDS[`COUNTY_DATA_${i}`]))
      }
      
      if (countyDataFields.some(field => field)) {
        const segmentCountyData = {}
        
        countyDataFields.forEach(field => {
          if (field) {
            Object.assign(segmentCountyData, JSON.parse(field))
          }
        })
        
        metrics.countyDataBySegment[segment] = segmentCountyData
      }
      
      if (heatmapJsons.some(Boolean)) {
        const merged = {}
        heatmapJsons.forEach((json, i) => {
          if (!json) return
          const sizeFilter = HEATMAP_SIZE_FILTERS[i]
          Object.entries(JSON.parse(json)).forEach(([stateCode, timeframeMap]) => {
            if (!merged[stateCode]) merged[stateCode] = {}
            Object.entries(timeframeMap).forEach(([timeframe, val]) => {
              merged[stateCode][`${timeframe}_${sizeFilter}`] = val
            })
          })
        })
        metrics.heatmapData[segment] = merged
      }
    }
    
    metrics.countyData = metrics.countyDataBySegment['All segments'] || {}
    metrics.topStatesByGrowth = metrics.segmentTopStates['All segments'] || {}
    
    return metrics
  } catch (error) {
    return null
  }
}

/**
 * Mark dashboard as recomputing
 */
export async function markDashboardRecomputing(isRecomputing) {
  try {
    const existingRecords = await base(DASHBOARD_METRICS_TABLE).select({
      maxRecords: 1,
      sort: [{ field: METRICS_FIELDS.COMPUTED_AT, direction: 'desc' }]
    }).firstPage()
    
    if (existingRecords.length > 0) {
      await base(DASHBOARD_METRICS_TABLE).update(existingRecords[0].id, {
        [METRICS_FIELDS.IS_RECOMPUTING]: isRecomputing ? 'true' : 'false'
      })
    }
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
