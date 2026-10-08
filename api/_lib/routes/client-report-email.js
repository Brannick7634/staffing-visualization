// POST /api/signal/client-report/email
//   { roleKey, state|null, city|null, rateCents, recipients[], sendCopy, preparedFor?, preparedBy?, note? }
//
// Emails a Client Pay Market Report (PDF attached) built entirely on the
// server: the figures are rebuilt from the verified snapshot for the selection
// and never taken from the browser. Signed-in subscribers only, and only a
// session started with the password currently stored.
//
// Off (404) unless SIGNAL_CLIENT_REPORT_EMAIL_ENABLED=1.
//
// Abuse limits: same-origin POST, 10 requests / 10 min per IP, 5 / 10 min per
// account, other recipients only from an account whose email is confirmed
// (F.verified; an unconfirmed account may send only its own copy, so a
// sign-up under someone else's address cannot mail anyone), and a daily cap per account (SIGNAL_REPORT_EMAIL_DAILY_CAP, default
// 5 people a day). The cap counts only recipients OTHER than the sender: the
// sender's own copy (sendCopy, or their own address typed as a recipient,
// which is folded into the copy) costs nothing. The cost is reserved in
// Airtable BEFORE anything is sent and settled to the other people actually
// sent to when rendering or sending fails. Self-only sends are held back by
// the per-account limit plus an in-memory 10 a day per account, so a
// self-copy loop cannot burn the mail quota. One Resend call per recipient so
// addresses are never shown to each other; replies go to the sender.
//
// Privacy: the client pay rate, recipients, note and names are used only to
// build and send this email. They are never logged, stored or echoed back.
import { createHash } from 'node:crypto'
import {
  loadConfig, readBody, sendJson, sendError, methodNotAllowed, requireJson, RATE_LIMITED,
  normalizeEmail, isEmail, findByEmail, updateRecord, sendEmail, F
} from '../subscribers.js'
import { verifySession, sessionMatchesHash } from '../signalSession.js'
import { rateLimit, sameOrigin } from '../security.js'
import { validatePaySelection } from '../signal/handlers.js'
import { buildPayResponse } from '../signal/service.js'
import { productionAdapter } from '../signal/productionAdapter.js'
import { buildReportEmail } from '../clientReportEmail.js'
import { ACCESS } from '../../../shared/signal/contract.js'
import {
  buildClientReportModel, containsLink, MAX_RECIPIENTS, DAILY_RECIPIENT_LIMIT, PREPARED_TEXT_MAX, NOTE_MAX
} from '../../../shared/signal/clientReport.js'

// Other people a day per account (the sender's own copy is free).
export const DEFAULT_DAILY_CAP = DAILY_RECIPIENT_LIMIT
export const MIN_RATE_CENTS = 100
export const MAX_RATE_CENTS = 99999
export const MAX_BODY_BYTES = 16 * 1024
export const LIMITS = Object.freeze({ windowMs: 10 * 60 * 1000, perIp: 10, perAccount: 5, selfOnlyPerDay: 10 })
const DAY_MS = 24 * 60 * 60 * 1000
const NAME_MAX = 100
// A longer raw list is rejected before any address is looked at.
const RAW_RECIPIENTS_MAX = 50
const RESEND_RETRY_MS = 1100

const MESSAGES = Object.freeze({
  invalid_selection: 'Choose a job and location from the list.',
  invalid_rate: 'Enter a client pay rate between $1.00 and $999.99 an hour.',
  invalid_recipients: 'Check the email addresses.',
  too_many_recipients: `Send to at most ${MAX_RECIPIENTS} people at a time.`,
  no_recipients: 'Add at least one recipient, or send yourself a copy.',
  links_not_allowed: "Links aren't allowed in the message or names.",
  text_too_long: 'That text is too long.'
})

export const NOT_VERIFIED_MESSAGE = 'Confirm your email address to send reports to other people. You can still send yourself a copy.'

const SELF_ONLY_LIMITED = Object.freeze({ error: { code: 'copy_limit', message: "You've sent yourself the most copies allowed today. You can send more tomorrow." } })

const people = (n) => (n === 1 ? 'person' : 'people')
function dailyLimitMessage(remaining, cap) {
  return remaining > 0
    ? `You can email ${remaining} more ${people(remaining)} today. Copies to yourself still work.`
    : `You've reached today's limit of ${cap} ${people(cap)}. Copies to yourself still work.`
}

