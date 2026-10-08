import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

// pdfkit loads its standard fonts (Helvetica*.cjs) by name at runtime, so Vercel's
// file tracing misses them; without includeFiles the emailed PDF fails on Vercel only.
test('signal-data function ships pdfkit standard fonts and the data files', () => {
  const cfg = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
  const include = cfg.functions?.['api/signal-data.js']?.includeFiles || ''
  for (const part of ['node_modules/pdfkit/js/standard-fonts/**', 'api/_lib/signal/data/report/**', 'api/_lib/signal/data/monthly/**']) {
    assert.ok(include.includes(part), `includeFiles must cover ${part}`)
  }
  assert.ok(existsSync(new URL('../../node_modules/pdfkit/js/standard-fonts/Helvetica.cjs', import.meta.url)), 'pdfkit font path moved; update includeFiles')
})
