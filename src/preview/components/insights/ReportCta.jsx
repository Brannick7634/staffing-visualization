import { Link } from 'react-router-dom'

// The report hand-off under the insights.
//   example: the first-load national example (a rate nobody entered), so it
//            points to the calculator instead of offering a report.
//   signed in: open the report built from this comparison.
//   signed out: Sign Up Free opens the free-account gate; Sign In goes to the
//            sign-in page. Both go through createClientReport, which re-runs
//            the check and saves where to return (job and place only).
// data-gate-opener lets the gate give focus back to the matching button after
// the results re-render.
export default function ReportCta({ signedIn, example = false, reportHref, onCreateReport, onEnterDetails }) {
  if (example) {
    return (
      <div className="ssp-reportcta">
        <div className="ssp-reportcta__copy">
          <p className="ssp-reportcta__title">This is an example</p>
          <p className="ssp-reportcta__text">
            Enter your client’s job, location and pay rate above to create a Client Pay Market Report.
          </p>
        </div>
        {typeof onEnterDetails === 'function' && (
          <div className="ssp-reportcta__actions">
            <button type="button" className="ssp-btn ssp-btn--primary" onClick={() => onEnterDetails()}>Enter client details</button>
          </div>
        )}
      </div>
    )
  }
  if (signedIn) {
    return (
      <div className="ssp-reportcta ssp-reportcta--in">
        <div className="ssp-reportcta__copy">
          <p className="ssp-reportcta__title">Your Client Pay Market Report is ready</p>
          <p className="ssp-reportcta__text">Two pages, US Letter. Print it, download the PDF or email it to your client.</p>
        </div>
        <div className="ssp-reportcta__actions">
          <Link to={reportHref} className="ssp-btn ssp-btn--primary">
            Open report <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    )
  }
  if (typeof onCreateReport !== 'function') return null
  return (
    <div className="ssp-reportcta">
      <div className="ssp-reportcta__copy">
        <p className="ssp-reportcta__title">Get your own report</p>
        <p className="ssp-reportcta__text">
          Create and download a customized Client Pay Market Report in seconds. Free account, no credit card.
        </p>
      </div>
      <div className="ssp-reportcta__actions">
        <button type="button" className="ssp-btn ssp-btn--primary" data-gate-opener="results-signup" onClick={() => onCreateReport()}>Sign Up Free</button>
        <button type="button" className="ssp-btn ssp-btn--secondary" data-gate-opener="results-signin" onClick={() => onCreateReport({ intent: 'sign-in' })}>Sign In</button>
      </div>
    </div>
  )
}
