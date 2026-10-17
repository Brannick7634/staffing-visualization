import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { _defaultSinkForTests as defaultSink } from '../../src/preview/lib/track.js'

// All networking is mocked; nothing leaves the process.
const ENV = { VITE_ANALYTICS_ENDPOINT: '/api/track' }
const PAYLOAD = { event: 'page_view', props: {}, path: '/' }
let saved

function install({ beacon, fetchImpl }) {
  const calls = { beacon: 0, fetch: 0 }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: beacon === undefined ? {} : { sendBeacon: (...a) => { calls.beacon++; return beacon(...a) } } })
  globalThis.fetch = fetchImpl === undefined ? undefined : (...a) => { calls.fetch++; return fetchImpl(...a) }
  return calls
}

describe('analytics transport fallback', () => {
  beforeEach(() => { saved = { nav: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), fetch: globalThis.fetch, win: globalThis.window }; globalThis.window = {} })
  afterEach(() => {
    if (saved.nav) Object.defineProperty(globalThis, 'navigator', saved.nav); else delete globalThis.navigator
    globalThis.fetch = saved.fetch; if (saved.win === undefined) delete globalThis.window; else globalThis.window = saved.win
  })

  test('beacon queued (true): no fetch', () => {
    const c = install({ beacon: () => true, fetchImpl: () => Promise.resolve() })
    defaultSink(ENV)(PAYLOAD)
    assert.deepEqual(c, { beacon: 1, fetch: 0 })
  })
  test('beacon refused (false): one keepalive fetch', () => {
    let opts
    const c = install({ beacon: () => false, fetchImpl: (_u, o) => { opts = o; return Promise.resolve() } })
    defaultSink(ENV)(PAYLOAD)
    assert.deepEqual(c, { beacon: 1, fetch: 1 })
    assert.equal(opts.keepalive, true); assert.equal(opts.credentials, 'omit')
  })
  test('beacon throws: falls back, never throws', () => {
    const c = install({ beacon: () => { throw new Error('x') }, fetchImpl: () => Promise.resolve() })
    assert.doesNotThrow(() => defaultSink(ENV)(PAYLOAD))
    assert.deepEqual(c, { beacon: 1, fetch: 1 })
  })
  test('no sendBeacon: uses fetch', () => {
    const c = install({ fetchImpl: () => Promise.resolve() })
    defaultSink(ENV)(PAYLOAD)
    assert.equal(c.fetch, 1)
  })
  test('fallback rejects or throws: swallowed, exactly one attempt (no retry loop)', async () => {
    const c = install({ beacon: () => false, fetchImpl: () => Promise.reject(new Error('offline')) })
    defaultSink(ENV)(PAYLOAD)
    await new Promise((r) => setTimeout(r, 5))
    assert.deepEqual(c, { beacon: 1, fetch: 1 })
    const c2 = install({ beacon: () => false, fetchImpl: () => { throw new Error('sync') } })
    assert.doesNotThrow(() => defaultSink(ENV)(PAYLOAD))
    assert.equal(c2.fetch, 1)
  })
})
