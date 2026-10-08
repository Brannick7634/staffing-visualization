// Display helpers for the homepage "Market Pay Insights". Pure and node-safe
// (tested by tests/signal/insightsFormat.test.mjs). Every amount is integer
// cents; the figures themselves come from buildClientReportModel so the page
// and the report always agree.
import { formatCents } from '../../../../shared/signal/money.js'

export const MINUS = '−'

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0
}

// '−$3.00/hr', '+$1.50/hr', '$0.00/hr'
export function formatSignedPerHour(cents) {
  if (!Number.isSafeInteger(cents)) return null
  const sign = cents < 0 ? MINUS : cents > 0 ? '+' : ''
  return `${sign}${formatCents(Math.abs(cents))}/hr`
}

function pctWords(gap) {
  return gap.pct === 0 ? 'Less than 1%' : `${gap.pct}%`
}

// '15% below market median' / 'Less than 1% above market median' / 'At the market median'
export function gapHeadline(gap) {
  if (!gap) return null
  if (gap.direction === 'at') return 'At the market median'
  return `${pctWords(gap)} ${gap.direction} market median`
}

// 'Your client’s pay rate is about 15% below the current market median.'
export function gapSentence(gap) {
  if (!gap) return null
  if (gap.direction === 'at') return 'Your client’s pay rate is at the current market median.'
  const amount = gap.pct === 0 ? 'less than 1%' : `about ${gap.pct}%`
  return `Your client’s pay rate is ${amount} ${gap.direction} the current market median.`
}

// Short note under the Client Pay Rate tile: '15% below median'.
export function clientTileNote(gap) {
  if (!gap) return null
  if (gap.direction === 'at') return 'At the median'
  return `${gap.pct === 0 ? '<1%' : `${gap.pct}%`} ${gap.direction} median`
}

const LEVEL_EXPLANATIONS = Object.freeze({
  severe: 'The client rate is more than 10% under the market low.',
  below: 'The client rate is under the market low.',
  moderate: 'The client rate is between the market low and the market median.',
  competitive: 'The client rate is between the market median and the market high.',
  high: 'The client rate is above the market high.'
})

export function competitivenessExplanation(key) {
  return LEVEL_EXPLANATIONS[key] || null
}

export function formatCount(value) {
  if (!isCount(value)) return null
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// 'from 204 staffing firms' (null when the count is unknown).
export function firmsPhrase(count) {
  if (!isCount(count) || count === 0) return null
  return `from ${formatCount(count)} staffing ${count === 1 ? 'firm' : 'firms'}`
}

// 'YYYY-MM-DD…' -> 'October 6, 2026' (UTC); null when unusable.
export function formatIsoDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

// '+64%', '−12%', '0%'
export function formatMomentum(pct) {
  if (!Number.isFinite(pct)) return null
  const whole = Math.round(pct)
  if (whole === 0) return '0%'
  return `${whole > 0 ? '+' : MINUS}${Math.abs(whole)}%`
}

// Recommended ranges as display text: competitive 'typ–p75' (one value when
// equal) and aggressive 'p75+'.
export function rangeTexts(ranges) {
  if (!ranges) return null
  const { competitive, aggressive } = ranges
  const competitiveText = competitive.fromCents === competitive.toCents
    ? formatCents(competitive.fromCents)
    : `${formatCents(competitive.fromCents)}–${formatCents(competitive.toCents)}`
  return { competitive: competitiveText, aggressive: `${formatCents(aggressive.fromCents)}+` }
}

// Market activity tiles from payResponse.market (aggregates only: postings,
// firm counts, state momentum). [] when nothing is publishable.
export function marketActivityItems(market) {
  const items = []
  if (!market || typeof market !== 'object') return items
  const city = market.city
  if (city && typeof city === 'object') {
    const windowText = isCount(city.windowDays) ? `last ${city.windowDays} days` : null
    if (isCount(city.newPostings)) {
      items.push({
        key: 'postings',
        label: 'New staffing postings',
        value: formatCount(city.newPostings),
        note: [city.label, windowText].filter(Boolean).join(' · ')
      })
    }
    if (isCount(city.staffingFirms)) {
      items.push({
        key: 'firms',
        label: 'Staffing firms posting',
        value: formatCount(city.staffingFirms),
        note: [city.label, windowText].filter(Boolean).join(' · ')
      })
    }
  }
  const state = market.state
  if (state && typeof state === 'object' && Number.isFinite(state.momentumPct)) {
    const windows = isCount(state.windowDays) && isCount(state.previousWindowDays)
      ? `Last ${state.windowDays} days vs the previous ${state.previousWindowDays}`
      : null
    items.push({
      key: 'momentum',
      label: `${state.label || state.code || 'State'} posting momentum`,
      value: formatMomentum(state.momentumPct),
      note: windows,
      tone: state.momentumPct > 0 ? 'heat' : state.momentumPct < 0 ? 'cool' : null,
      early: state.isEarlySignal === true
    })
  }
  return items
}

// Pay trend rows: one group per series, each point with a zero-based bar
// width (share of the largest figure across every series, so groups compare
// on one scale). Null points stay null ("Not enough data").
export function trendRows(trend) {
  if (!trend || !Array.isArray(trend.series)) return null
  const series = trend.series.filter((s) => s && Array.isArray(s.points) && s.points.length > 0)
  let max = 0
  for (const s of series) {
    for (const p of s.points) {
      if (Number.isSafeInteger(p?.typicalCents) && p.typicalCents > max) max = p.typicalCents
    }
  }
  if (series.length === 0 || max === 0) return null
  return series.map((s) => ({
    key: s.scope === 'state' ? `state-${s.code || s.label}` : s.scope || s.label,
    label: s.label || (s.scope === 'nationwide' ? 'Nationwide' : 'State'),
    points: s.points.map((p) => {
      const cents = Number.isSafeInteger(p?.typicalCents) && p.typicalCents > 0 ? p.typicalCents : null
      return {
        period: p?.period || '',
        label: p?.label || p?.period || '',
        typicalCents: cents,
        valueText: cents === null ? 'Not enough data' : formatCents(cents),
        widthPct: cents === null ? 0 : Math.round((cents / max) * 1000) / 10
      }
    })
  }))
}

// Roving-tabindex keyboard model for a horizontal tablist.
export function nextTabIndex(index, key, count) {
  if (!Number.isSafeInteger(count) || count <= 0) return null
  if (key === 'ArrowRight') return (index + 1) % count
  if (key === 'ArrowLeft') return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}
