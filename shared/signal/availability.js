// Plain-language note on where a role has a published local benchmark, shown
// before any result or report is promised. Uses snapshot.localAvailability
// ({ roleKey: { states, cities } }); never invents a local value.
import { STATES } from './geography.js'

const MAX_LISTED = 6
const STATE_NAMES = new Map(STATES.map((st) => [st.code, st.name]))
const stateNameOf = (code) => STATE_NAMES.get(code) || code

function listNames(codes, nameOf) {
  const names = codes.map(nameOf).filter(Boolean)
  if (names.length <= MAX_LISTED) return names.join(', ')
  return `${names.slice(0, MAX_LISTED).join(', ')} and ${names.length - MAX_LISTED} more`
}

// -> string | null (null when availability is unknown, e.g. snapshot not loaded)
export function localAvailabilityNote({ availability, roleKey, roleLabel, state, city, stateName, cityName }) {
  if (!availability || typeof availability !== 'object' || !roleKey) return null
  const job = roleLabel || 'this job'
  const entry = availability[roleKey] || { states: [], cities: [] }
  const states = Array.isArray(entry.states) ? entry.states : []
  const cities = Array.isArray(entry.cities) ? entry.cities : []
  if (city) {
    if (cities.includes(city)) return `${cityName || 'This city'} has a published benchmark for ${job}.`
    if (states.includes(state)) return `No ${cityName || 'city'} benchmark for ${job} yet; you'll see the ${stateName || 'state'} figure instead.`
    return `No ${cityName || 'city'} or ${stateName || 'state'} benchmark for ${job} yet; you'll see the nationwide figure instead.`
  }
  if (state) {
    if (states.includes(state)) return `${stateName || 'This state'} has a published benchmark for ${job}.`
    return `No ${stateName || 'state'} benchmark for ${job} yet; you'll see the nationwide figure instead.`
  }
  if (!states.length && !cities.length) return `${job} has a nationwide figure only; no state or city benchmarks are published yet.`
  return `Local benchmarks for ${job}: ${states.length} state${states.length === 1 ? '' : 's'} (${listNames(states, stateNameOf)})${cities.length ? ` and ${cities.length} cit${cities.length === 1 ? 'y' : 'ies'}` : ', no cities yet'}. Everywhere else shows the nationwide figure.`
}
