import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { COVERAGE, REQUEST } from '../../../shared/signal/contract.js'
import { formatCents, parseHourlyRate } from '../../../shared/signal/money.js'
import { fetchScenarios } from '../api.js'
import { MomentumRows, NoHistory, momentumCaption } from '../components/MarketPreview.jsx'
import ResultCard from '../components/ResultCard.jsx'
import { usePreview } from '../PreviewContext.jsx'
import '../styles/sections.css'

// Interaction States Lab (dev only). Every scenario comes from
// GET /api/signal/dev/scenarios, which runs the same service code as the real
// endpoints against a synthetic adapter (fake role, fake places). Every card is
// watermarked SYNTHETIC TEST DATA. Nothing on this page is market data.

const WATERMARK = 'SYNTHETIC TEST DATA'
const noop = () => {}

// Typed inputs only (not data): what the shared rate parser accepts/rejects.
const RATE_INPUTS = ['17', '17.5', '17.50', '$17.00', ' 17 ', '', 'abc', '-5', '0', '0.00', 'Infinity', 'NaN', '1e3', '17.555', '1,000', '17..5', '$', '١٧', '1000']

function Watermark() {
  return <p className="ssp-lab__mark" aria-label="Synthetic test data">{WATERMARK}</p>
}

function ScenarioCard({ scenario }) {
  const titleId = `ssp-lab-${scenario.key}`
  return (
    <article className="ssp-lab__card" aria-labelledby={titleId}>
      <Watermark />
      <h2 id={titleId} className="ssp-lab__title">{scenario.title}</h2>
      {scenario.description && <p className="ssp-lab__desc">{scenario.description}</p>}
      <p className="ssp-lab__meta ssp-muted">
        Key <code>{scenario.key}</code> · viewer {scenario.viewer?.access || 'public'}
        {scenario.viewer?.simulated ? ' (simulated)' : ''}
      </p>
      {scenario.kind === 'momentum' ? (
        <MomentumCard momentum={scenario.momentum} />
      ) : (
        <ResultCard
          response={scenario.response || null}
          rateCents={Number.isInteger(scenario.rateCents) ? scenario.rateCents : null}
          requestState={scenario.requestState || REQUEST.READY}
          isExample={false}
          isOutOfDate={Boolean(scenario.isOutOfDate)}
          onCompareLocal={noop}
          onUnlock={noop}
          onSeeFallback={noop}
          onNotify={noop}
          onRetry={noop}
          dataModeLabel="Synthetic test data"
          snapshot={scenario.snapshot || null}
        />
      )}
    </article>
  )
}

function MomentumCard({ momentum }) {
  const noHistory = !momentum || momentum.coverage === COVERAGE.INSUFFICIENT_HISTORY
  const heating = Array.isArray(momentum?.heating?.rows) ? momentum.heating.rows : []
  const cooling = Array.isArray(momentum?.cooling?.rows) ? momentum.cooling.rows : []
  return (
    <div className="ssp-card ssp-lab__momentum">
      <p className="ssp-card__title">Markets to watch</p>
      <p className="ssp-market__caption">{momentumCaption(momentum)}</p>
      {noHistory ? (
        <NoHistory momentum={momentum} />
      ) : (
        <>
          {heating.length > 0 && <MomentumRows rows={heating} direction="heat" />}
          {cooling.length > 0 && <MomentumRows rows={cooling} direction="cool" />}
        </>
      )}
      {momentum?.basis && <p className="ssp-market__basis ssp-muted">{momentum.basis}</p>}
    </div>
  )
}

// Client-only UI states built from scenario payloads (no new figures).
function uiOnlyScenarios(scenarios) {
  const within = scenarios.find((s) => s.key === 'verdict-within')
  const extra = [{
    key: 'ui-loading',
    title: 'Loading (client state)',
    description: 'While a benchmark request is in flight: skeleton and “Checking…”, no figures.',
    kind: 'pay',
    viewer: within?.viewer || { access: 'public', simulated: true },
    rateCents: within?.rateCents ?? null,
    requestState: REQUEST.LOADING,
    response: null
  }]
  if (within) {
    extra.push({
      ...within,
      key: 'ui-out-of-date',
      title: 'Out of date (client state)',
      description: 'Inputs changed after a result: the verdict is dimmed behind “Out of date — press Create Client Pay Report”.',
      isOutOfDate: true
    })
  }
  return extra
}

