import { useRef, useState } from 'react'
import { FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import { signup } from '../api.js'
import { EVENTS, track } from '../lib/track.js'

// Name + Work email + newsletter choice. Simulated in this preview: the dev
// endpoint saves nothing to Airtable and sends no email. Name and email live
// only in this form's local state and are cleared after a successful submit.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validate({ name, email }) {
  const errors = {}
  const trimmedName = name.trim()
  if (trimmedName === '') errors.name = 'Enter your name.'
  else if (trimmedName.length > 100) errors.name = 'Use 100 characters or fewer.'
  const trimmedEmail = email.trim()
  if (trimmedEmail === '') errors.email = 'Enter your work email.'
  else if (trimmedEmail.length > 254 || !EMAIL_PATTERN.test(trimmedEmail)) errors.email = 'Enter a work email like name@company.com.'
  return errors
}

function serverFieldErrors(err) {
  const details = err?.details || {}
  const out = {}
  const fields = details.fields || details.fieldErrors || null
  if (fields && typeof fields === 'object') {
    for (const key of ['name', 'email']) {
      const value = fields[key]
      if (typeof value === 'string' && value) out[key] = value
      else if (value) out[key] = key === 'name' ? 'Check your name.' : 'Check your work email.'
    }
  }
  if (typeof details.field === 'string' && (details.field === 'name' || details.field === 'email') && !out[details.field]) {
    out[details.field] = details.message || (details.field === 'name' ? 'Check your name.' : 'Check your work email.')
  }
  return out
}

export default function SignupForm({ idPrefix = 'signup', context = null, onSuccess }) {
  const { markSignedUp, reloadSnapshot, returnToComparison, variant, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [newsletter, setNewsletter] = useState(true)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const started = useRef(false)
  const nameRef = useRef(null)
  const emailRef = useRef(null)
  const id = (field) => `${idPrefix}-${field}`

  function focusFirst(errs) {
    if (errs.name) nameRef.current?.focus()
    else if (errs.email) emailRef.current?.focus()
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (submitting) return
    if (!started.current) {
      started.current = true
      track(EVENTS.SIGNUP_STARTED, { variant, roleKey: context?.roleKey || undefined })
    }
    const errs = validate({ name, email })
    setErrors(errs)
    setFormError('')
    if (errs.name || errs.email) {
      focusFirst(errs)
      return
    }
    setSubmitting(true)
    let result
    try {
      result = await signup({ name: name.trim(), email: email.trim(), newsletter, context })
    } catch (err) {
      setSubmitting(false)
      const fieldErrs = serverFieldErrors(err)
      if (fieldErrs.name || fieldErrs.email) {
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

      {!site && (
        <p id={id('sim')} className="ssp-signup__sim">
          <span className="ssp-chip ssp-chip--dev">Simulated</span>{' '}
          Nothing is saved to Airtable and no email is sent from this preview.
        </p>
      )}
    </form>
  )
}
