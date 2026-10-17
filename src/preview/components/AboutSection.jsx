import { contactUrl } from '../lib/contact.js'
import { EVENTS, track } from '../lib/track.js'

// About Andy Kohler (repair brief §6). Name and The Staffing Signal branding
// only: no employer branding, testimonials, credentials or claims.
//
// Contact: VITE_CONTACT_URL (an approved https:// link or mailto:) overrides
// the default mailto:andy@thestaffingsignal.com (Andy's choice, 2026-10-16).
function configuredContact() {
  try {
    return contactUrl(import.meta.env?.VITE_CONTACT_URL || 'mailto:andy@thestaffingsignal.com')
  } catch {
    return null
  }
}

export default function AboutSection() {
  const href = configuredContact()
  return (
    <section id="about" className="ssp-anchor ssp-about" aria-labelledby="ssp-about-title">
      <div className="ssp-about__inner">
        <h2 id="ssp-about-title" className="ssp-about__title">About The Staffing Signal</h2>
        <p className="ssp-about__text">
          Built by Andy Kohler for staffing leaders who want better client conversations. I work with staffing firms on workers’ comp and risk. The Staffing Signal gives you another way to understand the market behind the staffing decision.
        </p>
        <p className="ssp-about__text">
          It’s built on hourly pay advertised by verified staffing firms for contract and temporary roles, refreshed weekly. When there isn’t enough data for a reliable local number, it tells you so instead of guessing.
        </p>
        <p className="ssp-about__text">
          It’s free to compare. If you’d like to talk through pay, cost or risk at your firm, I’m easy to reach.
        </p>
        {href && (
          <p className="ssp-about__contact">
            <a
              href={href}
              className="ssp-btn ssp-btn--secondary"
              rel="noopener"
              target={href.startsWith('https:') ? '_blank' : undefined}
              onClick={() => track(EVENTS.CONTACT_CLICKED, {})}
            >
              Email Andy →
            </a>
          </p>
        )}
      </div>
    </section>
  )
}
