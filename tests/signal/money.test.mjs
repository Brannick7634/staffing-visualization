import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_INPUT_CENTS, parseHourlyRate, toCents, formatCents, formatDiffCents } from '../../shared/signal/money.js'

function cents(input) {
  const result = parseHourlyRate(input)
  assert.equal(result.ok, true, `expected ${JSON.stringify(input)} to parse, got ${JSON.stringify(result)}`)
  return result.cents
}

function code(input) {
  const result = parseHourlyRate(input)
  assert.equal(result.ok, false, `expected ${JSON.stringify(input)} to be rejected, got ${JSON.stringify(result)}`)
  assert.equal(typeof result.message, 'string')
  assert.ok(result.message.length > 0)
  return result.code
}

describe('parseHourlyRate: accepted inputs', () => {
  test('whole dollars, one and two decimals', () => {
    assert.equal(cents('17'), 1700)
    assert.equal(cents('17.5'), 1750)
    assert.equal(cents('17.50'), 1750)
    assert.equal(cents('17.05'), 1705)
    assert.equal(cents('0.01'), 1)
  })

  test('dollar sign and surrounding whitespace', () => {
    assert.equal(cents('$17.00'), 1700)
    assert.equal(cents(' 17 '), 1700)
    assert.equal(cents('\t$17.13\n'), 1713)
  })

  test('trailing or leading decimal point', () => {
    assert.equal(cents('17.'), 1700)
    assert.equal(cents('.50'), 50)
  })

  test('leading zeros', () => {
    assert.equal(cents('017.13'), 1713)
    assert.equal(cents('0.5'), 50)
  })

  test('float-unsafe values parse to exact integer cents', () => {
    // 0.29 * 100 === 28.999999999999996 and 1.15 * 100 === 114.99999999999999
    // in floating point; string parsing must not inherit that error.
    assert.notEqual(0.29 * 100, 29)
    assert.equal(cents('17.13'), 1713)
    assert.equal(cents('0.29'), 29)
    assert.equal(cents('57.38'), 5738)
    assert.equal(cents('1.15'), 115)
    assert.equal(cents('4.35'), 435)
  })

  test('result is always an integer', () => {
    for (const input of ['17', '17.1', '17.13', '999.99', '.01', '1.']) {
      assert.ok(Number.isInteger(cents(input)), input)
    }
  })

  test('upper input limit is inclusive', () => {
    assert.equal(MAX_INPUT_CENTS, 99999)
    assert.equal(cents('999.99'), 99999)
    assert.equal(cents('$999.99'), 99999)
  })

  test('finite numbers are accepted via their string form', () => {
    assert.equal(cents(17), 1700)
    assert.equal(cents(17.5), 1750)
    assert.equal(cents(17.13), 1713)
  })
})

