// US geography picker list for The Staffing Signal preview.
//
// This is a static list of places a visitor can choose, not data: being listed
// says nothing about whether a benchmark or demand count exists for a place.
// City keys pair the state code with a slug ('TX:houston') so same-named
// cities in different states (Aurora, IL and Aurora, CO) stay distinct.
//
// Browser-safe (no node: imports).

function freezeAll(items) {
  return Object.freeze(items.map((item) => Object.freeze(item)))
}

// 50 states + the District of Columbia, alphabetical by name.
export const STATES = freezeAll([
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' }
])

function city(state, slug, name) {
  return { key: `${state}:${slug}`, name, state }
}

// Static picker list: a few major cities for populous states. Grouped by
// state; within a state, largest first.
export const CITIES = freezeAll([
  city('AL', 'birmingham', 'Birmingham'),
  city('AL', 'huntsville', 'Huntsville'),
  city('AZ', 'phoenix', 'Phoenix'),
  city('AZ', 'tucson', 'Tucson'),
  city('AZ', 'mesa', 'Mesa'),
  city('CA', 'los-angeles', 'Los Angeles'),
  city('CA', 'san-diego', 'San Diego'),
  city('CA', 'san-jose', 'San Jose'),
  city('CA', 'san-francisco', 'San Francisco'),
  city('CA', 'fresno', 'Fresno'),
  city('CA', 'sacramento', 'Sacramento'),
  city('CO', 'denver', 'Denver'),
  city('CO', 'colorado-springs', 'Colorado Springs'),
  city('CO', 'aurora', 'Aurora'),
  city('DC', 'washington', 'Washington'),
  city('FL', 'jacksonville', 'Jacksonville'),
  city('FL', 'miami', 'Miami'),
  city('FL', 'tampa', 'Tampa'),
  city('FL', 'orlando', 'Orlando'),
  city('GA', 'atlanta', 'Atlanta'),
  city('GA', 'augusta', 'Augusta'),
  city('GA', 'savannah', 'Savannah'),
  city('IL', 'chicago', 'Chicago'),
  city('IL', 'aurora', 'Aurora'),
  city('IL', 'rockford', 'Rockford'),
  city('IN', 'indianapolis', 'Indianapolis'),
  city('IN', 'fort-wayne', 'Fort Wayne'),
  city('KY', 'louisville', 'Louisville'),
  city('KY', 'lexington', 'Lexington'),
  city('LA', 'new-orleans', 'New Orleans'),
  city('LA', 'baton-rouge', 'Baton Rouge'),
  city('MA', 'boston', 'Boston'),
  city('MA', 'worcester', 'Worcester'),
  city('MD', 'baltimore', 'Baltimore'),
  city('MD', 'columbia', 'Columbia'),
  city('MI', 'detroit', 'Detroit'),
  city('MI', 'grand-rapids', 'Grand Rapids'),
  city('MN', 'minneapolis', 'Minneapolis'),
  city('MN', 'saint-paul', 'Saint Paul'),
  city('MO', 'kansas-city', 'Kansas City'),
  city('MO', 'st-louis', 'St. Louis'),
  city('NC', 'charlotte', 'Charlotte'),
  city('NC', 'raleigh', 'Raleigh'),
  city('NC', 'greensboro', 'Greensboro'),
  city('NC', 'durham', 'Durham'),
  city('NJ', 'newark', 'Newark'),
  city('NJ', 'jersey-city', 'Jersey City'),
  city('NV', 'las-vegas', 'Las Vegas'),
  city('NV', 'reno', 'Reno'),
  city('NY', 'new-york', 'New York'),
  city('NY', 'buffalo', 'Buffalo'),
  city('NY', 'rochester', 'Rochester'),
  city('NY', 'albany', 'Albany'),
  city('OH', 'columbus', 'Columbus'),
  city('OH', 'cleveland', 'Cleveland'),
  city('OH', 'cincinnati', 'Cincinnati'),
  city('OK', 'oklahoma-city', 'Oklahoma City'),
  city('OK', 'tulsa', 'Tulsa'),
  city('OR', 'portland', 'Portland'),
  city('PA', 'philadelphia', 'Philadelphia'),
  city('PA', 'pittsburgh', 'Pittsburgh'),
  city('PA', 'allentown', 'Allentown'),
  city('SC', 'charleston', 'Charleston'),
  city('SC', 'columbia', 'Columbia'),
  city('SC', 'greenville', 'Greenville'),
  city('TN', 'nashville', 'Nashville'),
  city('TN', 'memphis', 'Memphis'),
  city('TN', 'knoxville', 'Knoxville'),
  city('TX', 'houston', 'Houston'),
  city('TX', 'san-antonio', 'San Antonio'),
  city('TX', 'dallas', 'Dallas'),
  city('TX', 'austin', 'Austin'),
  city('TX', 'fort-worth', 'Fort Worth'),
  city('TX', 'el-paso', 'El Paso'),
  city('UT', 'salt-lake-city', 'Salt Lake City'),
  city('VA', 'virginia-beach', 'Virginia Beach'),
  city('VA', 'richmond', 'Richmond'),
  city('VA', 'norfolk', 'Norfolk'),
  city('WA', 'seattle', 'Seattle'),
  city('WA', 'spokane', 'Spokane'),
  city('WA', 'tacoma', 'Tacoma'),
  city('WI', 'milwaukee', 'Milwaukee'),
  city('WI', 'madison', 'Madison')
])

const STATE_INDEX = new Map(STATES.map((state) => [state.code, state]))
const CITY_INDEX = new Map(CITIES.map((item) => [item.key, item]))

function isUnset(value) {
  return value === null || value === undefined || value === ''
}

// stateByCode('TX') -> { code:'TX', name:'Texas' } | null. Codes are uppercase.
export function stateByCode(code) {
  return STATE_INDEX.get(code) || null
}

// Picker cities for a state, in list order. Unknown state -> [].
export function citiesForState(code) {
  return CITIES.filter((item) => item.state === code)
}

// cityByKey('TX:houston') -> { key, name, state } | null
export function cityByKey(key) {
  return CITY_INDEX.get(key) || null
}

// True for: nationwide (no state, no city); a known state with no city; or a
// known state plus a known city in that state. null, undefined and '' all mean
// "not chosen". A city without its state is invalid.
export function isValidSelection(state, city) {
  if (isUnset(state)) return isUnset(city)
  if (!stateByCode(state)) return false
  if (isUnset(city)) return true
  const found = cityByKey(city)
  return Boolean(found) && found.state === state
}

// Display label for a valid selection: 'Nationwide' | 'Texas' | 'Houston, TX'.
// Returns null for an invalid selection.
export function geographyLabel(state, city) {
  if (!isValidSelection(state, city)) return null
  if (isUnset(state)) return 'Nationwide'
  if (isUnset(city)) return stateByCode(state).name
  const found = cityByKey(city)
  return `${found.name}, ${found.state}`
}
