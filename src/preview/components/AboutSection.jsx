import { contactUrl } from '../lib/contact.js'
import { EVENTS, track } from '../lib/track.js'

// About Andy Kohler (repair brief §6). Name and The Staffing Signal branding
// only: no employer branding, testimonials, credentials or claims.
//
// Contact: no verified business contact destination exists in the project, so
// the button renders ONLY when VITE_CONTACT_URL is set at build time to an
// approved https:// link or mailto: address. Unset (the default) = no button,
// never a dead one or a guessed address.
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
        {href && (
          <p className="ssp-about__contact">
            <a
              href={href}
              className="ssp-btn ssp-btn--secondary"
              rel="noopener"
              target={href.startsWith('https:') ? '_blank' : undefined}
              onClick={() => track(EVENTS.CONTACT_CLICKED, {})}
            >
              Talk through your staffing firm’s cost and risk challenges
            </a>
          </p>
        )}
      </div>
    </section>
  )
}
