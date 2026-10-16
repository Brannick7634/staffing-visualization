// The report hand-off under the insights.
//   example: the first-load national example (a rate nobody entered), so it
//            points to the calculator instead of offering a report.
//   signed in: open the report built from this comparison.
//   signed out: Sign Up Free opens the free-account gate; Sign In goes to the
//            sign-in page. Both go through createClientReport, which re-runs
//            the check and saves where to return (job and place only).
// data-gate-opener lets the gate give focus back to the matching button after
// the results re-render.
// outdated: the inputs above no longer match this comparison, so no report
//            can be created from it until the visitor presses Compare again.
export default function ReportCta({ signedIn, example = false, outdated = false, onCreateReport, onEnterDetails }) {
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
  if (outdated) {
    return (
      <div className="ssp-reportcta">
        <div className="ssp-reportcta__copy">
          <p className="ssp-reportcta__title">Your inputs changed</p>
          <p className="ssp-reportcta__text">Press <strong>Compare Client Pay</strong> to update these results before creating a report.</p>
        </div>
      </div>
    )
  }
  if (signedIn && typeof onCreateReport === 'function') {
    return (
      <div className="ssp-reportcta ssp-reportcta--in">
        <div className="ssp-reportcta__copy">
          <p className="ssp-reportcta__title">Next: your Client Pay Report</p>
          <p className="ssp-reportcta__text">Two pages, US Letter, built from this comparison. Print it, download the PDF or email it to your client.</p>
        </div>
        <div className="ssp-reportcta__actions">
          <button type="button" className="ssp-btn ssp-btn--primary" onClick={() => onCreateReport()}>
            Create Client Pay Report <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    )
  }
  if (typeof onCreateReport !== 'function') return null
  return (
    <div className="ssp-reportcta">
      <div className="ssp-reportcta__copy">
        <p className="ssp-reportcta__title">Next: your Client Pay Report</p>
        <p className="ssp-reportcta__text">
          Turn this comparison into a two-page report for your client. A free account is required to create, print, download or email it. No credit card.
        </p>
      </div>
      <div className="ssp-reportcta__actions">
        <button type="button" className="ssp-btn ssp-btn--primary" data-gate-opener="results-signup" onClick={() => onCreateReport()}>Create Client Pay Report</button>
        <button type="button" className="ssp-btn ssp-btn--secondary" data-gate-opener="results-signin" onClick={() => onCreateReport({ intent: 'sign-in' })}>Sign In</button>
      </div>
    </div>
  )
}
