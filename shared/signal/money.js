// Money helpers for The Staffing Signal preview.
//
// Browser-safe (no node: imports). All arithmetic is in integer cents. Typed
// rates are parsed from their string form with a regular expression and built
// up digit-by-digit into cents — never by multiplying a float and comparing it,
// so a boundary such as $0.29 can never be misclassified by float rounding.

// Input sanity limit for a typed hourly rate: $999.99/hour. This is input
// validation only (it catches typos such as 1750 for 17.50). It is NOT a
// market maximum and says nothing about what rates exist in the market.
export const MAX_INPUT_CENTS = 99999

const MESSAGES = {
  missing: "Enter your client's hourly pay rate.",
  not_a_number: 'Enter the client pay rate as a number, like 17.50.',
  negative: 'Client pay rate cannot be negative.',
  zero: 'Client pay rate must be more than $0.00.',
  too_many_decimals: 'Use dollars and cents only: at most two digits after the decimal point.',
  too_large: 'Enter a client pay rate of $999.99 or less. This is an input check, not a market maximum.',
  malformed: 'Enter digits with an optional decimal point, like 17.50 (no commas, letters or spaces).'
}

// Optional "$", then ASCII digits with an optional decimal part. Accepts
// '17', '17.5', '17.50', '17.', '.50'. Fraction length is checked separately so
// '17.555' gets a specific message instead of a generic one.
const RATE_PATTERN = /^\$?(?:(\d+)(?:\.(\d*))?|\.(\d+))$/
const HAS_ASCII_DIGIT = /[0-9]/
const LEADING_MINUS = /^\$?[-−]|^[-−]\$?/

function fail(code) {
  return { ok: false, code, message: MESSAGES[code] }
}

// parseHourlyRate(input) -> { ok:true, cents } | { ok:false, code, message }
// codes: 'missing' | 'not_a_number' | 'negative' | 'zero' | 'too_many_decimals'
//        | 'too_large' | 'malformed'
export function parseHourlyRate(input) {
  if (input === null || input === undefined) return fail('missing')

  let text
  if (typeof input === 'string') {
    text = input
  } else if (typeof input === 'number') {
    if (!Number.isFinite(input)) return fail('not_a_number')
    text = String(input)
  } else {
    return fail('not_a_number')
  }

  text = text.trim()
  if (text === '') return fail('missing')
  if (text === '$') return fail('missing')

  if (LEADING_MINUS.test(text)) {
    // '-5', '-$5', '$-5'. A well-formed negative amount is reported as
    // negative ('-0' as zero); anything else keeps the error its digits earn.
    const rest = parseHourlyRate(text.replace(LEADING_MINUS, '').replace(/^\$/, ''))
    if (rest.ok) return fail('negative')
    if (rest.code === 'missing') return fail('not_a_number')
    if (rest.code === 'negative') return fail('malformed')
    return rest
  }

  const match = RATE_PATTERN.exec(text)
  if (!match) {
    // No ASCII digit at all ('abc', 'NaN', 'Infinity', non-ASCII numerals) is
    // not a number; anything else with digits ('1e3', '1,000', '17..5') is
    // a malformed entry.
    return fail(HAS_ASCII_DIGIT.test(text) ? 'malformed' : 'not_a_number')
  }

  const wholeDigits = match[1] !== undefined ? match[1] : ''
  const fractionDigits = match[1] !== undefined ? (match[2] || '') : match[3]

  if (fractionDigits.length > 2) return fail('too_many_decimals')

  // Strip leading zeros so the length check below is meaningful; a whole part
  // longer than the limit's whole part is too large without converting it.
  const whole = wholeDigits.replace(/^0+(?=\d)/, '')
  const maxWholeDigits = String(Math.floor(MAX_INPUT_CENTS / 100)).length
  if (whole.length > maxWholeDigits) return fail('too_large')

  const cents = (whole === '' ? 0 : Number(whole)) * 100 + Number(fractionDigits.padEnd(2, '0'))

  if (cents === 0) return fail('zero')
  if (cents > MAX_INPUT_CENTS) return fail('too_large')
  return { ok: true, cents }
}

// toCents(number) -> integer cents, for numbers that arrive as data (fixture
// numbers such as 0.29). Throws on anything that is not a finite number.
export function toCents(number) {
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    throw new TypeError('toCents expects a finite number')
  }
  const cents = Math.round(number * 100)
  // Math.round(-0.4) is -0; normalise so callers never see a negative zero.
  return cents === 0 ? 0 : cents
}

function assertCents(cents, fn) {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(`${fn} expects an integer number of cents`)
  }
}

// formatCents(1234) -> '$12.34'; always two decimals, thousands separators.
// Negative values format as '-$0.13'.
export function formatCents(cents) {
  assertCents(cents, 'formatCents')
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const rest = String(abs % 100).padStart(2, '0')
  return `${sign}$${dollars}.${rest}`
}

// formatDiffCents(-13) -> '$0.13': the absolute size of a difference. Callers
// supply the direction in words ('below', 'above').
export function formatDiffCents(cents) {
  assertCents(cents, 'formatDiffCents')
  return formatCents(Math.abs(cents))
}
