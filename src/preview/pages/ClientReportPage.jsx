import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ACCESS, REQUEST } from '../../../shared/signal/contract.js'
import { PREPARED_TEXT_MAX, buildClientReportModel, containsLink } from '../../../shared/signal/clientReport.js'
import { geographyLabel } from '../../../shared/signal/geography.js'
import { formatCents, parseHourlyRate } from '../../../shared/signal/money.js'
import { roleByKey } from '../../../shared/signal/taxonomy.js'
import { renderClientReportPdfBlob } from '../../../shared/signal/clientReportPdf.js'
import ClientReportDocument from '../components/ClientReportDocument.jsx'
import EmailReportDialog from '../components/EmailReportDialog.jsx'
import { EVENTS, track } from '../lib/track.js'
import { usePreview } from '../PreviewContext.jsx'
import '../styles/report.css'

// /client-report: the signed-in preview of the Client Pay Market Report built
// from the last checked selection and the client pay rate held in memory. The
// rate is never read from or written to a URL or storage, so a reload loses
// it and the page asks for it again. "Prepared for / by" stay in memory too.

function snapshotDateOf(snapshot) {
  const exact = snapshot?.snapshot?.exactDate
  return typeof exact === 'string' && /^\d{4}-\d{2}-\d{2}/.test(exact) ? exact.slice(0, 10) : null
}

function Panel({ title, children }) {
  return (
    <div className="ssp-report-panel">
      {title && <h2 className="ssp-report-panel__title">{title}</h2>}
      {children}
    </div>
  )
}

function PreparedField({ id, label, value, onChange, error }) {
  return (
    <div className={`ssp-field${error ? ' has-error' : ''}`}>
      <label className="ssp-field__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="ssp-input"
        type="text"
        autoComplete="off"
        maxLength={PREPARED_TEXT_MAX}
        value={value}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value.slice(0, PREPARED_TEXT_MAX))}
      />
      {error && <p id={`${id}-error`} className="ssp-field-error">{error}</p>}
    </div>
  )
}

