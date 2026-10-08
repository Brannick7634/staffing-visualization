// Client Pay Market Report logic for The Staffing Signal: one model feeds the
// homepage "Market Pay Insights", the on-screen report, the PDF and the emailed
// report, so every surface shows the same figures and words.
//
// Browser- and node-safe (imports only shared/signal/*). Every amount is
// integer cents and every comparison is integer math. The typical rate is the
// median of advertised pay (snapshot method.quantile), labelled "Market Median".
// The client pay rate is only an input here: nothing in this module stores,
// logs or sends it.
import { formatCents } from './money.js'
import { classifyRate } from './payBand.js'
import { roleByKey } from './taxonomy.js'
import { geographyLabel } from './geography.js'

export const MAX_RECIPIENTS = 5
// Emailing a report: other people a day per account (copies to yourself are
// free). The server default; SIGNAL_REPORT_EMAIL_DAILY_CAP can override it.
export const DAILY_RECIPIENT_LIMIT = 5
export const PREPARED_TEXT_MAX = 80
export const NOTE_MAX = 500
// Figures from fewer staffing firms than this still publish (the privacy rule
// needs 3), but carry a short "directional guide" caution on every surface.
export const LIMITED_DATA_MIN_FIRMS = 5

// Any scheme followed by "//" (http://, ftp://, hxxp://), plus the schemes
// that mail and PDF readers act on without slashes.
const URL_SCHEME = /[a-z][a-z0-9+.-]*:\/\//i
const BARE_SCHEME = /\b(?:mailto|javascript|data|vbscript|file|tel|sms|callto|skype|whatsapp):/i
const WWW = /\bwww\./i
// Anything domain-shaped on ANY ending: name.de, bit.ly/x, secure-login.app,
// sub.name.co.uk. Mail clients and PDF viewers turn these into links, so a
// false positive ("Inc.com", "done.Thanks") is accepted over a missed link.
// The dot must touch letters/digits on both sides, so "U.S. market",
// "e.g. com", "Mr. Top" and "$17.50" stay plain text.
const DOMAIN_LIKE = /[\p{L}\p{N}-][.。][\p{L}]{2,}/u
// A bare IPv4 address.
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/
// Invisible formatting characters (zero-width spaces, joiners, direction
// marks) that could split a link so the checks above miss it.
const INVISIBLE = /\p{Cf}/gu

// containsLink(text) -> true when the text holds anything that reads as a
// link. Email addresses count too (they contain a domain). The text is
// checked after NFKC normalisation (full-width dots and letters become plain
// ones) with invisible formatting characters removed.
export function containsLink(text) {
  if (typeof text !== 'string' || text === '') return false
  const t = text.normalize('NFKC').replace(INVISIBLE, '')
  return URL_SCHEME.test(t) || BARE_SCHEME.test(t) || WWW.test(t) || DOMAIN_LIKE.test(t) || IPV4.test(t)
}

export const COMPETITIVENESS_LEVELS = Object.freeze([
  Object.freeze({ key: 'severe', label: 'Severe recruiting risk', rule: 'More than 10% under the market low' }),
  Object.freeze({ key: 'below', label: 'Below market', rule: 'Under the market low' }),
  Object.freeze({ key: 'moderate', label: 'Moderately competitive', rule: 'Market low to market median' }),
  Object.freeze({ key: 'competitive', label: 'Competitive', rule: 'Market median to market high' }),
  Object.freeze({ key: 'high', label: 'Highly competitive', rule: 'Above the market high' })
])

const LEVEL_BY_KEY = new Map(COMPETITIVENESS_LEVELS.map((level) => [level.key, level]))

// Keys come from payBand.classifyRate.
export const POSITION_LABELS = Object.freeze({ below: 'Below market', within: 'Market range', above: 'Above market' })

export const DISCLAIMER = 'Market data is based on aggregated advertised pay in staffing-firm job postings and is intended for informational purposes only. It is advertised pay, not actual pay. Market conditions may vary based on employer, experience, shift, industry, geography and other factors.'
export const METHOD_NOTE = `Local figures are published only when at least 3 staffing firms report and no single firm accounts for more than half of the data. Figures from fewer than ${LIMITED_DATA_MIN_FIRMS} firms are marked as a directional guide. Full method: thestaffingsignal.com/methodology`

function isCents(value) {
  return Number.isSafeInteger(value) && value > 0
}

function isOrderedBand(p25Cents, typicalCents, p75Cents) {
  return isCents(p25Cents) && isCents(typicalCents) && isCents(p75Cents) &&
    p25Cents <= typicalCents && typicalCents <= p75Cents
}

// classifyCompetitiveness(rate, p25, typical, p75) -> level key | null
// First match wins: severe when rate < 90% of P25 (rate*10 < p25*9); below
// when rate < P25; moderate when rate < typical; competitive when rate <= P75
// (typical may equal P75); otherwise high. null for unusable or unordered input.
export function classifyCompetitiveness(rateCents, p25Cents, typicalCents, p75Cents) {
  if (!isCents(rateCents) || !isOrderedBand(p25Cents, typicalCents, p75Cents)) return null
  if (rateCents * 10 < p25Cents * 9) return 'severe'
  if (rateCents < p25Cents) return 'below'
  if (rateCents < typicalCents) return 'moderate'
  if (rateCents <= p75Cents) return 'competitive'
  return 'high'
}

