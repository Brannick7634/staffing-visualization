/**
 * STAFFING SIGNAL - CALCULATION FORMULAS
 * 
 * This file contains all the business logic formulas used throughout the application.
 * Each formula includes a human-readable description explaining what it calculates and how.
 */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert decimal growth to percentage
 * 
 * Description:
 * Growth values from Airtable are stored as decimals where:
 * - 0.03 means 3% growth
 * - -0.1 means -10% decline
 * - 0.5 means 50% growth
 * 
 * This function converts the decimal to a percentage number.
 * 
 * Example: 0.03 → 3, -0.1 → -10
 */
export function convertDecimalToPercentage(decimalValue) {
  const decimal = Number(decimalValue) || 0
  return decimal * 100
}

/**
 * Calculate median from an array of numbers
 * 
 * Description:
 * The median is the middle value in a sorted list of numbers.
 * - If there's an odd number of values, it's the middle one
 * - If there's an even number of values, it's the average of the two middle ones
 * 
 * Example: [1, 3, 5, 7, 9] → median is 5
 * Example: [1, 3, 5, 7] → median is 4 (average of 3 and 5)
 */
export function calculateMedian(numbers) {
  if (!numbers || numbers.length === 0) return 0
  
  const sorted = [...numbers].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  
  if (sorted.length % 2 === 0) {
    // Even number of values: average the two middle values
    return (sorted[middle - 1] + sorted[middle]) / 2
  } else {
    // Odd number of values: return the middle value
    return sorted[middle]
  }
}

/**
 * Calculate average (mean) from an array of numbers
 * 
 * Description:
 * The average is the sum of all values divided by the count of values.
 * 
 * Example: [10, 20, 30] → average is 20 (because 60 ÷ 3 = 20)
 */
export function calculateAverage(numbers) {
  if (!numbers || numbers.length === 0) return 0
  const sum = numbers.reduce((total, num) => total + num, 0)
  return sum / numbers.length
}

// ============================================================================
// PUBLIC PAGE FORMULAS - SECTION 1: KPIs
// ============================================================================

/**
 * Formula 1: Count firms in a segment
 * 
 * Description:
 * Counts how many firms belong to a specific segment (e.g., "technology", "healthcare").
 * If "All segments" is selected, it counts all firms regardless of segment.
 * 
 * How it works:
 * 1. Look at each firm in the list
 * 2. Check if the firm belongs to the selected segment
 * 3. Count how many firms match
 * 
 * Example: If there are 150 technology firms, this returns 150
 */
export function countFirmsInSegment(firms, segment) {
  if (!firms || firms.length === 0) return 0
  
  if (segment === 'All segments') {
    return firms.length
  }
  
  return firms.filter(firm => 
    firm.primarySegment && 
    firm.primarySegment.toLowerCase() === segment.toLowerCase()
  ).length
}

/**
 * Formula 2: Find top state for a segment
 * 
 * Description:
 * Identifies which US state has the most headcount growth in absolute numbers
 * for firms in a specific segment.
 * 
 * How it works:
 * 1. For each state, calculate total headcount growth:
 *    - Take current employee count
 *    - Multiply by 1-year growth rate
 *    - This gives absolute headcount change (e.g., company grew from 100 to 103 employees = +3 headcount)
 * 2. Add up all headcount changes for all firms in that state
 * 3. The state with the highest total headcount growth wins
 * 
 * Example: California firms added 10,000 total employees, Texas added 8,000 → California is #1
 */
export function findTopStateForSegment(firms, segment) {
  if (!firms || firms.length === 0) return 'N/A'
  
  const stateHeadcountGrowth = {}
  
  firms.forEach(firm => {
    const state = firm.hqStateAbbr
    if (!state) return
    
    const currentEmployees = Number(firm.eeCount) || 0
    const growthDecimal = Number(firm.growth1Y) || 0
    
    if (currentEmployees > 0) {
      // Calculate absolute headcount growth
      // Example: 100 employees * 0.03 growth = 3 new employees
      const absoluteGrowth = currentEmployees * growthDecimal
      stateHeadcountGrowth[state] = (stateHeadcountGrowth[state] || 0) + absoluteGrowth
    }
  })
  
  // Find state with highest total headcount growth
  const topState = Object.entries(stateHeadcountGrowth)
    .sort(([, growthA], [, growthB]) => growthB - growthA)[0]
  
  return topState ? topState[0] : 'N/A'
}

