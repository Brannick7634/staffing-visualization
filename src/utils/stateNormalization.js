/**
 * State name normalization and fuzzy matching utilities
 * Handles misspellings, abbreviations, and variations in state names
 */

// Complete mapping of state abbreviations to full names
const STATE_ABBR_TO_FULL = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
}

// Reverse mapping: full names to abbreviations
const STATE_FULL_TO_ABBR = Object.entries(STATE_ABBR_TO_FULL).reduce((acc, [abbr, full]) => {
  acc[full.toLowerCase()] = abbr
  return acc
}, {})

// Common misspellings and variations
const STATE_MISSPELLINGS = {
  // District of Columbia variations
  'district of colmbia': 'District of Columbia',
  'district of colombia': 'District of Columbia',
  'distict of columbia': 'District of Columbia',
  'dist of columbia': 'District of Columbia',
  'washington dc': 'District of Columbia',
  'washington d.c.': 'District of Columbia',
  'washington d.c': 'District of Columbia',
  
  // Delaware variations
  'delware': 'Delaware',
  'deleware': 'Delaware',
  
  // Other common misspellings
  'pensylvania': 'Pennsylvania',
  'pennsilvania': 'Pennsylvania',
  'massachusets': 'Massachusetts',
  'massachusettes': 'Massachusetts',
  'massachussetts': 'Massachusetts',
  'conneticut': 'Connecticut',
  'connecticutt': 'Connecticut',
  'missisipi': 'Mississippi',
  'mississipi': 'Mississippi',
  'misouri': 'Missouri',
  'tennese': 'Tennessee',
  'tennesee': 'Tennessee',
  'tennesse': 'Tennessee',
  'arkanas': 'Arkansas',
  'arkansaw': 'Arkansas',
  'louisianna': 'Louisiana',
  'lousiana': 'Louisiana',
  'new hamshire': 'New Hampshire',
  'rhode island': 'Rhode Island',
  'rode island': 'Rhode Island',
  'north carlina': 'North Carolina',
  'north carollina': 'North Carolina',
  'south carlina': 'South Carolina',
  'south carollina': 'South Carolina',
  'west virgina': 'West Virginia',
  'west virignia': 'West Virginia',
  'new mexco': 'New Mexico',
  'new mexcio': 'New Mexico',
  'californa': 'California',
  'californai': 'California',
  'colorodo': 'Colorado',
  'colorada': 'Colorado',
  'wisconson': 'Wisconsin',
  'wisonsin': 'Wisconsin'
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching of state names
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length
  const n = str2.length
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + 1  // substitution
        )
      }
    }
  }

  return dp[m][n]
}

/**
 * Normalize a state name to its canonical full name
 * Handles abbreviations, misspellings, and variations
 * 
 * @param {string} stateName - Raw state name from data
 * @returns {string} - Normalized state name or original if no match found
 */
export function normalizeStateName(stateName) {
  if (!stateName) return ''
  
  // Handle array format (take first element)
  if (Array.isArray(stateName)) {
    stateName = stateName[0] || ''
  }
  
  // Convert to string and clean
  const cleaned = String(stateName).trim()
  if (!cleaned) return ''
  
  const lower = cleaned.toLowerCase()
  
  // 1. Check if it's an abbreviation
  const upper = cleaned.toUpperCase()
  if (STATE_ABBR_TO_FULL[upper]) {
    return STATE_ABBR_TO_FULL[upper]
  }
  
  // 2. Check exact match (case-insensitive)
  if (STATE_FULL_TO_ABBR[lower]) {
    // Find the abbreviation and return the canonical full name
    const abbr = STATE_FULL_TO_ABBR[lower]
    return STATE_ABBR_TO_FULL[abbr]
  }
  
  // 3. Check known misspellings
  if (STATE_MISSPELLINGS[lower]) {
    return STATE_MISSPELLINGS[lower]
  }
  
  // 4. Fuzzy matching - find closest state name
  const validStates = Object.values(STATE_ABBR_TO_FULL)
  let bestMatch = null
  let bestDistance = Infinity
  
  for (const validState of validStates) {
    const distance = levenshteinDistance(lower, validState.toLowerCase())
    
    // Only consider it a match if distance is small relative to length
    // Max 2 character differences for states, or 20% of the length
    const maxAllowedDistance = Math.min(2, Math.ceil(validState.length * 0.2))
    
    if (distance < bestDistance && distance <= maxAllowedDistance) {
      bestDistance = distance
      bestMatch = validState
    }
  }
  
  // Return best match if found, otherwise return original
  return bestMatch || cleaned
}

