import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  PRIVACY_RULE, PRIVACY_REASON, evaluatePublication, isPublishable, evaluatePayCell
} from '../../api/_lib/signal/privacy.js'
import { DATA_MODE } from '../../shared/signal/contract.js'

const verified = (distinctFirms, maxFirmShare) => ({ status: 'verified', distinctFirms, maxFirmShare })
const DEV = { mode: DATA_MODE.DEVELOPMENT_EXAMPLE }
const PROD = { mode: DATA_MODE.PRODUCTION }
const SYNTH = { mode: DATA_MODE.SYNTHETIC }

describe('publication rule', () => {
  test('rule constants are 3 firms and a 50% share', () => {
    assert.equal(PRIVACY_RULE.minDistinctFirms, 3)
    assert.equal(PRIVACY_RULE.maxFirmShare, 0.5)
    assert.ok(Object.isFrozen(PRIVACY_RULE))
  })

  test('2 distinct firms is suppressed in every mode', () => {
    for (const opts of [PROD, SYNTH, DEV]) {
      const r = evaluatePublication(verified(2, 0.1), opts)
      assert.equal(r.publishable, false)
      assert.equal(r.reason, PRIVACY_REASON.TOO_FEW_FIRMS)
    }
  })

  test('5 firms with a 0.51 share is suppressed', () => {
    const r = evaluatePublication(verified(5, 0.51), PROD)
    assert.equal(r.publishable, false)
    assert.equal(r.reason, PRIVACY_REASON.FIRM_SHARE_TOO_HIGH)
    assert.equal(isPublishable(verified(5, 0.6), DEV), false)
  })

  test('5 firms with exactly a 0.5 share passes', () => {
    const r = evaluatePublication(verified(5, 0.5), PROD)
    assert.equal(r.publishable, true)
    assert.equal(r.reason, PRIVACY_REASON.PASSED)
  })

  test('many firms with a small share passes', () => {
    assert.equal(isPublishable(verified(140, 0.034), PROD), true)
  })
})

describe('unknown fails closed', () => {
  test('missing checks fail in production mode', () => {
    for (const checks of [undefined, null, {}, 'yes', 1]) {
      assert.equal(isPublishable(checks, PROD), false)
    }
  })

  test('not_verified with no numbers fails in production and synthetic modes', () => {
    const checks = { status: 'not_verified', distinctFirms: null, maxFirmShare: null }
    assert.deepEqual({ ...evaluatePublication(checks, PROD) }, { publishable: false, reason: PRIVACY_REASON.NOT_VERIFIED })
    assert.equal(isPublishable(checks, SYNTH), false)
  })

  test('not_verified with no numbers is allowed only as a development example', () => {
    const checks = { status: 'not_verified', distinctFirms: null, maxFirmShare: null }
    const r = evaluatePublication(checks, DEV)
    assert.equal(r.publishable, true)
    assert.equal(r.reason, PRIVACY_REASON.UNVERIFIED_EXAMPLE)
  })

  test('the default mode is production (strict)', () => {
    assert.equal(isPublishable({ status: 'not_verified', distinctFirms: null, maxFirmShare: null }), false)
    assert.equal(isPublishable({ status: 'not_verified', distinctFirms: null, maxFirmShare: null }, { mode: 'whatever' }), false)
  })

  test('passing numbers without verified status fail in production', () => {
    assert.equal(isPublishable({ distinctFirms: 20, maxFirmShare: 0.1 }, PROD), false)
    assert.equal(isPublishable({ status: 'not_verified', distinctFirms: 20, maxFirmShare: 0.1 }, PROD), false)
  })

  test('half-supplied checks fail in every mode', () => {
    for (const opts of [PROD, DEV]) {
      assert.equal(isPublishable({ status: 'not_verified', distinctFirms: 12, maxFirmShare: null }, opts), false)
      assert.equal(isPublishable({ status: 'not_verified', distinctFirms: null, maxFirmShare: 0.2 }, opts), false)
    }
  })

  test('unknown status with no numbers fails even in development mode', () => {
    assert.equal(isPublishable({ distinctFirms: null, maxFirmShare: null }, DEV), false)
  })
})

describe('malformed values fail closed', () => {
  test('non-finite or wrongly typed values never pass', () => {
    const bad = [
      verified(Number.NaN, 0.1), verified(Infinity, 0.1), verified(5, Number.NaN), verified(5, Infinity),
      verified(5, -Infinity), verified('5', 0.1), verified(5, '0.1'), verified(5.5, 0.1), verified(-5, 0.1),
      verified(5, -0.1), verified(5, 1.2), verified(true, 0.1)
    ]
    for (const checks of bad) {
      for (const opts of [PROD, DEV]) {
        const r = evaluatePublication(checks, opts)
        assert.equal(r.publishable, false, JSON.stringify(checks))
      }
    }
  })
})

describe('pay subsets are judged on their own checks', () => {
  test('a large demand sample does not authorize a small pay subset', () => {
    const cell = {
      checks: verified(2, 0.4),
      demand: { postings: 5000, checks: verified(60, 0.05) }
    }
    const r = evaluatePayCell(cell, PROD)
    assert.equal(r.publishable, false)
    assert.equal(r.reason, PRIVACY_REASON.TOO_FEW_FIRMS)
  })

  test('a pay cell with no pay checks fails even when demand passes', () => {
    assert.equal(evaluatePayCell({ demand: { checks: verified(60, 0.05) } }, PROD).publishable, false)
    assert.equal(evaluatePayCell(null, PROD).publishable, false)
  })

  test('a pay cell with passing pay checks is publishable', () => {
    assert.equal(evaluatePayCell({ checks: verified(12, 0.21) }, PROD).publishable, true)
  })
})
