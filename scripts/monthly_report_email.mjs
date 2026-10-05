#!/usr/bin/env node
// Monthly Staffing Signal email, with Andy's approval required before any
// subscriber is emailed.
//
//   node scripts/monthly_report_email.mjs --preview [--month M] [--state TX] [--city Houston]
//       Render to logs/email-preview-M.{html,txt}. Sends nothing.
//   node scripts/monthly_report_email.mjs --draft [--month M] [--state TX] [--city Houston]
//       Send ONE email, to andy.kohler@marshmma.us only, subject "[DRAFT] ...",
//       rendered as a sample subscriber in the chosen area. Records the draft.
//   node scripts/monthly_report_email.mjs --approve M
//       Run only after Andy replies "send". Writes the approval marker, tied to
//       the exact report that was in the draft.
//   node scripts/monthly_report_email.mjs --send --approved M [--limit N] [--dry-run]
//       Email every subscriber with Newsletter = true and Unsubscribed != true.
//       Refuses without a matching draft + approval marker. Rate-limited
//       (~1.6/s), idempotent: a per-month sent log skips anyone already sent.
//
// Secrets: read ONLY from %USERPROFILE%\.staffing-signal\secrets.env (or the
// SIGNAL_SECRETS_FILE path): RESEND_API_KEY, SIGNAL_AIRTABLE_API_KEY,
// SIGNAL_SESSION_SECRET, SIGNAL_FROM_EMAIL, optional SIGNAL_SITE_URL.
// State (drafts, approvals, sent logs) lives beside it, outside the repo.
import { readFile, writeFile, mkdir, appendFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MONTH, cityKeyFor } from '../api/_lib/signal/report.js'
import { sendEmail, unsubscribeUrl } from '../api/_lib/subscribers.js'
import { stateByCode } from '../shared/signal/geography.js'
import { DRAFT_TO, DRAFT_SAMPLE_EMAIL, REQUIRED_SECRETS, parseSecrets, reportHash, eligibleSubscribers, checkApproval, renderEmail } from './lib/monthlyEmail.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const REPORTS = path.join(ROOT, 'api/_lib/signal/data/report')
const HOME = path.join(os.homedir(), '.staffing-signal')
const SECRETS = process.env.SIGNAL_SECRETS_FILE || path.join(HOME, 'secrets.env')
const STATE_DIR = path.join(HOME, 'monthly-email')
const DELAY_MS = 600

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const die = (msg, code = 2) => { console.error(`REFUSED: ${msg}`); process.exit(code) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'))

async function latestMonth() {
  const files = (await readdir(REPORTS).catch(() => [])).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort()
  return files.length ? files.at(-1).slice(0, 7) : null
}

async function loadCfg({ mail }) {
  if (!existsSync(SECRETS)) die(`secrets file not found: ${SECRETS}`)
  const s = parseSecrets(await readFile(SECRETS, 'utf8'))
  const need = mail ? REQUIRED_SECRETS : REQUIRED_SECRETS.filter((k) => k === 'SIGNAL_SESSION_SECRET')
  const missing = need.filter((k) => !s[k])
  if (missing.length) die(`secrets file is missing: ${missing.join(', ')}`)
  if (s.SIGNAL_SESSION_SECRET.length < 32) die('SIGNAL_SESSION_SECRET must be at least 32 characters (use the same value as Vercel)')
  return {
    apiKey: s.SIGNAL_AIRTABLE_API_KEY,
    base: s.SIGNAL_SUBSCRIBERS_BASE || 'appFkwB2Aei2oblnz',
    table: s.SIGNAL_SUBSCRIBERS_TABLE || 'tbl3V33K9WVjadzMQ',
    secret: s.SIGNAL_SESSION_SECRET,
    site: String(s.SIGNAL_SITE_URL || 'https://www.thestaffingsignal.com').replace(/\/+$/, ''),
    resendKey: s.RESEND_API_KEY,
    from: s.SIGNAL_FROM_EMAIL
  }
}

function sampleArea() {
  const st = (opt('--state') || '').toUpperCase()
  if (!st) return null
  if (!stateByCode(st)) die(`unknown state ${st}`)
  const city = opt('--city')
  return { state: st, cityKey: city ? cityKeyFor(st, city) : null }
}

async function listSubscribers(cfg) {
  const records = []
  let offset
  do {
    const q = new URLSearchParams({ pageSize: '100', returnFieldsByFieldId: 'true' })
    if (offset) q.set('offset', offset)
    const res = await fetch(`https://api.airtable.com/v0/${cfg.base}/${cfg.table}?${q}`, { headers: { Authorization: `Bearer ${cfg.apiKey}` } })
    if (!res.ok) die(`Airtable read failed (${res.status})`, 1)
    const data = await res.json()
    records.push(...(data.records || []))
    offset = data.offset
  } while (offset)
  return records
}

async function main() {
  const month = opt('--month') || opt('--approved') || opt('--approve') || await latestMonth()
  if (!month || !MONTH.test(month)) die('no report month (build one with scripts/build_monthly_report.mjs)')
  const reportFile = path.join(REPORTS, `${month}.json`)
  if (!existsSync(reportFile)) die(`no report file for ${month}`)
  const report = await readJson(reportFile)
  const hash = reportHash(report)
  await mkdir(STATE_DIR, { recursive: true })
  const draftFile = path.join(STATE_DIR, `${month}.draft.json`)
  const markerFile = path.join(STATE_DIR, `${month}.approved.json`)
  const sentFile = path.join(STATE_DIR, `${month}.sent.jsonl`)

  if (has('--preview')) {
    const area = sampleArea()
    const site = 'https://www.thestaffingsignal.com'
    const m = renderEmail(report, { area, name: 'Sample Subscriber', site, unsubUrl: `${site}/api/unsubscribe?token=PREVIEW`, draft: true })
    await mkdir(path.join(ROOT, 'logs'), { recursive: true })
    await writeFile(path.join(ROOT, 'logs', `email-preview-${month}.html`), m.html)
    await writeFile(path.join(ROOT, 'logs', `email-preview-${month}.txt`), m.text)
    console.log(`preview written: logs/email-preview-${month}.html (.txt); subject "${m.subject}"`)
    return
  }

  if (has('--draft')) {
    const cfg = await loadCfg({ mail: true })
    const area = sampleArea()
    const m = renderEmail(report, { area, name: 'Sample Subscriber', site: cfg.site, unsubUrl: unsubscribeUrl(cfg, DRAFT_SAMPLE_EMAIL), draft: true })
    await sendEmail(cfg, fetch, { to: DRAFT_TO, subject: m.subject, html: m.html, text: m.text })
    await writeFile(draftFile, JSON.stringify({ month, reportHash: hash, sentAt: new Date().toISOString(), to: DRAFT_TO, area }, null, 2))
    console.log(`draft for ${month} sent to ${DRAFT_TO} (report ${hash}). Waiting for Andy's "send".`)
    return
  }

  if (has('--approve')) {
    if (opt('--approve') !== month) die('usage: --approve YYYY-MM')
    if (!existsSync(draftFile)) die(`no draft was sent for ${month}; run --draft first`)
    const draft = await readJson(draftFile)
    if (draft.reportHash !== hash) die('the report changed after the draft was sent; send a new draft first')
    await writeFile(markerFile, JSON.stringify({ month, reportHash: hash, approvedAt: new Date().toISOString() }, null, 2))
    console.log(`approved ${month} (report ${hash}).`)
    return
  }

  if (has('--send')) {
    const draftRecord = existsSync(draftFile) ? await readJson(draftFile) : null
    const marker = existsSync(markerFile) ? await readJson(markerFile) : null
    const why = checkApproval({ month, approvedFlag: opt('--approved'), report, draftRecord, marker })
    if (why) die(why)
    const cfg = await loadCfg({ mail: true })
    const subs = eligibleSubscribers(await listSubscribers(cfg))
    const sent = new Set(existsSync(sentFile) ? (await readFile(sentFile, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l).email) : [])
    const todo = subs.filter((s) => !sent.has(s.email))
    const limit = Number(opt('--limit')) || Infinity
    console.log(`${month}: ${subs.length} eligible, ${sent.size} already sent, ${todo.length} to send${Number.isFinite(limit) ? ` (limit ${limit})` : ''}`)
    if (has('--dry-run')) return
    let ok = 0, failed = 0
    for (const s of todo.slice(0, limit)) {
      const unsub = unsubscribeUrl(cfg, s.email)
      const m = renderEmail(report, { area: s.area, name: s.name, site: cfg.site, unsubUrl: unsub })
      try {
        await sendEmail(cfg, fetch, { to: s.email, subject: m.subject, html: m.html, text: m.text,
          headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } })
        await appendFile(sentFile, JSON.stringify({ email: s.email, at: new Date().toISOString(), reportHash: hash }) + '\n')
        ok += 1
      } catch (e) {
        failed += 1
        console.error(`send failed for subscriber ${s.id} (${e.message})`)
      }
      await sleep(DELAY_MS)
    }
    console.log(`${month}: sent ${ok}, failed ${failed}. Re-run to retry failures (already-sent are skipped).`)
    process.exit(failed ? 1 : 0)
  }

  die('choose --preview, --draft, --approve YYYY-MM or --send --approved YYYY-MM')
}

await main()
