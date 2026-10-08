import { Link } from 'react-router-dom'
import { basePath, FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import { ACCESS } from '../../../shared/signal/contract.js'
import { geographyLabel } from '../../../shared/signal/geography.js'
import { roleByKey } from '../../../shared/signal/taxonomy.js'
import { isReportReturn } from '../lib/reportGate.js'
import SignupForm from './SignupForm.jsx'
import '../styles/sections.css'

// Free-account invitation. Name + work email + password (preferences come after
// signup, which signs the visitor in straight away). Local pay comparisons are
// free; the account is for creating, printing, downloading and emailing Client
// Pay Market Reports plus The Monthly Signal. When the visitor has a comparison
// or report in progress we say where we'll take them — job and place only,
// never the rate. Signed-in visitors see a short confirmation instead.

export function returnLine(context) {
  if (!context || !context.roleKey) return null
  const role = roleByKey(context.roleKey)
  if (!role) return null
  const place = geographyLabel(context.state || null, context.state ? (context.city || null) : null)
  return place ? `${role.label} · ${place}` : role.label
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" focusable="false">
      <path d="M5 19.5 35 6 28 34l-8.5-8-5 5.5v-8.5L30 11 12.5 21.5z" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

export default function AccessInvite({ context = null, signedUp = false }) {
  const line = returnLine(context)
  const { access, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const done = signedUp || access === ACCESS.AUTHORIZED

  return (
    <section className="ssp-section ssp-invite" aria-labelledby="ssp-invite-title">
      <div className="ssp-container">
        <div className="ssp-invite__box">
          <div className="ssp-invite__intro">
            <span className="ssp-invite__icon"><PlaneIcon /></span>
            <div>
              <h2 id="ssp-invite-title" className="ssp-h2">Turn pay data into a report your client can keep.</h2>
              <p className="ssp-invite__copy">
                A free account lets you create, print, download and email Client Pay Market Reports, see full city
                rankings, and receive The Monthly Signal, a five-minute briefing on staffing demand and advertised pay.
              </p>
              <p className="ssp-invite__copy ssp-muted">
                Local pay comparisons stay free without an account. Not every job and location has data: where a
                benchmark doesn't pass our publication checks, we say so instead of showing a guess.
              </p>
            </div>
          </div>

          <div className="ssp-card ssp-invite__card">
            {done ? (
              <div className="ssp-invite__done" role="status">
                <p className="ssp-invite__donetitle">You're signed in.</p>
                <p className="ssp-muted">
                  You can create, print, download and email Client Pay Market Reports on this device.
                  {!site && ' Development preview: simulated. Nothing was saved and no email was sent.'}
                </p>
                <Link to={`${basePath(site)}/preferences`} className="ssp-btn ssp-btn--primary">
                  Choose what you follow <span aria-hidden="true">→</span>
                </Link>
              </div>
            ) : (
              <>
                {line && (
                  <p className="ssp-invite__context">
                    {isReportReturn(context) ? 'Next, your report for: ' : "We'll bring you back to: "}
                    <strong>{line}</strong>
                  </p>
                )}
                <SignupForm idPrefix="invite" context={context} />
                <p className="ssp-invite__next ssp-muted">Next, you can choose the sectors and markets you follow.</p>
                <p className="ssp-invite__next ssp-muted">
                  Already have an account? <Link to={`${basePath(site)}/sign-in`} className="ssp-link">Sign in</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