/**
 * Formula 3: Calculate 1-year growth for a segment
 * 
 * Description:
 * Calculates the average 1-year growth rate for all firms in a segment.
 * 
 * How it works:
 * 1. Collect 1-year growth rate from each firm (e.g., 3%, 5%, -2%)
 * 2. Add all growth rates together
 * 3. Divide by the number of firms to get the average
 * 
 * Example: 3 firms with 5%, 10%, 15% growth → average is 10%
 */
export function calculateSegmentGrowth(firms, segment) {
  if (!firms || firms.length === 0) return 0
  
  const growthValues = firms
    .map(firm => convertDecimalToPercentage(firm.growth1Y))
    .filter(g => !isNaN(g))
  
  return calculateAverage(growthValues)
}

// ============================================================================
// PUBLIC PAGE FORMULAS - SECTION 2: HEATMAP
// ============================================================================

/**
 * Formula 4: Calculate headcount growth for a state
 * 
 * Description:
 * For a US state on the heatmap, calculates the average growth rate
 * of all firms headquartered in that state.
 * 
 * How it works:
 * 1. Find all firms in the state
 * 2. Collect their growth rates (6-month, 1-year, or 2-year based on timeframe filter)
 * 3. Calculate the average growth rate
 * 
 * Example: California has 100 firms with average 5% growth → returns 5
 */
export function calculateStateAverageGrowth(firms, stateCode, timeframe) {
  const stateFirms = firms.filter(f => f.hqStateAbbr === stateCode)
  if (stateFirms.length === 0) return 0
  
  const growthField = timeframe === '1Y Growth' ? 'growth1Y' 
                    : timeframe === '6M Growth' ? 'growth6M' 
                    : 'growth2Y'
  
  const growthValues = stateFirms
    .map(f => convertDecimalToPercentage(f[growthField]))
    .filter(g => !isNaN(g))
  
  return calculateAverage(growthValues)
}

/**
 * Formula 5: Count firms in a state
 * 
 * Description:
 * Counts how many firms are headquartered in a specific state
 * based on the current filter settings.
 * 
 * How it works:
 * Simply count all firms where the headquarters state matches the state code.
 * 
 * Example: 150 firms are headquartered in California → returns 150
 */
export function countFirmsInState(firms, stateCode) {
  return firms.filter(f => f.hqStateAbbr === stateCode).length
}

/**
 * Formula 6: Calculate total headcount for a state
 * 
 * Description:
 * Estimates the total number of employees working at all firms
 * headquartered in a specific state.
 * 
 * How it works:
 * Add up the employee count from each firm in the state.
 * 
 * Example: 3 firms with 100, 200, and 300 employees → total is 600
 */
export function calculateStateTotalHeadcount(firms, stateCode) {
  const stateFirms = firms.filter(f => f.hqStateAbbr === stateCode)
  return stateFirms.reduce((total, firm) => total + (Number(firm.eeCount) || 0), 0)
}

// ============================================================================
// PUBLIC PAGE FORMULAS - SECTION 3: TOP STATES RANKING
// ============================================================================

/**
 * Formula 7: Calculate top 5 states by average growth
 * 
 * Description:
 * Ranks all states by their average 1-year growth rate and returns the top 5.
 * 
 * How it works:
 * 1. For each state, calculate the average growth rate of all its firms
 * 2. Sort states from highest to lowest average growth
 * 3. Take the top 5
 * 
 * Example: Arizona avg 12%, Nevada avg 10%, Florida avg 8% → these are top 3
 */
