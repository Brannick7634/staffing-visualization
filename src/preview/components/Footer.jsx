import { Link } from 'react-router-dom'
import { FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import Wordmark from './Wordmark.jsx'

const PREVIEW_LINKS = [
  { to: '/preview/sample-report', label: 'Sample report' },
  { to: '/preview/methodology', label: 'How We Count' },
  { to: '/preview/about', label: 'About' },
  { to: '/preview/privacy', label: 'Privacy' },
  { to: '/preview/preferences', label: 'Email Preferences' },
  { to: '/preview/contact', label: 'Contact' }
]

// Production: real pages only (About/Contact copy not written yet).
const SITE_LINKS = [
  { to: '/sample-report', label: 'Sample report' },
  { to: '/methodology', label: 'How We Count' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/preferences', label: 'Email Preferences' }
]

export default function Footer() {
  const { site: siteMount, homePath } = usePreview()
  const site = FORCE_SITE || siteMount
  const LINKS = site ? SITE_LINKS : PREVIEW_LINKS
  return (
    <footer className="ssp-footer">
      <div className="ssp-container ssp-footer__row">
        <Link to={homePath} className="ssp-footer__brand" aria-label="The Staffing Signal, home">
          <Wordmark compact />
        </Link>
        <nav className="ssp-footer__nav" aria-label="Footer">
          <ul>
            {LINKS.map((link) => (
              <li key={link.to}><Link to={link.to}>{link.label}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="ssp-container">
        <p className="ssp-footer__fine">
          Staffing firms only — no direct-employer postings in these benchmarks. Advertised pay, not actual pay.
          {!site && 'Development preview: figures are supplied examples and signup is simulated.'}
        </p>
      </div>
    </footer>
  )
}
