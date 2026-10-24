// Smart links: a homepage URL that opens the pay tool on one market and job,
// e.g. /?city=raleigh-nc&role=warehouse-associate&utm_source=valley&ref=rec123
//
// parseSmartLink reads the query string; resolveSmartLink picks what to show
// using the snapshot's localAvailability, so a link can only land on a market
// the site already publishes for that job: the city, else its state, else the
// nationwide figure. An unknown job means "no smart link" (normal homepage).
// Bad values never throw and never reach the page as text.
//
// Browser-safe (no node: imports).
import { CITIES, STATES } from './geography.js'
import { roleByKey, sectorForRole } from './taxonomy.js'

// Campaign tags: short lowercase machine values only.
const TAG = /^[a-z0-9][a-z0-9_.-]{0,39}$/
// Recipient/row id from the sending list (e.g. an Airtable record id).
const REF = /^[A-Za-z0-9_-]{1,32}$/

const STATE_CODES = new Set(STATES.map((st) => st.code))
const CITY_KEYS = new Set(CITIES.map((c) => c.key))

export function slugify(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// 'raleigh-nc' | 'nc' -> { state: 'NC', city: 'NC:raleigh' | null }. The city
// may be one the picker does not list; resolve falls back to the state then.
export function parseCityParam(value) {
  const slug = slugify(value)
  const m = /^(?:([a-z0-9-]+)-)?([a-z]{2})$/.exec(slug)
  if (!m) return null
  const state = m[2].toUpperCase()
  if (!STATE_CODES.has(state)) return null
  return { state, city: m[1] ? `${state}:${m[1]}` : null }
}

function tag(params, name) {
  const v = String(params.get(name) || '').trim().toLowerCase()
  return TAG.test(v) ? v : null
}

// search: location.search string or URLSearchParams. -> null when not a smart link.
export function parseSmartLink(search) {
  let params
  try {
    params = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || ''))
  } catch {
    return null
  }
  const roleParam = slugify(params.get('role'))
  const role = roleParam && roleByKey(roleParam) && sectorForRole(roleParam) ? roleParam : null
  const place = params.get('city') ? parseCityParam(params.get('city')) : null
  const ref = String(params.get('ref') || '').trim()
  const utm = {
    utmSource: tag(params, 'utm_source'),
    utmMedium: tag(params, 'utm_medium'),
    utmCampaign: tag(params, 'utm_campaign'),
    ref: REF.test(ref) ? ref : null
  }
  const tagged = Object.values(utm).some(Boolean)
  if (!role && !place && !tagged) return null
  return { roleKey: role, place, utm }
}

// -> { selection, market, level } or null (show the normal homepage).
// availability: snapshot.localAvailability ({ roleKey: { states, cities } }).
export function resolveSmartLink(link, availability) {
  if (!link || !link.roleKey) return null
  const sector = sectorForRole(link.roleKey)
  if (!sector) return null
  const entry = (availability && availability[link.roleKey]) || {}
  const cities = Array.isArray(entry.cities) ? entry.cities : []
  const states = Array.isArray(entry.states) ? entry.states : []
  const base = { sectorKey: sector.key, roleKey: link.roleKey, state: null, city: null }
  const place = link.place
  if (place && place.city && CITY_KEYS.has(place.city) && cities.includes(place.city)) {
    return { selection: { ...base, state: place.state, city: place.city }, market: place.city, level: 'city' }
  }
  if (place && states.includes(place.state)) {
    return { selection: { ...base, state: place.state }, market: place.state, level: 'state' }
  }
  return { selection: base, market: null, level: 'nationwide' }
}

// The link a sending list should carry for one row.
export function buildSmartLink({ origin = 'https://www.thestaffingsignal.com', cityName, state, roleKey, source = 'valley', medium = 'linkedin', campaign = 'pay-targets', ref } = {}) {
  const params = new URLSearchParams()
  const st = slugify(state)
  if (st) params.set('city', cityName ? `${slugify(cityName)}-${st}` : st)
  if (roleKey) params.set('role', roleKey)
  params.set('utm_source', source)
  params.set('utm_medium', medium)
  params.set('utm_campaign', campaign)
  if (ref && REF.test(ref)) params.set('ref', ref)
  return `${origin}/?${params.toString()}`
}
