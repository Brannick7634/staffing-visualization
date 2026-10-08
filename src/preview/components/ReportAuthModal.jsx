import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { basePath, FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import { gateChips } from '../lib/reportGate.js'
import SignupForm from './SignupForm.jsx'
import '../styles/modal.css'

// The Client Pay Market Report sign-up gate. Mounted once inside the .ssp root
// (the design tokens live there) and shown while PreviewContext's
// reportGateOpen is true. The rest of the page is made inert while it is open;
// focus is trapped inside, Esc or the close button closes it, and focus goes
// back to where it was. The "Your search" chips show the job, place and the
// client pay rate held in memory; nothing here stores or sends the rate.

const BENEFITS = [
  'A two-page, client-ready report on US Letter paper',
  'Print it, download the PDF or email it to your client',
  'Market median, competitive range and local market activity in one place'
]

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

function ReportIcon() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
      <path d="M8 3.5h11l6 6V27a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 7 27V5a1.5 1.5 0 0 1 1-1.5z" fill="none" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M19 3.5V9.5h6" fill="none" strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="11" y="18" width="3" height="6" rx="0.8" className="ssp-modal__icon-bar" />
      <rect x="15.5" y="15" width="3" height="9" rx="0.8" className="ssp-modal__icon-bar" />
      <rect x="20" y="12" width="3" height="12" rx="0.8" className="ssp-modal__icon-bar" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M5 5l10 10M15 5L5 15" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function visibleFocusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => el.getClientRects().length > 0)
}

function ReportAuthDialog() {
  const { closeReportGate, takeGateOpener, pendingReturn, rateInput, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const base = basePath(site)
  const navigate = useNavigate()
  const [signupOpen, setSignupOpen] = useState(false)
  const overlayRef = useRef(null)
  const dialogRef = useRef(null)
  const closeRef = useRef(closeReportGate)
  closeRef.current = closeReportGate
  const takeOpenerRef = useRef(takeGateOpener)
  takeOpenerRef.current = takeGateOpener

  const chips = gateChips({ selection: pendingReturn?.selection || null, rateInput })

  // Open: remember the focused element, make the rest of the page inert, lock
  // page scroll and move focus into the dialog. Close: undo all of it.
  useEffect(() => {
    const overlay = overlayRef.current
    const dialog = dialogRef.current
    const returnTo = document.activeElement
    const madeInert = []
    const root = overlay?.parentElement
    if (root) {
      for (const el of Array.from(root.children)) {
        if (el === overlay || el.hasAttribute('inert')) continue
        el.setAttribute('inert', '')
        madeInert.push(el)
      }
    }
    document.body.classList.add('ssp-modal-open')
    dialog?.focus({ preventScroll: true })

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const nodes = visibleFocusables(dialog)
      if (nodes.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      const inside = dialog.contains(active)
      if (event.shiftKey && (!inside || active === first || active === dialog)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      for (const el of madeInert) el.removeAttribute('inert')
      document.body.classList.remove('ssp-modal-open')
      // Back to the control that opened the gate. When the results card
      // re-rendered meanwhile, use its twin (same data-gate-opener), then the
      // calculator's main button.
      const opener = typeof takeOpenerRef.current === 'function' ? takeOpenerRef.current() : null
      const usable = (el) => el && el !== document.body && el.isConnected && typeof el.focus === 'function'
      const twin = opener?.key ? document.querySelector(`[data-gate-opener="${CSS.escape(opener.key)}"]`) : null
      const target = [returnTo, opener?.el, twin, document.getElementById('ssp-check')].find(usable)
      if (target) target.focus({ preventScroll: true })
    }
  }, [])

  // Expanding the sign-up form moves focus to its first field.
  useEffect(() => {
    if (!signupOpen) return
    const field = document.getElementById('report-gate-name')
    if (field) field.focus()
  }, [signupOpen])

  function onBackdrop(event) {
    if (event.target === overlayRef.current) closeReportGate()
  }

  function onSignIn() {
    // pendingReturn is kept: signing in on /sign-in ends on the report.
    closeReportGate()
    navigate(`${base}/sign-in`)
  }

  return (
    <div className="ssp-modal" ref={overlayRef} onMouseDown={onBackdrop}>
      <div
        ref={dialogRef}
        className="ssp-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ssp-report-gate-title"
        aria-describedby="ssp-report-gate-text"
        tabIndex={-1}
      >
        <button type="button" className="ssp-modal__close" aria-label="Close" onClick={closeReportGate}>
          <CloseIcon />
        </button>

        <div className="ssp-modal__head">
          <span className="ssp-modal__icon"><ReportIcon /></span>
          <h2 id="ssp-report-gate-title" className="ssp-modal__title">Create your Client Pay Market Report</h2>
          <p id="ssp-report-gate-text" className="ssp-modal__text">
            Create and download a customized Client Pay Market Report in seconds. It’s free.
          </p>
        </div>

        {chips.length > 0 && (
          <div className="ssp-modal__search">
            <p id="ssp-report-gate-search" className="ssp-modal__label">Your search</p>
            <ul className="ssp-modal__chips" aria-labelledby="ssp-report-gate-search">
              {chips.map((chip) => (
                <li key={chip.key} className={`ssp-modal__chip ssp-modal__chip--${chip.key}`}>{chip.text}</li>
              ))}
            </ul>
          </div>
        )}

        <ul className="ssp-modal__benefits">
          {BENEFITS.map((item) => <li key={item}>{item}</li>)}
        </ul>

        <div className="ssp-modal__actions">
          <button
            type="button"
            className="ssp-btn ssp-btn--primary ssp-btn--lg ssp-modal__action"
            aria-expanded={signupOpen}
            aria-controls="ssp-report-gate-signup"
            onClick={() => setSignupOpen((value) => !value)}
          >
            Sign Up Free
          </button>
          <button type="button" className="ssp-btn ssp-btn--secondary ssp-btn--lg ssp-modal__action" onClick={onSignIn}>
            Sign In
          </button>
        </div>

        <div id="ssp-report-gate-signup" className="ssp-modal__signup" hidden={!signupOpen}>
          {signupOpen && (
            <SignupForm
              idPrefix="report-gate"
              context={pendingReturn}
              submitLabel="Create my free account"
              onSuccess={() => closeReportGate()}
            />
          )}
        </div>

        <p className="ssp-modal__fine">Free account · no credit card</p>
        <p className="ssp-modal__sample">
          <Link to={`${base}/sample-report`} className="ssp-link" onClick={() => closeReportGate()}>
            See the sample report first <span aria-hidden="true">→</span>
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function ReportAuthModal() {
  const { reportGateOpen } = usePreview()
  if (!reportGateOpen) return null
  return <ReportAuthDialog />
}
