import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ACCESS } from '../../../shared/signal/contract.js'
import { basePath, FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import { EVENTS, track } from '../lib/track.js'
import Wordmark from './Wordmark.jsx'

// Dev preview nav (includes "coming soon" stubs).
const PREVIEW_PAGES = [
  { to: '/preview/market-report', label: 'Market Report', event: EVENTS.MARKET_REPORT_OPENED },
  { to: '/preview/hot-jobs', label: 'Hot Jobs' },
  { to: '/preview/my-market', label: 'My Market' },
  { to: '/preview/monthly-signal', label: 'The Monthly Signal', event: EVENTS.MONTHLY_ISSUE_OPENED },
  { to: '/preview/about', label: 'About' }
]

// Production nav: real pages only. Market Report is shown but not linked
// until the new report page is built (it used to open the old /dashboard).
const SITE_PAGES = [
  { label: 'Market Report', comingSoon: true },
  { to: '/methodology', label: 'How We Count' }
]

export default function Header() {
  const { homePath, access, requestFreeAccess, payCheck, variant, signOut, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const PAGES = site ? SITE_PAGES : PREVIEW_PAGES
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const location = useLocation()
  const menuButton = useRef(null)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname, location.hash])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        menuButton.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const authorized = access === ACCESS.AUTHORIZED
  const context = payCheck.selection && !payCheck.isExample ? payCheck.selection : null
  const signInPath = `${basePath(site)}/sign-in`

  async function onSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <header className={`ssp-header${open ? ' is-open' : ''}`}>
      <div className="ssp-container ssp-header__row">
        <Link to={homePath} className="ssp-header__brand" aria-label={site ? 'The Staffing Signal, home' : 'The Staffing Signal, preview home'}>
          <Wordmark />
        </Link>

        <button
          ref={menuButton}
          type="button"
          className="ssp-header__menu"
          aria-expanded={open}
          aria-controls="ssp-main-nav"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="ssp-header__menu-icon" aria-hidden="true"><span /></span>
          <span className="ssp-header__menu-label">Menu</span>
        </button>

        <nav id="ssp-main-nav" className="ssp-header__nav" aria-label="Main">
          <ul>
            <li>
              <Link to={{ pathname: homePath, hash: '#pay-check' }}>Pay Check</Link>
            </li>
            {PAGES.map((page) => (
              <li key={page.label}>
                {page.comingSoon ? (
                  <span className="ssp-header__soon">
                    {page.label} <span className="ssp-header__soon-tag">Soon</span>
                  </span>
                ) : (
                  <NavLink
                    to={page.to}
                    onClick={() => page.event && track(page.event, { variant })}
                  >
                    {page.label}
                  </NavLink>
                )}
              </li>
            ))}
            {/* Phone menu only; on wider screens "Sign in" / "Sign out" sits
                beside the button. */}
            {authorized ? (
              <li className="ssp-header__nav-signin">
                <button type="button" className="ssp-header__navbtn" onClick={onSignOut} disabled={signingOut}
                  aria-busy={signingOut ? 'true' : undefined}>
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </li>
            ) : (
              <li className="ssp-header__nav-signin">
                <NavLink to={signInPath}>Sign in</NavLink>
              </li>
            )}
          </ul>
        </nav>

        <div className="ssp-header__action">
          {authorized ? (
            <div className="ssp-header__signedin">
              <button
                type="button"
                className="ssp-header__signin ssp-header__signout"
                onClick={onSignOut}
                disabled={signingOut}
                aria-busy={signingOut ? 'true' : undefined}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
              {site ? (
                <Link to="/preferences" className="ssp-btn ssp-btn--primary ssp-header__cta">My preferences</Link>
              ) : (
                <Link to="/preview/my-market" className="ssp-btn ssp-btn--primary ssp-header__cta">My market</Link>
              )}
            </div>
          ) : (
            <div className="ssp-header__signedout">
              <Link to={signInPath} className="ssp-header__signin">Sign in</Link>
              <button
                type="button"
                className="ssp-btn ssp-btn--primary ssp-header__cta"
                onClick={() => requestFreeAccess(context)}
              >
                Get free access
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
