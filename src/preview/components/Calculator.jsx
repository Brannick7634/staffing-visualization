import { useEffect, useMemo, useRef, useState } from 'react'
import { citiesForState, STATES } from '../../../shared/signal/geography.js'
import { parseHourlyRate } from '../../../shared/signal/money.js'
import { EXAMPLE_ROLES, roleByKey, rolesForSector, SECTORS, sectorForRole } from '../../../shared/signal/taxonomy.js'
import { usePreview } from '../PreviewContext.jsx'
import { EVENTS, track } from '../lib/track.js'

// "Check a pay rate": Sector -> Job -> State -> City -> Your hourly pay.
// The typed rate is validated here with the shared parser and kept in memory
// only; it is never put in a URL, storage or an analytics event.

function useMediaQuery(query) {
  const get = () => {
    try {
      return window.matchMedia(query).matches
    } catch {
      return false
    }
  }
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    let mql
    try {
      mql = window.matchMedia(query)
    } catch {
      return undefined
    }
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function firstBenchmarkedRole(sectorKey, benchmarked) {
  const roles = rolesForSector(sectorKey)
  const withBenchmark = roles.find((role) => benchmarked.has(role.key))
  return (withBenchmark || roles[0] || null)?.key || null
}

function groupRoles(roles) {
  const groups = []
  for (const role of roles) {
    const group = role.group || null
    const last = groups[groups.length - 1]
    if (last && last.group === group) last.roles.push(role)
    else groups.push({ group, roles: [role] })
  }
  return groups
}

function Field({ id, label, error, children, className = '' }) {
  return (
    <div className={`ssp-field${error ? ' has-error' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={id} className="ssp-field__label">{label}</label>
      {children}
      {error && (
        <p id={`${id}-error`} className="ssp-field-error">
          <span aria-hidden="true">!</span> {error}
        </p>
      )}
    </div>
  )
}

export default function Calculator({ idPrefix = 'ssp', layout = 'card', collapsibleLocal = false, onChecked }) {
  const {
    selection, setSelection, rateInput, setRateInput, runPayCheck, snapshot, focusRequest, variant, payCheck
  } = usePreview()
  const [errors, setErrors] = useState({})
  const [localOpen, setLocalOpen] = useState(false)
  const narrow = useMediaQuery('(max-width: 639.98px)')
  const collapsed = collapsibleLocal && narrow && !localOpen

  const roleRef = useRef(null)
  const stateRef = useRef(null)
  const rateRef = useRef(null)
  const id = (name) => `${idPrefix}-${name}`

  const benchmarked = useMemo(() => {
    const keys = (snapshot?.nationalPay || [])
      .filter((entry) => entry && entry.coverage === 'publishable')
      .map((entry) => entry.roleKey)
    return new Set(keys)
  }, [snapshot])
  const knowsBenchmarks = benchmarked.size > 0

  const sectorRoles = rolesForSector(selection.sectorKey)
  // Long lists (Healthcare) carry a `group` per role: render one <optgroup>
  // per group, in the order rolesForSector returns them.
  const roleGroups = groupRoles(sectorRoles)
  const roleOption = (role) => (
    <option key={role.key} value={role.key}>
      {role.label}{knowsBenchmarks && !benchmarked.has(role.key) ? ' (no benchmark yet)' : ''}
    </option>
  )
  const cities = selection.state ? citiesForState(selection.state) : []

  // Open the local fields if the visitor already chose a state.
  useEffect(() => {
    if (selection.state) setLocalOpen(true)
  }, [selection.state])

  // Focus requests from elsewhere on the page (example roles, "Compare in my market").
  useEffect(() => {
    if (!focusRequest) return undefined
    const target = focusRequest.field === 'state' ? stateRef : focusRequest.field === 'rate' ? rateRef : roleRef
    if (focusRequest.field === 'state') setLocalOpen(true)
    const frame = window.requestAnimationFrame(() => {
      const el = target.current
      if (!el) return
      el.focus({ preventScroll: true })
      let reduce = false
      try {
        reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      } catch {
        reduce = false
      }
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusRequest])

  function clearError(name) {
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  function onSector(event) {
    const sectorKey = event.target.value
    setSelection({ sectorKey, roleKey: firstBenchmarkedRole(sectorKey, benchmarked), state: null, city: null })
    clearError('role')
  }

  function onRole(event) {
    const roleKey = event.target.value || null
    setSelection({ roleKey })
    clearError('role')
  }

  function onState(event) {
    setSelection({ state: event.target.value || null, city: null })
  }

  function onCity(event) {
    setSelection({ city: event.target.value || null })
  }

  function onRate(event) {
    const value = event.target.value
    setRateInput(value)
    if (errors.rate && parseHourlyRate(value).ok) clearError('rate')
  }

  function pickExample(roleKey) {
    const sector = sectorForRole(roleKey)
    if (!sector) return
    setSelection({ sectorKey: sector.key, roleKey, state: null, city: null })
    setErrors({})
  }

  function onSubmit(event) {
    event.preventDefault()
    const parsed = parseHourlyRate(rateInput)
    const next = {}
    if (!selection.roleKey || !roleByKey(selection.roleKey)) {
      next.role = selection.sectorKey === 'professional'
        ? 'No title-level pay benchmarks for professional roles in our data. Choose another sector.'
        : 'Choose a job to compare.'
    }
    if (!parsed.ok) next.rate = parsed.message
    setErrors(next)
    if (next.role || next.rate) {
      const first = next.role ? roleRef.current : rateRef.current
      if (first) first.focus()
      return
    }
    track(EVENTS.PAY_CHECK_STARTED, {
      roleKey: selection.roleKey,
      sectorKey: selection.sectorKey,
      geographyLevel: selection.city ? 'city' : selection.state ? 'state' : 'nationwide',
      variant
    })
    runPayCheck({ selection, rateCents: parsed.cents })
    if (typeof onChecked === 'function') onChecked()
  }

  const describe = (...ids) => ids.filter(Boolean).join(' ') || undefined
  const busy = payCheck.requestState === 'loading'
  const localSummary = selection.state
    ? STATES.find((s) => s.code === selection.state)?.name || selection.state
    : 'Nationwide'

  return (
    <form
      className={`ssp-card ssp-calc ssp-calc--${layout}${collapsibleLocal ? ' ssp-calc--collapsible' : ''}`}
      onSubmit={onSubmit}
      noValidate
      aria-labelledby={id('calc-title')}
    >
      <h2 id={id('calc-title')} className="ssp-calc__title">Check a pay rate</h2>

      <div className="ssp-calc__grid">
        <Field id={id('sector')} label="Sector" className="ssp-calc__sector">
          <span className="ssp-select">
            <select id={id('sector')} value={selection.sectorKey || ''} onChange={onSector}>
              {SECTORS.map((sector) => (
                <option key={sector.key} value={sector.key}>{sector.label}</option>
              ))}
            </select>
          </span>
        </Field>

        <Field id={id('role')} label="Job" error={errors.role} className="ssp-calc__role">
          <span className="ssp-select">
            <select
              id={id('role')}
              ref={roleRef}
              value={selection.roleKey || ''}
              onChange={onRole}
              aria-invalid={errors.role ? 'true' : undefined}
              aria-describedby={describe(errors.role && `${id('role')}-error`)}
            >
              {sectorRoles.length === 0 && <option value="">No job titles available yet</option>}
              {roleGroups.map(({ group, roles }) => (group
                ? <optgroup key={group} label={group}>{roles.map(roleOption)}</optgroup>
                : roles.map(roleOption)))}
            </select>
          </span>
        </Field>

        {collapsibleLocal && narrow && (
          <div className="ssp-calc__disclosure">
            <button
              type="button"
              className="ssp-calc__toggle"
              aria-expanded={!collapsed}
              aria-controls={id('local')}
              onClick={() => setLocalOpen((value) => !value)}
            >
              <span className="ssp-calc__toggle-icon" aria-hidden="true">{collapsed ? '+' : '−'}</span>
              <span>Make this local</span>
              <span className="ssp-calc__toggle-value">{localSummary}</span>
            </button>
          </div>
        )}

        <div id={id('local')} className="ssp-calc__local" hidden={collapsed}>
          <Field id={id('state')} label="State" className="ssp-calc__state">
            <span className="ssp-select">
              <select id={id('state')} ref={stateRef} value={selection.state || ''} onChange={onState}>
                <option value="">Nationwide</option>
                {STATES.map((state) => (
                  <option key={state.code} value={state.code}>{state.name}</option>
                ))}
              </select>
            </span>
          </Field>

          <Field id={id('city')} label="City" className="ssp-calc__city">
            <span className="ssp-select">
              <select
                id={id('city')}
                value={selection.city || ''}
                onChange={onCity}
                disabled={!selection.state}
                aria-describedby={!selection.state ? id('city-hint') : undefined}
              >
                <option value="">{selection.state ? 'All cities' : 'Nationwide'}</option>
                {cities.map((city) => (
                  <option key={city.key} value={city.key}>{city.name}</option>
                ))}
              </select>
            </span>
            {!selection.state && <span id={id('city-hint')} className="ssp-visually-hidden">Choose a state first.</span>}
          </Field>
        </div>

        <Field id={id('rate')} label="Your hourly pay" error={errors.rate} className="ssp-calc__rate">
          <span className={`ssp-money${errors.rate ? ' has-error' : ''}`}>
            <span className="ssp-money__prefix" aria-hidden="true">$</span>
            <input
              id={id('rate')}
              ref={rateRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck="false"
              value={rateInput}
              onChange={onRate}
              aria-invalid={errors.rate ? 'true' : undefined}
              aria-describedby={describe(errors.rate && `${id('rate')}-error`, id('privacy'))}
            />
            <span className="ssp-money__suffix" aria-hidden="true">/hr</span>
          </span>
        </Field>

        <div className="ssp-calc__submit">
          <button id={id('check')} type="submit" className="ssp-btn ssp-btn--primary ssp-btn--lg ssp-btn--block" aria-busy={busy ? 'true' : undefined}>
            Check my rate <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <p className="ssp-calc__examples">
        <span className="ssp-calc__examples-label">Try an example:</span>{' '}
        {EXAMPLE_ROLES.map((key, index) => (
          <span key={key} className="ssp-calc__example">
            {index > 0 && <span className="ssp-calc__dot" aria-hidden="true">·</span>}
            <button type="button" className="ssp-linkbtn" onClick={() => pickExample(key)}>
              {roleByKey(key)?.label}
            </button>
          </span>
        ))}
      </p>
      {layout === 'card' && (
        <div className="ssp-calc__about">
          <h3 className="ssp-calc__about-title">What you're comparing</h3>
          <ul>
            <li>Advertised hourly pay in staffing-firm job postings, not actual pay.</li>
            <li>The band shows the middle half of advertised rates (25th to 75th percentile) and the typical advertised rate.</li>
            <li>No direct-employer postings. Not a prediction of whether an order will fill.</li>
          </ul>
        </div>
      )}
      <p id={id('privacy')} className="ssp-calc__privacy">
        <svg className="ssp-calc__privacy-icon" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
          <rect x="4" y="9" width="12" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        <span>Your rate stays in this browser. It is not sent to our servers, saved or put in links.</span>
      </p>
    </form>
  )
}