describe('parseHourlyRate: rejected inputs', () => {
  test('missing', () => {
    assert.equal(code(''), 'missing')
    assert.equal(code('   '), 'missing')
    assert.equal(code(null), 'missing')
    assert.equal(code(undefined), 'missing')
    assert.equal(code('$'), 'missing')
  })

  test('not a number', () => {
    assert.equal(code('abc'), 'not_a_number')
    assert.equal(code('Infinity'), 'not_a_number')
    assert.equal(code('-Infinity'), 'not_a_number')
    assert.equal(code('NaN'), 'not_a_number')
    assert.equal(code('-'), 'not_a_number')
    assert.equal(code(Number.NaN), 'not_a_number')
    assert.equal(code(Number.POSITIVE_INFINITY), 'not_a_number')
    assert.equal(code({}), 'not_a_number')
    assert.equal(code([]), 'not_a_number')
    assert.equal(code(true), 'not_a_number')
  })

  test('non-ASCII numerals are rejected', () => {
    assert.equal(code('١٧'), 'not_a_number') // Arabic-Indic 17
    assert.equal(code('１７'), 'not_a_number') // full-width 17
  })

  test('negative', () => {
    assert.equal(code('-5'), 'negative')
    assert.equal(code('-17.50'), 'negative')
    assert.equal(code('-$5'), 'negative')
    assert.equal(code('$-5'), 'negative')
    assert.equal(code('−5'), 'negative') // unicode minus sign
    assert.equal(code(-5), 'negative')
  })

  test('zero', () => {
    assert.equal(code('0'), 'zero')
    assert.equal(code('0.00'), 'zero')
    assert.equal(code('$0'), 'zero')
    assert.equal(code('.0'), 'zero')
    assert.equal(code('000'), 'zero')
    assert.equal(code('-0'), 'zero')
    assert.equal(code(0), 'zero')
  })

  test('too many decimals', () => {
    assert.equal(code('17.555'), 'too_many_decimals')
    assert.equal(code('17.500'), 'too_many_decimals')
    assert.equal(code('.001'), 'too_many_decimals')
  })

  test('too large', () => {
    assert.equal(code('1000'), 'too_large')
    assert.equal(code('1000.00'), 'too_large')
    assert.equal(code('99999999999999999999999'), 'too_large')
    assert.equal(code('0001000'), 'too_large')
  })

  test('too-large message says it is an input check, not a market maximum', () => {
    const { message } = parseHourlyRate('5000')
    assert.match(message, /input check/)
    assert.match(message, /not a market maximum/)
  })

  test('malformed', () => {
    for (const input of ['1e3', '1E3', '1,000', '17..5', '17.5.0', '1 7', '+17', '17$', '$$17', '17abc', '0x11', '--5', '17 50', '17,50', '1_000']) {
      assert.equal(code(input), 'malformed', input)
    }
  })

  test('every rejection carries a plain-language message', () => {
    const inputs = ['', 'abc', '-5', '0', '17.555', '1000', '1e3']
    const codes = new Set(inputs.map((input) => parseHourlyRate(input).code))
    assert.deepEqual([...codes].sort(), ['malformed', 'missing', 'negative', 'not_a_number', 'too_large', 'too_many_decimals', 'zero'])
  })

  test('messages speak about the client pay rate, not the visitor\'s own pay', () => {
    assert.equal(parseHourlyRate('').message, "Enter your client's hourly pay rate.")
    assert.equal(parseHourlyRate('abc').message, 'Enter the client pay rate as a number, like 17.50.')
    assert.equal(parseHourlyRate('-5').message, 'Client pay rate cannot be negative.')
    assert.equal(parseHourlyRate('0').message, 'Client pay rate must be more than $0.00.')
    assert.match(parseHourlyRate('5000').message, /^Enter a client pay rate of \$999\.99 or less\./)
    for (const input of ['', 'abc', '-5', '0', '17.555', '1000', '1e3']) {
      assert.doesNotMatch(parseHourlyRate(input).message, /your hourly pay|^Hourly pay/i, input)
    }
  })
})

describe('toCents', () => {
  test('rounds fixture numbers to integer cents', () => {
    assert.equal(toCents(17.13), 1713)
    assert.equal(toCents(57.38), 5738)
    assert.equal(toCents(18.5), 1850)
    assert.equal(toCents(20), 2000)
    assert.equal(toCents(62.5), 6250)
    assert.equal(toCents(0), 0)
  })

  test('never returns negative zero', () => {
    assert.ok(Object.is(toCents(-0.001), 0))
  })

  test('throws on non-finite or non-number input', () => {
    for (const input of [Number.NaN, Infinity, -Infinity, '17.13', null, undefined, {}]) {
      assert.throws(() => toCents(input), TypeError, String(input))
    }
  })
})

describe('formatCents', () => {
  test('always two decimals', () => {
    assert.equal(formatCents(1713), '$17.13')
    assert.equal(formatCents(1700), '$17.00')
    assert.equal(formatCents(1750), '$17.50')
    assert.equal(formatCents(5), '$0.05')
    assert.equal(formatCents(0), '$0.00')
  })

  test('thousands separators', () => {
    assert.equal(formatCents(99999), '$999.99')
    assert.equal(formatCents(100000), '$1,000.00')
    assert.equal(formatCents(123456789), '$1,234,567.89')
  })

  test('negative values', () => {
    assert.equal(formatCents(-13), '-$0.13')
  })

  test('throws on non-integer cents', () => {
    for (const input of [17.13, Number.NaN, Infinity, null, undefined, '1713']) {
      assert.throws(() => formatCents(input), TypeError, String(input))
    }
  })

  test('round-trips with parseHourlyRate', () => {
    for (const input of ['17.13', '0.01', '999.99', '57.38', '18.50']) {
      assert.equal(formatCents(cents(input)), `$${input}`)
    }
  })
})

describe('formatDiffCents', () => {
  test('absolute difference', () => {
    assert.equal(formatDiffCents(13), '$0.13')
    assert.equal(formatDiffCents(-13), '$0.13')
    assert.equal(formatDiffCents(1713 - 1700), '$0.13')
    assert.equal(formatDiffCents(0), '$0.00')
    assert.equal(formatDiffCents(-123456), '$1,234.56')
  })

  test('throws on non-integer cents', () => {
    assert.throws(() => formatDiffCents(0.13), TypeError)
  })
})
