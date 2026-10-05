import { Link } from 'react-router-dom'
import { usePreview } from '../PreviewContext.jsx'

// Plain-language privacy summary. Every statement here describes what the
// code in api/subscribe.js, api/auth/*, api/preferences.js and
// api/unsubscribe.js actually does; update it if those change.
export default function PrivacyPage() {
  const { base, homePath } = usePreview()
  return (
    <div className="ssp-page">
      <div className="ssp-container">
        <div className="ssp-card">
          <p className="ssp-eyebrow">Privacy</p>
          <h1 className="ssp-page__title">What we collect and why</h1>
          <h2>The pay check</h2>
          <p>
            The pay rate you type stays in your browser. We send only the job title and place you choose, get the
            benchmark back, and compare on your device. Your rate is not stored or put in any link.
          </p>
          <h2>Free access</h2>
          <p>
            When you sign up we keep your name, work email, the date you signed up, whether you want The Monthly
            Signal, and the sectors and states you choose on the{' '}
            <Link to={`${base}/preferences`} className="ssp-link">preferences page</Link>. We use them to sign you in
            and, if you asked for it, to send the newsletter. We do not sell them.
          </p>
          <h2>Signing in</h2>
          <p>
            We email you a one-time sign-in link. Opening it sets a single cookie on this site that keeps you signed
            in for 30 days. We use no advertising or tracking cookies.
          </p>
          <h2>Unsubscribing</h2>
          <p>
            Every email has an unsubscribe link. One click stops all Staffing Signal emails, and we keep a record
            that you unsubscribed so you are not added back.
          </p>
          <p>
            <Link to={{ pathname: homePath, hash: '#pay-check' }} className="ssp-link">
              <span aria-hidden="true">←</span> Back to the pay check
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
