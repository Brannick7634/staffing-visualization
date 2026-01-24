// City name normalization utilities

// Common city name variations and their normalized forms
const CITY_ABBREVIATIONS = {
  'st.': 'saint',
  'st ': 'saint ',
  'ft.': 'fort',
  'ft ': 'fort ',
  'mt.': 'mount',
  'mt ': 'mount '
}

// Known non-US cities (to flag data quality issues)
const KNOWN_FOREIGN_CITIES = new Set([
  'london', 'chennai', 'mumbai', 'delhi', 'bangalore', 'hyderabad',
  'paris', 'berlin', 'tokyo', 'beijing', 'shanghai', 'toronto',
  'vancouver', 'montreal', 'sydney', 'melbourne', 'dublin', 'manila',
  'singapore', 'hong kong', 'dubai', 'mexico city', 'bogota', 'lima'
])

// Generic/invalid city names
const INVALID_CITY_NAMES = new Set([
  'across the u.s.', 'usa', 'united states', 'remote', 'various',
  'multiple locations', 'nationwide', 'n/a', 'tbd', 'unknown'
])

/**
 * Normalize a city name for consistent matching
 * - Converts to lowercase
 * - Trims whitespace
 * - Expands common abbreviations (St. → Saint, Ft. → Fort)
 * - Removes apostrophes for consistency
 * - Removes extra spaces
 */
export const normalizeCityName = (cityName) => {
  if (!cityName) return ''
  
  let normalized = cityName.toLowerCase().trim()
  
  // Remove apostrophes first (Land O' Lakes → Land O Lakes)
  normalized = normalized.replace(/'/g, '')
  
  // Replace common abbreviations (handle with and without periods)
  // St. Petersburg, St Petersburg, Saint Petersburg → saint petersburg
  normalized = normalized.replace(/\bst\.\s+/gi, 'saint ')
  normalized = normalized.replace(/\bst\s+/gi, 'saint ')
  normalized = normalized.replace(/\bft\.\s+/gi, 'fort ')
  normalized = normalized.replace(/\bft\s+/gi, 'fort ')
  normalized = normalized.replace(/\bmt\.\s+/gi, 'mount ')
  normalized = normalized.replace(/\bmt\s+/gi, 'mount ')
  
  // Remove extra spaces
  normalized = normalized.replace(/\s+/g, ' ').trim()
  
  return normalized
}

/**
 * Check if a city name is likely a foreign city (data quality issue)
 */
export const isForeignCity = (cityName) => {
  const normalized = normalizeCityName(cityName)
  return KNOWN_FOREIGN_CITIES.has(normalized)
}

/**
 * Check if a city name is invalid/generic
 */
export const isInvalidCity = (cityName) => {
  const normalized = normalizeCityName(cityName)
  return INVALID_CITY_NAMES.has(normalized)
}

/**
 * Get suggestions for city name corrections
 * Returns possible matches from a list of valid cities
 */
export const getSuggestions = (cityName, validCities, maxSuggestions = 3) => {
  const normalized = normalizeCityName(cityName)
  const suggestions = []
  
  // Exact match (already handled elsewhere)
  if (validCities.includes(normalized)) {
    return [normalized]
  }
  
  // Partial match - city contains or is contained by valid city
  validCities.forEach(validCity => {
    if (normalized.includes(validCity) || validCity.includes(normalized)) {
      suggestions.push(validCity)
    }
  })
  
  return suggestions.slice(0, maxSuggestions)
}
