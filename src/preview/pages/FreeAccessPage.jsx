import { Link, useNavigate } from 'react-router-dom'
import { cityByKey, stateByCode } from '../../../shared/signal/geography.js'
import { roleByKey } from '../../../shared/signal/taxonomy.js'
import SignupForm from '../components/SignupForm.jsx'
import { FORCE_SITE, usePreview } from '../PreviewContext.jsx'

// Standalone signup route, also reachable from contextual gates. After a
// simulated signup the visitor returns to the exact comparison they asked for
// (selection + in-memory rate); with no pending comparison they go on to pick
// what they follow.

function contextLine(context) {
  if (!context || !context.roleKey) return null
  const role = roleByKey(context.roleKey)?.label
  if (!role) return null
  let place = 'Nationwide'
  if (context.city && cityByKey(context.city)) {
    const city = cityByKey(context.city)
    place = `${city.name}, ${city.state}`
  } else if (context.state && stateByCode(context.state)) {
    place = stateByCode(context.state).name
  }
  return `${role} · ${place}`
}

const BENEFITS = [
  'Available state and city pay comparisons, where a benchmark passes publication checks',
  'Full city rankings and cooling markets',
  'The Monthly Signal, a five-minute briefing on staffing demand and advertised pay (optional)'
]

export default function FreeAccessPage() {
  const { pendingReturn, signedUp, homePath, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const navigate = useNavigate()
  const line = contextLine(pendingReturn)

  function onSuccess(result) {
    if (!site && !result.returned) navigate('/preview/preferences')
  }

  return (
    <section className="ssp-section ssp-page">
      <div className="ssp-container ssp-freeaccess">
        <div className="ssp-freeaccess__intro">
          <p className="ssp-eyebrow">Free access</p>
          <h1 className="ssp-page__title">Check today's rate. Keep up with tomorrow's market.</h1>
          <p className="ssp-lede">
            Unlock available local pay comparisons and full city rankings. Receive The Monthly Signal, a five-minute
            briefing on staffing demand and advertised pay.
          </p>
          <ul className="ssp-ticks">
            {BENEFITS.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="ssp-muted ssp-freeaccess__note">
            Access does not mean every job and location has data. Where a benchmark doesn't pass our publication
            checks, we say so instead of showing a guess.
          </p>
        </div>

        <div className="ssp-card ssp-freeaccess__card">
          {signedUp ? (
            <div className="ssp-freeaccess__done" role="status">
              <h2 className="ssp-card__title">{site ? 'Check your inbox.' : "You're in (simulated)."}</h2>
              <p>{site
                ? 'We sent a sign-in link to your work email. Open it on this device to unlock local comparisons. The link works once, for 15 minutes.'
                : 'Choose the sectors and markets you follow, or go back to your pay check.'}</p>
              <div className="ssp-freeaccess__links">
                {!site && <Link to="/preview/preferences" className="ssp-btn ssp-btn--primary">Choose what you follow <span aria-hidden="true">→</span></Link>}
                <Link to={{ pathname: homePath, hash: '#pay-check' }} className="ssp-btn ssp-btn--secondary">Back to the pay check</Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="ssp-card__title">Get free access</h2>
              {line && (
                <p className="ssp-freeaccess__context">
                  We'll bring you back to: <strong>{line}</strong>
                </p>
              )}
              <SignupForm idPrefix="page" context={pendingReturn} onSuccess={onSuccess} />
              <p className="ssp-muted ssp-freeaccess__next">Next, you can choose the sectors and markets you follow.</p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
