import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWeeklyCards } from '../../api/_lib/signal/service.js'

const W = {
  windowDays: 45,
  mover: { roleKey: 'software-engineer', state: 'NJ', nowCents: 6900, prevCents: 6400 },
  hotCold: { hot: { roleKey: 'executive-assistant', pct: 80 }, cold: { roleKey: 'warehouse-associate', pct: -70 } },
  spotlight: { state: 'OR', momentumPct: 36, topRoleKey: 'software-engineer', typicalCents: 2800 },
  quiz: { roleKey: 'software-engineer', state: 'CA', typicalCents: 6750, observations: 49, optionsDollars: [52, 60, 68, 76], answerDollars: 68 }
}

describe('weekly cards', () => {
  test('builds all four with names, not codes', () => {
    const cards = buildWeeklyCards({ weeklyCards: W })
    assert.deepEqual(cards.map((c) => c.kind), ['mover', 'hotCold', 'spotlight', 'quiz'])
    assert.equal(cards[0].title, 'Software Engineer pay rose $5.00/hr.')
    assert.match(cards[0].label, /New Jersey/)
    assert.equal(cards[3].answerText, '$67.50/hr')
  })
  test('a stale snapshot shows none', () => {
    assert.deepEqual(buildWeeklyCards({ weeklyCards: W, freshness: 'stale' }), [])
  })
  test('unknown roles, missing answers, and one-sided hot/cold drop out', () => {
    const cards = buildWeeklyCards({ weeklyCards: {
      ...W,
      mover: { ...W.mover, roleKey: 'nope' },
      hotCold: { hot: W.hotCold.hot, cold: { roleKey: 'warehouse-associate', pct: 5 } },
      quiz: { ...W.quiz, answerDollars: 99 }
    } })
    assert.deepEqual(cards.map((c) => c.kind), ['spotlight'])
  })
  test('no weeklyCards means no cards', () => {
    assert.deepEqual(buildWeeklyCards({}), [])
  })
})