// marketGap(rate, typical) -> { gapCents, pct, direction } | null
// pct is |gap| / typical as a whole percent, rounded half up:
// floor((200*|gap| + typical) / (2*typical)), computed without floats.
export function marketGap(rateCents, typicalCents) {
  if (!isCents(rateCents) || !isCents(typicalCents)) return null
  const gapCents = rateCents - typicalCents
  const numerator = Math.abs(gapCents) * 200 + typicalCents
  const denominator = typicalCents * 2
  const pct = (numerator - (numerator % denominator)) / denominator
  const direction = gapCents < 0 ? 'below' : gapCents > 0 ? 'above' : 'at'
  return { gapCents, pct, direction }
}

export function recommendedRanges(typicalCents, p75Cents) {
  if (!isCents(typicalCents) || !isCents(p75Cents)) return null
  return {
    competitive: { fromCents: typicalCents, toCents: p75Cents },
    aggressive: { fromCents: p75Cents }
  }
}

// '$20.00–$24.20', or the single value when both ends are equal.
export function formatRangeCents(fromCents, toCents) {
  return fromCents === toCents ? formatCents(fromCents) : `${formatCents(fromCents)}–${formatCents(toCents)}`
}

// True when a pay scope carries figures the viewer may see. Stricter than
// "finite": the figures must be positive integer cents in P25 <= typical <= P75
// order, so a malformed scope falls through to the next one.
export function hasFigures(scope) {
  return Boolean(scope) && typeof scope === 'object' &&
    scope.coverage === 'publishable' &&
    scope.access !== 'requires_free_account' &&
    isOrderedBand(scope.p25Cents, scope.typicalCents, scope.p75Cents)
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function isoDay(date) {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${mm}-${dd}`
}

function dayLabel(date) {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
}

// Optional "Prepared for / by" text: single line, trimmed, at most
// PREPARED_TEXT_MAX characters (code points, so emoji are never split).
function cleanPrepared(value) {
  if (typeof value !== 'string') return ''
  const line = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return Array.from(line).slice(0, PREPARED_TEXT_MAX).join('').trim()
}

function slug(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function geographyOf(scope, fallback) {
  const geo = scope && scope.geography && typeof scope.geography === 'object' ? scope.geography : {}
  const level = ['nationwide', 'state', 'city'].includes(geo.level) ? geo.level : fallback.level
  const label = typeof geo.label === 'string' && geo.label.trim() !== '' ? geo.label : fallback.label
  return { level, label }
}

function requestedGeography(payResponse) {
  const request = payResponse.request && typeof payResponse.request === 'object' ? payResponse.request : {}
  const state = request.state || null
  const city = state && request.city ? request.city : null
  const derived = {
    level: city ? 'city' : state ? 'state' : 'nationwide',
    label: geographyLabel(state, city) || 'Nationwide'
  }
  return geographyOf(payResponse.result, derived)
}

// "Staffing firms in the Houston, TX area" / "in Texas" / "across the U.S."
function summaryPlace(scope) {
  if (scope.level === 'nationwide') return 'across the U.S.'
  if (scope.level === 'city') return `in the ${scope.label} area`
  return `in ${scope.label}`
}

function takeawayPlace(scope) {
  return scope.level === 'nationwide' ? 'across the U.S.' : `in ${scope.label}`
}

// limitedDataNote(firmCount) -> caution sentence | null. Only a known firm
// count below LIMITED_DATA_MIN_FIRMS gets the note; an unknown count does not.
export function limitedDataNote(firmCount) {
  if (!Number.isSafeInteger(firmCount) || firmCount < 0 || firmCount >= LIMITED_DATA_MIN_FIRMS) return null
  return `Based on a small number of staffing firms (${firmCount}). Treat these figures as a directional guide.`
}

// "about 15%", or "less than 1%" when a real gap rounds to 0.
function gapPhrase(gap) {
  return gap.pct === 0 ? 'less than 1%' : `about ${gap.pct}%`
}

function executiveSummaryText({ place, role, figures, rateCents, gap, level }) {
  const { p25Cents, typicalCents, p75Cents } = figures
  const middle = p25Cents === p75Cents ? formatCents(p25Cents) : `${formatCents(p25Cents)} to ${formatCents(p75Cents)}`
  const lead = `Staffing firms ${place} are advertising ${role} positions in a middle range of about ${middle} per hour, with a median of ${formatCents(typicalCents)}. `
  const rate = `A client pay rate of ${formatCents(rateCents)} per hour`
  if (level === 'severe' || level === 'below') {
    return `${lead}${rate} falls below that range and is ${gapPhrase(gap)} under the median, which may make the position more difficult to fill.`
  }
  if (level === 'moderate') {
    return `${lead}${rate} is within that range but ${gapPhrase(gap)} under the median, so many competing offers for the same work advertise more.`
  }
  if (level === 'competitive') {
    return `${lead}${rate} is at or above the median and within that range, in line with most competing offers.`
  }
  return `${lead}${rate} is above that range, higher than at least three in four advertised rates.`
}

// "across the U.S." already ends the sentence.
function endSentence(text) {
  return text.endsWith('.') ? text : `${text}.`
}

function takeawayText({ place, role, figures, rateCents, gap }) {
  const rate = `A client pay rate of ${formatCents(rateCents)}/hr`
  if (gap.direction === 'below') {
    return `${endSentence(`${rate} is ${gapPhrase(gap)} below the current market median for ${role} ${place}`)} ` +
      `Moving the rate into the competitive range (${formatRangeCents(figures.typicalCents, figures.p75Cents)}) may improve the client’s ability to attract qualified candidates. ` +
      'Higher pay does not guarantee an order will fill.'
  }
  const where = gap.direction === 'at' ? 'at' : `${gapPhrase(gap)} above`
  return `${endSentence(`${rate} is ${where} the current market median for ${role} ${place}`)} Pay is one factor in filling an order; it does not guarantee a fill.`
}

// buildClientReportModel({ payResponse, rateCents, now, preparedFor, preparedBy, sample, snapshotDate })
//   -> model | null
// Uses the requested scope when it has figures, else the state fallback, else
// nationwide. null when no scope has figures or the rate is not positive cents.
// snapshotDate defaults to payResponse.trend.snapshotDate when not supplied.
export function buildClientReportModel({
  payResponse,
  rateCents,
  now = new Date(),
  preparedFor = '',
  preparedBy = '',
  sample = false,
  snapshotDate = null
} = {}) {
  if (!payResponse || typeof payResponse !== 'object' || !isCents(rateCents)) return null

  const picked = [payResponse.result, payResponse.fallback, payResponse.national].find(hasFigures)
  if (!picked) return null

  const request = payResponse.request && typeof payResponse.request === 'object' ? payResponse.request : {}
  const requested = requestedGeography(payResponse)
  let scopeDefault = requested
  if (picked === payResponse.national) scopeDefault = { level: 'nationwide', label: 'Nationwide' }
  else if (picked === payResponse.fallback) scopeDefault = { level: 'state', label: geographyLabel(request.state || null, null) || requested.label }
  const scope = geographyOf(picked, scopeDefault)
  const usedFallback = scope.level !== requested.level
  const fallbackNote = usedFallback
    ? `There is no reliable ${requested.label} figure yet, so this report uses ${scope.level === 'nationwide' ? 'nationwide figures' : scope.label}.`
    : null

  const roleKey = request.roleKey || (payResponse.national && payResponse.national.roleKey) || null
  const role = roleKey ? roleByKey(roleKey) : null
  const roleLabel = (role && role.label) || request.roleLabel || (payResponse.national && payResponse.national.roleLabel) || ''

  const figures = {
    p25Cents: picked.p25Cents,
    typicalCents: picked.typicalCents,
    p75Cents: picked.p75Cents,
    firmCount: Number.isSafeInteger(picked.firmCount) && picked.firmCount >= 0 ? picked.firmCount : null
  }
  const gap = marketGap(rateCents, figures.typicalCents)
  const positionKey = classifyRate(rateCents, figures.p25Cents, figures.p75Cents)
  const levelKey = classifyCompetitiveness(rateCents, figures.p25Cents, figures.typicalCents, figures.p75Cents)
  const date = validDate(now)
  const trend = payResponse.trend ?? null
  const limitedNote = limitedDataNote(figures.firmCount)

  return {
    sample: Boolean(sample),
    reportDateIso: isoDay(date),
    reportDateLabel: dayLabel(date),
    snapshotDate: snapshotDate ?? (trend && typeof trend.snapshotDate === 'string' ? trend.snapshotDate : null),
    roleKey,
    roleLabel,
    requested,
    scope,
    usedFallback,
    fallbackNote,
    figures,
    limitedData: limitedNote !== null,
    limitedDataNote: limitedNote,
    rateCents,
    gap,
    position: { key: positionKey, label: POSITION_LABELS[positionKey] },
    competitiveness: { key: levelKey, label: LEVEL_BY_KEY.get(levelKey).label },
    levels: COMPETITIVENESS_LEVELS.map((level) => ({ ...level, active: level.key === levelKey })),
    ranges: recommendedRanges(figures.typicalCents, figures.p75Cents),
    executiveSummary: executiveSummaryText({ place: summaryPlace(scope), role: roleLabel, figures, rateCents, gap, level: levelKey }),
    takeaway: takeawayText({ place: takeawayPlace(scope), role: roleLabel, figures, rateCents, gap }),
    market: payResponse.market ?? null,
    trend,
    preparedFor: cleanPrepared(preparedFor),
    preparedBy: cleanPrepared(preparedBy),
    fileName: `Client-Pay-Market-Report_${slug(roleLabel) || 'Role'}_${slug(scope.label) || 'Nationwide'}.pdf`,
    disclaimer: DISCLAIMER,
    methodNote: METHOD_NOTE
  }
}
