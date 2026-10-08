// Fixture isolation: after `vite build`, nothing under dist/ may contain
// fixture-only identifiers, supplied figures or synthetic States Lab figures.
// Every figure must arrive from the API at runtime.
//
// City and state NAMES may legitimately appear (geography picker list), so
// names are tested in API payloads (access/service tests), not here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatCents } from '../../shared/signal/money.js'
import { SYNTHETIC_FIGURES } from '../../dev/signal/syntheticScenarios.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DIST = join(ROOT, 'dist')
const SRC = join(ROOT, 'src')

// Fixture-only identifiers and copy: must never appear anywhere in dist/.
const FIXTURE_STRINGS = [
  'fixture_version', 'supplied_normalized', 'supplied-october-2026', 'dev-fixtures',
  'publication_checks', 'proposed_role_key', 'national_pay_examples', 'Unknown is not a pass'
]

// Development-only preview (simulated access/sign-up, synthetic scenarios):
// guarded by import.meta.env.DEV, so none of it may reach a production build. Matched case-insensitively.
const DEV_ONLY_STRINGS = ['/api/signal/dev/', 'SYNTHETIC TEST DATA']

// Supplied figures. Map geodata bundled by the existing site (amCharts
// FeatureCollections) contains coordinates such as ",57.38]", so in those
// files the figures are matched outside coordinate context. Every other file
// is matched as a standalone number (no digit directly before or after): the
// lazily loaded PDF library (@react-pdf/renderer) carries numeric tables such
// as 2361852424 and 118528, which are not the supplied figure 1852.
const FIXTURE_FIGURES = ['57.38', '17.13', '3308', '3,308', '1852', '1,852']

const SYNTHETIC_MONEY = Object.values(SYNTHETIC_FIGURES)
  .flatMap((f) => [f.p25Cents, f.typicalCents, f.p75Cents])
  .map((cents) => formatCents(cents))

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function outsideCoordinates(figure) {
  return new RegExp(`(?<![0-9.,\\[-])${escapeRegex(figure)}(?![0-9])`)
}

function standaloneNumber(figure) {
  return new RegExp(`(?<![0-9])${escapeRegex(figure)}(?![0-9])`)
}

function listFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full))
    else out.push(full)
  }
  return out
}

function newestMtime(dir) {
  let newest = 0
  for (const file of listFiles(dir)) newest = Math.max(newest, statSync(file).mtimeMs)
  return newest
}

const TEXT_FILE = /\.(js|mjs|cjs|css|html|json|map|txt|svg|webmanifest)$/i
const distMissing = !existsSync(join(DIST, 'index.html'))

test('dist/ contains no fixture-only strings, supplied figures or synthetic figures', {
  skip: distMissing ? 'dist/ not found - run `npx vite build` first to check fixture isolation' : false
}, (t) => {
  if (existsSync(SRC) && newestMtime(SRC) > statSync(join(DIST, 'index.html')).mtimeMs) {
    t.diagnostic('dist/ is older than src/; rebuild for an up-to-date isolation check')
  }
  const files = listFiles(DIST).filter((file) => TEXT_FILE.test(file))
  assert.ok(files.length > 0, 'dist/ has no text assets')
  const problems = []
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    const name = relative(ROOT, file)
    const isGeodata = content.includes('FeatureCollection')
    for (const s of [...FIXTURE_STRINGS, ...SYNTHETIC_MONEY]) {
      if (content.includes(s)) problems.push(`${name}: ${s}`)
    }
    const lower = content.toLowerCase()
    for (const s of DEV_ONLY_STRINGS) {
      if (lower.includes(s.toLowerCase())) problems.push(`${name}: ${s}`)
    }
    for (const figure of FIXTURE_FIGURES) {
      const found = isGeodata ? outsideCoordinates(figure).test(content) : standaloneNumber(figure).test(content)
      if (found) problems.push(`${name}: ${figure}`)
    }
  }
  assert.deepEqual(problems, [])
})

// The pay-first site ships as the production homepage (PreviewApp chunk), but
// its dev-only modules (DevBanner, States Lab, stub pages) must not.
test('dist/ has no dev-only preview chunks (DevBanner, States Lab, stubs)', {
  skip: distMissing ? 'dist/ not found - run `npx vite build` first to check preview isolation' : false
}, () => {
  const chunks = listFiles(DIST).map((file) => relative(DIST, file)).filter((name) => /devbanner|stateslab|stubpage/i.test(name))
  assert.deepEqual(chunks, [])
})

// The PDF library (@react-pdf/renderer, ~1.2 MB) must load only when a report
// PDF is made: neither the entry chunk nor anything it imports statically may
// contain it. Library code is recognised by PDF stream markers.
test('dist/ entry chunk and its static imports do not include the PDF library', {
  skip: distMissing ? 'dist/ not found - run `npx vite build` first to check lazy loading' : false
}, () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8')
  const entries = [...html.matchAll(/<script[^>]+src="\/?([^"]+\.js)"/g)].map((m) => m[1])
  assert.ok(entries.length > 0, 'no entry script in dist/index.html')
  const seen = new Set()
  const queue = entries.map((src) => join(DIST, src))
  const offenders = []
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file) || !existsSync(file)) continue
    seen.add(file)
    const content = readFileSync(file, 'utf8')
    if (content.includes('FlateDecode') || content.includes('%PDF-')) offenders.push(relative(DIST, file))
    for (const m of content.matchAll(/(?:^|[;}\n])\s*import\s*(?:[^'"()]*?from\s*)?["']([^"']+\.js)["']/g)) {
      queue.push(join(file, '..', m[1]))
    }
  }
  assert.deepEqual(offenders, [])
  const pdfChunks = listFiles(DIST).filter((file) => /\.js$/.test(file) && readFileSync(file, 'utf8').includes('FlateDecode'))
  assert.ok(pdfChunks.length > 0, 'expected the PDF library in a lazily loaded chunk')
})