export function calculateTopStatesByGrowth(firms, topCount = 5) {
  const stateGrowth = {}
  
  firms.forEach(firm => {
    const state = firm.hqStateAbbr
    if (!state) return
    
    const growthPercent = convertDecimalToPercentage(firm.growth1Y)
    
    if (!isNaN(growthPercent)) {
      if (!stateGrowth[state]) {
        stateGrowth[state] = { total: 0, count: 0 }
      }
      stateGrowth[state].total += growthPercent
      stateGrowth[state].count += 1
    }
  })
  
  return Object.entries(stateGrowth)
    .map(([stateAbbr, data]) => ({
      state: stateAbbr,
      avgGrowth: data.total / data.count
    }))
    .sort((a, b) => b.avgGrowth - a.avgGrowth)
    .slice(0, topCount)
}

// ============================================================================
// PRIVATE PAGE FORMULAS - SECTION 1: KPIs
// ============================================================================

/**
 * Formula 8: Count firms in current view
 * 
 * Description:
 * Counts the total number of firms visible after all filters are applied.
 * 
 * How it works:
 * Simply count the firms in the filtered list.
 * 
 * Example: After filtering by segment and size, 45 firms remain → returns 45
 */
export function countFirmsInView(firms) {
  return firms ? firms.length : 0
}

/**
 * Formula 9: Calculate median 1-year growth
 * 
 * Description:
 * Finds the median (middle value) of 1-year growth rates for all firms in view.
 * The median is better than average when there are outliers.
 * 
 * How it works:
 * 1. Collect all 1-year growth rates
 * 2. Sort them from lowest to highest
 * 3. Pick the middle value (or average of two middle values if even count)
 * 
 * Example: Growth rates [2%, 5%, 7%, 9%, 15%] → median is 7%
 */
export function calculateMedianGrowth(firms) {
  if (!firms || firms.length === 0) return 0
  
  const growthValues = firms
    .map(firm => convertDecimalToPercentage(firm.growth1Y))
    .filter(g => !isNaN(g))
  
  return calculateMedian(growthValues)
}

/**
 * Formula 10: Calculate top segments in view
 * 
 * Description:
 * Identifies which industry segments have the highest average growth rates.
 * Returns the top 3 segments.
 * 
 * How it works:
 * 1. Group firms by their industry segment
 * 2. Calculate average growth for each segment
 * 3. Sort segments by average growth (highest first)
 * 4. Return top 3
 * 
 * Example: Technology 15% avg, Healthcare 12% avg, Finance 8% avg → these are top 3
 */
export function calculateTopSegmentsByGrowth(firms, topCount = 3) {
  if (!firms || firms.length === 0) return []
  
  const segmentGrowth = {}
  
  firms.forEach(firm => {
    const segment = firm.primarySegment
    if (!segment) return
    
    const growthPercent = convertDecimalToPercentage(firm.growth1Y)
    
    if (!isNaN(growthPercent)) {
      if (!segmentGrowth[segment]) {
        segmentGrowth[segment] = { total: 0, count: 0 }
      }
      segmentGrowth[segment].total += growthPercent
      segmentGrowth[segment].count += 1
    }
  })
  
  return Object.entries(segmentGrowth)
    .map(([segment, data]) => ({
      name: segment,
      avgGrowth: data.total / data.count,
      firmCount: data.count
    }))
    .sort((a, b) => b.avgGrowth - a.avgGrowth)
    .slice(0, topCount)
}

/**
 * Formula 11: Find top city in view
 * 
 * Description:
 * Identifies which city has the most firms in the current view.
 * 
 * How it works:
 * 1. Count how many firms are in each city
 * 2. Find the city with the most firms
 * 
 * Example: San Francisco has 25 firms, Austin has 20 → San Francisco is top city
 */
export function findTopCity(firms) {
  if (!firms || firms.length === 0) return 'N/A'
  
  const cityCounts = {}
  
  firms.forEach(firm => {
    const city = firm.companyCity
    if (city) {
      cityCounts[city] = (cityCounts[city] || 0) + 1
    }
  })
  
  const topCity = Object.entries(cityCounts)
    .sort(([, countA], [, countB]) => countB - countA)[0]
  
  return topCity ? topCity[0] : 'N/A'
}

