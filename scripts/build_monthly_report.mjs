#!/usr/bin/env node
// Build the monthly Staffing Signal report: month M vs M-1.
//   node scripts/build_monthly_report.mjs [--month YYYY-MM] [--dry-run]
// Default month = the newest archive in api/_lib/signal/data/monthly/ that has
// its previous month archived too. Writes api/_lib/signal/data/report/YYYY-MM.json.
// Prints a short summary (headline count + the national headlines).
import { readFile, writeFile, readdir, mkdir, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { buildReport, validateMonthly, previousMonth, MONTH } from '../api/_lib/signal/report.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MONTHLY = path.join(ROOT, 'api/_lib/signal/data/monthly')
const REPORTS = path.join(ROOT, 'api/_lib/signal/data/report')

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const load = async (m) => validateMonthly(JSON.parse(await readFile(path.join(MONTHLY, `${m}.json`), 'utf8')), m)

const have = (await readdir(MONTHLY).catch(() => [])).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 7)).sort()
let month = opt('--month')
if (!month) month = [...have].reverse().find((m) => have.includes(previousMonth(m)))
if (!month || !MONTH.test(month)) { console.error('REFUSED: no month with both it and its previous month archived'); process.exit(2) }
if (!have.includes(month) || !have.includes(previousMonth(month))) {
  console.error(`REFUSED: need monthly/${month}.json and monthly/${previousMonth(month)}.json`); process.exit(2)
}
const report = buildReport(await load(month), await load(previousMonth(month)))
console.log(`${report.label} vs ${report.previousMonth}: ${report.national.headlines.length} national headlines, ` +
  `${report.national.payMoves.length} pay moves, ${Object.keys(report.states).length} state sections, ${Object.keys(report.cities).length} city sections, ` +
  `${report.national.newlyPublishable.length} newly publishable roles`)
for (const h of report.national.headlines) console.log(`  [${h.direction}] ${h.text}`)
if (args.includes('--dry-run')) process.exit(0)
await mkdir(REPORTS, { recursive: true })
const out = path.join(REPORTS, `${month}.json`)
await writeFile(`${out}.tmp`, JSON.stringify(report))
await rename(`${out}.tmp`, out)
console.log('wrote', path.relative(ROOT, out))
