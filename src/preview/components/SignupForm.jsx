import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { basePath, FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import { signup } from '../api.js'
import { STATES, stateByCode } from '../../../shared/signal/geography.js'
import { EVENTS, track } from '../lib/track.js'
import { PASSWORD_HINT, passwordProblem } from '../lib/password.js'
import PasswordField from './PasswordField.jsx'

// Name + Work email + Password + newsletter choice. A successful signup signs
// the visitor in straight away (no email is sent). In the dev preview the
// signup is simulated: nothing is saved to Airtable. Name, email and password
// live only in this form's local state and are cleared after a successful
// submit; the password is never trimmed, logged or tracked.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validate({ name, email, password }) {
  const errors = {}
  const trimmedName = name.trim()
  if (trimmedName === '') errors.name = 'Enter your name.'
  else if (trimmedName.length > 100) errors.name = 'Use 100 characters or fewer.'
  const trimmedEmail = email.trim()
  if (trimmedEmail === '') errors.email = 'Enter your work email.'
  else if (trimmedEmail.length > 254 || !EMAIL_PATTERN.test(trimmedEmail)) errors.email = 'Enter a work email like name@company.com.'
  const pw = passwordProblem(password)
  if (pw) errors.password = pw
  return errors
}

const FIELD_KEYS = ['name', 'email', 'password']
const FIELD_FALLBACK = { name: 'Check your name.', email: 'Check your work email.', password: 'Check your password.' }

function serverFieldErrors(err) {
  const details = err?.details || {}
  const out = {}
  const fields = details.fields || details.fieldErrors || null
  if (fields && typeof fields === 'object') {
    for (const key of FIELD_KEYS) {
      const value = fields[key]
      if (typeof value === 'string' && value) out[key] = value
      else if (value) out[key] = FIELD_FALLBACK[key]
    }
  }
  if (typeof details.field === 'string' && FIELD_KEYS.includes(details.field) && !out[details.field]) {
    out[details.field] = details.message || FIELD_FALLBACK[details.field]
  }
  return out
}

