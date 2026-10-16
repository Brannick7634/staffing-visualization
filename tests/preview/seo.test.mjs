import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PRIVATE_PATHS, isPrivatePath, canonicalFor } from '../../src/preview/lib/seo.js'

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')

test('private routes are noindexed by header, same list as the app', () => {
  const vercel = JSON.parse(read('vercel.json'))
  const rule = vercel.headers.find((h) => h.headers.some((x) => x.key === 'X-Robots-Tag'))
  for (const p of PRIVATE_PATHS) assert.ok(new RegExp(`^${rule.source}$`).test(p), p)
  assert.ok(!new RegExp(`^${rule.source}$`).test('/methodology'))
  assert.ok(!new RegExp(`^${rule.source}$`).test('/sample-report'))
})

test('canonical is path-only on the confirmed domain', () => {
  assert.equal(canonicalFor('/methodology/'), 'https://www.thestaffingsignal.com/methodology')
  assert.equal(canonicalFor('/'), 'https://www.thestaffingsignal.com/')
  assert.ok(isPrivatePath('/reset-password'))
  assert.ok(!isPrivatePath('/sample-report'))
})

test('index.html ships metadata and a loading shell before JavaScript', () => {
  const html = read('index.html')
  for (const re of [/<meta name="description"/, /rel="canonical" href="https:\/\/www\.thestaffingsignal\.com\/"/, /og:image" content="https:\/\/www\.thestaffingsignal\.com\/og-image\.png"/, /twitter:card/, /role="status"/]) assert.match(html, re)
  assert.equal((html.match(/<title>/g) || []).length, 1)
  assert.ok(!/<div id="root"><\/div>/.test(html))
})
