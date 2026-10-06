import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { resetPassword } from '../api.js'
import PasswordField from '../components/PasswordField.jsx'
import { PASSWORD_HINT, passwordProblem } from '../lib/password.js'
import { basePath, FORCE_SITE, usePreview } from '../PreviewContext.jsx'

// Reset password: opened from the emailed link /reset-password?token=...
// The token is read once into memory and immediately removed from the address
// bar (so it is not kept in history, bookmarks or shared links). It is only
// ever sent in the body of POST /api/auth/reset, never to analytics. Success
// sets a new password and signs the visitor in.

const LINK_MESSAGES = {
  link_expired: "This reset link has expired or isn't valid.",
  link_used: 'This reset link was already used.',
  missing: 'This reset link is incomplete. Open the link from your email again, or ask for a new one.'
}

function readToken(search) {
  try {
    const value = new URLSearchParams(search).get('token')
    return value && value.length <= 4096 ? value : null
  } catch {
    return null
  }
}

export default function ResetPasswordPage() {
  const { homePath, reloadSnapshot, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const base = basePath(site)
  const location = useLocation()
  const navigate = useNavigate()
  // Read once on first render; later renders (after the URL is cleaned) keep it.
  const [token] = useState(() => readToken(location.search))
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [linkProblem, setLinkProblem] = useState(token ? null : 'missing')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const passwordRef = useRef(null)
  const confirmRef = useRef(null)
  // After a submit swaps the form for a result panel, move keyboard focus to
  // that panel's heading so keyboard users keep their place.
  const panelHeadingRef = useRef(null)
  const [focusPanel, setFocusPanel] = useState(false)
  useEffect(() => {
    if (!focusPanel) return
    panelHeadingRef.current?.focus()
    setFocusPanel(false)
  }, [focusPanel, linkProblem, done])

  // Drop ?token= from the address bar (history.replaceState via the router).
  useEffect(() => {
    if (new URLSearchParams(location.search).has('token')) {
      navigate({ pathname: location.pathname, hash: location.hash }, { replace: true })
    }
  }, [location.search, location.pathname, location.hash, navigate])

  async function onSubmit(event) {
    event.preventDefault()
    if (busy || !token) return
    const errs = {}
    const problem = passwordProblem(password)
    if (problem) errs.password = problem
    else if (confirm !== password) errs.confirm = 'The two passwords do not match.'
    setErrors(errs)
    setFormError(null)
    if (errs.password) {
      passwordRef.current?.focus()
      return
    }
    if (errs.confirm) {
      confirmRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      await resetPassword({ token, password })
    } catch (error) {
      setBusy(false)
      if (error?.code === 'link_expired' || error?.code === 'link_used') {
        setLinkProblem(error.code)
        setFocusPanel(true)
        return
      }
      if (error?.status === 400) {
        const message = error?.details?.fields?.password || error?.message || 'Check your new password.'
        setErrors({ password: message })
        passwordRef.current?.focus()
        return
      }
      if (error?.status === 429) setFormError('Too many attempts. Please wait a few minutes and try again.')
      else if (error?.status === 0) setFormError('We could not reach the server. Check your connection and try again.')
      else setFormError('Something went wrong. Please try again.')
      return
    }
    setPassword('')
    setConfirm('')
    await reloadSnapshot()
    setBusy(false)
    setDone(true)
    setFocusPanel(true)
  }

  let body
  if (done) {
    body = (
      <div className="ssp-freeaccess__done" role="status">
        <h2 className="ssp-card__title ssp-focus-target" ref={panelHeadingRef} tabIndex={-1}>Your new password is set.</h2>
        <p>You're signed in. Local comparisons and full rankings are unlocked on this device.</p>
        <div className="ssp-freeaccess__links">
          <Link to={{ pathname: homePath, hash: '#pay-check' }} className="ssp-btn ssp-btn--primary">Go to the pay check</Link>
          <Link to={`${base}/preferences`} className="ssp-btn ssp-btn--secondary">My preferences</Link>
        </div>
      </div>
    )
  } else if (linkProblem) {
    body = (
      <div className="ssp-freeaccess__done" role="alert">
        <h2 className="ssp-card__title ssp-focus-target" ref={panelHeadingRef} tabIndex={-1}>{linkProblem === 'link_used' ? 'Link already used' : 'Link not valid'}</h2>
        <p>{LINK_MESSAGES[linkProblem] || LINK_MESSAGES.link_expired}</p>
        <div className="ssp-freeaccess__links">
          <Link to={`${base}/forgot-password`} className="ssp-btn ssp-btn--primary">Get a new reset link</Link>
          <Link to={`${base}/sign-in`} className="ssp-btn ssp-btn--secondary">Sign in</Link>
        </div>
      </div>
    )
  } else {
    body = (
      <>
        <h2 className="ssp-card__title">Choose a new password</h2>
        <form className="ssp-signup" onSubmit={onSubmit} noValidate>
          <div className="ssp-signup__fields">
            <PasswordField
              id="reset-password"
              label="New password"
              value={password}
              autoComplete="new-password"
              hint={PASSWORD_HINT}
              error={errors.password || null}
              inputRef={passwordRef}
              className="ssp-signup__full"
              onChange={(e) => {
                setPassword(e.target.value)
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }))
              }}
            />
            <PasswordField
              id="reset-confirm"
              label="Confirm new password"
              value={confirm}
              autoComplete="new-password"
              error={errors.confirm || null}
              inputRef={confirmRef}
              className="ssp-signup__full"
              onChange={(e) => {
                setConfirm(e.target.value)
                if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: undefined }))
              }}
            />
          </div>
          {formError && (
            <p className="ssp-field-error ssp-signup__error" role="alert"><span aria-hidden="true">!</span> {formError}</p>
          )}
          <div className="ssp-signup__actions">
            <button type="submit" className="ssp-btn ssp-btn--primary ssp-btn--lg" aria-busy={busy ? 'true' : undefined} disabled={busy}>
              {busy ? 'Saving…' : 'Set password and sign in'}
            </button>
          </div>
        </form>
      </>
    )
  }

  return (
    <section className="ssp-section ssp-page">
      <div className="ssp-container ssp-freeaccess">
        <div className="ssp-freeaccess__intro">
          <p className="ssp-eyebrow">Reset password</p>
          <h1 className="ssp-page__title">Choose a new password.</h1>
          <p className="ssp-lede">
            Pick a password you don't use anywhere else. Once it's saved you'll be signed in on this device.
          </p>
          <ul className="ssp-ticks">
            <li>At least 8 characters.</li>
            <li>We store only a one-way hash of it. We never see or email your password.</li>
          </ul>
        </div>
        <div className="ssp-card ssp-freeaccess__card">{body}</div>
      </div>
    </section>
  )
}