/**
 * Normalize a state abbreviation
 * Converts full names or misspellings to standard 2-letter abbreviation
 * 
 * @param {string} stateName - Raw state name from data
 * @returns {string} - Normalized state abbreviation (e.g., "CA", "DC") or empty string
 */
export function normalizeStateAbbr(stateName) {
  if (!stateName) return ''
  
  const normalized = normalizeStateName(stateName)
  
  // Find the abbreviation for this normalized name
  const lower = normalized.toLowerCase()
  
  // Check if it's already an abbreviation
  const upper = normalized.toUpperCase()
  if (STATE_ABBR_TO_FULL[upper]) {
    return upper
  }
  
  // Look up abbreviation from full name
  return STATE_FULL_TO_ABBR[lower] || ''
}

/**
 * Check if a state name is valid (matches a real US state)
 * 
 * @param {string} stateName - State name to validate
 * @returns {boolean} - True if valid US state
 */
export function isValidStateName(stateName) {
  if (!stateName) return false
  
  const normalized = normalizeStateName(stateName)
  const lower = normalized.toLowerCase()
  
  return STATE_FULL_TO_ABBR.hasOwnProperty(lower)
}

/**
 * Get all unique valid states from a list of firms
 * Normalizes state names and removes duplicates/invalid entries
 * 
 * @param {Array} firms - Array of firm objects
 * @returns {Array} - Sorted array of unique valid state names
 */
export function getUniqueValidStates(firms) {
  if (!firms || !Array.isArray(firms)) return []
  
  const stateSet = new Set()
  
  firms.forEach(firm => {
    const stateName = firm.hqLocation || firm.hqStateAbbr
    if (stateName) {
      const normalized = normalizeStateName(stateName)
      if (normalized && isValidStateName(normalized)) {
        stateSet.add(normalized)
      }
    }
  })
  
  return Array.from(stateSet).sort()
}

/**
 * Compare two state names for equality (fuzzy match)
 * Handles misspellings and variations
 * 
 * @param {string} state1 - First state name
 * @param {string} state2 - Second state name
 * @returns {boolean} - True if they represent the same state
 */
export function statesMatch(state1, state2) {
  const normalized1 = normalizeStateName(state1)
  const normalized2 = normalizeStateName(state2)
  
  return normalized1.toLowerCase() === normalized2.toLowerCase()
}

/**
 * Get state abbreviation from firm data (tries both fields)
 * 
 * @param {Object} firm - Firm object with hqStateAbbr and/or hqLocation
 * @returns {string} - Normalized state abbreviation
 */
export function getFirmStateAbbr(firm) {
  if (!firm) return ''
  
  // Try hqStateAbbr first (it's more reliable if present)
  if (firm.hqStateAbbr) {
    const normalized = normalizeStateAbbr(firm.hqStateAbbr)
    if (normalized) return normalized
  }
  
  // Fall back to hqLocation
  if (firm.hqLocation) {
    return normalizeStateAbbr(firm.hqLocation)
  }
  
  return ''
}

/**
 * Get state full name from firm data (tries both fields)
 * 
 * @param {Object} firm - Firm object with hqStateAbbr and/or hqLocation
 * @returns {string} - Normalized state full name
 */
export function getFirmStateName(firm) {
  if (!firm) return ''
  
  // Try hqLocation first (it's the full name field)
  if (firm.hqLocation) {
    const normalized = normalizeStateName(firm.hqLocation)
    if (normalized && isValidStateName(normalized)) return normalized
  }
  
  // Fall back to hqStateAbbr
  if (firm.hqStateAbbr) {
    return normalizeStateName(firm.hqStateAbbr)
  }
  
  return ''
}
