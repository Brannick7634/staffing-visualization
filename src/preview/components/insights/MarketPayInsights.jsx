import { useId } from 'react'
import { formatCents } from '../../../../shared/signal/money.js'
import PayBand from '../PayBand.jsx'
import CompetitivenessScale from './CompetitivenessScale.jsx'
import InsightTabs from './InsightTabs.jsx'
import { clientTileNote, formatSignedPerHour, gapHeadline, gapSentence, rangeTexts } from './format.js'

// "Market Pay Insights" (mockup B1): the homepage view of a client pay
// comparison. Everything shown comes from one buildClientReportModel model, so
// the page and the Client Pay Market Report always say the same thing.

function Tile({ label, value, note, tone = null, emphasis = false }) {
  return (
    <li className={`ssp-tile${tone ? ` ssp-tile--${tone}` : ''}${emphasis ? ' ssp-tile--client' : ''}`}>
      <span className="ssp-tile__label">{label}</span>
      <span className="ssp-tile__value ssp-num">{value}<small>/hr</small></span>
      {note && <span className="ssp-tile__note">{note}</span>}
    </li>
  )
}

function Note({ children }) {
  return (
    <div className="ssp-notice">
      <span className="ssp-notice__icon" aria-hidden="true">i</span>
      <div className="ssp-notice__text"><p>{children}</p></div>
    </div>
  )
}

// Figures without a client rate (should not happen on the homepage, where the
// rate is validated before every check): the market tiles and band only.
export function MarketFiguresOnly({ figures, placeLabel }) {
  return (
    <div className="ssp-insights">
      <ul className="ssp-insights__tiles ssp-insights__tiles--3" aria-label="Market pay overview">
        <Tile label="Market Low" value={formatCents(figures.p25Cents)} note="25th percentile" />
        <Tile label="Market Median" value={formatCents(figures.typicalCents)} note="Typical advertised" />
        <Tile label="Market High" value={formatCents(figures.p75Cents)} note="75th percentile" />
      </ul>
      <PayBand p25Cents={figures.p25Cents} typicalCents={figures.typicalCents} p75Cents={figures.p75Cents} geographyLabel={placeLabel} />
      <p className="ssp-insights__fine">Enter a client pay rate to see where it falls.</p>
    </div>
  )
}

export default function MarketPayInsights({ model, note, before = null, after = null }) {
  const positionId = useId()
  const gapId = useId()
  const rangesId = useId()
  const takeawayId = useId()
  const { figures, gap } = model
  // Amber only under the market low, the same rule as the report and PDF.
  const tone = model.position.key === 'below' ? 'below' : null
  const ranges = rangeTexts(model.ranges)
  const shownNote = note === undefined ? model.fallbackNote : note

  return (
    <div className={`ssp-insights ssp-insights--${model.competitiveness.key}`}>
      {/* Small-sample caution, first so it sits under the "from N staffing firms" line. */}
      {model.limitedDataNote && <p className="ssp-caution ssp-insights__limited" role="note">{model.limitedDataNote}</p>}
      {shownNote && <Note>{shownNote}</Note>}
      {before}

      <ul className="ssp-insights__tiles" aria-label="Market pay overview">
        <Tile label="Market Low" value={formatCents(figures.p25Cents)} note="25th percentile" />
        <Tile label="Market Median" value={formatCents(figures.typicalCents)} note="Typical advertised" />
        <Tile label="Market High" value={formatCents(figures.p75Cents)} note="75th percentile" />
        <Tile label="Client Pay Rate" value={formatCents(model.rateCents)} note={clientTileNote(gap)} tone={tone} emphasis />
      </ul>

      <div className="ssp-insights__position">
        <section className="ssp-insights__section ssp-insights__band" aria-labelledby={positionId}>
          <h3 id={positionId} className="ssp-insights__h">Your Client’s Pay Position</h3>
          <p className={`ssp-insights__position-label ssp-insights__position-label--${model.position.key}`}>{model.position.label}</p>
          <PayBand
            rateCents={model.rateCents}
            p25Cents={figures.p25Cents}
            typicalCents={figures.typicalCents}
            p75Cents={figures.p75Cents}
            geographyLabel={model.scope.label}
          />
        </section>
        <section
          className={`ssp-insights__section ssp-gap ssp-gap--${gap.direction}${tone ? ' ssp-gap--caution' : ''}`}
          aria-labelledby={gapId}
        >
          <h3 id={gapId} className="ssp-insights__h">Market Gap</h3>
          <p className="ssp-gap__value ssp-num">{formatSignedPerHour(gap.gapCents)}</p>
          <p className="ssp-gap__headline">{gapHeadline(gap)}</p>
          <p className="ssp-gap__text">{gapSentence(gap)}</p>
        </section>
      </div>

      <CompetitivenessScale levels={model.levels} active={model.competitiveness} />

      <div className="ssp-insights__pair">
        <InsightTabs market={model.market} trend={model.trend} requested={model.requested} />
        <section className="ssp-insights__section ssp-insights__ranges" aria-labelledby={rangesId}>
          <h3 id={rangesId} className="ssp-insights__h">Recommended Pay Range</h3>
          <ul className="ssp-ranges">
            <li className="ssp-ranges__item ssp-ranges__item--competitive">
              <span className="ssp-ranges__label">Competitive Range</span>
              <span className="ssp-ranges__value ssp-num">{ranges.competitive}<small>/hr</small></span>
              <span className="ssp-ranges__rule">Market median to market high</span>
            </li>
            <li className="ssp-ranges__item ssp-ranges__item--aggressive">
              <span className="ssp-ranges__label">Aggressive Recruiting Range</span>
              <span className="ssp-ranges__value ssp-num">{ranges.aggressive}<small>/hr</small></span>
              <span className="ssp-ranges__rule">Above the market high</span>
            </li>
          </ul>
          <p className="ssp-insights__fine">Targets describe the market. They don’t guarantee an order fills.</p>
        </section>
      </div>

      <section className="ssp-insights__section ssp-takeaway" aria-labelledby={takeawayId}>
        <h3 id={takeawayId} className="ssp-insights__h">Quick Takeaway</h3>
        <p className="ssp-takeaway__text">{model.takeaway}</p>
      </section>

      {after}
    </div>
  )
}