// ============================================================================
// PRIVATE PAGE FORMULAS - SECTION 2: COUNTY MAP
// ============================================================================

/**
 * Formula 12: Calculate city average growth
 * 
 * Description:
 * Calculates the average growth rate for all firms in a specific city.
 * 
 * How it works:
 * 1. Find all firms in the city
 * 2. Get their growth rates based on selected timeframe
 * 3. Calculate the average
 * 
 * Example: 5 firms in Austin with 3%, 5%, 7%, 9%, 11% growth → average is 7%
 */
export function calculateCityAverageGrowth(firms, cityName, timeframe) {
  const cityFirms = firms.filter(f => f.companyCity === cityName)
  if (cityFirms.length === 0) return 0
  
  const growthField = timeframe === '1Y Growth' ? 'growth1Y' 
                    : timeframe === '6M Growth' ? 'growth6M' 
                    : 'growth2Y'
  
  const growthValues = cityFirms
    .map(f => convertDecimalToPercentage(f[growthField]))
    .filter(g => !isNaN(g))
  
  return calculateAverage(growthValues)
}

/**
 * Formula 13: Count firms in a county/city
 * 
 * Description:
 * Counts how many firms are located in a specific county or city.
 * 
 * How it works:
 * Count all firms where the city matches the specified city name.
 * 
 * Example: 15 firms are in Travis County (Austin area) → returns 15
 */
export function countFirmsInCity(firms, cityName) {
  return firms.filter(f => f.companyCity === cityName).length
}

/**
 * Formula 14: Calculate total headcount for a county/city
 * 
 * Description:
 * Estimates total number of employees at all firms in a city/county.
 * 
 * How it works:
 * Add up employee counts from all firms in that city.
 * 
 * Example: 3 firms with 50, 100, 150 employees → total is 300
 */
export function calculateCityTotalHeadcount(firms, cityName) {
  const cityFirms = firms.filter(f => f.companyCity === cityName)
  return cityFirms.reduce((total, firm) => total + (Number(firm.eeCount) || 0), 0)
}

/**
 * Formula 15: Calculate cities within a county with stats
 * 
 * Description:
 * For a county, lists all cities with their firm count and estimated growth.
 * 
 * How it works:
 * 1. Group firms by city within the county
 * 2. For each city, calculate:
 *    - Number of firms
 *    - Estimated total headcount growth (sum of all firms' growth)
 * 
 * Example: Travis County has Austin (20 firms, +150 employees) and Round Rock (5 firms, +30 employees)
 */
export function calculateCitiesInCounty(firms, timeframe) {
  const cityData = {}
  
  firms.forEach(firm => {
    const city = firm.companyCity
    if (!city) return
    
    if (!cityData[city]) {
      cityData[city] = {
        firmCount: 0,
        totalHeadcount: 0,
        estimatedGrowth: 0
      }
    }
    
    cityData[city].firmCount += 1
    
    const headcount = Number(firm.eeCount) || 0
    cityData[city].totalHeadcount += headcount
    
    // Calculate estimated headcount growth
    const growthField = timeframe === '1Y Growth' ? 'growth1Y' 
                      : timeframe === '6M Growth' ? 'growth6M' 
                      : 'growth2Y'
    const growthDecimal = Number(firm[growthField]) || 0
    const headcountGrowth = headcount * growthDecimal
    cityData[city].estimatedGrowth += headcountGrowth
  })
  
  return cityData
}

// ============================================================================
// PRIVATE PAGE FORMULAS - SECTION 3: PEER GROUP COMPARISON
// ============================================================================

/**
 * Formula 16: Calculate your average growth
 * 
 * Description:
 * Takes the user's self-reported internal headcount growth rate.
 * This is entered by the user during signup/registration.
 * 
 * How it works:
 * Simply return the value the user provided about their own growth.
 * 
 * Example: User said their company grew 8% → returns 8
 */
