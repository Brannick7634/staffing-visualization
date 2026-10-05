import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ACCESS } from '../../../shared/signal/contract.js'
import { STATES, citiesForState, cityByKey, stateByCode } from '../../../shared/signal/geography.js'
import { SECTORS } from '../../../shared/signal/taxonomy.js'
import { savePreferences } from '../api.js'
import { EVENTS, track } from '../lib/track.js'
import { FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import '../styles/sections.css'

// Post-signup preferences (simulated save). Prefilled from the visitor's
// current selection; nothing is written to storage, Airtable or email.

function initialPrefs(selection) {
  const sectors = selection?.sectorKey && SECTORS.some((s) => s.key === selection.sectorKey) ? [selection.sectorKey] : []
  const states = selection?.state && stateByCode(selection.state) ? [selection.state] : []
  const city = selection?.city ? cityByKey(selection.city) : null
  const cities = city && states.includes(city.state) ? [city.key] : []
  return { sectors, states, cities, newsletter: false, alerts: 'off', homeState: states[0] || '', homeCity: city ? city.name : '' }
}

function toggle(list, value, on) {
  if (on) return list.includes(value) ? list : [...list, value]
  return list.filter((item) => item !== value)
}

function savedSummary(saved) {
  const sectors = (saved.sectors || []).map((key) => SECTORS.find((s) => s.key === key)?.label || key)
  const states = (saved.states || []).map((code) => stateByCode(code)?.name || code)
  const cities = (saved.cities || []).map((key) => {
    const c = cityByKey(key)
    return c ? `${c.name}, ${c.state}` : key
  })
  return [
    `Sectors: ${sectors.length ? sectors.join(', ') : 'none'}`,
    `States: ${states.length ? states.join(', ') : 'none'}`,
    `Cities: ${cities.length ? cities.join(', ') : 'none'}`,
    `Your area: ${saved.homeState ? `${saved.homeCity ? `${saved.homeCity}, ` : ''}${stateByCode(saved.homeState)?.name || saved.homeState}` : 'not set'}`,
    `The Monthly Signal: ${saved.newsletter ? 'yes' : 'no'}`,
    `Alerts: ${saved.alerts === 'weekly' ? 'weekly digest' : 'off'}`
  ]
}

function PreferencesForm({ selection, variant, site: siteProp }) {
  const site = FORCE_SITE || siteProp
  const [prefs, setPrefs] = useState(() => initialPrefs(selection))
  const [stateToAdd, setStateToAdd] = useState('')
  const [status, setStatus] = useState({ kind: 'idle', saved: null })

  const update = (partial) => {
    setPrefs((prev) => ({ ...prev, ...partial }))
    setStatus((prev) => (prev.kind === 'saved' ? { kind: 'changed', saved: prev.saved } : prev))
  }

  function addState() {
    if (!stateToAdd || !stateByCode(stateToAdd)) return
    update({ states: toggle(prefs.states, stateToAdd, true) })
    setStateToAdd('')
  }

  function removeState(code) {
    update({
      states: prefs.states.filter((s) => s !== code),
      cities: prefs.cities.filter((key) => cityByKey(key)?.state !== code)
    })
  }

  async function onSubmit(event) {
    event.preventDefault()
    setStatus({ kind: 'saving', saved: null })
    const payload = {
      sectors: prefs.sectors,
      states: prefs.states,
      cities: prefs.cities.filter((key) => prefs.states.includes(cityByKey(key)?.state)),
      newsletter: prefs.newsletter,
      alerts: prefs.alerts,
      homeState: prefs.homeState || '',
      homeCity: prefs.homeState ? prefs.homeCity.trim().slice(0, 80) : ''
    }
    try {
      const result = await savePreferences(payload)
      setStatus({ kind: 'saved', saved: result.saved || payload })
      track(EVENTS.PREFERENCES_SAVED, { variant })
    } catch {
      setStatus({ kind: 'error', saved: null })
    }
  }

  const available = STATES.filter((s) => !prefs.states.includes(s.code))

  return (
    <form className="ssp-card ssp-prefs__form" onSubmit={onSubmit} noValidate>
      <fieldset className="ssp-prefs__group">
        <legend className="ssp-prefs__legend">Your area</legend>
        <p className="ssp-muted ssp-prefs__hint">Your monthly report and email lead with this state and city. If your city has too little data in a month, we show your state, then national.</p>
        <div className="ssp-prefs__add">
          <div className="ssp-field">
            <label htmlFor="ssp-prefs-home-state" className="ssp-field__label">State</label>
            <select id="ssp-prefs-home-state" className="ssp-input" value={prefs.homeState}
              onChange={(e) => update({ homeState: e.target.value, ...(e.target.value ? {} : { homeCity: '' }) })}>
              <option value="">Not set</option>
              {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </div>
          <div className="ssp-field">
            <label htmlFor="ssp-prefs-home-city" className="ssp-field__label">City</label>
            <input id="ssp-prefs-home-city" className="ssp-input" type="text" maxLength={80} autoComplete="address-level2"
              value={prefs.homeCity} disabled={!prefs.homeState} placeholder={prefs.homeState ? 'e.g. Houston' : 'Choose a state first'}
              onChange={(e) => update({ homeCity: e.target.value })} />
          </div>
        </div>
      </fieldset>

      <fieldset className="ssp-prefs__group">
        <legend className="ssp-prefs__legend">Sectors you follow</legend>
        <ul className="ssp-prefs__checks">
          {SECTORS.map((sector) => (
            <li key={sector.key}>
              <label className="ssp-check ssp-prefs__check">
                <input
                  type="checkbox"
                  checked={prefs.sectors.includes(sector.key)}
                  onChange={(e) => update({ sectors: toggle(prefs.sectors, sector.key, e.target.checked) })}
                />
                <span>{sector.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="ssp-prefs__group">
        <legend className="ssp-prefs__legend">States you follow</legend>
        <div className="ssp-prefs__add">
          <div className="ssp-field">
            <label htmlFor="ssp-prefs-state" className="ssp-field__label">Add a state</label>
            <span className="ssp-select">
              <select id="ssp-prefs-state" value={stateToAdd} onChange={(e) => setStateToAdd(e.target.value)}>
                <option value="">Choose a state</option>
                {available.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </span>
          </div>
          <button type="button" className="ssp-btn ssp-btn--secondary" onClick={addState} disabled={!stateToAdd}>Add state</button>
        </div>
        {prefs.states.length === 0 ? (
          <p className="ssp-muted ssp-prefs__hint">No states yet. Leave empty to follow nationwide signals only.</p>
        ) : (
          <ul className="ssp-prefs__states">
            {prefs.states.map((code) => {
              const cities = citiesForState(code)
              const name = stateByCode(code)?.name || code
              return (
                <li key={code} className="ssp-prefs__state">
                  <div className="ssp-prefs__statehead">
                    <span className="ssp-prefs__statename">{name}</span>
                    <button type="button" className="ssp-linkbtn" onClick={() => removeState(code)} aria-label={`Remove ${name}`}>Remove</button>
                  </div>
                  {cities.length > 0 ? (
                    <fieldset className="ssp-prefs__cities">
                      <legend className="ssp-prefs__sublegend">Cities in {name} (optional)</legend>
                      <ul className="ssp-prefs__checks ssp-prefs__checks--cities">
                        {cities.map((city) => (
                          <li key={city.key}>
                            <label className="ssp-check ssp-prefs__check">
                              <input
                                type="checkbox"
                                checked={prefs.cities.includes(city.key)}
                                onChange={(e) => update({ cities: toggle(prefs.cities, city.key, e.target.checked) })}
                              />
                              <span>{city.name}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </fieldset>
                  ) : (
                    <p className="ssp-muted ssp-prefs__hint">No city list for this state yet; you'll follow statewide signals.</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </fieldset>

      <fieldset className="ssp-prefs__group">
        <legend className="ssp-prefs__legend">Email</legend>
        <label className="ssp-check ssp-prefs__check">
          <input type="checkbox" checked={prefs.newsletter} onChange={(e) => update({ newsletter: e.target.checked })} />
          <span>Email me The Monthly Signal (monthly). You can unsubscribe anytime; free access stays.</span>
        </label>
        <p className="ssp-muted ssp-prefs__hint">
          This box doesn't show the choice you made at signup, so it starts unticked. Nothing changes
          until you save.
        </p>
      </fieldset>

      <fieldset className="ssp-prefs__group">
        <legend className="ssp-prefs__legend">Market alerts</legend>
        <div className="ssp-prefs__radios">
          <label className="ssp-check ssp-prefs__check">
            <input type="radio" name="ssp-alerts" value="off" checked={prefs.alerts === 'off'} onChange={() => update({ alerts: 'off' })} />
            <span>Off</span>
          </label>
          <label className="ssp-check ssp-prefs__check">
            <input type="radio" name="ssp-alerts" value="weekly" checked={prefs.alerts === 'weekly'} onChange={() => update({ alerts: 'weekly' })} />
            <span>Weekly digest — only when a market you follow has a newly publishable benchmark or a valid, meaningful change</span>
          </label>
        </div>
        <p className="ssp-muted ssp-prefs__hint">{site ? 'Alerts are not sent yet; we will use this choice when they start.' : 'Alerts are not built yet; this preview records the choice only.'}</p>
      </fieldset>

      <div className="ssp-prefs__actions">
        <button type="submit" className="ssp-btn ssp-btn--primary ssp-btn--lg" disabled={status.kind === 'saving'} aria-busy={status.kind === 'saving' ? 'true' : undefined}>
          {status.kind === 'saving' ? 'Saving…' : 'Save preferences'}
        </button>
      </div>

      <div className="ssp-prefs__status" role="status" aria-live="polite">
        {status.kind === 'saved' && (
          <div className="ssp-prefs__saved">
            <p className="ssp-prefs__savedtitle">{site ? 'Saved.' : 'Saved (simulated) — nothing stored.'}</p>
            {!site && <p className="ssp-muted">Nothing was sent to Airtable and no email will be sent from this preview.</p>}
            <ul className="ssp-prefs__summary">
              {savedSummary(status.saved).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        )}
        {status.kind === 'changed' && <p className="ssp-muted">You have unsaved changes.</p>}
        {status.kind === 'error' && (
          <p className="ssp-field-error"><span aria-hidden="true">!</span> {site ? 'We couldn’t save these preferences. Please try again.' : 'We couldn’t save these preferences (simulated). Nothing was stored.'}</p>
        )}
      </div>
    </form>
  )
}

export default function PreferencesPage() {
  const { signedUp, access, selection, variant, homePath, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  // Production: only a server-confirmed session (ss_session) may save.
  const allowed = site ? access === ACCESS.AUTHORIZED : (signedUp || access === ACCESS.AUTHORIZED)

  return (
    <div className="ssp-page ssp-prefs">
      <div className="ssp-container ssp-prefs__layout">
        <header className="ssp-prefs__head">
          <p className="ssp-eyebrow">Preferences</p>
          <h1 className="ssp-page__title">Choose what you follow</h1>
          <p className="ssp-lede">
            Pick the sectors and markets you care about. We've started from the comparison you were looking at; change
            anything you like.
          </p>
          {!site && <p className="ssp-prefs__sim">
            <span className="ssp-chip ssp-chip--dev">Simulated</span> Saving here stores nothing: no Airtable record,
            no email, no browser storage.
          </p>}
        </header>

        {allowed ? (
          <PreferencesForm selection={selection} variant={variant} site={site} />
        ) : (
          <div className="ssp-card ssp-lock ssp-prefs__gate">
            <p className="ssp-prefs__savedtitle">Preferences are part of free access.</p>
            <p className="ssp-muted">
              {site
                ? 'Sign up with your name and work email, then open the sign-in link we email you. Already signed up? Request a new link from the free-access page.'
                : 'Sign up with your name and work email first (simulated in this preview), or use the dev banner’s “Signed in (simulated)” switch.'}
            </p>
            <Link to={site ? '/free-access' : '/preview/free-access'} className="ssp-btn ssp-btn--primary">Get free access</Link>
          </div>
        )}

        <p className="ssp-prefs__back">
          <Link to={{ pathname: homePath || '/preview', hash: '#pay-check' }} className="ssp-link">
            <span aria-hidden="true">←</span> Back to the pay check
          </Link>
        </p>
      </div>
    </div>
  )
}