function RateValidation() {
  return (
    <section className="ssp-lab__rates" aria-labelledby="ssp-lab-rates">
      <h2 id="ssp-lab-rates" className="ssp-lab__title">Rate input validation (live, from shared/signal/money.js)</h2>
      <p className="ssp-lab__desc">
        Typed test inputs run through <code>parseHourlyRate</code> on this page. These are input checks, not market
        data. The upper limit is an input sanity check, not a market maximum.
      </p>
      <ul className="ssp-lab__ratelist">
        {RATE_INPUTS.map((input) => {
          const parsed = parseHourlyRate(input)
          return (
            <li key={`r-${input}`} className={`ssp-lab__rate${parsed.ok ? ' is-ok' : ' is-bad'}`}>
              <code className="ssp-lab__input">{JSON.stringify(input)}</code>
              <span className="ssp-lab__verdict">
                {parsed.ok ? (
                  <><span aria-hidden="true">✓ </span>Accepted → <span className="ssp-num">{formatCents(parsed.cents)}</span></>
                ) : (
                  <><span aria-hidden="true">✕ </span>Rejected (<code>{parsed.code}</code>): {parsed.message}</>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function StatesLabPage() {
  const { homePath } = usePreview()
  const [state, setState] = useState({ status: REQUEST.LOADING, data: null, error: null })

  const load = useCallback(async () => {
    setState({ status: REQUEST.LOADING, data: null, error: null })
    try {
      const data = await fetchScenarios()
      setState({ status: REQUEST.READY, data, error: null })
    } catch (error) {
      setState({ status: REQUEST.ERROR, data: null, error })
    }
  }, [])

  useEffect(() => { load() }, [load])

  const scenarios = Array.isArray(state.data?.scenarios) ? state.data.scenarios : []
  const all = scenarios.length ? [...scenarios, ...uiOnlyScenarios(scenarios)] : []

  return (
    <div className="ssp-page ssp-lab">
      <div className="ssp-container">
        <header className="ssp-lab__head">
          <p className="ssp-eyebrow">Development only</p>
          <h1 className="ssp-page__title">Interaction states lab</h1>
          <p className="ssp-lab__banner" role="note">
            <strong>{WATERMARK}.</strong> {state.data?.note || 'Synthetic test values on a fake role and fake places. Not market data.'}
            {' '}Every card below uses “Example Role” in “Example City, EX” / “Example State (EX)”.
          </p>
          <p className="ssp-muted">
            Each pay scenario is produced by the same service code as the real endpoints (privacy check, then access
            check) and rendered with the homepage's result card. Buttons on this page do nothing.{' '}
            <Link to={homePath || '/preview'} className="ssp-link">Back to the homepage preview</Link>
          </p>
        </header>

        {state.status === REQUEST.LOADING && (
          <div className="ssp-card ssp-status" role="status">
            <p className="ssp-status__title">Loading synthetic scenarios…</p>
          </div>
        )}
        {state.status === REQUEST.ERROR && (
          <div className="ssp-card ssp-status" role="alert">
            <p className="ssp-status__title">The scenarios couldn't load.</p>
            <p className="ssp-muted">They are served only by the local dev server (<code>/api/signal/dev/scenarios</code>).</p>
            <button type="button" className="ssp-btn ssp-btn--secondary" onClick={load}>Retry</button>
          </div>
        )}
        {state.status === REQUEST.READY && (
          <>
            <p className="ssp-lab__count ssp-muted">{all.length} states shown.</p>
            <div className="ssp-lab__grid">
              {all.map((scenario) => <ScenarioCard key={scenario.key} scenario={scenario} />)}
            </div>
          </>
        )}

        <RateValidation />
      </div>
    </div>
  )
}