async function defaultRenderPdf(model) {
  const { renderClientReportPdfBuffer } = await import('../../../shared/signal/clientReportPdf.js')
  return renderClientReportPdfBuffer(model)
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Production sign-in check: signed session cookie, the subscriber row, and a
// session started with the password currently stored.
// -> { email, name, record, verified } | null. Throws when Airtable fails.
// verified: the reader has proved they can open mail sent to the address.
export async function sessionAccount(req, { cfg, env, fetchImpl, now }) {
  const session = verifySession(req, { env, now })
  if (!session) return null
  const record = await findByEmail(cfg, fetchImpl, session.email)
  if (!record || !sessionMatchesHash(session, record.fields?.[F.passwordHash], cfg.secret)) return null
  return { email: normalizeEmail(session.email), name: record.fields?.[F.name], record, verified: record.fields?.[F.verified] === true }
}

const codePoints = (s) => Array.from(s).length

// Single-line text (prepared for / by): control characters become spaces.
// '' when absent; null when not a string or too long.
function lineText(value, max) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null
  const t = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return codePoints(t) > max ? null : t
}

// Multi-line plain text (the note): line breaks kept, other control
// characters removed, at most one blank line in a row.
function noteText(value, max) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null
  const t = value.replace(/\r\n?/g, '\n').replace(/\t/g, ' ')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/[ ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return codePoints(t) > max ? null : t
}

const fail = (code, field) => ({ ok: false, code, ...(field ? { field } : {}) })

// validateEmailRequest(body, { senderEmail }) -> { ok:true, value } | { ok:false, code, field? }
export function validateEmailRequest(input, { senderEmail = '' } = {}) {
  const b = input && typeof input === 'object' && !Array.isArray(input) ? input : null
  if (!b) return fail('invalid_selection', 'role')
  const selection = validatePaySelection({ role: b.roleKey, state: b.state, city: b.city })
  if (!selection.ok) return fail('invalid_selection', selection.field)
  if (!Number.isSafeInteger(b.rateCents) || b.rateCents < MIN_RATE_CENTS || b.rateCents > MAX_RATE_CENTS) return fail('invalid_rate', 'rateCents')

  if (b.recipients !== undefined && b.recipients !== null && !Array.isArray(b.recipients)) return fail('invalid_recipients', 'recipients')
  const raw = b.recipients || []
  if (raw.length > RAW_RECIPIENTS_MAX) return fail('too_many_recipients', 'recipients')
  const recipients = []
  for (const item of raw) {
    const email = normalizeEmail(item)
    if (typeof item !== 'string' || !isEmail(email)) return fail('invalid_recipients', 'recipients')
    if (!recipients.includes(email)) recipients.push(email)
  }
  // The sender's own address typed as a recipient becomes their copy: it is
  // never sent twice and never counts against the daily cap.
  const sender = normalizeEmail(senderEmail)
  const typedSelf = sender !== '' && recipients.includes(sender)
  const to = typedSelf ? recipients.filter((email) => email !== sender) : recipients
  if (to.length > MAX_RECIPIENTS) return fail('too_many_recipients', 'recipients')
  const sendCopy = b.sendCopy === true || typedSelf
  if (to.length === 0 && !sendCopy) return fail('no_recipients', 'recipients')

  const preparedFor = lineText(b.preparedFor, PREPARED_TEXT_MAX)
  if (preparedFor === null) return fail('text_too_long', 'preparedFor')
  const preparedBy = lineText(b.preparedBy, PREPARED_TEXT_MAX)
  if (preparedBy === null) return fail('text_too_long', 'preparedBy')
  const note = noteText(b.note, NOTE_MAX)
  if (note === null) return fail('text_too_long', 'note')
  for (const [field, value] of [['note', note], ['preparedFor', preparedFor], ['preparedBy', preparedBy]]) {
    if (value && containsLink(value)) return fail('links_not_allowed', field)
  }

  return { ok: true, value: { selection: selection.selection, rateCents: b.rateCents, recipients: to, sendCopy, preparedFor, preparedBy, note } }
}

export function dailyCap(env) {
  const n = Number.parseInt(String(env.SIGNAL_REPORT_EMAIL_DAILY_CAP ?? ''), 10)
  return Number.isSafeInteger(n) && n > 0 ? n : DEFAULT_DAILY_CAP
}

// Other people already emailed against today's (UTC) cap.
function usedToday(fields, today) {
  if (fields?.[F.reportEmailDay] !== today) return 0
  const n = fields?.[F.reportEmailCount]
  return Number.isSafeInteger(n) && n > 0 ? n : 0
}

