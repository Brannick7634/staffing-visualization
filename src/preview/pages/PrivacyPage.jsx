import { Link } from 'react-router-dom'
import { usePreview } from '../PreviewContext.jsx'

// Plain-language privacy summary. Every statement here describes what the
// code in api/_lib/routes/ (subscribe, login, forgot, reset, logout,
// preferences, unsubscribe and client-report-email) actually does; update it
// if those change.
export default function PrivacyPage() {
  const { base, homePath } = usePreview()
  return (
    <div className="ssp-page">
      <div className="ssp-container">
        <div className="ssp-card">
          <p className="ssp-eyebrow">Privacy</p>
          <h1 className="ssp-page__title">What we collect and why</h1>
          <h2>The client pay rate</h2>
          <p>
            The client pay rate you enter stays in your browser. It is never saved or put in links, and it is sent to
            our server only if you email a report, to build that report.
          </p>
          <p>
            To compare, we send only the job title and location you choose, get the benchmark back, and compare on
            your device. The rate is not recorded in analytics or kept in your browser's storage, so if you reload the
            page you enter it again.
          </p>
          <h2>Emailing a report</h2>
          <p>
            When you email a Client Pay Market Report, the request carries the job title, location, client pay rate,
            the addresses you send to and any optional message or “Prepared for / Prepared by” text. We use them only
            to build the report and send one email to each address through our email provider; recipients don't see
            each other's addresses, and replies come to you. We don't store or log the rate, the addresses, the
            message or the names. We keep only a count of the people you emailed a report to today (copies to yourself aren't counted), to apply the daily limit.
          </p>
          <h2>Free account</h2>
          <p>
            When you sign up we keep your name, work email, a one-way hash of your password, the date you signed
            up, whether you want The Monthly Signal, and the sectors and states you choose on the{' '}
            <Link to={`${base}/preferences`} className="ssp-link">preferences page</Link>. We use them to sign you in
            and, if you asked for it, to send the newsletter. We do not sell them.
          </p>
          <h2>Signing in</h2>
          <p>
            You sign in with your work email and a password. We store your password only as a one-way bcrypt hash,
            so we never see it and never email it to you. Signing in sets a single cookie on this site that keeps you
            signed in for up to 30 days, or until you sign out. If you forget your password, we email you a reset link; it
            works once and expires after 60 minutes. We use no advertising or tracking cookies.
          </p>
          <h2>Unsubscribing</h2>
          <p>
            Every email has an unsubscribe link. One click stops The Monthly Signal and our other updates, and we
            keep a record that you unsubscribed so you are not added back. Password reset emails you ask for still
            arrive, and you can still sign in.
          </p>
          <p>
            <Link to={{ pathname: homePath, hash: '#pay-check' }} className="ssp-link">
              <span aria-hidden="true">←</span> Back to pay data
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
