import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { track, EVENTS, sanitizeProps, safePath, buildPayload, _setSinkForTests } from '../../src/preview/lib/track.js'

describe('analytics adapter', () => {
  let got
  beforeEach(() => { got = []; _setSinkForTests((p) => got.push(p)) })

  test('disabled by default: no sink, no throw, nothing sent', () => {
    _setSinkForTests(null)
    assert.doesNotThrow(() => track(EVENTS.PAY_CHECK_STARTED, { roleKey: 'cna' }))
  })

  test('drops non-allowlisted keys (rates, names, emails, notes, tokens)', () => {
    track(EVENTS.PAY_CHECK_STARTED, { roleKey: 'cna', rate: '18.50', rateCents: 1850, name: 'Andy', email: 'a@b.com', note: 'hi', token: 'abc', recipients: ['x@y.z'] })
    assert.deepEqual(got[0].props, { roleKey: 'cna' })
  })

  test('drops unsafe values even under allowed keys', () => {
    assert.deepEqual(sanitizeProps({ roleKey: 'a@b.com', variant: 'free text here', reason: '18.50', sectorKey: 'x'.repeat(65), access: 'ok' }), { access: 'ok' })
  })

  test('path never carries query or hash (reset/confirm tokens)', () => {
    assert.equal(safePath('/reset-password?token=secret#x'), '/reset-password')
    assert.equal(buildPayload(EVENTS.REPORT_VIEWED, {}, '/client-report?rate=18').path, '/client-report')
  })

  test('success events are deduped per key; attempts are not', () => {
    track(EVENTS.SIGNUP_COMPLETED, { variant: 'a' })
    track(EVENTS.SIGNUP_COMPLETED, { variant: 'a' })
    track(EVENTS.REPORT_VIEWED, {}, { dedupeKey: 'cna|city' })
    track(EVENTS.REPORT_VIEWED, {}, { dedupeKey: 'cna|city' })
    track(EVENTS.REPORT_VIEWED, {}, { dedupeKey: 'cna|state' })
    track(EVENTS.REPORT_PRINT_REQUESTED, {})
    track(EVENTS.REPORT_PRINT_REQUESTED, {})
    assert.deepEqual(got.map((p) => p.event), ['signup_completed', 'report_viewed', 'report_viewed', 'report_print_requested', 'report_print_requested'])
  })

  test('unknown events ignored; a failing sink never throws', () => {
    track('anything', {})
    assert.equal(got.length, 0)
    _setSinkForTests(() => { throw new Error('down') })
    assert.doesNotThrow(() => track(EVENTS.PAY_CHECK_STARTED, {}))
  })

  test('attempt / failure / success are separate events', () => {
    for (const k of ['SIGNUP_STARTED', 'SIGNUP_FAILED', 'SIGNUP_COMPLETED', 'REPORT_EMAIL_SUBMITTED', 'REPORT_EMAIL_ACCEPTED', 'REPORT_EMAIL_FAILED', 'REPORT_DOWNLOAD_STARTED', 'REPORT_DOWNLOAD_FAILED']) assert.ok(EVENTS[k], k)
    assert.ok(!Object.values(EVENTS).some((v) => /delivered/.test(v)))
  })
})
