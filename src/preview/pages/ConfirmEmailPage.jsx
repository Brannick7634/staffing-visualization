import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { confirmEmail } from '../api.js'
import { basePath, FORCE_SITE, usePreview } from '../PreviewContext.jsx'

// Confirm email: opened from the emailed link /confirm-email?token=...
// The token is read once into memory and removed from the address bar. It is
// sent only in the body of POST /api/auth/confirm, and only when the reader
// presses the button (so a mail scanner that opens links confirms nothing).
// A confirmed address lets the account email reports to other people.

function readToken(search) {
  try {
    const value = new URLSearchParams(search).get('token')
    return value && value.length <= 4096 ? value : null
  } catch {
    return null
  }
}

export default function ConfirmEmailPage() {
  const { site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const base = basePath(site)
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => readToken(location.search))
  const [state, setState] = useState(token ? 'ready' : 'invalid')
  const [error, setError] = useState(null)
  const headingRef = useRef(null)

  useEffect(() => {
    if (new URLSearchParams(location.search).has('token')) {
      navigate({ pathname: location.pathname, hash: location.hash }, { replace: true })
    }
  }, [location.search, location.pathname, location.hash, navigate])

  useEffect(() => {
    if (state === 'done' || state === 'invalid') headingRef.current?.focus()
  }, [state])

  async function onConfirm() {
    if (!token || state === 'busy') return
    setState('busy')
    setError(null)
    try {
      await confirmEmail(token)
      setState('done')
    } catch (err) {
      if (err?.code === 'link_expired') {
        setState('invalid')
        return
      }
      setState('ready')
      setError(err?.status === 429
        ? 'Too many attempts. Please wait a few minutes and try again.'
        : err?.status === 0
          ? 'We could not reach the server. Check your connection and try again.'
          : 'Something went wrong. Please try again.')
    }
  }

  let body
  if (state === 'done') {
    body = (
      <div className="ssp-freeaccess__done" role="status">
        <h2 className="ssp-card__title ssp-focus-target" ref={headingRef} tabIndex={-1}>Your email is confirmed.</h2>
        <p>You can now email Client Pay Market Reports to your clients and colleagues.</p>
        <div className="ssp-freeaccess__links">
          <Link to={`${base}/client-report`} className="ssp-btn ssp-btn--primary">Back to my report</Link>
        </div>
      </div>
    )
  } else if (state === 'invalid') {
    body = (
      <div className="ssp-freeaccess__done" role="alert">
        <h2 className="ssp-card__title ssp-focus-target" ref={headingRef} tabIndex={-1}>Link not valid</h2>
        <p>This confirmation link has expired or is incomplete. Open your report, choose Email and ask for a new link.</p>
        <div className="ssp-freeaccess__links">
          <Link to={`${base}/sign-in`} className="ssp-btn ssp-btn--secondary">Sign in</Link>
        </div>
      </div>
    )
  } else {
    body = (
      <>
        <h2 className="ssp-card__title">Confirm your email address</h2>
        <p>Press the button to confirm that this email address is yours.</p>
        {error && <p className="ssp-field-error ssp-signup__error" role="alert"><span aria-hidden="true">!</span> {error}</p>}
        <div className="ssp-signup__actions">
          <button
            type="button"
            className="ssp-btn ssp-btn--primary ssp-btn--lg"
            aria-disabled={state === 'busy' ? 'true' : undefined}
            aria-busy={state === 'busy' ? 'true' : undefined}
            onClick={onConfirm}
          >
            {state === 'busy' ? 'Confirming…' : 'Confirm my email'}
          </button>
        </div>
      </>
    )
  }

  return (
    <section className="ssp-section ssp-page">
      <div className="ssp-container ssp-freeaccess">
        <div className="ssp-freeaccess__intro">
          <p className="ssp-eyebrow">Confirm email</p>
          <h1 className="ssp-page__title">Confirm your email.</h1>
          <p className="ssp-lede">
            A confirmed email address lets you send Client Pay Market Reports to other people. It keeps anyone else from sending them in your name.
          </p>
        </div>
        <div className="ssp-card ssp-freeaccess__card">{body}</div>
      </div>
    </section>
  )
}
