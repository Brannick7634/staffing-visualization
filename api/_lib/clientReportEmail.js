// Email template for POST /api/signal/client-report/email.
//
// The subject is fixed (never user-editable). Every user-supplied or derived
// string is HTML-escaped in the html part; the text part is plain text. The
// sender's note is plain text only (links are rejected before this runs).
//
// Server-only.
import { esc } from './html.js'
import { formatCents } from '../../shared/signal/money.js'

export const SITE_NAME = 'The Staffing Signal'
export const SITE_HOST = 'thestaffingsignal.com'

// "in Houston, TX" / "in Texas" / "across the U.S." (same phrasing as the report).
export function reportPlacePhrase(model) {
  return model.scope.level === 'nationwide' ? 'across the U.S.' : `in ${model.scope.label}`
}

export function reportEmailSubject(model) {
  return `Client Pay Market Report: ${model.roleLabel} ${reportPlacePhrase(model)}`.replace(/[\r\n]+/g, ' ')
}

function gapLine(model) {
  const { gap } = model
  if (gap.direction === 'at') return 'At the market median'
  const size = formatCents(Math.abs(gap.gapCents))
  const pct = gap.pct === 0 ? 'less than 1%' : `about ${gap.pct}%`
  return gap.direction === 'below'
    ? `${size}/hr below the market median (${pct} below)`
    : `${size}/hr above the market median (${pct} above)`
}

function figureRows(model) {
  const f = model.figures
  return [
    ['Market Low (25th percentile)', `${formatCents(f.p25Cents)}/hr`],
    ['Market Median', `${formatCents(f.typicalCents)}/hr`],
    ['Market High (75th percentile)', `${formatCents(f.p75Cents)}/hr`],
    ['Client pay rate', `${formatCents(model.rateCents)}/hr`],
    ['Market gap', gapLine(model)]
  ]
}

// buildReportEmail({ model, senderLabel, senderEmail, note }) -> { subject, html, text }
//   senderLabel: the sender's name, or their email when no usable name.
export function buildReportEmail({ model, senderLabel, senderEmail, note = '' }) {
  const subject = reportEmailSubject(model)
  const heading = `${model.roleLabel} ${reportPlacePhrase(model)}`
  const intro = `${senderLabel} shared a Client Pay Market Report with you.`
  const footer = `Sent via ${SITE_NAME} (${SITE_HOST}) on behalf of ${senderEmail}. Replies go to ${senderEmail}.`
  const attached = 'The full two-page report is attached as a PDF.'
  const rows = figureRows(model)
  const caveat = 'Advertised pay in staffing-firm job postings, not actual pay. Pay is one factor in filling an order; it does not guarantee a fill.'

  const text = [
    intro,
    ...(note ? ['', `Message from ${senderLabel}:`, note] : []),
    '',
    heading,
    ...(model.fallbackNote ? [model.fallbackNote] : []),
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(model.limitedDataNote ? [model.limitedDataNote] : []),
    '',
    attached,
    caveat,
    '',
    footer
  ].join('\n')

  const cell = 'padding:6px 12px 6px 0;border-bottom:1px solid #DCE5EE;font-size:14px;color:#243B53'
  const html = '<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:Helvetica,Arial,sans-serif;color:#132B45">' +
    '<div style="max-width:560px">' +
    `<p style="font-size:15px;margin:0 0 16px">${esc(intro)}</p>` +
    (note
      ? `<div style="margin:0 0 20px;padding:12px 14px;background:#F5F8FB;border-left:3px solid #1E5FAA;font-size:14px;line-height:1.5">` +
        `<div style="font-size:12px;color:#52647A;margin-bottom:4px">Message from ${esc(senderLabel)}</div>` +
        `${esc(note).replace(/\n/g, '<br>')}</div>`
      : '') +
    `<h1 style="font-size:18px;margin:0 0 4px;color:#102A43">${esc(subject)}</h1>` +
    (model.fallbackNote ? `<p style="font-size:13px;color:#8A5A10;margin:0 0 8px">${esc(model.fallbackNote)}</p>` : '') +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px">' +
    rows.map(([label, value]) => `<tr><td style="${cell}">${esc(label)}</td><td style="${cell};font-weight:bold">${esc(value)}</td></tr>`).join('') +
    '</table>' +
    // Small-sample caution, directly under the figures it qualifies.
    (model.limitedDataNote
      ? `<p style="font-size:13px;line-height:1.45;color:#8A5A10;background:#FFF7E6;border:1px solid #EFD7A6;border-radius:4px;padding:6px 10px;margin:-8px 0 16px">${esc(model.limitedDataNote)}</p>`
      : '') +
    `<p style="font-size:14px;margin:0 0 8px">${esc(attached)}</p>` +
    `<p style="font-size:12px;color:#52647A;margin:0 0 20px">${esc(caveat)}</p>` +
    `<p style="font-size:12px;color:#52647A;margin:0;border-top:1px solid #DCE5EE;padding-top:12px">${esc(footer)}</p>` +
    '</div></body></html>'

  return { subject, html, text }
}
