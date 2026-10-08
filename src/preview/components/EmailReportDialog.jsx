import { useEffect, useId, useRef, useState } from 'react'
import { MAX_RECIPIENTS, DAILY_RECIPIENT_LIMIT, NOTE_MAX, containsLink } from '../../../shared/signal/clientReport.js'
import { emailClientReport, requestEmailConfirmation } from '../api.js'
import { EVENTS, track } from '../lib/track.js'
import '../styles/report.css'

// "Email this report" dialog. Recipients, the note and the client pay rate stay
// in memory and go to the server only in the send request's POST body; nothing
// here is stored, logged or tracked except the event name.

const EMAIL = /^[^\s@,;<>"()[\]\\]+@[^\s@,;<>"()[\]\\]+\.[A-Za-z]{2,}$/
const SEPARATORS = /[\s,;]+/

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const ERROR_COPY = {
  sign_in_required: 'Your session has ended. Sign in again to email the report.',
  email_not_verified: 'To send the report to other people, first confirm your email address. You can still send yourself a copy.',
  invalid_recipients: 'Check the email addresses and try again.',
  too_many_recipients: `You can send to up to ${MAX_RECIPIENTS} people at a time.`,
  no_recipients: 'Add at least one recipient, or send yourself a copy.',
  links_not_allowed: 'Links aren’t allowed in the message or the Prepared for / by lines.',
  text_too_long: 'That text is too long. Shorten the message and try again.',
  invalid_selection: 'This job and location can’t be emailed. Go back and check them again.',
  invalid_rate: 'Enter a client pay rate between $1.00 and $999.99 an hour, then try again.',
  no_benchmark: 'There is no published benchmark for this job and location yet.',
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  copy_limit: 'You’ve sent yourself the most copies allowed today. You can send more tomorrow.',
  bad_origin: 'Please send the report from thestaffingsignal.com.',
  email_unavailable: 'Emailing reports is not available right now. Please try again later.',
  feed_unavailable: 'Market data is not available right now. Please try again later.',
  network_error: 'We couldn’t reach the server. Check your connection and try again.'
}

export function reportEmailSubject(model) {
  const place = model.scope.level === 'nationwide' ? 'across the U.S.' : `in ${model.scope.label}`
  return `Client Pay Market Report: ${model.roleLabel} ${place}`
}

function errorMessage(error) {
  const code = error?.code
  const details = error?.details || {}
  if (code === 'daily_limit') {
    const limit = Number.isSafeInteger(details.dailyLimit) && details.dailyLimit > 0 ? details.dailyLimit : DAILY_RECIPIENT_LIMIT
    const left = Number.isSafeInteger(details.remainingToday) ? details.remainingToday : 0
    return left > 0
      ? `You can email ${left} more ${people(left)} today. Remove some recipients and try again. Copies to yourself still work.`
      : `You’ve reached today’s limit of ${limit} ${people(limit)}. Copies to yourself still work.`
  }
  if (code === 'send_failed') {
    const sent = Number.isSafeInteger(details.sent) ? details.sent : 0
    if (sent > 0 && details.copySent === false) return `Sent to ${sent}, but your copy could not be sent. Press Send to try your copy again.`
    return sent > 0
      ? `Sent to ${sent}, but the rest could not be sent. Please try again for the others.`
      : 'We couldn’t send the report. Please try again.'
  }
  if (ERROR_COPY[code]) return ERROR_COPY[code]
  if (error?.status === 404) return 'Emailing reports is not available yet.'
  return 'Something went wrong sending the report. Please try again.'
}

function plural(n, one, many) {
  return n === 1 ? one : many
}

const people = (n) => plural(n, 'person', 'people')

// Copies to yourself don't count against the daily limit, so a copy-only send
// says nothing about it.
function successMessage({ sent, copySent, remainingToday }) {
  const count = Number.isSafeInteger(sent) ? sent : 0
  if (count === 0) return copySent ? 'Sent a copy to you.' : 'Sent.'
  const first = `Sent to ${count}${copySent ? ', with a copy to you' : ''}.`
  const left = Number.isSafeInteger(remainingToday) ? Math.max(0, remainingToday) : null
  if (left === null) return first
  return left > 0
    ? `${first} You can email ${left} more ${people(left)} today.`
    : `${first} That’s today’s limit for other people. Copies to yourself still work.`
}

