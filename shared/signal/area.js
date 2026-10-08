// The reader's area (state + city) for sign-up and preferences. The Monthly
// Signal is sent by area, so sign-up requires both. One rule set for the
// browser forms, the API (api/_lib/subscribers.js) and the dev fakes.
//
// On the wire `city` is either a listed city key ('TX:houston', from
// citiesForState) or the typed name of a city that is not listed ('Katy').
// What gets stored is a label: 'Houston, TX' for a listed city, or
// '<typed name>, <ST>' for a typed one.
//
// Browser-safe (imports only shared/signal/*).
import { STATES, stateByCode, cityByKey, citiesForState } from './geography.js'
import { containsLink } from './clientReport.js'

// Select value for "My city isn't listed" (reveals the "Your city" box).
export const CITY_OTHER = 'other'
export const CITY_TEXT_MIN = 2
export const CITY_TEXT_MAX = 60
// Longer input is rejected before any cleaning or link checks run.
const RAW_MAX = 200
const CITY_KEY = /^[A-Z]{2}:[a-z0-9-]+$/
// Letters (any script), digits, spaces and the punctuation real place names use.
const CITY_CHARS = /^[\p{L}\p{M}0-9 .'’\-,()&/]+$/u
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g

export const AREA_MESSAGES = Object.freeze({
  state_required: 'Choose your state.',
  invalid_state: 'Choose a US state from the list.',
  city_required: 'Choose your city, or choose “My city isn’t listed” and type it.',
  city_text_required: 'Type your city.',
  invalid_city: `Type just your city name (${CITY_TEXT_MIN} to ${CITY_TEXT_MAX} letters, spaces, hyphens or periods).`,
  unlisted_city: 'Choose a city from the list.',
  links_not_allowed: 'Links aren’t allowed. Type just your city name.'
})

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Typed city text: control characters out, spaces collapsed, trimmed, and a
// trailing ", TX" / ", Texas" / " TX" for the chosen state dropped (the state
// is added back when the label is built).
export function cleanCityText(text, state) {
  if (typeof text !== 'string') return ''
  let t = text.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()
  const st = stateByCode(state)
  if (st) {
    t = t.replace(new RegExp(`,\\s*(?:${st.code}|${escapeRe(st.name)})\\.?$`, 'i'), '')
      .replace(new RegExp(`\\s+${st.code}\\.?$`, 'i'), '')
      .replace(/[\s,]+$/, '')
      .trim()
  }
  return t
}

// "St.Louis", "Ft.Myers", "Mt.Pleasant": a space after the abbreviation, so
// the link check does not read them as domains.
const spaceAbbreviations = (text) => text.replace(/\b(st|ft|mt)\.(?=\p{L})/giu, '$1. ')

// A trailing ", CA" / ", California" naming a state other than the chosen one
// -> that state's code, else null.
function otherStateSuffix(text, state) {
  const m = /,\s*([\p{L} .]+?)\.?\s*$/u.exec(text)
  if (!m) return null
  const tail = m[1].trim().toLowerCase()
  const st = STATES.find((s) => s.code.toLowerCase() === tail || s.name.toLowerCase() === tail)
  return st && st.code !== state ? st.code : null
}

// Spelling-insensitive match key: accents and punctuation dropped, and
// Saint/St., Fort/Ft., Mount/Mt. treated as the same word.
function matchSlug(name) {
  return String(name || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\b(?:saint|st)\b\.?/g, 'st')
    .replace(/\b(?:fort|ft)\b\.?/g, 'fort')
    .replace(/\b(?:mount|mt)\b\.?/g, 'mount')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
const CITY_ALIASES = Object.freeze({ 'NY:nyc': 'NY:new-york', 'NY:new-york-city': 'NY:new-york' })

// The listed city a typed or stored name means ('Saint Louis', 'St Louis' and
// 'St. Louis' -> St. Louis, MO; 'NYC' -> New York), else null.
export function findListedCity(state, name) {
  const slug = matchSlug(name)
  if (!state || !slug) return null
  const alias = CITY_ALIASES[`${state}:${slug}`]
  return citiesForState(state).find((c) => c.key === alias || matchSlug(c.name) === slug) || null
}

const fail = (field, code, message = AREA_MESSAGES[code]) => ({ ok: false, field, code, message })
const listedArea = (c) => ({ ok: true, state: c.state, cityKey: c.key, cityName: c.name, label: `${c.name}, ${c.state}`, listed: true })

// checkArea('TX', 'TX:houston') | checkArea('TX', 'Katy') ->
//   { ok: true, state, cityKey ('TX:houston' | null), cityName, label, listed }
//   { ok: false, field: 'state' | 'city', code, message }
// Codes: state_required, invalid_state, city_required, invalid_city,
// links_not_allowed. A typed name that matches a listed city in that state is
// treated as that listed city (findListedCity: 'Saint Louis' = St. Louis). A
// typed ', CA' for a state other than the chosen one is invalid_city.
export function checkArea(stateIn, cityIn) {
  if (stateIn !== undefined && stateIn !== null && typeof stateIn !== 'string') return fail('state', 'invalid_state')
  const state = typeof stateIn === 'string' ? stateIn.trim().toUpperCase() : ''
  if (!state) return fail('state', 'state_required')
  if (!/^[A-Z]{2}$/.test(state) || !stateByCode(state)) return fail('state', 'invalid_state')
  if (cityIn !== undefined && cityIn !== null && typeof cityIn !== 'string') return fail('city', 'invalid_city')
  const raw = typeof cityIn === 'string' ? cityIn.trim() : ''
  if (!raw) return fail('city', 'city_required')
  if (raw.length > RAW_MAX) return fail('city', 'invalid_city')
  if (CITY_KEY.test(raw)) {
    const c = cityByKey(raw)
    return c && c.state === state ? listedArea(c) : fail('city', 'invalid_city', AREA_MESSAGES.unlisted_city)
  }
  const spaced = spaceAbbreviations(raw)
  if (containsLink(spaced)) return fail('city', 'links_not_allowed')
  const other = otherStateSuffix(spaced, state)
  if (other) {
    const otherName = stateByCode(other).name
    return fail('city', 'invalid_city', `That city is in ${otherName}. Choose ${otherName} as your state.`)
  }
  const name = cleanCityText(spaced, state)
  if (!name) return fail('city', 'city_required')
  if (name.length < CITY_TEXT_MIN || name.length > CITY_TEXT_MAX || !CITY_CHARS.test(name) || !/\p{L}/u.test(name)) {
    return fail('city', 'invalid_city')
  }
  const listed = findListedCity(state, name)
  if (listed) return listedArea(listed)
  return { ok: true, state, cityKey: null, cityName: name, label: `${name}, ${state}`, listed: false }
}

// ---- The saved area (as stored on the subscriber row) ----
// States is one value per line: the home state first, then followed states
// ('CA') and followed cities ('CA:los-angeles'). City is the label
// ('Houston, TX', '<typed name>, <ST>', or an older bare 'Houston').

const STATE_LINE = /^[A-Z]{2}$/
const LABEL_STATE = /,\s*([A-Za-z]{2})\.?\s*$/

// Stored multi-line text -> trimmed, non-empty lines.
export function storedLines(text) {
  return typeof text === 'string' ? text.split('\n').map((x) => x.trim()).filter(Boolean) : []
}

// The saved home state: the state at the end of the City label ('Katy, TX'),
// else the first States line that is a state code, else null.
export function savedHomeState(lines, cityText) {
  const m = typeof cityText === 'string' ? LABEL_STATE.exec(cityText) : null
  if (m && stateByCode(m[1].toUpperCase())) return m[1].toUpperCase()
  return (lines || []).find((x) => STATE_LINE.test(x) && stateByCode(x)) || null
}

// The saved area from the stored States text and City label ->
//   { state, cityKey: 'TX:houston' | null, typedCity: 'Katy' | null, label }
// or null when no home state is saved. A label for a listed city gives its
// key; any other name is the typed city. No City saved: both null and the
// label is the state name.
export function savedArea(statesText, cityText) {
  const state = savedHomeState(storedLines(statesText), cityText)
  if (!state) return null
  const text = typeof cityText === 'string' ? cityText.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim() : ''
  const name = text ? cleanCityText(text, state) : ''
  if (!name) return { state, cityKey: null, typedCity: null, label: stateByCode(state).name }
  const listed = findListedCity(state, name)
  if (listed) return { state, cityKey: listed.key, typedCity: null, label: `${listed.name}, ${state}` }
  return { state, cityKey: null, typedCity: name, label: `${name}, ${state}` }
}

// ---- The form control (components/AreaFields.jsx) ----
// Picker value: { state: 'TX' | '', city: 'TX:houston' | CITY_OTHER | '', cityText }

export const EMPTY_PICKER = Object.freeze({ state: '', city: '', cityText: '' })

// A state with no listed cities goes straight to the "Your city" box.
const defaultCity = (state) => (state && citiesForState(state).length === 0 ? CITY_OTHER : '')

// Prefill from a search selection ({ state, city: 'TX:houston' }): the listed
// city when it belongs to the state, else just the state.
export function pickerFromSelection(selection) {
  const state = selection?.state && stateByCode(selection.state) ? selection.state : ''
  if (!state) return { ...EMPTY_PICKER }
  const c = selection.city ? cityByKey(selection.city) : null
  return { state, city: c && c.state === state ? c.key : defaultCity(state), cityText: '' }
}

// Prefill from the saved area (savedArea / GET /api/preferences): the listed
// city selected, or "My city isn't listed" with the typed name in the box.
export function pickerFromSavedArea(area) {
  const state = area?.state && stateByCode(area.state) ? area.state : ''
  if (!state) return { ...EMPTY_PICKER }
  const c = area.cityKey ? cityByKey(area.cityKey) : null
  if (c && c.state === state) return { state, city: c.key, cityText: '' }
  const typed = typeof area.typedCity === 'string' ? area.typedCity.trim() : ''
  if (typed) return { state, city: CITY_OTHER, cityText: typed }
  return { state, city: defaultCity(state), cityText: '' }
}

// True when the reader changed the area from what was loaded (a typed city
// compared trimmed), so an untouched area is left out of the save.
export function pickerChanged(picker, loaded) {
  const norm = (p) => {
    const typed = p.city === CITY_OTHER
    return `${p.state || ''}|${p.city || ''}|${typed ? String(p.cityText || '').trim() : ''}`
  }
  return norm(picker || EMPTY_PICKER) !== norm(loaded || EMPTY_PICKER)
}

// New state chosen: a typed city is kept; a listed one is cleared.
export function pickerWithState(picker, state) {
  const keepTyped = picker.city === CITY_OTHER && Boolean(state)
  return { state, city: keepTyped ? CITY_OTHER : defaultCity(state), cityText: picker.cityText || '' }
}

// The followed-states list when the area moves from one state to another
// (Preferences). The area's state is always on the list (the server keeps it
// first), so the old area state leaves with the move unless the reader
// follows it in its own right: it was on the loaded list without being the
// saved area state, or a followed city sits in it. The new area state joins
// the list first. `followedBefore` = loaded states minus the saved area state.
export function followedStatesForArea(states, cities, fromState, toState, followedBefore = []) {
  if (fromState === toState) return states
  const keepFrom = !fromState || followedBefore.includes(fromState) ||
    cities.some((key) => cityByKey(key)?.state === fromState)
  const next = keepFrom ? states : states.filter((code) => code !== fromState)
  return toState && stateByCode(toState) && !next.includes(toState) ? [toState, ...next] : next
}

// Request fields for the API: { state, city } (city = key or typed text).
export function pickerToRequest(picker) {
  const city = picker.city === CITY_OTHER ? String(picker.cityText || '').trim() : picker.city
  return { state: picker.state || '', city: city || '' }
}

// -> { ok: true, area } (area from checkArea) or
//    { ok: false, errors: { state?, city?, cityText? } } for the form.
export function checkPicker(picker) {
  if (!picker.state) return { ok: false, errors: { state: AREA_MESSAGES.state_required } }
  if (!picker.city) return { ok: false, errors: { city: AREA_MESSAGES.city_required } }
  const typed = picker.city === CITY_OTHER
  if (typed && !String(picker.cityText || '').trim()) return { ok: false, errors: { cityText: AREA_MESSAGES.city_text_required } }
  const area = checkArea(picker.state, pickerToRequest(picker).city)
  if (area.ok) return { ok: true, area }
  const key = area.field === 'state' ? 'state' : (typed ? 'cityText' : 'city')
  const message = typed && area.code === 'city_required' ? AREA_MESSAGES.city_text_required : area.message
  return { ok: false, errors: { [key]: message } }
}
