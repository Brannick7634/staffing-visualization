import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ACCESS } from '../../../shared/signal/contract.js'
import { FORCE_SITE, usePreview } from '../PreviewContext.jsx'
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
  const { homePath, access, simulated, requestFreeAccess, payCheck, variant, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const PAGES = site ? SITE_PAGES : PREVIEW_PAGES
  const [open, setOpen] = useState(false)
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
          </ul>
        </nav>

        <div className="ssp-header__action">
          {authorized ? (
            <>
              {site ? (
                <>
                  <Link to="/preferences" className="ssp-btn ssp-btn--primary ssp-header__cta">My preferences</Link>
                  <span className="ssp-header__status">Signed in</span>
                </>
              ) : (
                <>
                  <Link to="/preview/my-market" className="ssp-btn ssp-btn--primary ssp-header__cta">My market</Link>
                  {simulated && <span className="ssp-header__status">Signed in (simulated)</span>}
                </>
              )}
            </>
          ) : (
            <button
              type="button"
              className="ssp-btn ssp-btn--primary ssp-header__cta"
              onClick={() => requestFreeAccess(context)}
            >
              Get free access
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
