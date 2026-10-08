import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ACCESS } from '../../../shared/signal/contract.js'
import { STATES, citiesForState, cityByKey, stateByCode } from '../../../shared/signal/geography.js'
import { SECTORS } from '../../../shared/signal/taxonomy.js'
import { CITY_OTHER, checkPicker, followedStatesForArea, pickerChanged, pickerFromSavedArea, pickerToRequest } from '../../../shared/signal/area.js'
import AreaFields from '../components/AreaFields.jsx'
import { fetchPreferences, savePreferences } from '../api.js'
import { EVENTS, track } from '../lib/track.js'
import { FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import '../styles/sections.css'

// Preferences for a signed-in reader. The form starts from what is SAVED
// (GET /api/preferences), never from the current search: the area (listed
// city selected, or a typed city in the "My city isn't listed" box), The
// Monthly Signal choice and the followed sectors, states and cities.
// Saving sends the followed lists as edited. The area and the newsletter
// choice are sent only when they differ from what was loaded, so an
// untouched field keeps its saved value; a changed area must be complete
// (state + city, the sign-up rules). Followed states always include the
// area's state (the server keeps it first), so it has no Remove button;
// moving the area to another state drops the old one unless it is followed
// in its own right. A reader who unsubscribed with an email link sees the
// newsletter box locked off: saving here cannot restart their email.

const AREA_PROMPT = 'Add your city so The Monthly Signal can lead with your local market.'
const UNSUBSCRIBED_NOTE = 'You unsubscribed using the link in one of our emails, so The Monthly Signal is off. It can’t be turned back on from this page yet.'

// Saved settings (GET /api/preferences) -> form state. Unknown sector keys
// are kept so a save sends them back unchanged.
function initialPrefs(saved) {
  const list = (value) => (Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [])
  return {
    sectors: list(saved?.sectors),
    states: list(saved?.states).filter((code) => stateByCode(code)),
    cities: list(saved?.cities).filter((key) => cityByKey(key)),
    newsletter: saved?.newsletter === true,
    alerts: 'off',
    area: pickerFromSavedArea(saved?.area)
  }
}

function toggle(list, value, on) {
  if (on) return list.includes(value) ? list : [...list, value]
  return list.filter((item) => item !== value)
}

function savedSummary(saved, unsubscribed) {
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
    `Your area: ${saved.homeCity || (saved.homeState ? stateByCode(saved.homeState)?.name || saved.homeState : 'unchanged')}`,
    `The Monthly Signal: ${unsubscribed ? 'off (unsubscribed by email link)' : typeof saved.newsletter !== 'boolean' ? 'unchanged' : saved.newsletter ? 'yes' : 'no'}`,
    `Alerts: ${saved.alerts === 'weekly' ? 'weekly digest' : 'off'}`
  ]
}

