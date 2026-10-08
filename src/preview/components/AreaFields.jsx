import { STATES, citiesForState } from '../../../shared/signal/geography.js'
import { CITY_OTHER, CITY_TEXT_MAX, pickerWithState } from '../../../shared/signal/area.js'

// State + city control shared by the sign-up form and Preferences. The city
// list is the site's static city picker for the chosen state (geography.js;
// not every listed city has data in every monthly report), plus "My city
// isn't listed", which reveals a "Your city" box. The rules live in
// shared/signal/area.js (checkPicker / pickerToRequest), the same ones the API
// applies.
//
// value: { state, city: listed key | CITY_OTHER | '', cityText }
// errors: { state?, city?, cityText? } (messages)
// refs: { state, city, cityText } for focusing the first error.

export const AREA_HINT = 'We’ll send The Monthly Signal with news for your area. Pick your city, or type it if it isn’t listed.'

export default function AreaFields({
  idPrefix,
  value,
  onChange,
  errors = {},
  refs = {},
  hint = AREA_HINT,
  statePlaceholder = 'Choose your state',
  className = ''
}) {
  const id = (field) => `${idPrefix}-${field}`
  const cities = value.state ? citiesForState(value.state) : []
  const typed = value.city === CITY_OTHER
  const describe = (...ids) => ids.filter(Boolean).join(' ') || undefined
  const hintId = hint ? id('area-hint') : null

  return (
    <div className={`ssp-area${className ? ` ${className}` : ''}`}>
      <div className="ssp-area__pair">
        <div className={`ssp-field${errors.state ? ' has-error' : ''}`}>
          <label htmlFor={id('state')} className="ssp-field__label">State</label>
          <span className="ssp-select">
            <select
              id={id('state')}
              ref={refs.state}
              value={value.state}
              autoComplete="address-level1"
              aria-required="true"
              aria-invalid={errors.state ? 'true' : undefined}
              aria-describedby={describe(errors.state && id('state-error'), hintId)}
              onChange={(e) => onChange(pickerWithState(value, e.target.value), 'state')}
            >
              <option value="">{statePlaceholder}</option>
              {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </span>
          {errors.state && <p id={id('state-error')} className="ssp-field-error"><span aria-hidden="true">!</span> {errors.state}</p>}
        </div>
        <div className={`ssp-field${errors.city ? ' has-error' : ''}`}>
          <label htmlFor={id('city')} className="ssp-field__label">City</label>
          <span className="ssp-select">
            <select
              id={id('city')}
              ref={refs.city}
              value={value.state ? value.city : ''}
              disabled={!value.state}
              aria-required="true"
              aria-invalid={errors.city ? 'true' : undefined}
              aria-describedby={describe(errors.city && id('city-error'), hintId)}
              onChange={(e) => onChange({ ...value, city: e.target.value }, 'city')}
            >
              <option value="">{value.state ? 'Choose your city' : 'Choose a state first'}</option>
              {cities.map((c) => <option key={c.key} value={c.key}>{`${c.name}, ${c.state}`}</option>)}
              {value.state && <option value={CITY_OTHER}>My city isn’t listed</option>}
            </select>
          </span>
          {errors.city && <p id={id('city-error')} className="ssp-field-error"><span aria-hidden="true">!</span> {errors.city}</p>}
        </div>
      </div>
      {typed && value.state && (
        <div className={`ssp-field${errors.cityText ? ' has-error' : ''}`}>
          <label htmlFor={id('city-text')} className="ssp-field__label">Your city</label>
          <input
            id={id('city-text')}
            ref={refs.cityText}
            className="ssp-input"
            type="text"
            autoComplete="address-level2"
            maxLength={CITY_TEXT_MAX}
            value={value.cityText}
            aria-required="true"
            aria-invalid={errors.cityText ? 'true' : undefined}
            aria-describedby={describe(errors.cityText && id('city-text-error'))}
            onChange={(e) => onChange({ ...value, cityText: e.target.value }, 'cityText')}
          />
          {errors.cityText && <p id={id('city-text-error')} className="ssp-field-error"><span aria-hidden="true">!</span> {errors.cityText}</p>}
        </div>
      )}
      {hint && <p id={hintId} className="ssp-muted ssp-area__hint">{hint}</p>}
    </div>
  )
}
