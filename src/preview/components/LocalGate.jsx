import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { basePath, FORCE_SITE, usePreview } from '../PreviewContext.jsx'

// Contextual gate shown only when a publishable local benchmark exists and the
// visitor is signed out. It carries no local figures (the server never sent
// any). Copy follows brief §9 with the visitor's own rate and place.
export function shortRate(rateCents) {
  if (!Number.isSafeInteger(rateCents) || rateCents <= 0) return null
  const dollars = Math.floor(rateCents / 100)
  const cents = rateCents % 100
  const whole = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return cents === 0 ? `$${whole}` : `$${whole}.${String(cents).padStart(2, '0')}`
}

export default function LocalGate({ rateCents, placeName, onUnlock, signup = null }) {
  const { site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const panelRef = useRef(null)
  const rate = shortRate(rateCents)
  const heading = rate ? `See how ${rate}/hour compares in ${placeName}.` : `See how your rate compares in ${placeName}.`

  useEffect(() => {
    if (!open || !panelRef.current) return
    const field = panelRef.current.querySelector('input')
    if (field) field.focus()
  }, [open])

  function handleClick() {
    if (typeof onUnlock === 'function') onUnlock()
    if (signup) setOpen((value) => !value)
  }

  return (
    <div className="ssp-lock ssp-gate">
      <div className="ssp-gate__head">
        <span className="ssp-gate__icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="18" height="18" focusable="false">
            <rect x="4" y="9" width="12" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </span>
        <h3 className="ssp-gate__title">{heading}</h3>
      </div>
      <p className="ssp-gate__body">
        Create a free account (name, work email and a password) to unlock this local benchmark and other available state and city comparisons.
      </p>
      <div className="ssp-gate__actions">
        <button
          type="button"
          className="ssp-btn ssp-btn--primary"
          onClick={handleClick}
          aria-expanded={signup ? open : undefined}
          aria-controls={signup ? panelId : undefined}
        >
          Unlock my local comparison
        </button>
      </div>
      {signup && (
        <p className="ssp-gate__signin ssp-muted">
          Already have free access?{' '}
          {/* onUnlock saves this comparison, so sign-in brings the reader back to it. */}
          <Link
            to={`${basePath(site)}/sign-in`}
            className="ssp-link"
            onClick={() => { if (typeof onUnlock === 'function') onUnlock() }}
          >
            Sign in
          </Link>
        </p>
      )}
      {signup && open && (
        <div id={panelId} ref={panelRef} className="ssp-gate__panel">
          {signup}
        </div>
      )}
    </div>
  )
}
