import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSmartLink, parseCityParam, parseSmartLink, resolveSmartLink } from '../../shared/signal/smartLink.js'
import { sanitizeProps } from '../../src/preview/lib/track.js'
import { validateEvent } from '../../api/_lib/analytics.js'

const AVAIL = {
  'warehouse-associate': { states: ['NC', 'TX'], cities: ['NC:raleigh', 'TX:houston'] },
  'software-engineer': { states: [], cities: [] }
}
const UTM = '&utm_source=valley&utm_medium=linkedin&utm_campaign=pay-targets'

describe('smart link parsing', () => {
  test('city + role + tags', () => {
    const link = parseSmartLink(`?city=raleigh-nc&role=warehouse-associate${UTM}&ref=recAbc123`)
    assert.deepEqual(link.place, { state: 'NC', city: 'NC:raleigh' })
    assert.equal(link.roleKey, 'warehouse-associate')
    assert.deepEqual(link.utm, { utmSource: 'valley', utmMedium: 'linkedin', utmCampaign: 'pay-targets', ref: 'recAbc123' })
  })

  test('city param forms', () => {
    assert.deepEqual(parseCityParam('New York-NY'), { state: 'NY', city: 'NY:new-york' })
    assert.deepEqual(parseCityParam('tx'), { state: 'TX', city: null })
    assert.deepEqual(parseCityParam('winston-salem-nc'), { state: 'NC', city: 'NC:winston-salem' })
    assert.equal(parseCityParam('atlantis-zz'), null)
    assert.equal(parseCityParam('<script>'), null)
    assert.equal(parseCityParam(''), null)
  })

  test('no params, or nothing usable -> not a smart link', () => {
    assert.equal(parseSmartLink(''), null)
    assert.equal(parseSmartLink('?foo=bar'), null)
    assert.equal(parseSmartLink('?role=not-a-job&city=nowhere'), null)
  })

  test('free text never survives as a tag or ref', () => {
    const link = parseSmartLink('?role=warehouse-associate&utm_source=Jane%20Doe%20jane@x.com&ref=has%20space')
    assert.equal(link.utm.utmSource, null)
    assert.equal(link.utm.ref, null)
  })
})

describe('smart link resolution', () => {
  const resolve = (q) => resolveSmartLink(parseSmartLink(q), AVAIL)

  test('published city -> city', () => {
    const r = resolve('?city=raleigh-nc&role=warehouse-associate')
    assert.equal(r.level, 'city')
    assert.deepEqual(r.selection, { sectorKey: r.selection.sectorKey, roleKey: 'warehouse-associate', state: 'NC', city: 'NC:raleigh' })
  })

  test('unpublished or unlisted city -> its state when published', () => {
    assert.deepEqual(
      [resolve('?city=charlotte-nc&role=warehouse-associate').market, resolve('?city=apex-nc&role=warehouse-associate').market],
      ['NC', 'NC'])
  })

  test('nothing published locally -> nationwide figure for the job', () => {
    const r = resolve('?city=raleigh-nc&role=software-engineer')
    assert.equal(r.level, 'nationwide')
    assert.equal(r.selection.state, null)
    assert.equal(r.selection.city, null)
  })

  test('bogus city -> nationwide; bogus role -> normal homepage', () => {
    assert.equal(resolve('?city=atlantis-zz&role=warehouse-associate').level, 'nationwide')
    assert.equal(resolve(`?city=raleigh-nc&role=nope${UTM}`), null)
  })

  test('no snapshot availability -> never a local market', () => {
    const r = resolveSmartLink(parseSmartLink('?city=raleigh-nc&role=warehouse-associate'), undefined)
    assert.equal(r.level, 'nationwide')
  })
})

describe('smart link tracking + building', () => {
  test('event props pass client and collector allowlists', () => {
    const props = { utmSource: 'valley', utmMedium: 'linkedin', utmCampaign: 'pay-targets', ref: 'recAbc123', roleKey: 'warehouse-associate', market: 'NC:raleigh', geographyLevel: 'city' }
    assert.deepEqual(sanitizeProps(props), props)
    assert.ok(validateEvent({ event: 'smart_link_opened', props, path: '/' }))
    assert.equal(validateEvent({ event: 'smart_link_opened', props: { market: 'Raleigh' }, path: '/' }), null)
  })

  test('built link round-trips', () => {
    const url = buildSmartLink({ cityName: 'Raleigh', state: 'NC', roleKey: 'warehouse-associate', ref: 'recAbc123' })
    assert.equal(url, `https://www.thestaffingsignal.com/?city=raleigh-nc&role=warehouse-associate${UTM}&ref=recAbc123`)
    assert.equal(resolveSmartLink(parseSmartLink(new URL(url).search), AVAIL).market, 'NC:raleigh')
  })
})
