import { useState } from 'react'

// Labelled password input with a Show/Hide toggle. The value lives only in the
// parent form's state; it is never logged, stored or sent to analytics.
export default function PasswordField({
  id,
  label = 'Password',
  value,
  onChange,
  autoComplete = 'current-password',
  hint = null,
  error = null,
  inputRef = null,
  className = ''
}) {
  const [visible, setVisible] = useState(false)
  const hintId = hint ? `${id}-hint` : null
  const errorId = error ? `${id}-error` : null
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`ssp-field${error ? ' has-error' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={id} className="ssp-field__label">{label}</label>
      <div className="ssp-password">
        <input
          id={id}
          ref={inputRef}
          className="ssp-input"
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          value={value}
          onChange={onChange}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
        />
        {/* Toggle button: the accessible name stays "Show <label>" and
            aria-pressed says whether the characters are shown; the visible
            text switches between Show and Hide for sighted users. */}
        <button
          type="button"
          className="ssp-password__toggle"
          aria-label={`Show ${label.toLowerCase()}`}
          aria-pressed={visible ? 'true' : 'false'}
          aria-controls={id}
          onClick={() => setVisible((v) => !v)}
        >
          <span aria-hidden="true">{visible ? 'Hide' : 'Show'}</span>
        </button>
      </div>
      {hint && <p id={hintId} className="ssp-muted ssp-password__hint">{hint}</p>}
      {error && <p id={errorId} className="ssp-field-error"><span aria-hidden="true">!</span> {error}</p>}
    </div>
  )
}
