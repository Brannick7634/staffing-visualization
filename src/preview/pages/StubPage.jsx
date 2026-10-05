import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { EVENTS, track } from '../lib/track.js'
import { usePreview } from '../PreviewContext.jsx'
import '../styles/sections.css'

// Honest placeholder for pages that sit outside this homepage preview. The
// route's last path segment picks the copy; nothing pretends to be built.

const PAGES = {
  'market-report': {
    title: 'Market Report',
    holds: 'A state map, observed posting volume, qualified momentum and city rankings — with the same publication checks and free-access rules as the homepage.'
  },
  'hot-jobs': {
    title: 'Hot Jobs',
    holds: 'A role explorer filtered Sector → Job → State → City, showing only aggregates that pass publication checks. No individual firms or postings.'
  },
  'my-market': {
    title: 'My Market',
    holds: 'Your saved sectors and markets, with every local result your free access makes available.'
  },
  'monthly-signal': {
    title: 'The Monthly Signal',
    holds: 'The current issue (or a clearly labeled sample) and a genuine archive. No past issues are invented.'
  },
  about: {
    title: 'About',
    holds: 'Who publishes The Staffing Signal and why.',
    draft: 'Brought to you by Andy Kohler, who works in commercial insurance for staffing firms. The Staffing Signal is a free publication, not an insurance offer.'
  },
  privacy: {
    title: 'Privacy',
    holds: 'What we collect at signup, how we use it, and how to unsubscribe. Your entered pay rate is never sent or stored.'
  },
  contact: {
    title: 'Contact',
    holds: 'How to reach The Staffing Signal with questions or corrections.'
  },
  'email-preferences': {
    title: 'Email Preferences',
    holds: 'Newsletter and alert choices, followed markets and unsubscribe controls.',
    link: { to: '/preview/preferences', label: 'Open the simulated preferences page' }
  }
}

function lastSegment(pathname) {
  const parts = pathname.split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}

export default function StubPage() {
  const location = useLocation()
  const { homePath, variant } = usePreview()
  const slug = lastSegment(location.pathname)
  const page = PAGES[slug] || { title: 'Page', holds: 'This page is planned but not part of this preview.' }

  useEffect(() => {
    if (slug === 'market-report') track(EVENTS.MARKET_REPORT_OPENED, { variant })
    if (slug === 'monthly-signal') track(EVENTS.MONTHLY_ISSUE_OPENED, { variant })
  }, [slug, variant])

  return (
    <div className="ssp-page ssp-stub">
      <div className="ssp-container">
        <div className="ssp-card ssp-stub__card">
          <p className="ssp-eyebrow">Outside this homepage preview</p>
          <h1 className="ssp-page__title">{page.title}</h1>
          <p className="ssp-stub__lead">This page isn't part of the homepage preview yet.</p>
          <h2 className="ssp-stub__h2">What this page will hold</h2>
          <p>{page.holds}</p>
          {page.draft && (
            <div className="ssp-stub__draft">
              <p className="ssp-stub__draftflag"><span className="ssp-chip ssp-chip--dev">Draft copy — needs Andy's approval</span></p>
              <p>{page.draft}</p>
            </div>
          )}
          <div className="ssp-stub__actions">
            <Link to={homePath || '/preview'} className="ssp-btn ssp-btn--primary">Back to the homepage preview</Link>
            {page.link && <Link to={page.link.to} className="ssp-btn ssp-btn--secondary">{page.link.label}</Link>}
            <Link to="/preview/methodology" className="ssp-link">How we count</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