export default function ClientReportPage() {
  const preview = usePreview()
  const { access, snapshot, snapshotState, reloadSnapshot, payCheck, rateInput, homePath, base, retryPayCheck, openReportGate, signInForReport } = preview

  const [preparedFor, setPreparedFor] = useState('')
  const [preparedBy, setPreparedBy] = useState('')
  const [emailOpen, setEmailOpen] = useState(false)
  const [download, setDownload] = useState({ busy: false, error: null })

  const signedIn = access === ACCESS.AUTHORIZED
  const snapshotKnown = snapshotState !== REQUEST.LOADING || Boolean(snapshot)
  // The snapshot request failed and nothing is loaded: sign-in status is
  // unknown, so offer a retry instead of treating the visitor as signed out.
  const snapshotFailed = snapshotState === REQUEST.ERROR && !snapshot
  const selection = payCheck?.selection && !payCheck.isExample ? payCheck.selection : null

  const rateCents = useMemo(() => {
    const parsed = parseHourlyRate(rateInput)
    if (parsed.ok) return parsed.cents
    return Number.isSafeInteger(payCheck?.rateCents) && payCheck.rateCents > 0 && !payCheck.isExample ? payCheck.rateCents : null
  }, [rateInput, payCheck])

  const forError = containsLink(preparedFor) ? 'Links aren’t allowed.' : null
  const byError = containsLink(preparedBy) ? 'Links aren’t allowed.' : null
  const safeFor = forError ? '' : preparedFor
  const safeBy = byError ? '' : preparedBy

  const ready = payCheck?.requestState === REQUEST.READY && Boolean(selection) && rateCents !== null
  const model = useMemo(() => {
    if (!ready) return null
    return buildClientReportModel({
      payResponse: payCheck.response,
      rateCents,
      preparedFor: safeFor,
      preparedBy: safeBy,
      snapshotDate: payCheck.response?.trend?.snapshotDate || snapshotDateOf(snapshot)
    })
  }, [ready, payCheck, rateCents, safeFor, safeBy, snapshot])

  // Signed out (once the snapshot says so): open the sign-up / sign-in gate.
  const gateOpened = useRef(false)
  useEffect(() => {
    if (!snapshotKnown || snapshotFailed || signedIn || gateOpened.current) return
    gateOpened.current = true
    if (typeof openReportGate === 'function') openReportGate()
  }, [snapshotKnown, snapshotFailed, signedIn, openReportGate])

  const viewedKey = model ? `${model.roleKey}|${model.scope.level}` : null
  const viewed = useRef(null)
  useEffect(() => {
    if (!viewedKey || !signedIn || viewed.current === viewedKey) return
    viewed.current = viewedKey
    track(EVENTS.REPORT_VIEWED, { roleKey: model.roleKey, geographyLevel: model.scope.level })
  }, [viewedKey, signedIn, model])

  const onPrint = useCallback(() => {
    if (!model) return
    track(EVENTS.REPORT_PRINTED, { roleKey: model.roleKey, geographyLevel: model.scope.level })
    window.print()
  }, [model])

  const onDownload = useCallback(async () => {
    if (!model || download.busy) return
    setDownload({ busy: true, error: null })
    try {
      const blob = await renderClientReportPdfBlob(model)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = model.fileName
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
      track(EVENTS.REPORT_DOWNLOADED, { roleKey: model.roleKey, geographyLevel: model.scope.level })
      setDownload({ busy: false, error: null })
    } catch {
      setDownload({ busy: false, error: 'The PDF could not be created. Please try again, or use Print and choose “Save as PDF”.' })
    }
  }, [model, download.busy])

  const payCheckTo = { pathname: homePath, hash: '#pay-check' }

  let body
  if (!snapshotKnown) {
    body = <Panel><p className="ssp-report-panel__text" role="status">Loading your report…</p></Panel>
  } else if (snapshotFailed) {
    body = (
      <Panel title="We couldn’t check your account">
        <p className="ssp-report-panel__text">Please check your connection and try again.</p>
        <div className="ssp-report-panel__actions">
          {typeof reloadSnapshot === 'function' && (
            <button type="button" className="ssp-btn ssp-btn--primary" onClick={() => reloadSnapshot()}>Try again</button>
          )}
          <Link className="ssp-link" to={payCheckTo}>Back to results</Link>
        </div>
      </Panel>
    )
  } else if (!signedIn) {
    body = (
      <Panel title="Sign in to create your report">
        <p className="ssp-report-panel__text">
          A free account lets you create, print, download and email Client Pay Market Reports.
        </p>
        <div className="ssp-report-panel__actions">
          {typeof openReportGate === 'function' && (
            <button type="button" className="ssp-btn ssp-btn--primary" onClick={() => openReportGate()}>Sign up free or sign in</button>
          )}
          <Link className="ssp-link" to={`${base}/sample-report`}>See the sample report first</Link>
        </div>
      </Panel>
    )
  } else if (!selection || rateCents === null) {
    body = (
      <Panel title="Enter the client pay rate">
        <p className="ssp-report-panel__text">For privacy, the client pay rate isn’t saved. Enter it again to build the report.</p>
        <div className="ssp-report-panel__actions">
          <Link className="ssp-btn ssp-btn--primary" to={payCheckTo}>Enter the client pay rate</Link>
        </div>
      </Panel>
    )
  } else if (payCheck.requestState === REQUEST.ERROR) {
    body = (
      <Panel title="We couldn’t load the market data">
        <p className="ssp-report-panel__text">Please try again in a moment.</p>
        <div className="ssp-report-panel__actions">
          <button type="button" className="ssp-btn ssp-btn--primary" onClick={() => retryPayCheck()}>Try again</button>
          <Link className="ssp-link" to={payCheckTo}>Back to results</Link>
        </div>
      </Panel>
    )
  } else if (!ready) {
    body = <Panel><p className="ssp-report-panel__text" role="status">Building your report…</p></Panel>
  } else if (!model) {
    body = (
      <Panel title="No benchmark for this selection yet">
        <p className="ssp-report-panel__text">There is no published pay benchmark for this job and location yet, so a report can’t be built. Try another location or job.</p>
        <div className="ssp-report-panel__actions">
          <Link className="ssp-btn ssp-btn--primary" to={payCheckTo}>Change the job or location</Link>
        </div>
      </Panel>
    )
  }

  const role = selection ? roleByKey(selection.roleKey) : null
  const placeLabel = selection ? (geographyLabel(selection.state, selection.city) || 'Nationwide') : ''

  return (
    <div className="ssp-page ssp-report">
      <div className="ssp-container">
        <div className="ssp-report__toolbar">
          <Link className="ssp-report__back" to={payCheckTo}>
            <span aria-hidden="true">←</span> Back to results
          </Link>
          <h1 className="ssp-report__heading">Client Pay Market Report <span>· Preview</span></h1>
          {model && (
            <div className="ssp-report__actions">
              <button type="button" className="ssp-btn ssp-btn--secondary ssp-btn--sm" onClick={onPrint}>Print</button>
              <button type="button" className="ssp-btn ssp-btn--secondary ssp-btn--sm" onClick={() => setEmailOpen(true)}>Email</button>
              <button type="button" className="ssp-btn ssp-btn--primary ssp-btn--sm" onClick={onDownload} aria-disabled={download.busy ? 'true' : undefined} aria-busy={download.busy ? 'true' : undefined}>
                {download.busy ? 'Creating PDF…' : 'Download PDF'}
              </button>
            </div>
          )}
        </div>
        {download.error && <p className="ssp-report__error" role="alert">{download.error}</p>}

        {body || (
          <div className="ssp-report__layout">
            <aside className="ssp-report__side" aria-label="Report details">
              <dl className="ssp-report__summary">
                <div><dt>Job</dt><dd>{role?.label || model.roleLabel}</dd></div>
                <div><dt>Location</dt><dd>{placeLabel}</dd></div>
                <div><dt>Client Pay Rate</dt><dd>{formatCents(rateCents)}/hr</dd></div>
              </dl>
              <Link className="ssp-link ssp-report__change" to={payCheckTo}>Change</Link>
              <div className="ssp-report__prepared">
                <PreparedField id="ssp-report-prepared-for" label="Prepared for (optional)" value={preparedFor} onChange={setPreparedFor} error={forError} />
                <PreparedField id="ssp-report-prepared-by" label="Prepared by (optional)" value={preparedBy} onChange={setPreparedBy} error={byError} />
                <p className="ssp-report__hint">Shown on the report only. Not saved.</p>
              </div>
            </aside>
            <div className="ssp-report__pages">
              <ClientReportDocument model={model} idPrefix="ssp-client-report" />
            </div>
          </div>
        )}
      </div>

      {emailOpen && model && (
        <EmailReportDialog
          model={model}
          request={{
            roleKey: selection.roleKey,
            state: selection.state || null,
            city: selection.state ? (selection.city || null) : null,
            rateCents,
            preparedFor: safeFor.trim(),
            preparedBy: safeBy.trim()
          }}
          onSignIn={typeof signInForReport === 'function' ? () => { setEmailOpen(false); signInForReport({ signOutFirst: true }) } : undefined}
          onClose={() => setEmailOpen(false)}
        />
      )}
    </div>
  )
}