export default function SignupForm({ idPrefix = 'signup', context = null, onSuccess }) {
  const { markSignedUp, reloadSnapshot, returnToComparison, variant, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newsletter, setNewsletter] = useState(true)
  // Optional area: leads the monthly report and email with local trends.
  const [areaState, setAreaState] = useState(context?.state && stateByCode(context.state) ? context.state : '')
  const [areaCity, setAreaCity] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  // The email already has an account: offer Sign in / Forgot password.
  const [accountExists, setAccountExists] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const started = useRef(false)
  const nameRef = useRef(null)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const id = (field) => `${idPrefix}-${field}`
  const base = basePath(site)

  function focusFirst(errs) {
    if (errs.name) nameRef.current?.focus()
    else if (errs.email) emailRef.current?.focus()
    else if (errs.password) passwordRef.current?.focus()
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (submitting) return
    if (!started.current) {
      started.current = true
      track(EVENTS.SIGNUP_STARTED, { variant, roleKey: context?.roleKey || undefined })
    }
    const errs = validate({ name, email, password })
    setErrors(errs)
    setFormError('')
    setAccountExists(false)
    if (errs.name || errs.email || errs.password) {
      focusFirst(errs)
      return
    }
    setSubmitting(true)
    let result
    try {
      result = await signup({ name: name.trim(), email: email.trim(), password, newsletter, context, state: areaState, city: areaState ? areaCity.trim().slice(0, 80) : '' })
    } catch (err) {
      setSubmitting(false)
      if (err?.status === 409 || err?.code === 'account_exists') {
        setAccountExists(true)
        return
      }
      if (err?.status === 429) {
        setFormError('Too many attempts. Please wait a few minutes and try again.')
        return
      }
      const fieldErrs = serverFieldErrors(err)
      if (fieldErrs.name || fieldErrs.email || fieldErrs.password) {
        setErrors(fieldErrs)
        focusFirst(fieldErrs)
      } else {
        setFormError(site ? (err?.message || 'We could not complete your signup. Please try again.') : 'We could not complete the simulated signup. Nothing was saved. Please try again.')
      }
      return
    }
    track(EVENTS.SIGNUP_COMPLETED, { variant, roleKey: context?.roleKey || undefined })
    setName('')
    setEmail('')
    setPassword('')
    setAreaCity('')
    markSignedUp()
    await reloadSnapshot()
    setSubmitting(false)
    const safeResult = {
      ok: true,
      simulated: result?.simulated === true,
      created: result?.created === true,
      newsletter: result?.newsletter === true,
      message: typeof result?.message === 'string' ? result.message : ''
    }
    const returned = returnToComparison(context)
    if (typeof onSuccess === 'function') onSuccess({ ...safeResult, returned })
  }

  const describe = (...ids) => ids.filter(Boolean).join(' ') || undefined

  return (
    <form className="ssp-signup" onSubmit={onSubmit} noValidate aria-describedby={site ? undefined : id('sim')}>
      <div className="ssp-signup__fields">
        <div className={`ssp-field${errors.name ? ' has-error' : ''}`}>
          <label htmlFor={id('name')} className="ssp-field__label">Name</label>
          <input
            id={id('name')}
            ref={nameRef}
            className="ssp-input"
            type="text"
            autoComplete="name"
            maxLength={120}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }))
            }}
            aria-invalid={errors.name ? 'true' : undefined}
            aria-describedby={describe(errors.name && id('name-error'))}
          />
          {errors.name && <p id={id('name-error')} className="ssp-field-error"><span aria-hidden="true">!</span> {errors.name}</p>}
        </div>
        <div className={`ssp-field${errors.email ? ' has-error' : ''}`}>
          <label htmlFor={id('email')} className="ssp-field__label">Work email</label>
          <input
            id={id('email')}
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
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
            }}
            aria-invalid={errors.email ? 'true' : undefined}
            aria-describedby={describe(errors.email && id('email-error'))}
          />
          {errors.email && <p id={id('email-error')} className="ssp-field-error"><span aria-hidden="true">!</span> {errors.email}</p>}
        </div>
        <PasswordField
          id={id('password')}
          label="Password"
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
        <div className="ssp-field">
          <label htmlFor={id('state')} className="ssp-field__label">State <span className="ssp-muted">(optional)</span></label>
          <select id={id('state')} className="ssp-input" value={areaState} autoComplete="address-level1"
            onChange={(e) => { setAreaState(e.target.value); if (!e.target.value) setAreaCity('') }}>
            <option value="">Choose your state</option>
            {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </div>
        <div className="ssp-field">
          <label htmlFor={id('city')} className="ssp-field__label">City <span className="ssp-muted">(optional)</span></label>
          <input id={id('city')} className="ssp-input" type="text" autoComplete="address-level2" maxLength={80}
            value={areaCity} disabled={!areaState} placeholder={areaState ? 'e.g. Houston' : 'Choose a state first'}
            onChange={(e) => setAreaCity(e.target.value)} aria-describedby={id('area-hint')} />
        </div>
        <p id={id('area-hint')} className="ssp-muted ssp-signup__hint">Add your area and The Monthly Signal leads with your local trends.</p>
      </div>

      <div className="ssp-check">
        <input
          id={id('newsletter')}
          type="checkbox"
          checked={newsletter}
          onChange={(e) => setNewsletter(e.target.checked)}
        />
        <label htmlFor={id('newsletter')}>
          Email me The Monthly Signal (monthly). You can unsubscribe anytime; free access stays.
        </label>
      </div>

      <div className="ssp-signup__actions">
        <button type="submit" className="ssp-btn ssp-btn--primary ssp-btn--lg" disabled={submitting} aria-busy={submitting ? 'true' : undefined}>
          {submitting ? 'Getting access…' : 'Get free access'}
        </button>
      </div>

      {formError && <p className="ssp-field-error ssp-signup__error" role="alert">{formError}</p>}
      {accountExists && (
        <p className="ssp-auth__alert ssp-signup__error" role="alert">
          An account with this email already exists.{' '}
          {/* The typed email rides along in router state (never in the URL). */}
          <Link to={`${base}/sign-in`} state={{ email: email.trim() }} className="ssp-link">Sign in</Link>, or use{' '}
          <Link to={`${base}/forgot-password`} state={{ email: email.trim() }} className="ssp-link">Forgot password</Link> to set a new one.
        </p>
      )}

      {!site && (
        <p id={id('sim')} className="ssp-signup__sim">
          <span className="ssp-chip ssp-chip--dev">Simulated</span>{' '}
          Nothing is saved to Airtable and no email is sent from this preview.
        </p>
      )}
    </form>
  )
}
