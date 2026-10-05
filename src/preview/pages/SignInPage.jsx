import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ACCESS } from '../../../shared/signal/contract.js'
import { requestMagicLink } from '../api.js'
import { basePath, FORCE_SITE, usePreview } from '../PreviewContext.jsx'

// Returning subscribers: enter a work email, get a one-time sign-in link
// (POST /api/auth/magic-link). The server answers the same way whether or not
// the email is signed up, so this page never says which emails exist.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function errorMessage(error) {
  if (error?.status === 400) return 'Enter a valid work email address.'
  if (error?.status === 429) return 'Too many sign-in requests. Please wait a few minutes and try again.'
  if (error?.status === 502) return "We couldn't send the sign-in email. Please try again."
  return 'Something went wrong. Please try again.'
}

export default function SignInPage() {
  const { access, homePath, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const base = basePath(site)
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const emailRef = useRef(null)

  async function onSubmit(event) {
    event.preventDefault()
    const value = email.trim().toLowerCase()
    if (!EMAIL_RE.test(value) || value.length > 254) {
      setFieldError('Enter a valid work email address.')
      emailRef.current?.focus()
      return
    }
    setFieldError(null)
    setFormError(null)
    setBusy(true)
    try {
      await requestMagicLink(value)
      setSent(true)
    } catch (error) {
      if (error?.status === 400) {
        setFieldError(errorMessage(error))
        emailRef.current?.focus()
      } else {
        setFormError(errorMessage(error))
      }
    } finally {
      setBusy(false)
    }
  }

  const signedIn = access === ACCESS.AUTHORIZED

  return (
    <section className="ssp-section ssp-page">
      <div className="ssp-container ssp-freeaccess">
        <div className="ssp-freeaccess__intro">
          <p className="ssp-eyebrow">Sign in</p>
          <h1 className="ssp-page__title">Welcome back.</h1>
          <p className="ssp-lede">
            Already have free access? Enter your work email and we'll send you a one-time sign-in link. No password
            needed.
          </p>
          <ul className="ssp-ticks">
            <li>The link works once, for 15 minutes.</li>
            <li>Open it on the device you want to use. You stay signed in there for 30 days.</li>
          </ul>
        </div>

        <div className="ssp-card ssp-freeaccess__card">
          {signedIn ? (
            <div className="ssp-freeaccess__done" role="status">
              <h2 className="ssp-card__title">You're already signed in.</h2>
              <p>Local comparisons and full rankings are unlocked on this device.</p>
              <div className="ssp-freeaccess__links">
                <Link to={{ pathname: homePath, hash: '#pay-check' }} className="ssp-btn ssp-btn--primary">Go to the pay check</Link>
                <Link to={`${base}/preferences`} className="ssp-btn ssp-btn--secondary">My preferences</Link>
              </div>
            </div>
          ) : sent ? (
            <div className="ssp-freeaccess__done" role="status">
              <h2 className="ssp-card__title">Check your inbox.</h2>
              <p>
                If {email.trim()} is signed up, a sign-in link is on its way. Open it on this device. The link works
                once, for 15 minutes.
              </p>
              {!site && <p className="ssp-muted">Development preview: simulated. No email was sent.</p>}
              <div className="ssp-freeaccess__links">
                <button type="button" className="ssp-btn ssp-btn--secondary" onClick={() => setSent(false)}>
                  Use a different email
                </button>
              </div>
              <p className="ssp-muted">
                No email after a few minutes? Check your spam folder, or{' '}
                <Link to={`${base}/free-access`} className="ssp-link">get free access</Link> if you haven't signed up yet.
              </p>
            </div>
          ) : (
            <>
              <h2 className="ssp-card__title">Email me a sign-in link</h2>
              <form className="ssp-signup" onSubmit={onSubmit} noValidate>
                <div className="ssp-signup__fields">
                  <div className={`ssp-field${fieldError ? ' has-error' : ''}`}>
                    <label htmlFor="signin-email" className="ssp-field__label">Work email</label>
                    <input
                      id="signin-email"
                      ref={emailRef}
                      className="ssp-input"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck="false"
                      maxLength={254}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (fieldError) setFieldError(null)
                      }}
                      aria-invalid={fieldError ? 'true' : undefined}
                      aria-describedby={fieldError ? 'signin-email-error' : undefined}
                    />
                    {fieldError && (
                      <p id="signin-email-error" className="ssp-field-error"><span aria-hidden="true">!</span> {fieldError}</p>
                    )}
                  </div>
                </div>
                {formError && <p className="ssp-field-error" role="alert"><span aria-hidden="true">!</span> {formError}</p>}
                <button type="submit" className="ssp-btn ssp-btn--primary" aria-busy={busy ? 'true' : undefined} disabled={busy}>
                  {busy ? 'Sending…' : 'Email me a sign-in link'}
                </button>
              </form>
              <p className="ssp-muted ssp-freeaccess__next">
                New here? <Link to={`${base}/free-access`} className="ssp-link">Get free access</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
