import { Link, useNavigate } from 'react-router-dom'
import { ACCESS } from '../../../shared/signal/contract.js'
import { cityByKey, stateByCode } from '../../../shared/signal/geography.js'
import { roleByKey } from '../../../shared/signal/taxonomy.js'
import SignupForm from '../components/SignupForm.jsx'
import { isReportReturn } from '../lib/reportGate.js'
import { basePath, FORCE_SITE, usePreview } from '../PreviewContext.jsx'

// Standalone signup route, also reachable from contextual gates. Signup signs
// the visitor in straight away (no email link). They then go on to the report
// or comparison they asked for (selection + in-memory rate); with nothing
// pending they can go on to pick what they follow.

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
  'Create, print, download and email Client Pay Market Reports: two pages, US Letter, ready to hand your client',
  'Full city rankings and cooling markets',
  'The Monthly Signal, a five-minute briefing on staffing demand and advertised pay (optional)'
]

export default function FreeAccessPage() {
  const { pendingReturn, signedUp, access, homePath, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const navigate = useNavigate()
  const line = contextLine(pendingReturn)
  const base = basePath(site)
  const done = signedUp || access === ACCESS.AUTHORIZED

  function onSuccess(result) {
    if (!site && !result.returned) navigate('/preview/preferences')
  }

  return (
    <section className="ssp-section ssp-page">
      <div className="ssp-container ssp-freeaccess">
        <div className="ssp-freeaccess__intro">
          <p className="ssp-eyebrow">Free account</p>
          <h1 className="ssp-page__title">Turn pay data into a report your client can keep.</h1>
          <p className="ssp-lede">
            Local pay comparisons are free for everyone. A free account lets you create, print, download and email
            Client Pay Market Reports, and brings you The Monthly Signal, a five-minute briefing on staffing demand
            and advertised pay.
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
          {done ? (
            <div className="ssp-freeaccess__done" role="status">
              <h2 className="ssp-card__title">You're signed in.</h2>
              <p>
                You can create, print, download and email Client Pay Market Reports on this device. Choose the sectors
                and markets you follow, or go back to the pay data.
              </p>
              {!site && <p className="ssp-muted">Development preview: simulated. Nothing was saved.</p>}
              <div className="ssp-freeaccess__links">
                <Link to={{ pathname: homePath, hash: '#pay-check' }} className="ssp-btn ssp-btn--primary">Back to pay data</Link>
                <Link to={`${base}/preferences`} className="ssp-btn ssp-btn--secondary">Choose what you follow</Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="ssp-card__title">Sign up free</h2>
              {line && (
                <p className="ssp-freeaccess__context">
                  {isReportReturn(pendingReturn) ? 'Next, your report for: ' : "We'll bring you back to: "}
                  <strong>{line}</strong>
                </p>
              )}
              <SignupForm idPrefix="page" context={pendingReturn} onSuccess={onSuccess} />
              <p className="ssp-muted ssp-freeaccess__next">Next, you can choose the sectors and markets you follow.</p>
              <p className="ssp-muted ssp-freeaccess__next">
                Already have an account? <Link to={`${base}/sign-in`} className="ssp-link">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
