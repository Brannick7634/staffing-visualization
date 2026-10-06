import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { forgotPassword } from '../api.js'
import { stateEmail } from '../lib/password.js'
import { basePath, FORCE_SITE, usePreview } from '../PreviewContext.jsx'

// Forgot password: POST /api/auth/forgot { email }. The server answers the
// same way whether or not the email has an account (no enumeration) and, when
// it does, emails a reset link that works once, for 60 minutes.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const SENT = 'If that email has an account, a reset link is on its way. It works once, for 60 minutes.'

function errorMessage(error) {
  if (error?.status === 400) return 'Enter a valid work email address.'
  if (error?.status === 429) return 'Too many requests. Please wait a few minutes and try again.'
  if (error?.status === 502) return "We couldn't send the reset email. Please try again."
  if (error?.status === 0) return 'We could not reach the server. Check your connection and try again.'
  return 'Something went wrong. Please try again.'
}

// Dev simulation only: the dev endpoint returns a reset URL instead of
// emailing it. Rebuild it as an in-app path on this mount (/ or /preview) and
// only when it points at this origin's reset page.
function devResetPath(value, base) {
  if (!import.meta.env.DEV || typeof value !== 'string' || value === '') return null
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return null
    if (!/\/reset-password\/?$/.test(url.pathname) || !url.searchParams.get('token')) return null
    return `${base}/reset-password${url.search}`
  } catch {
    return null
  }
}

export default function ForgotPasswordPage() {
  const { site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const base = basePath(site)
  const location = useLocation()
  const [email, setEmail] = useState(() => stateEmail(location.state))
  const [fieldError, setFieldError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [devLink, setDevLink] = useState(null)
  const emailRef = useRef(null)

  async function onSubmit(event) {
    event.preventDefault()
    if (busy) return
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
      const result = await forgotPassword(value)
      if (import.meta.env.DEV) setDevLink(devResetPath(result?.devResetUrl, base))
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

  return (
    <section className="ssp-section ssp-page">
      <div className="ssp-container ssp-freeaccess">
        <div className="ssp-freeaccess__intro">
          <p className="ssp-eyebrow">Forgot password</p>
          <h1 className="ssp-page__title">Set a new password.</h1>
          <p className="ssp-lede">
            Enter the work email you signed up with. We'll email you a link to choose a new password.
          </p>
          <ul className="ssp-ticks">
            <li>The reset link works once, for 60 minutes.</li>
            <li>Signed up before we added passwords? This is how you set your first one.</li>
          </ul>
        </div>

        <div className="ssp-card ssp-freeaccess__card">
          {sent ? (
            <div className="ssp-freeaccess__done" role="status">
              <h2 className="ssp-card__title">Check your inbox.</h2>
              <p>{SENT}</p>
              {import.meta.env.DEV && devLink && (
                <p className="ssp-auth__alert ssp-auth__dev">
                  <span className="ssp-chip ssp-chip--dev">Dev only</span>{' '}
                  No email is sent in the dev preview.{' '}
                  <Link to={devLink} className="ssp-link">Open the reset link</Link>
                </p>
              )}
              <div className="ssp-freeaccess__links">
                <Link to={`${base}/sign-in`} className="ssp-btn ssp-btn--primary">Back to sign in</Link>
                <button
                  type="button"
                  className="ssp-btn ssp-btn--secondary"
                  onClick={() => {
                    setSent(false)
                    setDevLink(null)
                  }}
                >
                  Use a different email
                </button>
              </div>
              <p className="ssp-muted">No email after a few minutes? Check your spam folder.</p>
            </div>
          ) : (
            <>
              <h2 className="ssp-card__title">Email me a reset link</h2>
              <form className="ssp-signup" onSubmit={onSubmit} noValidate>
                <div className="ssp-signup__fields">
                  <div className={`ssp-field ssp-signup__full${fieldError ? ' has-error' : ''}`}>
                    <label htmlFor="forgot-email" className="ssp-field__label">Work email</label>
                    <input
                      id="forgot-email"
                      ref={emailRef}
                      className="ssp-input"
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck="false"
                      maxLength={254}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (fieldError) setFieldError(null)
                      }}
                      aria-invalid={fieldError ? 'true' : undefined}
                      aria-describedby={fieldError ? 'forgot-email-error' : undefined}
                    />
                    {fieldError && (
                      <p id="forgot-email-error" className="ssp-field-error"><span aria-hidden="true">!</span> {fieldError}</p>
                    )}
                  </div>
                </div>
                {formError && (
                  <p className="ssp-field-error ssp-signup__error" role="alert"><span aria-hidden="true">!</span> {formError}</p>
                )}
                <div className="ssp-signup__actions">
                  <button type="submit" className="ssp-btn ssp-btn--primary ssp-btn--lg" aria-busy={busy ? 'true' : undefined} disabled={busy}>
                    {busy ? 'Sending…' : 'Email me a reset link'}
                  </button>
                </div>
              </form>
              <p className="ssp-muted ssp-freeaccess__next">
                Remembered it? <Link to={`${base}/sign-in`} className="ssp-link">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
