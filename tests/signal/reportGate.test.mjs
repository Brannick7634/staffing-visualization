import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  REPORT_RETURN_TARGET, freezeSelection, reportReturn, isReportReturn, gateChips
} from '../../src/preview/lib/reportGate.js'
import { EVENTS, ALLOWED_PROPS } from '../../src/preview/lib/track.js'

const HOUSTON = { sectorKey: null, roleKey: 'forklift-operator', state: 'TX', city: 'TX:houston' }

describe('report return (job and place only)', () => {
  test('freezeSelection normalizes and fills the sector from the role', () => {
    const frozen = freezeSelection({ ...HOUSTON, extra: 'x' })
    assert.equal(frozen.roleKey, 'forklift-operator')
    assert.equal(frozen.state, 'TX')
    assert.equal(frozen.city, 'TX:houston')
    assert.ok(typeof frozen.sectorKey === 'string' && frozen.sectorKey.length > 0)
    assert.deepEqual(Object.keys(frozen).sort(), ['city', 'roleKey', 'sectorKey', 'state'])
  })

  test('a city without a state is dropped; no role means no selection', () => {
    assert.equal(freezeSelection({ roleKey: 'forklift-operator', state: null, city: 'TX:houston' }).city, null)
    assert.equal(freezeSelection({ state: 'TX' }), null)
    assert.equal(freezeSelection(null), null)
  })

  test('reportReturn carries { target, selection } plus top-level fields for older readers', () => {
    const ret = reportReturn(HOUSTON)
    assert.equal(ret.target, REPORT_RETURN_TARGET)
    assert.equal(ret.target, 'client-report')
    assert.equal(ret.selection.roleKey, 'forklift-operator')
    assert.equal(ret.roleKey, 'forklift-operator')
    assert.equal(ret.city, 'TX:houston')
    assert.ok(isReportReturn(ret))
    assert.ok(Object.isFrozen(ret))
  })

  test('reportReturn never holds a rate, even if one is passed in', () => {
    const ret = reportReturn({ ...HOUSTON, rateCents: 1700, rateInput: '17.00' })
    const text = JSON.stringify(ret)
    assert.ok(!/rate|1700|17\.00/i.test(text), text)
  })

  test('an empty report return is still a report return with no selection', () => {
    const ret = reportReturn(null)
    assert.ok(isReportReturn(ret))
    assert.equal(ret.selection, null)
  })

  test('plain selections and nulls are not report returns', () => {
    assert.equal(isReportReturn(HOUSTON), false)
    assert.equal(isReportReturn(null), false)
    assert.equal(isReportReturn(undefined), false)
  })
})

describe('gate chips', () => {
  test('job, place and client pay rate', () => {
    const chips = gateChips({ selection: HOUSTON, rateInput: '17' })
    assert.deepEqual(chips.map((c) => c.key), ['job', 'place', 'rate'])
    assert.equal(chips[1].text, 'Houston, TX')
    assert.equal(chips[2].text, 'Client pay $17.00/hr')
    assert.ok(chips[0].text.length > 0)
  })

  test('nationwide place and an unparsable rate', () => {
    const chips = gateChips({ selection: { roleKey: 'forklift-operator' }, rateInput: 'abc' })
    assert.deepEqual(chips.map((c) => c.text).slice(1), ['Nationwide'])
  })

  test('nothing to show without a job, even with a rate', () => {
    assert.deepEqual(gateChips(), [])
    assert.deepEqual(gateChips({ selection: null, rateInput: '17.00' }), [])
    assert.deepEqual(gateChips({ selection: { roleKey: 'no-such-role' }, rateInput: '17.00' }), [])
  })
})

describe('analytics events', () => {
  test('report events exist with the agreed names', () => {
    assert.equal(EVENTS.REPORT_CREATE_CLICKED, 'report_create_clicked')
    assert.equal(EVENTS.REPORT_GATE_SHOWN, 'report_gate_shown')
    assert.equal(EVENTS.SAMPLE_REPORT_VIEWED, 'sample_report_viewed')
    assert.equal(EVENTS.REPORT_VIEWED, 'report_viewed')
    assert.equal(EVENTS.REPORT_PRINTED, 'report_printed')
    assert.equal(EVENTS.REPORT_DOWNLOADED, 'report_downloaded')
    assert.equal(EVENTS.REPORT_EMAILED, 'report_emailed')
    assert.equal(new Set(Object.values(EVENTS)).size, Object.values(EVENTS).length)
  })

  test('no allowed property can carry a rate, address, note or name', () => {
    for (const key of ALLOWED_PROPS) {
      assert.ok(!/rate|cents|pay|email|recipient|note|name|prepared/i.test(key), key)
    }
  })
})

describe('wiring', () => {
  const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')

  test('both route blocks serve the sample and client report pages', () => {
    const app = read('src/preview/PreviewApp.jsx')
    assert.equal(app.match(/path="sample-report"/g)?.length, 2)
    assert.equal(app.match(/path="client-report"/g)?.length, 2)
    assert.match(app, /<ReportAuthModal \/>/)
  })

  test('the gate styles never use the global legacy .modal-* classes', () => {
    const css = read('src/preview/styles/modal.css').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.ok(!/(^|[\s,}])\.modal-/m.test(css))
    const jsx = read('src/preview/components/ReportAuthModal.jsx')
    assert.ok(!/className="[^"]*\bmodal-/.test(jsx))
    assert.match(jsx, /aria-modal="true"/)
  })
})