export function getUserAverageGrowth(userGrowthInput) {
  const growth = parseFloat(userGrowthInput)
  return isNaN(growth) ? 0 : growth
}

/**
 * Formula 17: Calculate peer median growth
 * 
 * Description:
 * Finds the median growth rate of "peer" firms - companies that are similar to yours.
 * Peers are defined as firms in the same segment and same size bucket.
 * 
 * How it works:
 * 1. Filter to find peer firms (same segment + same size bucket)
 * 2. Collect their 1-year growth rates
 * 3. Calculate the median (middle value)
 * 
 * Example: Your peers have growth rates [3%, 5%, 7%, 9%, 12%] → median is 7%
 */
export function calculatePeerMedianGrowth(allFirms, userSegment, userSizeBucket) {
  if (!allFirms || allFirms.length === 0) return 0
  
  // Find peer firms (same segment and same size)
  const peerFirms = allFirms.filter(firm => 
    firm.primarySegment === userSegment && 
    firm.employeeSizeBucket === userSizeBucket
  )
  
  if (peerFirms.length === 0) return 0
  
  const peerGrowthValues = peerFirms
    .map(firm => convertDecimalToPercentage(firm.growth1Y))
    .filter(g => !isNaN(g))
  
  return calculateMedian(peerGrowthValues)
}

/**
 * Formula 18: Calculate growth gap vs peers
 * 
 * Description:
 * Calculates how much faster or slower your company is growing compared to peers.
 * 
 * How it works:
 * Your growth - Peer median growth = Gap
 * - Positive gap means you're growing faster than peers
 * - Negative gap means you're growing slower than peers
 * 
 * Example: Your growth 10%, peer median 7% → gap is +3% (you're ahead)
 * Example: Your growth 4%, peer median 7% → gap is -3% (you're behind)
 */
export function calculateGrowthGap(userGrowth, peerMedianGrowth) {
  return userGrowth - peerMedianGrowth
}

// ============================================================================
// SHARED FORMULAS - MULTI-TIMEFRAME GROWTH
// ============================================================================

/**
 * Formula 19: Calculate average headcount growth across timeframes
 * 
 * Description:
 * For a single firm, calculates the average growth rate across multiple timeframes
 * (6-month, 1-year, and 2-year growth).
 * 
 * How it works:
 * 1. Get growth rates for all available timeframes
 * 2. Average them together
 * 3. Skip any missing values
 * 
 * Example: Firm has 6M growth 4%, 1Y growth 6%, 2Y growth 8% → average is 6%
 */
export function calculateAverageHeadcountGrowth(firm) {
  const growth6M = convertDecimalToPercentage(firm.growth6M)
  const growth1Y = convertDecimalToPercentage(firm.growth1Y)
  const growth2Y = convertDecimalToPercentage(firm.growth2Y)
  
  const validGrowths = [growth6M, growth1Y, growth2Y].filter(g => !isNaN(g) && g !== 0)
  
  if (validGrowths.length === 0) return 0
  
  return calculateAverage(validGrowths)
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format growth as a percentage string with sign
 * 
 * Description:
 * Converts a number to a formatted percentage string with + or - sign.
 * 
 * Example: 5.2 → "+5.2%"
 * Example: -3.7 → "-3.7%"
 * Example: 0 → "0%"
 */
export function formatGrowthPercentage(growthValue, decimalPlaces = 1) {
  if (growthValue === null || growthValue === undefined || isNaN(growthValue)) {
    return '-'
  }
  
  const rounded = Number(growthValue).toFixed(decimalPlaces)
  
  if (growthValue === 0) return '0%'
  if (growthValue > 0) return `+${rounded}%`
  return `${rounded}%`
}

/**
 * Format number with thousands separators
 * 
 * Description:
 * Formats large numbers with commas for readability.
 * 
 * Example: 1234567 → "1,234,567"
 * Example: 500 → "500"
 */
export function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '-'
  return Number(num).toLocaleString()
}
