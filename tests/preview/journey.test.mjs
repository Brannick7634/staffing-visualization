import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contactUrl } from '../../src/preview/lib/contact.js'

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')

describe('comparison-to-report journey (brief §4)', () => {
  const calc = read('src/preview/components/Calculator.jsx')
  test('primary action compares without an account', () => {
    assert.match(calc, /Compare Client Pay/)
    assert.ok(!/createClientReport\(/.test(calc), 'calculator must not open the report gate')
    assert.match(calc, /label="Client Pay Rate"/)
    assert.match(calc, /Hourly wage offered to the worker, not the rate you bill your client\./)
  })
  test('sector/job changes keep the market', () => {
    const body = calc.slice(calc.indexOf('function onSector'), calc.indexOf('function onRole'))
    assert.ok(!/state: null|city: null/.test(body))
    const ex = calc.slice(calc.indexOf('function pickExample'), calc.indexOf('function onSubmit'))
    assert.ok(!/state: null|city: null/.test(ex))
  })
  test('no report from a stale comparison', () => {
    assert.match(read('src/preview/pages/HomePage.jsx'), /isOutOfDate \|\| typeof createClientReport/)
    assert.match(read('src/preview/components/insights/ReportCta.jsx'), /if \(outdated\)/)
  })
  test('gate shows the signup form at once', () => {
    const modal = read('src/preview/components/ReportAuthModal.jsx')
    assert.ok(!/signupOpen|aria-expanded/.test(modal))
    assert.match(modal, /<SignupForm/)
  })
  test('signup is guarded against a fast second click', () => {
    assert.match(read('src/preview/components/SignupForm.jsx'), /submittingRef\.current\) return/)
  })
  test('rate never reaches storage or URLs from the calculator', () => {
    assert.ok(!/localStorage|sessionStorage|searchParams|URLSearchParams/.test(calc))
  })
})

describe('coverage before signup (brief §5)', () => {
  const card = read('src/preview/components/ResultCard.jsx')
  test('explicit population label and unavailable-city wording', () => {
    assert.match(card, /City benchmark/)
    assert.match(card, /State benchmark/)
    assert.match(card, /Nationwide benchmark/)
    assert.match(card, /Not enough verified observations for/)
    assert.match(card, /View the available/)
  })
  test('fallback offered only when it passes publication checks', () => {
    assert.match(card, /fb && fb\.coverage === COVERAGE\.PUBLISHABLE/)
  })
})

describe('homepage and About (brief §6)', () => {
  test('brief copy present', () => {
    const hero = read('src/preview/components/Hero.jsx')
    assert.match(hero, /Know whether your client’s pay is competitive\./)
    assert.match(hero, /View Sample Report/)
    assert.match(hero, /Advertised pay, not actual wages paid\./)
    assert.match(read('src/preview/components/AboutSection.jsx'), /Built by Andy Kohler/)
  })
  test('contact button only with a configured, valid destination', () => {
    const about = read('src/preview/components/AboutSection.jsx')
    assert.match(about, /\{href && \(/)
    assert.ok(!/@[a-z0-9-]+\.(com|us|net)/i.test(about.replace(/mailto:\[\^/g, '')), 'no hard-coded address')
    {
      assert.equal(contactUrl(undefined), null)
      assert.equal(contactUrl('javascript:alert(1)'), null)
      assert.equal(contactUrl('http://x.com'), null)
      assert.equal(contactUrl('https://example.com/book'), 'https://example.com/book')
    }
  })
})
