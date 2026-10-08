// Client Pay Market Report: the two-page US Letter PDF, plus reportView(), the
// display strings and geometry shared with the on-screen HTML report
// (src/preview/components/ClientReportDocument.jsx) so screen, print and PDF
// always say the same thing.
//
// No JSX (this file also runs in node for the emailed report). React primitives
// come from @react-pdf/renderer, which is imported only inside the render
// functions so the library stays out of every bundle that does not render a
// PDF. Fonts are the built-in Helvetica faces only, so every string passes
// through pdfText() to stay inside the WinAnsi character set they support.
import { createElement as h } from 'react'
import { formatCents } from './money.js'
import { bandGeometry, placeLabels } from './payBand.js'

export const PAGE_COUNT = 2
export const PAGE_SIZE = 'LETTER'
export const HISTORY_NOTE = 'Monthly pay history began in August 2026.'
export const TREND_MAX_POINTS = 6

const MINUS = '−'

// ---------------------------------------------------------------------------
// reportView(model): every derived string and position, renderer-neutral.
// ---------------------------------------------------------------------------

function isInt(value) {
  return Number.isSafeInteger(value)
}

function isPositiveInt(value) {
  return Number.isSafeInteger(value) && value > 0
}

function count(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function plural(n, one, many) {
  return n === 1 ? one : many
}

function perHour(cents) {
  return `${formatCents(cents)}/hr`
}

function rangeText(fromCents, toCents) {
  return fromCents === toCents ? formatCents(fromCents) : `${formatCents(fromCents)}–${formatCents(toCents)}`
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// '2026-10-06' -> 'Week of October 6, 2026'
export function snapshotWeekLabel(iso) {
  const match = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  if (!match) return 'Latest weekly snapshot'
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return 'Latest weekly snapshot'
  return `Week of ${MONTHS[month - 1]} ${day}, ${match[1]}`
}

function placePhrase(scope) {
  return scope.level === 'nationwide' ? 'across the U.S.' : `in ${scope.label}`
}

function gapView(gap) {
  const pctWord = gap.pct === 0 ? 'less than 1%' : `about ${gap.pct}%`
  if (gap.direction === 'at') {
    return {
      direction: 'at',
      amount: `${formatCents(0)}/hr`,
      short: 'At the market median',
      sentence: 'The client pay rate matches the current market median.'
    }
  }
  const size = formatCents(Math.abs(gap.gapCents))
  const short = `${gap.pct === 0 ? 'Less than 1%' : `${gap.pct}%`} ${gap.direction} market median`
  return {
    direction: gap.direction,
    amount: `${gap.direction === 'below' ? MINUS : '+'}${size}/hr`,
    short,
    sentence: `The client pay rate is ${pctWord} ${gap.direction} the current market median.`
  }
}

const TICK_NAMES = { p25: 'Low', typical: 'Median', p75: 'High' }
// Tick labels are centred boxes, so they stay inside [EDGE, 100 - EDGE] percent
// of the bar: placeLabels runs on that inner span and the result maps back.
const EDGE = 9
const INNER = 100 - 2 * EDGE

function insetLabels(markers, minGapPct) {
  const toInner = (pct) => ((Math.min(100 - EDGE, Math.max(EDGE, pct)) - EDGE) / INNER) * 100
  return placeLabels(markers.map((marker) => ({ ...marker, xPct: toInner(marker.xPct) })), { minGapPct: (minGapPct / INNER) * 100 })
    .map((placed, i) => ({ ...placed, xPct: markers[i].xPct, labelPct: EDGE + (placed.labelPct / 100) * INNER }))
}

function barView(model) {
  const { p25Cents, typicalCents, p75Cents } = model.figures
  const geometry = bandGeometry({ rateCents: model.rateCents, p25Cents, typicalCents, p75Cents })
  if (!geometry) return null
  const ticks = insetLabels(geometry.markers.filter((marker) => marker.key !== 'rate'), 19).map((marker) => ({ key: marker.key, name: TICK_NAMES[marker.key], value: formatCents(marker.cents), xPct: marker.xPct, labelPct: marker.labelPct }))
  const clientPct = geometry.x(model.rateCents)
  const { fromPct, toPct } = geometry.band
  return {
    zones: [
      { key: 'below', label: 'Below market', fromPct: 0, toPct: fromPct },
      { key: 'within', label: 'Market range', fromPct, toPct },
      { key: 'above', label: 'Above market', fromPct: toPct, toPct: 100 }
    ],
    client: { xPct: clientPct, labelPct: Math.min(88, Math.max(12, clientPct)), label: `Client ${formatCents(model.rateCents)}` },
    ticks,
    summary: `On a scale of advertised pay, the client pay rate of ${perHour(model.rateCents)} sits ${
      model.position.key === 'within' ? 'inside' : model.position.key === 'below' ? 'below' : 'above'
    } the market range of ${rangeText(p25Cents, p75Cents)}, with the market median at ${formatCents(typicalCents)}.`
  }
}

function marketView(model) {
  const market = model.market && typeof model.market === 'object' ? model.market : null
  const city = market && market.city && typeof market.city === 'object' ? market.city : null
  const state = market && market.state && typeof market.state === 'object' ? market.state : null
  const cards = []
  if (city) {
    const window = isPositiveInt(city.windowDays) ? `Last ${city.windowDays} days` : 'Recent weeks'
    if (isInt(city.newPostings) && city.newPostings >= 0) {
      cards.push({ key: 'postings', value: count(city.newPostings), label: `New staffing-firm job ${plural(city.newPostings, 'posting', 'postings')} in ${city.label}`, note: window })
    }
    if (isInt(city.staffingFirms) && city.staffingFirms >= 0) {
      cards.push({ key: 'firms', value: count(city.staffingFirms), label: `Staffing ${plural(city.staffingFirms, 'firm', 'firms')} posting in ${city.label}`, note: window })
    }
  }
  if (state && isInt(state.momentumPct)) {
    const pct = state.momentumPct
    const windows = isPositiveInt(state.windowDays) && isPositiveInt(state.previousWindowDays)
      ? `Last ${state.windowDays} days vs. the previous ${state.previousWindowDays}, relative to all states`
      : 'Recent weeks vs. the weeks before, relative to all states'
    cards.push({
      key: 'momentum',
      value: `${pct > 0 ? '+' : pct < 0 ? MINUS : ''}${Math.abs(pct)}%`,
      label: `${state.label} posting momentum`,
      note: state.isEarlySignal ? `${windows}. Early signal.` : `${windows}.`,
      tone: pct > 0 ? 'heating' : pct < 0 ? 'cooling' : null
    })
  }
  const where = city ? city.label : state ? state.label : null
  return {
    cards,
    scopeLine: where ? `All staffing jobs in ${where}, not only ${model.roleLabel}.` : null,
    caution: 'Observed postings, not verified open orders.',
    empty: cards.length === 0 ? 'Local market activity is not available for this location yet.' : null
  }
}

function trendView(model) {
  const trend = model.trend && typeof model.trend === 'object' ? model.trend : null
  const raw = trend && Array.isArray(trend.series) ? trend.series : []
  const series = raw
    .filter((entry) => entry && Array.isArray(entry.points) && entry.points.length > 0)
    .map((entry) => ({
      key: entry.scope === 'state' ? `state-${entry.code || ''}` : String(entry.scope || 'series'),
      label: entry.label || (entry.scope === 'nationwide' ? 'Nationwide' : ''),
      points: entry.points.slice(-TREND_MAX_POINTS).map((point) => ({
        key: String(point.period),
        label: String(point.label || point.period || ''),
        cents: isPositiveInt(point.typicalCents) ? point.typicalCents : null
      }))
    }))
  const values = series.flatMap((entry) => entry.points.map((point) => point.cents)).filter((cents) => cents !== null)
  const max = values.length ? Math.max(...values) : 0
  const shaped = series.map((entry) => ({
    ...entry,
    points: entry.points.map((point) => ({
      ...point,
      value: point.cents === null ? 'Not enough data' : formatCents(point.cents),
      // Bars start at $0 so their lengths stay honest.
      widthPct: point.cents === null || max === 0 ? 0 : Math.max(2, (point.cents / max) * 100)
    }))
  }))
  return {
    series: values.length ? shaped : [],
    note: `Market median advertised pay for ${model.roleLabel}, by monthly snapshot. ${HISTORY_NOTE}`,
    empty: values.length ? null : `A pay trend is not available for this job yet. ${HISTORY_NOTE}`
  }
}

const DEFINITIONS = Object.freeze([
  { term: 'Market Low', text: 'The 25th percentile of advertised pay: one in four advertised rates is at or below it.' },
  { term: 'Market Median', text: 'The middle advertised rate: half of advertised rates are above it and half are below.' },
  { term: 'Market High', text: 'The 75th percentile: one in four advertised rates is at or above it.' },
  { term: 'Market Gap', text: 'The client pay rate minus the market median, in dollars per hour and as a percent of the median.' },
  { term: 'Client Pay Position', text: 'Below market is under the market low, market range runs from the market low to the market high, and above market is over the market high.' }
])

export function reportView(model) {
  const { figures } = model
  const firms = isPositiveInt(figures.firmCount) ? figures.firmCount : null
  const level = model.levels.find((entry) => entry.active) || null
  const caution = model.position.key === 'below'
  return {
    brand: 'The Staffing Signal',
    tagline: 'Market intelligence for the staffing industry',
    site: 'thestaffingsignal.com',
    title: 'Client Pay Market Report',
    subtitle: 'Independent market data to support smarter staffing decisions.',
    sampleBand: model.sample ? { title: 'EXAMPLE REPORT', text: 'Built from real market data with an example client pay rate.' } : null,
    meta: [
      { key: 'date', label: 'Report date', value: model.reportDateLabel },
      { key: 'location', label: 'Location', value: model.scope.label },
      { key: 'data', label: 'Data', value: snapshotWeekLabel(model.snapshotDate) }
    ],
    prepared: [
      model.preparedFor ? { key: 'for', label: 'Prepared for', value: model.preparedFor } : null,
      model.preparedBy ? { key: 'by', label: 'Prepared by', value: model.preparedBy } : null
    ].filter(Boolean),
    role: model.roleLabel,
    firmLine: firms ? `from ${count(firms)} staffing ${plural(firms, 'firm', 'firms')}` : null,
    limitedNote: model.limitedDataNote || null,
    fallbackNote: model.fallbackNote || null,
    tiles: [
      { key: 'low', label: 'Market Low', sub: '25th percentile', value: formatCents(figures.p25Cents) },
      { key: 'median', label: 'Market Median', sub: 'Typical advertised', value: formatCents(figures.typicalCents) },
      { key: 'high', label: 'Market High', sub: '75th percentile', value: formatCents(figures.p75Cents) },
      { key: 'client', label: 'Client Pay Rate', sub: gapView(model.gap).short, value: formatCents(model.rateCents), tone: caution ? 'caution' : 'client' }
    ],
    position: { label: model.position.label, caution },
    bar: barView(model),
    gap: gapView(model.gap),
    executiveSummary: model.executiveSummary,
    levels: model.levels,
    levelLine: level ? `${level.label}: ${level.rule.charAt(0).toLowerCase()}${level.rule.slice(1)}.` : null,
    ranges: [
      { key: 'competitive', label: 'Competitive Range', value: `${rangeText(model.ranges.competitive.fromCents, model.ranges.competitive.toCents)}/hr`, rule: 'Market median to market high' },
      { key: 'aggressive', label: 'Aggressive Recruiting Range', value: `${formatCents(model.ranges.aggressive.fromCents)}+/hr`, rule: 'Above the market high' }
    ],
    rangeNote: 'Targets describe the market. They don’t guarantee an order fills.',
    runningHead: `Client Pay Market Report · ${model.roleLabel} ${placePhrase(model.scope)}`,
    market: marketView(model),
    trend: trendView(model),
    definitions: DEFINITIONS,
    rules: model.levels.map((entry) => ({ key: entry.key, label: entry.label, rule: entry.rule })),
    rangeRules: [
      { key: 'competitive', label: 'Competitive Range', rule: 'Market median to market high.' },
      { key: 'aggressive', label: 'Aggressive Recruiting Range', rule: 'Above the market high.' }
    ],
    readClosing: 'They describe the market; they do not guarantee an order will fill.',
    disclaimer: model.disclaimer,
    methodNote: model.methodNote,
    pages: PAGE_COUNT
  }
}

// ---------------------------------------------------------------------------
// PDF document (react-pdf primitives, no JSX).
// ---------------------------------------------------------------------------

// react-pdf's primitives are plain element-type strings. These match the
// library's own exports (asserted in tests/signal/clientReportPdf.test.mjs);
// the render functions always pass the real exports.
const DEFAULT_PRIMITIVES = Object.freeze({ Document: 'DOCUMENT', Page: 'PAGE', View: 'VIEW', Text: 'TEXT', Svg: 'SVG', Rect: 'RECT' })

// WinAnsi (Windows-1252) is all the standard Helvetica faces can draw.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
const REPLACEMENTS = { '−': '-', '≤': '<=', '≥': '>=', '→': '->', ' ': ' ', ' ': ' ', ' ': ' ' }

export function pdfText(value) {
  let out = ''
  for (const ch of String(value ?? '')) {
    if (REPLACEMENTS[ch] !== undefined) { out += REPLACEMENTS[ch]; continue }
    const code = ch.codePointAt(0)
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch)) out += ch
    else if (code === 0x0a) out += '\n'
    else out += '?'
  }
  return out
}

