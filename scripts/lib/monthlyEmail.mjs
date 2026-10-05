// Pure helpers for the monthly report email (rendering, secrets parsing,
// subscriber filtering, approval checks). No network, no file writes: the CLI
// in scripts/monthly_report_email.mjs does the I/O. Unit-tested.
import { createHash } from 'node:crypto'
import { localFor, cityLabel, stateName } from '../../api/_lib/signal/report.js'
import { F, isEmail, normalizeEmail } from '../../api/_lib/subscribers.js'
import { areaFromRecord } from '../../api/_lib/routes/signal-report.js'

export const DRAFT_TO = 'andy.kohler@marshmma.us'
export const DRAFT_SAMPLE_EMAIL = 'sample.subscriber@example.com'
export const REQUIRED_SECRETS = ['RESEND_API_KEY', 'SIGNAL_AIRTABLE_API_KEY', 'SIGNAL_SESSION_SECRET', 'SIGNAL_FROM_EMAIL']

// KEY=VALUE lines; '#' comments; optional surrounding quotes. Never logged.
export function parseSecrets(text) {
  const out = {}
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i <= 0) continue
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[line.slice(0, i).trim()] = v
  }
  return out
}

export const reportHash = (report) => createHash('sha256').update(JSON.stringify({ ...report, generatedAt: null })).digest('hex').slice(0, 16)

// Newsletter = true AND Unsubscribed != true AND a valid email. Deduped.
export function eligibleSubscribers(records) {
  const seen = new Set()
  const out = []
  for (const r of records || []) {
    const f = r?.fields || {}
    const email = normalizeEmail(f[F.email])
    if (f[F.newsletter] !== true || f[F.unsubscribed] === true || !isEmail(email) || seen.has(email)) continue
    seen.add(email)
    out.push({ id: r.id, email, name: typeof f[F.name] === 'string' ? f[F.name] : '', area: areaFromRecord(f) })
  }
  return out
}

// Approval: a draft of THIS report must have gone to Andy, and the approval
// marker must name the same month and report hash.
export function checkApproval({ month, approvedFlag, report, draftRecord, marker }) {
  if (approvedFlag !== month) return `pass --approved ${month} to confirm the month`
  if (!draftRecord || draftRecord.month !== month) return `no draft was sent for ${month}; run --draft first`
  if (!marker || marker.month !== month) return `no approval marker for ${month}; run --approve ${month} after Andy says "send"`
  const h = reportHash(report)
  if (marker.reportHash !== h || draftRecord.reportHash !== h) return 'the report changed after the draft/approval; send a new draft and re-approve'
  return null
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const arrow = (d) => (d === 'up' ? '▲' : d === 'down' ? '▼' : '★')
const color = (d) => (d === 'up' ? '#B42336' : d === 'down' ? '#1D5EA8' : '#075968')

function areaLabel(area) {
  if (!area?.state) return null
  return area.cityKey ? cityLabel(area.cityKey) : stateName(area.state)
}

// -> { subject, html, text }
export function renderEmail(report, { area = null, name = '', site, unsubUrl, draft = false } = {}) {
  const local = localFor(report, area || {})
  const reportUrl = `${site}/report/${report.month}`
  const prefsUrl = `${site}/preferences`
  const subject = `${draft ? '[DRAFT] ' : ''}The Monthly Signal: ${report.label}`
  const hello = name ? `Hi ${name.split(/\s+/)[0]},` : 'Hi,'
  const blocks = []
  if (local.section) blocks.push({ title: `Your area: ${local.section.name}`, items: local.section.headlines })
  if (local.level === 'city' && area?.state && report.states?.[area.state]) {
    blocks.push({ title: report.states[area.state].name, items: report.states[area.state].headlines })
  }
  blocks.push({ title: 'National', items: report.national.headlines })
  const where = areaLabel(area)

  const text = [
    draft ? '[DRAFT - sample subscriber' + (where ? ` in ${where}` : ' with no area set') + '. Not sent to subscribers.]\n' : null,
    hello,
    '',
    `Here is what moved in staffing-firm postings in ${report.label}, compared with the month before.`,
    local.note ? `\n${local.note}` : null,
    !where ? `\nTell us your state and city and we will lead with your area: ${prefsUrl}` : null,
    ...blocks.flatMap((b) => ['', b.title.toUpperCase(), ...b.items.map((h) => `${arrow(h.direction)} ${h.text}`)]),
    '',
    `Full report: ${reportUrl}`,
    '',
    'Staffing-firm postings only. Advertised pay, not actual pay. A figure appears only when at least 5 firms (none over half) are behind it in both months.',
    '',
    `Unsubscribe: ${unsubUrl}`
  ].filter((l) => l !== null).join('\n')

  const li = (h) => `<li style="margin:0 0 8px;list-style:none"><span style="color:${color(h.direction)};font-weight:700">${arrow(h.direction)}</span> ${esc(h.text)}</li>`
  const html = `<!doctype html><html><body style="margin:0;background:#F6F8FB;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#102A43">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
${draft ? `<p style="background:#FFF7E6;border:1px solid #EFD7A6;padding:8px 12px;border-radius:8px;font-size:13px">DRAFT: sample subscriber${where ? ` in ${esc(where)}` : ' with no area set'}. Not sent to subscribers.</p>` : ''}
<p style="font-family:Georgia,serif;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#075968;margin:0">The Monthly Signal</p>
<h1 style="font-family:Georgia,serif;font-size:26px;margin:4px 0 16px">${esc(report.label)}</h1>
<p>${esc(hello)}</p>
<p>Here is what moved in staffing-firm postings in ${esc(report.label)}, compared with the month before.</p>
${local.note ? `<p style="background:#FFF7E6;padding:8px 12px;border-radius:8px">${esc(local.note)}</p>` : ''}
${!where ? `<p><a href="${esc(prefsUrl)}" style="color:#1D5EA8">Add your state and city</a> and we will lead with your area.</p>` : ''}
${blocks.map((b) => `<h2 style="font-family:Georgia,serif;font-size:18px;margin:20px 0 8px">${esc(b.title)}</h2><ul style="padding:0;margin:0">${b.items.map(li).join('')}</ul>`).join('\n')}
<p style="margin:24px 0"><a href="${esc(reportUrl)}" style="background:#075968;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Read the full report</a></p>
<p style="font-size:12px;color:#52647A">Staffing-firm postings only. Advertised pay, not actual pay. A figure appears only when at least 5 firms (none over half) are behind it in both months.</p>
<p style="font-size:12px;color:#52647A"><a href="${esc(unsubUrl)}" style="color:#52647A">Unsubscribe</a></p>
</div></body></html>`
  return { subject, html, text }
}
