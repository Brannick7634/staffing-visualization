import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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