// The sender's name when it is safe to show, else their email address.
function senderLabelOf(name, email) {
  if (typeof name !== 'string') return email
  const t = name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t || codePoints(t) > NAME_MAX || containsLink(t)) return email
  return t
}

const accountSubject = (email) => createHash('sha256').update(`client-report:${email}`).digest('hex').slice(0, 32)

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10)

function tooLarge(req) {
  const declared = Number(req?.headers?.['content-length'])
  return Number.isFinite(declared) && declared > MAX_BODY_BYTES
}

function notFound(res) {
  res.statusCode = 404
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({ error: 'not_found' }))
}

export function createClientReportEmailHandler({
  env = process.env,
  fetchImpl = globalThis.fetch,
  adapter = productionAdapter,
  now = () => Date.now(),
  renderPdf = defaultRenderPdf,
  logger = console,
  // Development and test hooks (the dev server uses its simulated sign-in).
  authenticate = sessionAccount,
  checkOrigin = sameOrigin,
  sleep = defaultSleep
} = {}) {
  // Fixed strings only: never the rate, recipients, note, names or emails.
  const logFailure = (stage, error) => {
    const code = error && typeof error.message === 'string' && /^(resend|airtable)_\d{3}$/.test(error.message) ? error.message : (error?.name || 'Error')
    try { logger.error(`[client-report-email] ${stage} failed (${code})`) } catch { /* logging must never break a send */ }
  }
  const sendFailed = (res, sent, extra = {}) => sendError(res, 502, 'send_failed', 'We could not send the report. Please try again.', { sent, ...extra })

  return async function clientReportEmailHandler(req, res) {
    if (env.SIGNAL_CLIENT_REPORT_EMAIL_ENABLED !== '1') return notFound(res)
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    if (!requireJson(req, res)) return
    if (tooLarge(req)) return sendError(res, 413, 'payload_too_large', 'That request is too large.')
    if (!checkOrigin(req, env)) return sendError(res, 403, 'bad_origin', 'Send the report from the site.')
    const t = Number(now())
    if (!rateLimit(req, res, { key: 'client-report-email:ip', limit: LIMITS.perIp, windowMs: LIMITS.windowMs, now: t, body: RATE_LIMITED })) return
    const conf = loadConfig(env, { needMail: true })
    if (!conf.ok) return sendError(res, 503, 'email_unavailable', 'Emailing reports is not available right now. Please try again later.')
    const cfg = conf.cfg

    let account
    try {
      account = await authenticate(req, { cfg, env, fetchImpl, now: t })
    } catch (error) {
      logFailure('account lookup', error)
      return sendFailed(res, 0)
    }
    if (!account || !isEmail(normalizeEmail(account.email)) || !account.record?.id) {
      return sendError(res, 401, 'sign_in_required', 'Please sign in to email a report.')
    }
    const senderEmail = normalizeEmail(account.email)

    const body = readBody(req)
    const checked = validateEmailRequest(body, { senderEmail })
    if (!checked.ok) return sendError(res, 400, checked.code, MESSAGES[checked.code], checked.field ? { field: checked.field } : {})
    const v = checked.value
    if (v.recipients.length > 0 && account.verified !== true) {
      return sendError(res, 403, 'email_not_verified', NOT_VERIFIED_MESSAGE)
    }

    const subject = accountSubject(senderEmail)
    if (!rateLimit(req, res, { key: 'client-report-email:account', subject, limit: LIMITS.perAccount, windowMs: LIMITS.windowMs, now: t, body: RATE_LIMITED })) return

    const cap = dailyCap(env)
    const today = isoDay(t)

    // Only other people count; the sender's copy is free.
    const used = usedToday(account.record.fields, today)
    const cost = v.recipients.length
    const remainingBefore = Math.max(0, cap - used)
    if (cost > remainingBefore) {
      return sendError(res, 429, 'daily_limit', dailyLimitMessage(remainingBefore, cap), { remainingToday: remainingBefore, dailyLimit: cap })
    }

    // Rebuild the figures from the verified snapshot, as an authorized viewer.
    let model
    try {
      const loaded = adapter && typeof adapter.load === 'function' ? await adapter.load() : null
      if (!loaded || loaded.available !== true || !loaded.data || typeof loaded.data !== 'object') {
        return sendError(res, 503, 'feed_unavailable', 'Market data is not available right now. Please try again later.')
      }
      const payResponse = buildPayResponse({ data: loaded.data, dataMode: adapter.dataMode, viewer: { access: ACCESS.AUTHORIZED }, request: v.selection })
      const exact = loaded.data.snapshot?.exactDate
      model = buildClientReportModel({
        payResponse,
        rateCents: v.rateCents,
        now: new Date(t),
        preparedFor: v.preparedFor,
        preparedBy: v.preparedBy,
        snapshotDate: typeof exact === 'string' && /^\d{4}-\d{2}-\d{2}/.test(exact) ? exact.slice(0, 10) : null
      })
    } catch (error) {
      logFailure('report build', error)
      return sendError(res, 500, 'internal_error', 'Something went wrong building the report.')
    }
    if (!model) return sendError(res, 409, 'no_benchmark', 'There is no published benchmark for this job and location yet.')

    // Self-only sends cost nothing against the cap, so they get their own
    // (in-memory, per UTC day) limit, counted only once the report exists
    // (feed_unavailable / no_benchmark do not use one up).
    if (v.recipients.length === 0 && !rateLimit(req, res, { key: 'client-report-email:self-only', subject: `${subject}:${today}`, limit: LIMITS.selfOnlyPerDay, windowMs: DAY_MS, now: t, body: SELF_ONLY_LIMITED })) return

    // Reserve the other people against today's cap BEFORE sending anything.
    // A copy only to the sender costs nothing, so nothing is written.
    const remainingToday = remainingBefore - cost
    if (cost > 0) {
      try {
        await updateRecord(cfg, fetchImpl, account.record.id, { [F.reportEmailDay]: today, [F.reportEmailCount]: used + cost })
      } catch (error) {
        logFailure('daily cap', error)
        return sendFailed(res, 0)
      }
    }

    // On a failure, give back what was reserved but not sent: `delivered`
    // counts other people only. The count is re-read and only the unsent part
    // is subtracted, so a send running in parallel keeps its own reservation
    // (best effort: if this fails the reservation stands, which errs on the
    // safe side).
    const settle = async (delivered) => {
      if (delivered === cost) return remainingToday
      try {
        const fresh = await findByEmail(cfg, fetchImpl, senderEmail)
        if (!fresh || fresh.id !== account.record.id) return remainingToday
        const count = Math.max(0, usedToday(fresh.fields, today) - (cost - delivered))
        await updateRecord(cfg, fetchImpl, account.record.id, { [F.reportEmailDay]: today, [F.reportEmailCount]: count })
        return Math.max(0, cap - count)
      } catch (error) {
        logFailure('daily cap release', error)
        return remainingToday
      }
    }

    // Positions in the submitted list that did not get the report (the
    // sender's own address counts as sent once their copy is), so the page
    // can keep exactly those for a retry. Positions only, never addresses.
    const unsentPositions = (sent, copySent) => {
      const delivered = new Set(v.recipients.slice(0, sent))
      const raw = Array.isArray(body?.recipients) ? body.recipients : []
      const out = []
      raw.forEach((item, i) => {
        const email = normalizeEmail(item)
        if (!(email === senderEmail ? copySent : delivered.has(email))) out.push(i)
      })
      return out
    }

    let attachment
    try {
      const pdf = await renderPdf(model)
      attachment = { filename: model.fileName, content: Buffer.from(pdf).toString('base64') }
    } catch (error) {
      logFailure('pdf', error)
      return sendError(res, 500, 'render_failed', 'We could not build the PDF. Please try again.', { remainingToday: await settle(0) })
    }

    const mail = buildReportEmail({ model, senderLabel: senderLabelOf(account.name, senderEmail), senderEmail, note: v.note })
    const deliver = async (to) => {
      const message = { to, subject: mail.subject, html: mail.html, text: mail.text, reply_to: senderEmail, attachments: [attachment] }
      try {
        await sendEmail(cfg, fetchImpl, message)
      } catch (error) {
        // Resend allows a few requests a second; wait once and retry on 429.
        if (!(error && error.message === 'resend_429')) throw error
        await sleep(RESEND_RETRY_MS)
        await sendEmail(cfg, fetchImpl, message)
      }
    }

    let sent = 0
    for (const to of v.recipients) {
      try {
        await deliver(to)
      } catch (error) {
        logFailure('send', error)
        return sendFailed(res, sent, { unsent: unsentPositions(sent, false), remainingToday: await settle(sent) })
      }
      sent++
    }
    let copySent = false
    if (v.sendCopy) {
      try {
        await deliver(senderEmail)
      } catch (error) {
        logFailure('send copy', error)
        return sendFailed(res, sent, { copySent, unsent: unsentPositions(sent, false), remainingToday: await settle(sent) })
      }
      copySent = true
    }
    return sendJson(res, 200, { ok: true, sent, copySent, remainingToday })
  }
}

export default createClientReportEmailHandler()