function PreferencesForm({ saved, variant, site: siteProp }) {
  const site = FORCE_SITE || siteProp
  // `baseline` is what the server holds (as loaded, then as last saved).
  const [baseline, setBaseline] = useState(() => initialPrefs(saved))
  const [prefs, setPrefs] = useState(baseline)
  const [stateToAdd, setStateToAdd] = useState('')
  const [status, setStatus] = useState({ kind: 'idle', saved: null })
  const [areaErrors, setAreaErrors] = useState({})
  const unsubscribed = saved?.unsubscribed === true
  const areaRefs = { state: useRef(null), city: useRef(null), cityText: useRef(null) }

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

  function onAreaChange(next) {
    // A new area state replaces the old one on the followed list (unless the
    // old one is followed in its own right), so it never lingers as a market
    // the reader did not pick.
    const followedBefore = baseline.states.filter((code) => code !== baseline.area.state)
    update({ area: next, states: followedStatesForArea(prefs.states, prefs.cities, prefs.area.state, next.state, followedBefore) })
    setAreaErrors({})
  }

  async function onSubmit(event) {
    event.preventDefault()
    // An untouched area is left out (the saved one is kept); a changed one
    // needs a state and a city.
    const areaChanged = pickerChanged(prefs.area, baseline.area)
    if (areaChanged) {
      const where = checkPicker(prefs.area)
      if (!where.ok) {
        setAreaErrors(where.errors)
        const first = ['state', 'city', 'cityText'].find((key) => where.errors[key])
        areaRefs[first]?.current?.focus()
        return
      }
    }
    setAreaErrors({})
    setStatus({ kind: 'saving', saved: null })
    // The server always keeps the area's state on the States list (first).
    const areaState = prefs.area.state
    const states = areaState && !prefs.states.includes(areaState) ? [areaState, ...prefs.states] : prefs.states
    const sent = { ...prefs, states, cities: prefs.cities.filter((key) => states.includes(cityByKey(key)?.state)) }
    const home = areaChanged ? pickerToRequest(sent.area) : null
    const payload = {
      sectors: sent.sectors,
      states: sent.states,
      cities: sent.cities,
      ...(sent.newsletter !== baseline.newsletter ? { newsletter: sent.newsletter } : {}),
      alerts: sent.alerts,
      ...(home ? { homeState: home.state, homeCity: home.city } : {})
    }
    try {
      const result = await savePreferences(payload)
      setBaseline(sent)
      if (areaState) setPrefs((prev) => (prev.states.includes(areaState) ? prev : { ...prev, states: [areaState, ...prev.states] }))
      setStatus({ kind: 'saved', saved: result.saved || payload })
      track(EVENTS.PREFERENCES_SAVED, { variant })
    } catch (err) {
      // The server applies the same area rules; show its message on the field.
      const fields = err?.details?.fields || {}
      const serverArea = {}
      if (typeof fields.homeState === 'string') serverArea.state = fields.homeState
      if (typeof fields.homeCity === 'string') serverArea[prefs.area.city === CITY_OTHER ? 'cityText' : 'city'] = fields.homeCity
      if (Object.keys(serverArea).length) setAreaErrors(serverArea)
      setStatus({ kind: 'error', saved: null })
    }
  }

  const available = STATES.filter((s) => !prefs.states.includes(s.code))
  // No complete area saved yet (older sign-ups): ask for the city.
  const needsArea = !checkPicker(baseline.area).ok
  const homeCode = prefs.area.state

  return (
    <form className="ssp-card ssp-prefs__form" onSubmit={onSubmit} noValidate>
      <fieldset className="ssp-prefs__group">
        <legend className="ssp-prefs__legend">Your area</legend>
        {needsArea && (
          <div className="ssp-notice">
            <span className="ssp-notice__icon" aria-hidden="true">i</span>
            <div className="ssp-notice__text"><p>{AREA_PROMPT}</p></div>
          </div>
        )}
        <p className="ssp-muted ssp-prefs__hint">Your monthly report and email lead with this state and city. If your city has too little data in a month, we show your state, then national.</p>
        <AreaFields
          idPrefix="ssp-prefs-home"
          value={prefs.area}
          onChange={onAreaChange}
          errors={areaErrors}
          refs={areaRefs}
          hint="Pick your city, or type it if it isn’t listed."
        />
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
                    {code === homeCode
                      ? <span className="ssp-chip">Your area</span>
                      : <button type="button" className="ssp-linkbtn" onClick={() => removeState(code)} aria-label={`Remove ${name}`}>Remove</button>}
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
          <input type="checkbox" checked={prefs.newsletter} disabled={unsubscribed} onChange={(e) => update({ newsletter: e.target.checked })} />
          <span>Email me The Monthly Signal (monthly). You can unsubscribe anytime; your free account stays.</span>
        </label>
        {unsubscribed && <p className="ssp-muted ssp-prefs__hint">{UNSUBSCRIBED_NOTE}</p>}
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
            <p className="ssp-prefs__savedtitle">{site ? 'Saved.' : 'Saved (simulated, dev server memory only).'}</p>
            {!site && <p className="ssp-muted">Nothing was sent to Airtable and no email will be sent from this preview.</p>}
            <ul className="ssp-prefs__summary">
              {savedSummary(status.saved, unsubscribed).map((line) => <li key={line}>{line}</li>)}
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

// Loads the saved settings, then shows the form filled from them. While
// loading or after a failed load there is no form, so nothing can be saved
// over the saved lists by mistake.
function SavedPreferences({ variant, site }) {
  const [load, setLoad] = useState({ kind: 'loading', saved: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setLoad({ kind: 'loading', saved: null, error: null })
    fetchPreferences()
      .then((saved) => { if (alive) setLoad({ kind: 'ready', saved, error: null }) })
      .catch((error) => { if (alive) setLoad({ kind: 'error', saved: null, error }) })
    return () => { alive = false }
  }, [attempt])

  if (load.kind === 'ready') return <PreferencesForm saved={load.saved} variant={variant} site={site} />
  if (load.kind === 'loading') {
    return (
      <div className="ssp-card ssp-prefs__gate" role="status" aria-live="polite">
        <p className="ssp-muted">Loading your saved preferences…</p>
      </div>
    )
  }
  const signedOut = load.error?.status === 401
  return (
    <div className="ssp-card ssp-prefs__gate" role="alert">
      <p className="ssp-prefs__savedtitle">{signedOut ? 'Please sign in again.' : 'We couldn’t load your saved preferences.'}</p>
      <p className="ssp-muted">
        {signedOut
          ? 'Your sign-in has ended. Sign in to see and change what you follow.'
          : 'Nothing was changed. Please try again in a moment.'}
      </p>
      <div className="ssp-freeaccess__links">
        {signedOut
          ? <Link to={site ? '/sign-in' : '/preview/sign-in'} className="ssp-btn ssp-btn--primary">Sign in</Link>
          : <button type="button" className="ssp-btn ssp-btn--primary" onClick={() => setAttempt((n) => n + 1)}>Try again</button>}
      </div>
    </div>
  )
}

export default function PreferencesPage() {
  const { signedUp, access, variant, homePath, site: siteMount } = usePreview()
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
            Your area, The Monthly Signal and the sectors and markets you follow, as saved on your account. Change
            anything you like, then save.
          </p>
          {!site && <p className="ssp-prefs__sim">
            <span className="ssp-chip ssp-chip--dev">Simulated</span> Saving here is kept only in the dev server’s memory: no Airtable record,
            no email, no browser storage.
          </p>}
        </header>

        {allowed ? (
          <SavedPreferences variant={variant} site={site} />
        ) : (
          <div className="ssp-card ssp-lock ssp-prefs__gate">
            <p className="ssp-prefs__savedtitle">Preferences are part of a free account.</p>
            <p className="ssp-muted">
              {site
                ? 'Sign up with your name, work email and a password. Already signed up? Sign in with your email and password.'
                : 'Sign up with your name, work email and a password, or sign in (simulated in this preview). The dev banner’s “Signed in (simulated)” switch also works.'}
            </p>
            <div className="ssp-freeaccess__links">
              <Link to={site ? '/free-access' : '/preview/free-access'} className="ssp-btn ssp-btn--primary">Sign up free</Link>
              <Link to={site ? '/sign-in' : '/preview/sign-in'} className="ssp-btn ssp-btn--secondary">Sign in</Link>
            </div>
          </div>
        )}

        <p className="ssp-prefs__back">
          <Link to={{ pathname: homePath || '/preview', hash: '#pay-check' }} className="ssp-link">
            <span aria-hidden="true">←</span> Back to pay data
          </Link>
        </p>
      </div>
    </div>
  )
}