// EmailReportDialog({ model, request, onClose, onSignIn })
//   request = { roleKey, state, city, rateCents, preparedFor, preparedBy }
//   onSignIn: offered when the server no longer accepts the session.
// While sending, controls stay focusable (aria-disabled / readOnly) so focus
// never drops to the page; Esc and Tab are handled on the document and the
// rest of the page is inert while the dialog is open.
export default function EmailReportDialog({ model, request, onClose, onSignIn }) {
  const uid = useId().replace(/:/g, '')
  const ids = {
    title: `ssp-email-title-${uid}`,
    to: `ssp-email-to-${uid}`,
    toHint: `ssp-email-tohint-${uid}`,
    toError: `ssp-email-toerror-${uid}`,
    note: `ssp-email-note-${uid}`,
    noteHint: `ssp-email-notehint-${uid}`,
    noteError: `ssp-email-noteerror-${uid}`,
    status: `ssp-email-status-${uid}`
  }

  const [recipients, setRecipients] = useState([])
  const [draft, setDraft] = useState('')
  const [toError, setToError] = useState(null)
  const [sendCopy, setSendCopy] = useState(true)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState(null)
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [confirmLink, setConfirmLink] = useState(null)
  const [result, setResult] = useState(null)
  const [announcement, setAnnouncement] = useState('')

  const wrapperRef = useRef(null)
  const dialogRef = useRef(null)
  const toRef = useRef(null)
  const doneRef = useRef(null)
  const errorRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const sendingRef = useRef(false)
  sendingRef.current = sending

  // Focus the first field on open; lock page scroll; give focus back to the
  // control that opened the dialog when it closes.
  useEffect(() => {
    const opener = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Everything outside the dialog (each ancestor's siblings) becomes inert.
    const madeInert = []
    for (let node = wrapperRef.current; node && node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling === node || sibling.hasAttribute('inert') || sibling.tagName === 'SCRIPT') continue
        sibling.setAttribute('inert', '')
        madeInert.push(sibling)
      }
    }
    toRef.current?.focus()

    function onDocumentKeyDown(event) {
      const dialog = dialogRef.current
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const inside = dialog.contains(document.activeElement)
      if (event.shiftKey && (!inside || document.activeElement === first)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onDocumentKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onDocumentKeyDown, true)
      for (const el of madeInert) el.removeAttribute('inert')
      document.body.style.overflow = previousOverflow
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus()
    }
  }, [])

  useEffect(() => {
    if (result) doneRef.current?.focus()
  }, [result])

  // A failed send: move focus to the message so it is read and Tab continues
  // from inside the dialog.
  useEffect(() => {
    if (formError) errorRef.current?.focus()
  }, [formError])

  function close() {
    if (sendingRef.current) return
    onCloseRef.current?.()
  }

  async function onRequestConfirm() {
    if (confirmLink === 'busy') return
    setConfirmLink('busy')
    try {
      const response = await requestEmailConfirmation()
      setConfirmLink(response?.alreadyConfirmed ? 'already' : 'sent')
    } catch {
      setConfirmLink('error')
    }
  }

  // Turns typed text into chips. Returns the list (so send can use it at once)
  // or null when something typed is not a valid address.
  function commit(text = draft) {
    const parts = text.split(SEPARATORS).map((part) => part.trim()).filter(Boolean)
    if (parts.length === 0) {
      setDraft('')
      return recipients
    }
    const next = [...recipients]
    const bad = []
    const added = []
    let overflow = false
    for (const part of parts) {
      if (!EMAIL.test(part)) { bad.push(part); continue }
      if (next.some((existing) => existing.toLowerCase() === part.toLowerCase())) continue
      if (next.length >= MAX_RECIPIENTS) { overflow = true; continue }
      next.push(part)
      added.push(part)
    }
    setRecipients(next)
    if (added.length) setAnnouncement(`Added ${added.join(', ')}. ${next.length} of ${MAX_RECIPIENTS} recipients.`)
    setDraft(bad.join(', '))
    if (bad.length) setToError(`${bad.length === 1 ? `“${bad[0]}” isn’t` : 'Some entries aren’t'} a valid email address.`)
    else if (overflow) setToError(`You can send to up to ${MAX_RECIPIENTS} people at a time.`)
    else setToError(null)
    return bad.length ? null : next
  }

  function onToKeyDown(event) {
    if (sendingRef.current) return
    if (event.key === 'Enter' || event.key === ',' || event.key === ';' || (event.key === ' ' && draft.trim() !== '')) {
      event.preventDefault()
      commit()
    } else if (event.key === 'Backspace' && draft === '' && recipients.length > 0) {
      const removed = recipients[recipients.length - 1]
      setRecipients((list) => list.slice(0, -1))
      setAnnouncement(`Removed ${removed}. ${recipients.length - 1} of ${MAX_RECIPIENTS} recipients.`)
      setToError(null)
    }
  }

  function onToChange(event) {
    const value = event.target.value
    if (value.trim() === '') {
      setDraft('')
      return
    }
    // Virtual keyboards may not report the separator key, so check the text.
    if (/[\s,;]$/.test(value)) {
      commit(value)
      return
    }
    setDraft(value)
    if (toError) setToError(null)
  }

  function onToPaste(event) {
    const text = event.clipboardData?.getData('text') || ''
    if (!SEPARATORS.test(text.trim())) return
    event.preventDefault()
    commit(`${draft} ${text}`)
  }

  function removeRecipient(address) {
    if (sendingRef.current) return
    setRecipients((list) => list.filter((item) => item !== address))
    setAnnouncement(`Removed ${address}. ${Math.max(0, recipients.length - 1)} of ${MAX_RECIPIENTS} recipients.`)
    setToError(null)
    toRef.current?.focus()
  }

  function onNoteChange(event) {
    const value = event.target.value.slice(0, NOTE_MAX)
    setNote(value)
    setNoteError(containsLink(value) ? 'Links aren’t allowed in the message.' : null)
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (sendingRef.current) return
    if (noteError) return
    setFormError(null)
    setErrorCode(null)
    const list = commit()
    if (list === null) {
      toRef.current?.focus()
      return
    }
    if (list.length === 0 && !sendCopy) {
      setToError('Add at least one recipient, or send yourself a copy.')
      toRef.current?.focus()
      return
    }
    if (containsLink(note)) {
      setNoteError('Links aren’t allowed in the message.')
      return
    }
    setSending(true)
    sendingRef.current = true
    try {
      const response = await emailClientReport({ ...request, recipients: list, sendCopy, note: note.trim() })
      track(EVENTS.REPORT_EMAILED, { roleKey: request.roleKey, geographyLevel: model.scope.level })
      setResult(response)
    } catch (error) {
      // After a partial failure, keep only the people who were not sent it, so
      // a retry does not repeat anyone. The server names their positions in
      // this list (your own address is moved to the copy, so plain list order
      // can be off by one); older responses give only a count in list order.
      const failed = error?.code === 'send_failed' ? error.details || {} : {}
      const sent = Number.isSafeInteger(failed.sent) ? failed.sent : 0
      if (Array.isArray(failed.unsent) && failed.unsent.every(Number.isSafeInteger)) {
        setRecipients(list.filter((_, i) => failed.unsent.includes(i)))
      } else if (sent > 0) setRecipients(list.slice(sent))
      setErrorCode(error?.code || null)
      setFormError(errorMessage(error))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const subject = reportEmailSubject(model)
  const atLimit = recipients.length >= MAX_RECIPIENTS

  return (
    <div ref={wrapperRef} className="ssp-email">
      <div className="ssp-email__backdrop" onClick={close} aria-hidden="true" />
      <div ref={dialogRef} className="ssp-email__dialog" role="dialog" aria-modal="true" aria-labelledby={ids.title}>
        <div className="ssp-email__head">
          <h2 id={ids.title} className="ssp-email__title">Email this report</h2>
          <button type="button" className="ssp-email__close" onClick={close} aria-label="Close" aria-disabled={sending ? 'true' : undefined}>
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {result ? (
          <div className="ssp-email__done">
            <p className="ssp-email__success" role="status">{successMessage(result)}</p>
            <button ref={doneRef} type="button" className="ssp-btn ssp-btn--primary" onClick={close}>Done</button>
          </div>
        ) : (
          <form className="ssp-email__form" onSubmit={onSubmit} noValidate>
            <div className={`ssp-field${toError ? ' has-error' : ''}`}>
              <label className="ssp-field__label" htmlFor={ids.to}>To</label>
              <div className="ssp-email__chips" onClick={() => toRef.current?.focus()}>
                {recipients.map((address) => (
                  <span key={address} className="ssp-email__chip">
                    {address}
                    <button type="button" className="ssp-email__chipx" onClick={() => removeRecipient(address)} aria-label={`Remove ${address}`}>
                      <span aria-hidden="true">×</span>
                    </button>
                  </span>
                ))}
                <input
                  ref={toRef}
                  id={ids.to}
                  className="ssp-email__toinput"
                  type="text"
                  inputMode="email"
                  autoComplete="off"
                  spellCheck="false"
                  value={draft}
                  readOnly={sending}
                  placeholder={recipients.length ? '' : 'name@company.com'}
                  aria-describedby={`${ids.toHint}${toError ? ` ${ids.toError}` : ''}`}
                  aria-invalid={toError ? 'true' : undefined}
                  onChange={onToChange}
                  onKeyDown={onToKeyDown}
                  onPaste={onToPaste}
                  onBlur={() => { if (draft.trim()) commit() }}
                />
              </div>
              <p id={ids.toHint} className="ssp-email__hint">
                {`Up to ${DAILY_RECIPIENT_LIMIT} people a day. Copies to yourself don’t count. `}
                {atLimit ? `That’s the maximum of ${MAX_RECIPIENTS} recipients per email.` : 'Press Enter or comma after each address. Recipients don’t see each other.'}
              </p>
              {toError && <p id={ids.toError} className="ssp-field-error">{toError}</p>}
            </div>

            <label className="ssp-email__check">
              <input
                type="checkbox"
                checked={sendCopy}
                aria-disabled={sending ? 'true' : undefined}
                onChange={(event) => { if (!sendingRef.current) setSendCopy(event.target.checked) }}
              />
              <span>Send me a copy</span>
            </label>

            <div className="ssp-field">
              <p className="ssp-field__label">Subject <span className="ssp-email__optional">(set by The Staffing Signal)</span></p>
              <p className="ssp-email__subject">{subject}</p>
            </div>

            <div className={`ssp-field${noteError ? ' has-error' : ''}`}>
              <label className="ssp-field__label" htmlFor={ids.note}>Message <span className="ssp-email__optional">(optional)</span></label>
              <textarea
                id={ids.note}
                className="ssp-input ssp-email__note"
                rows={4}
                maxLength={NOTE_MAX}
                value={note}
                readOnly={sending}
                aria-describedby={`${ids.noteHint}${noteError ? ` ${ids.noteError}` : ''}`}
                aria-invalid={noteError ? 'true' : undefined}
                onChange={onNoteChange}
              />
              <p id={ids.noteHint} className="ssp-email__hint ssp-email__hint--split">
                <span>Plain text. Links aren’t allowed.</span>
                <span aria-live="polite">{note.length}/{NOTE_MAX}</span>
              </p>
              {noteError && <p id={ids.noteError} className="ssp-field-error">{noteError}</p>}
            </div>

            <p className="ssp-email__attachment">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                <path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M9.5 1.5V5H13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              <span><span className="ssp-visually-hidden">Attachment: </span>{model.fileName} · 2 pages · US Letter</span>
            </p>

            {formError && (
              <div className="ssp-email__problem">
                <p ref={errorRef} className="ssp-email__error" role="alert" tabIndex={-1}>{formError}</p>
                {errorCode === 'sign_in_required' && typeof onSignIn === 'function' && (
                  <button type="button" className="ssp-btn ssp-btn--secondary ssp-btn--sm" onClick={() => onSignIn()}>Sign in again</button>
                )}
                {errorCode === 'email_not_verified' && (
                  confirmLink === 'sent' ? (
                    <p className="ssp-email__hint" role="status">We sent a confirmation link to your email. Open it, press Confirm, then come back and press Send.</p>
                  ) : confirmLink === 'already' ? (
                    <p className="ssp-email__hint" role="status">Your email is already confirmed. Press Send to try again.</p>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ssp-btn ssp-btn--secondary ssp-btn--sm"
                        aria-disabled={confirmLink === 'busy' ? 'true' : undefined}
                        onClick={onRequestConfirm}
                      >
                        {confirmLink === 'busy' ? 'Sending link…' : 'Email me a confirmation link'}
                      </button>
                      {confirmLink === 'error' && <p className="ssp-email__hint" role="status">We couldn’t send the link. Please try again in a few minutes.</p>}
                    </>
                  )
                )}
              </div>
            )}

            <div className="ssp-email__actions">
              <button type="button" className="ssp-btn ssp-btn--secondary" onClick={close} aria-disabled={sending ? 'true' : undefined}>Cancel</button>
              <button type="submit" className="ssp-btn ssp-btn--primary" aria-disabled={sending || noteError ? 'true' : undefined}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
            <p id={ids.status} className="ssp-visually-hidden" role="status">{sending ? 'Sending the report.' : announcement}</p>
          </form>
        )}
      </div>
    </div>
  )
}
