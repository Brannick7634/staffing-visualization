import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ACCESS } from '../../../shared/signal/contract.js'
import { signIn } from '../api.js'
import PasswordField from '../components/PasswordField.jsx'
import { stateEmail } from '../lib/password.js'
import { basePath, FORCE_SITE, usePreview } from '../PreviewContext.jsx'

// Returning subscribers: work email + password (POST /api/auth/login). The
// server gives the same answer for an unknown email, an account without a
// password and a wrong password, so this page never says which emails exist.
// The password lives only in this component's state and is cleared on success.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function errorMessage(error) {
  if (error?.status === 401) return 'Email or password is incorrect.'
  if (error?.status === 429) return 'Too many attempts. Please wait a few minutes and try again.'
  if (error?.status === 400) return 'Enter your work email and password.'
  if (error?.status === 0) return 'We could not reach the server. Check your connection and try again.'
  return 'Something went wrong. Please try again.'
}

export default function SignInPage() {
  const { access, homePath, reloadSnapshot, returnAfterAuth, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const base = basePath(site)
  const navigate = useNavigate()
  const location = useLocation()
  // Email typed in the signup form (router state, never the URL), if any.
  const [email, setEmail] = useState(() => stateEmail(location.state))
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)

  // Old one-time sign-in emails now redirect here with a dead ?token=; drop it
  // from the address bar.
  useEffect(() => {
    if (new URLSearchParams(location.search).has('token')) {
      navigate({ pathname: location.pathname, hash: location.hash }, { replace: true })
    }
  }, [location.search, location.pathname, location.hash, navigate])

  async function onSubmit(event) {
    event.preventDefault()
    if (busy) return
    const value = email.trim().toLowerCase()
    const errs = {}
    if (!EMAIL_RE.test(value) || value.length > 254) errs.email = 'Enter a valid work email address.'
    if (password === '') errs.password = 'Enter your password.'
    setErrors(errs)
    setFormError(null)
    if (errs.email || errs.password) {
      if (errs.email) emailRef.current?.focus()
      else passwordRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      await signIn({ email: value, password })
    } catch (error) {
      setBusy(false)
      setFormError(errorMessage(error))
      return
    }
    setPassword('')
    await reloadSnapshot()
    setBusy(false)
    // On to the report they were creating (or the comparison they were on),
    // else the pay data on the homepage.
    const returned = returnAfterAuth()
    if (!returned) navigate({ pathname: homePath, hash: '#pay-check' })
  }

  const signedIn = access === ACCESS.AUTHORIZED && !busy

  return (
    <section className="ssp-section ssp-page">
      <div className="ssp-container ssp-freeaccess">
        <div className="ssp-freeaccess__intro">
          <p className="ssp-eyebrow">Sign in</p>
          <h1 className="ssp-page__title">Welcome back.</h1>
          <p className="ssp-lede">
            Sign in with your work email and password to create, print, download and email Client Pay Market Reports,
            and to see full city rankings.
          </p>
          <ul className="ssp-ticks">
            <li>You stay signed in on this device for 30 days, or until you sign out.</li>
            <li>Forgot your password? We'll email you a reset link. It works once, for 60 minutes.</li>
          </ul>
        </div>

        <div className="ssp-card ssp-freeaccess__card">
          {signedIn ? (
            <div className="ssp-freeaccess__done" role="status">
              <h2 className="ssp-card__title">You're already signed in.</h2>
              <p>You can create, print, download and email Client Pay Market Reports on this device.</p>
              <div className="ssp-freeaccess__links">
                <Link to={{ pathname: homePath, hash: '#pay-check' }} className="ssp-btn ssp-btn--primary">Go to pay data</Link>
                <Link to={`${base}/preferences`} className="ssp-btn ssp-btn--secondary">My preferences</Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="ssp-card__title">Sign in</h2>
              <form className="ssp-signup" onSubmit={onSubmit} noValidate>
                <div className="ssp-signup__fields">
                  <div className={`ssp-field ssp-signup__full${errors.email ? ' has-error' : ''}`}>
                    <label htmlFor="signin-email" className="ssp-field__label">Work email</label>
                    <input
                      id="signin-email"
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
                        if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
                      }}
                      aria-invalid={errors.email ? 'true' : undefined}
                      aria-describedby={errors.email ? 'signin-email-error' : undefined}
                    />
                    {errors.email && (
                      <p id="signin-email-error" className="ssp-field-error"><span aria-hidden="true">!</span> {errors.email}</p>
                    )}
                  </div>
                  <PasswordField
                    id="signin-password"
                    label="Password"
                    value={password}
                    autoComplete="current-password"
                    error={errors.password || null}
                    inputRef={passwordRef}
                    className="ssp-signup__full"
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }))
                    }}
                  />
                </div>
                <div className="ssp-auth__row">
                  <Link to={`${base}/forgot-password`} className="ssp-link">Forgot password?</Link>
                </div>
                {formError && (
                  <p className="ssp-field-error ssp-signup__error" role="alert"><span aria-hidden="true">!</span> {formError}</p>
                )}
                <div className="ssp-signup__actions">
                  <button type="submit" className="ssp-btn ssp-btn--primary ssp-btn--lg" aria-busy={busy ? 'true' : undefined} disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                  </button>
                </div>
                {!site && (
                  <p className="ssp-signup__sim">
                    <span className="ssp-chip ssp-chip--dev">Simulated</span>{' '}
                    Development preview: sign-in uses the in-memory dev accounts.
                  </p>
                )}
              </form>
              <p className="ssp-muted ssp-freeaccess__next">
                Signed up before we added passwords? Use{' '}
                <Link to={`${base}/forgot-password`} className="ssp-link">Forgot password</Link> to set one.
              </p>
              <p className="ssp-muted ssp-freeaccess__next">
                New here? <Link to={`${base}/free-access`} className="ssp-link">Sign up free</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