const C = {
  navy: '#102A43',
  navy2: '#16426E',
  primary: '#1E5FAA',
  ink: '#132B45',
  ink2: '#243B53',
  muted: '#52647A',
  border: '#DCE5EE',
  surface2: '#F0F4F8',
  tint: '#E8F0FA',
  amber: '#8A5A10',
  amberBg: '#FFF7E6',
  amberBorder: '#EFD7A6',
  zoneBelow: '#F3D9A4',
  zoneWithin: '#DCE5EE',
  zoneAbove: '#B9D1EC',
  heating: '#B42336',
  cooling: '#1D5EA8',
  white: '#FFFFFF'
}

const ZONE_COLORS = { below: C.zoneBelow, within: C.zoneWithin, above: C.zoneAbove }
const REGULAR = 'Helvetica'
const BOLD = 'Helvetica-Bold'

const S = {
  page: { paddingTop: 34, paddingBottom: 44, paddingHorizontal: 42, fontFamily: REGULAR, fontSize: 9, color: C.ink2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brandName: { fontFamily: BOLD, fontSize: 13, color: C.navy, lineHeight: 1.1 },
  brandTag: { fontSize: 7.5, lineHeight: 1.2, color: C.muted, marginTop: 1 },
  site: { fontSize: 8, lineHeight: 1.2, color: C.muted },
  rule: { height: 2, backgroundColor: C.navy, marginTop: 8, marginBottom: 12 },
  thinRule: { height: 1, backgroundColor: C.border, marginTop: 6, marginBottom: 12 },
  sample: { backgroundColor: C.amberBg, borderWidth: 1, borderColor: C.amberBorder, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  sampleTitle: { fontFamily: BOLD, fontSize: 8.5, lineHeight: 1.2, color: C.amber, letterSpacing: 1, marginRight: 8 },
  sampleText: { fontSize: 8, lineHeight: 1.2, color: C.amber },
  title: { fontFamily: BOLD, fontSize: 21, color: C.navy, lineHeight: 1.15 },
  subtitle: { fontSize: 9.5, lineHeight: 1.3, color: C.muted, marginTop: 1 },
  metaRow: { flexDirection: 'row', marginTop: 8, marginBottom: 7 },
  metaCell: { marginRight: 28 },
  kicker: { fontFamily: BOLD, fontSize: 7, lineHeight: 1.3, color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase' },
  metaValue: { fontSize: 9.5, lineHeight: 1.3, color: C.ink },
  prepared: { flexDirection: 'row', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 7 },
  preparedCell: { flex: 1, paddingRight: 8 },
  positionRow: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 4 },
  roleText: { fontFamily: BOLD, fontSize: 14, lineHeight: 1.2, color: C.ink, marginRight: 8 },
  firmText: { fontSize: 9, lineHeight: 1.2, color: C.muted, marginBottom: 1.5 },
  limited: { alignSelf: 'flex-start', backgroundColor: C.amberBg, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6, color: C.amber, fontSize: 8, lineHeight: 1.25, marginBottom: 3 },
  note: { backgroundColor: C.amberBg, borderWidth: 1, borderColor: C.amberBorder, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8, color: C.amber, fontSize: 8.5, lineHeight: 1.3, marginBottom: 2 },
  h2: { fontFamily: BOLD, fontSize: 8.5, lineHeight: 1.2, color: C.navy2, letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 8, marginBottom: 4 },
  tiles: { flexDirection: 'row' },
  tile: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 8, marginRight: 6 },
  tileLast: { marginRight: 0 },
  tileLabel: { fontFamily: BOLD, fontSize: 8, lineHeight: 1.25, color: C.ink },
  tileSub: { fontSize: 7, lineHeight: 1.25, color: C.muted },
  tileValue: { fontFamily: BOLD, fontSize: 16, lineHeight: 1.15, color: C.navy, marginTop: 3 },
  tileUnit: { fontSize: 8, color: C.muted, fontFamily: REGULAR },
  positionWrap: { flexDirection: 'row', alignItems: 'stretch' },
  barCol: { flex: 1, marginRight: 12 },
  barBox: { position: 'relative', height: 66 },
  gapBox: { width: 150, borderWidth: 1, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 8 },
  gapAmount: { fontFamily: BOLD, fontSize: 15, lineHeight: 1.15, marginTop: 2 },
  gapShort: { fontFamily: BOLD, fontSize: 8.5, lineHeight: 1.25, marginTop: 1 },
  gapSentence: { fontSize: 8, lineHeight: 1.35, color: C.ink2, marginTop: 3 },
  legend: { flexDirection: 'row', marginTop: 3 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  swatch: { width: 8, height: 8, borderRadius: 1.5, marginRight: 3 },
  legendText: { fontSize: 7, lineHeight: 1.2, color: C.muted },
  body: { fontSize: 9.5, color: C.ink2, lineHeight: 1.4 },
  scale: { flexDirection: 'row' },
  step: { flex: 1, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, borderRadius: 4, paddingVertical: 5, paddingHorizontal: 5, marginRight: 4 },
  stepLabel: { fontFamily: BOLD, fontSize: 7.5, lineHeight: 1.25, color: C.ink },
  stepRule: { fontSize: 6.5, lineHeight: 1.3, color: C.muted, marginTop: 1 },
  stepFlag: { fontFamily: BOLD, fontSize: 6, lineHeight: 1.2, letterSpacing: 0.6, marginBottom: 2 },
  levelLine: { fontSize: 8.5, lineHeight: 1.3, color: C.ink2, marginTop: 3 },
  rangeTile: { flex: 1, borderWidth: 1, borderColor: C.zoneAbove, backgroundColor: C.tint, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 9, marginRight: 6 },
  rangeLabel: { fontFamily: BOLD, fontSize: 8.5, lineHeight: 1.2, color: C.navy2 },
  rangeValue: { fontFamily: BOLD, fontSize: 14, lineHeight: 1.2, color: C.navy, marginTop: 2 },
  rangeRule: { fontSize: 7.5, lineHeight: 1.2, color: C.muted, marginTop: 1 },
  small: { fontSize: 7.5, lineHeight: 1.3, color: C.muted, marginTop: 3 },
  footer: { position: 'absolute', left: 42, right: 42, bottom: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 5 },
  footerText: { fontSize: 7, lineHeight: 1.2, color: C.muted },
  cards: { flexDirection: 'row' },
  card: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 8, marginRight: 6 },
  cardValue: { fontFamily: BOLD, fontSize: 15, lineHeight: 1.2, color: C.navy },
  cardLabel: { fontSize: 7.5, lineHeight: 1.3, color: C.ink, marginTop: 1 },
  cardNote: { fontSize: 6.5, lineHeight: 1.3, color: C.muted, marginTop: 2 },
  trendCols: { flexDirection: 'row' },
  trendCol: { flex: 1, marginRight: 16 },
  seriesLabel: { fontFamily: BOLD, fontSize: 8.5, lineHeight: 1.2, color: C.ink, marginTop: 3, marginBottom: 3 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  trendPeriod: { width: 52, fontSize: 7.5, lineHeight: 1.2, color: C.muted },
  trendTrack: { flex: 1, height: 8, backgroundColor: C.surface2, borderRadius: 1.5 },
  trendValue: { width: 64, fontSize: 7.5, lineHeight: 1.2, color: C.ink, textAlign: 'right' },
  def: { flexDirection: 'row', marginBottom: 2 },
  defTerm: { width: 104, fontFamily: BOLD, fontSize: 8, lineHeight: 1.35, color: C.ink },
  defText: { flex: 1, fontSize: 8, lineHeight: 1.35, color: C.ink2 },
  ruleItem: { flexDirection: 'row', marginBottom: 1.5 },
  ruleLabel: { width: 118, fontSize: 8, lineHeight: 1.3, color: C.ink, fontFamily: BOLD },
  ruleText: { flex: 1, fontSize: 8, lineHeight: 1.3, color: C.ink2 },
  sub: { fontFamily: BOLD, fontSize: 8, lineHeight: 1.2, color: C.navy2, marginTop: 5, marginBottom: 3 }
}

function makeKit(P) {
  const t = (style, value, extra = {}) => h(P.Text, { style, ...extra }, pdfText(value))
  const v = (style, ...children) => h(P.View, { style }, ...children)
  const logo = (size) => h(P.Svg, { width: size, height: size, viewBox: '0 0 30 30' },
    h(P.Rect, { x: 1, y: 17, width: 7, height: 12, rx: 1, fill: '#1D5EA8' }),
    h(P.Rect, { x: 11.5, y: 10, width: 7, height: 19, rx: 1, fill: '#16426E' }),
    h(P.Rect, { x: 22, y: 2, width: 7, height: 27, rx: 1, fill: '#102A43' })
  )
  return { t, v, logo }
}

function pageOne(kit, view, P, wrap) {
  const { t, v, logo } = kit
  const bar = view.bar
  const gapTone = view.position.caution
    ? { borderColor: C.amberBorder, backgroundColor: C.amberBg, color: C.amber }
    : { borderColor: C.zoneAbove, backgroundColor: C.tint, color: C.navy2 }

  const tiles = view.tiles.map((tile, i) => {
    const tone = tile.tone === 'caution'
      ? { borderColor: C.amberBorder, backgroundColor: C.amberBg }
      : tile.tone === 'client' ? { borderColor: C.zoneAbove, backgroundColor: C.tint } : null
    return h(P.View, { key: tile.key, style: [S.tile, i === view.tiles.length - 1 ? S.tileLast : null, tone].filter(Boolean) },
      t(S.tileLabel, tile.label),
      t([S.tileSub, tile.tone === 'caution' ? { color: C.amber, fontFamily: BOLD } : null].filter(Boolean), tile.sub),
      h(P.Text, { style: [S.tileValue, tile.tone === 'caution' ? { color: C.amber } : null].filter(Boolean) },
        pdfText(tile.value), h(P.Text, { style: S.tileUnit }, ' /hr'))
    )
  })

  const barBox = bar && h(P.View, { style: S.barBox },
    h(P.View, { style: { position: 'absolute', top: 0, left: `${bar.client.labelPct}%`, width: 80, marginLeft: -40 } },
      t({ fontFamily: BOLD, fontSize: 8, color: view.position.caution ? C.amber : C.navy, textAlign: 'center' }, bar.client.label)),
    h(P.View, { style: { position: 'absolute', top: 15, left: 0, right: 0, height: 14, flexDirection: 'row', borderRadius: 2 } },
      ...bar.zones.filter((zone) => zone.toPct > zone.fromPct).map((zone) =>
        h(P.View, { key: zone.key, style: { width: `${zone.toPct - zone.fromPct}%`, height: 14, backgroundColor: ZONE_COLORS[zone.key] } }))),
    ...bar.ticks.map((tick) => h(P.View, { key: `tick-${tick.key}`, style: { position: 'absolute', top: 29, left: `${tick.xPct}%`, width: 1, height: 5, marginLeft: -0.5, backgroundColor: C.muted } })),
    ...bar.ticks.map((tick) => h(P.View, { key: `lab-${tick.key}`, style: { position: 'absolute', top: 35, left: `${tick.labelPct}%`, width: 64, marginLeft: -32 } },
      t({ fontSize: 7, color: C.muted, textAlign: 'center' }, tick.name),
      t({ fontFamily: BOLD, fontSize: 8, color: C.ink, textAlign: 'center' }, tick.value))),
    h(P.View, { style: { position: 'absolute', top: 11, left: `${bar.client.xPct}%`, width: 2.5, height: 22, marginLeft: -1.25, backgroundColor: view.position.caution ? C.amber : C.navy } })
  )

  return h(P.Page, { size: PAGE_SIZE, style: S.page, wrap },
    v(S.headerRow,
      v(S.brandRow, logo(24), v({ marginLeft: 7 }, t(S.brandName, view.brand), t(S.brandTag, view.tagline))),
      t(S.site, view.site)),
    v(S.rule),
    view.sampleBand && v(S.sample, t(S.sampleTitle, view.sampleBand.title), t(S.sampleText, view.sampleBand.text)),
    t(S.title, view.title),
    t(S.subtitle, view.subtitle),
    v(S.metaRow, ...view.meta.map((item) => h(P.View, { key: item.key, style: S.metaCell }, t(S.kicker, item.label), t(S.metaValue, item.value)))),
    view.prepared.length > 0 && v(S.prepared, ...view.prepared.map((item) =>
      h(P.View, { key: item.key, style: S.preparedCell }, t(S.kicker, item.label), t(S.metaValue, item.value)))),
    t(S.kicker, 'Position'),
    v(S.positionRow, t(S.roleText, view.role), view.firmLine && t(S.firmText, view.firmLine)),
    view.limitedNote && t(S.limited, view.limitedNote),
    view.fallbackNote && t(S.note, view.fallbackNote),

    t(S.h2, 'Market pay overview'),
    v(S.tiles, ...tiles),

    t(S.h2, 'Client pay position'),
    v(S.positionWrap,
      v(S.barCol,
        barBox,
        v(S.legend, ...(bar ? bar.zones : []).map((zone) => h(P.View, { key: zone.key, style: S.legendItem },
          h(P.View, { style: [S.swatch, { backgroundColor: ZONE_COLORS[zone.key] }] }), t(S.legendText, zone.label))))),
      v([S.gapBox, { borderColor: gapTone.borderColor, backgroundColor: gapTone.backgroundColor }],
        t(S.kicker, 'Market gap'),
        t([S.gapAmount, { color: gapTone.color }], view.gap.amount),
        t([S.gapShort, { color: gapTone.color }], view.gap.short),
        t(S.gapSentence, view.gap.sentence))),

    t(S.h2, 'Executive summary'),
    t(S.body, view.executiveSummary),

    t(S.h2, 'Pay competitiveness'),
    v(S.scale, ...view.levels.map((level, i) => {
      const warn = level.key === 'severe' || level.key === 'below'
      const active = level.active
        ? (warn ? { backgroundColor: C.amberBg, borderColor: C.amber, borderWidth: 1.5 } : { backgroundColor: C.tint, borderColor: C.primary, borderWidth: 1.5 })
        : null
      return h(P.View, { key: level.key, style: [S.step, i === view.levels.length - 1 ? { marginRight: 0 } : null, active].filter(Boolean) },
        t([S.stepFlag, { color: level.active ? (warn ? C.amber : C.primary) : C.surface2 }], level.active ? 'CLIENT RATE' : ' '),
        t([S.stepLabel, level.active && warn ? { color: C.amber } : null].filter(Boolean), level.label),
        t(S.stepRule, level.rule))
    })),
    view.levelLine && t(S.levelLine, view.levelLine),

    t(S.h2, 'Recommended pay range'),
    v(S.tiles, ...view.ranges.map((range, i) => h(P.View, { key: range.key, style: [S.rangeTile, i === view.ranges.length - 1 ? S.tileLast : null].filter(Boolean) },
      t(S.rangeLabel, range.label), t(S.rangeValue, range.value), t(S.rangeRule, range.rule)))),
    t(S.small, view.rangeNote),

    h(P.View, { style: S.footer, fixed: true }, t(S.footerText, view.runningHead), t(S.footerText, `Page 1 of ${view.pages}`))
  )
}

function pageTwo(kit, view, P, wrap) {
  const { t, v, logo } = kit
  const market = view.market
  const trend = view.trend
  return h(P.Page, { size: PAGE_SIZE, style: S.page, wrap },
    v(S.headerRow,
      v(S.brandRow, logo(16), t({ fontFamily: BOLD, fontSize: 10, lineHeight: 1.2, color: C.navy, marginLeft: 5 }, view.brand)),
      t(S.site, view.runningHead)),
    v(S.thinRule),

    t([S.h2, { marginTop: 0 }], 'Market activity'),
    market.scopeLine && t({ fontSize: 8.5, lineHeight: 1.3, color: C.ink2, marginBottom: 4 }, market.scopeLine),
    market.cards.length > 0
      ? v(S.cards, ...market.cards.map((card, i) => h(P.View, { key: card.key, style: [S.card, i === market.cards.length - 1 ? S.tileLast : null].filter(Boolean) },
        t([S.cardValue, card.tone ? { color: C[card.tone] } : null].filter(Boolean), card.value),
        t(S.cardLabel, card.label),
        t(S.cardNote, card.note))))
      : t(S.body, market.empty),
    t(S.small, market.caution),

    t(S.h2, 'Pay trend'),
    t({ fontSize: 8.5, lineHeight: 1.3, color: C.ink2, marginBottom: 2 }, trend.empty || trend.note),
    trend.series.length > 0 && v(S.trendCols, ...trend.series.map((series, i) => h(P.View, { key: series.key, style: [S.trendCol, i === trend.series.length - 1 ? { marginRight: 0 } : null].filter(Boolean) },
      t(S.seriesLabel, series.label),
      ...series.points.map((point) => h(P.View, { key: point.key, style: S.trendRow },
        t(S.trendPeriod, point.label),
        h(P.View, { style: S.trendTrack },
          point.cents === null ? null : h(P.View, { style: { width: `${point.widthPct}%`, height: 8, backgroundColor: series.key.startsWith('state') ? C.primary : C.navy2, borderRadius: 1.5 } })),
        t([S.trendValue, point.cents === null ? { color: C.muted } : null].filter(Boolean), point.value)))))),

    t(S.h2, 'How to read this report'),
    ...view.definitions.map((item) => h(P.View, { key: item.term, style: S.def }, t(S.defTerm, item.term), t(S.defText, item.text))),
    v(S.trendCols,
      v([S.trendCol, { flex: 1.15 }],
        t(S.sub, 'Pay competitiveness'),
        ...view.rules.map((item) => h(P.View, { key: item.key, style: S.ruleItem }, t(S.ruleLabel, item.label), t(S.ruleText, item.rule)))),
      v([S.trendCol, { marginRight: 0 }],
        t(S.sub, 'Recommended pay ranges'),
        ...view.rangeRules.map((item) => h(P.View, { key: item.key, style: S.ruleItem }, t([S.ruleLabel, { width: 132 }], item.label), t(S.ruleText, item.rule))),
        t({ fontSize: 8, lineHeight: 1.35, color: C.ink2, marginTop: 4 }, view.readClosing))),

    t(S.h2, 'Methodology & disclaimer'),
    t({ fontSize: 8, lineHeight: 1.4, color: C.ink2 }, view.disclaimer),
    t({ fontSize: 8, lineHeight: 1.4, color: C.ink2, marginTop: 3 }, view.methodNote),

    h(P.View, { style: S.footer, fixed: true },
      v(S.brandRow, logo(11), t([S.footerText, { marginLeft: 4 }], `${view.brand} · ${view.site}`)),
      t(S.footerText, `Page 2 of ${view.pages}`))
  )
}

// ClientReportPdf({ model, primitives, wrap }) -> <Document> with exactly two
// LETTER pages. Pages do not wrap, so long content can never add a third page
// (the test renders the worst case with wrap on to prove nothing overflows).
export function ClientReportPdf({ model, primitives = DEFAULT_PRIMITIVES, wrap = false }) {
  const P = primitives
  const view = reportView(model)
  const kit = makeKit(P)
  return h(P.Document, {
    title: pdfText(`${view.title}: ${model.roleLabel}, ${model.scope.label}`),
    author: view.brand,
    subject: view.title,
    creator: view.brand,
    producer: view.brand,
    language: 'en-US'
  }, pageOne(kit, view, P, wrap), pageTwo(kit, view, P, wrap))
}

let fontsReady = false

async function loadRenderer() {
  const lib = await import('@react-pdf/renderer')
  const mod = lib.default && !lib.Document ? lib.default : lib
  if (!fontsReady) {
    // Never hyphenate real words; only split an unbroken run long enough to
    // overflow its box (e.g. an 80-character "Prepared for" with no spaces).
    mod.Font.registerHyphenationCallback((word) => (word.length > 24 ? word.match(/.{1,12}/gsu) : [word]))
    fontsReady = true
  }
  return mod
}

function primitivesOf(mod) {
  return { Document: mod.Document, Page: mod.Page, View: mod.View, Text: mod.Text, Svg: mod.Svg, Rect: mod.Rect }
}

// Browser: a PDF Blob ready to download.
export async function renderClientReportPdfBlob(model) {
  const mod = await loadRenderer()
  return mod.pdf(h(ClientReportPdf, { model, primitives: primitivesOf(mod) })).toBlob()
}

// Node: a PDF Buffer (used for the emailed attachment).
export async function renderClientReportPdfBuffer(model, { wrap = false } = {}) {
  const mod = await loadRenderer()
  return mod.renderToBuffer(h(ClientReportPdf, { model, primitives: primitivesOf(mod), wrap }))
}
