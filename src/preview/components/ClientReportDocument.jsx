import { useEffect, useMemo } from 'react'
import { reportView } from '../../../shared/signal/clientReportPdf.js'
import '../styles/report.css'

// The on-screen and printable Client Pay Market Report: the same two US Letter
// pages as the PDF (shared/signal/clientReportPdf.js), built from the same
// reportView() strings so screen, print and download never disagree.

function Logo({ size = 30 }) {
  return (
    <svg className="ssp-report-logo" width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" focusable="false">
      <rect x="1" y="17" width="7" height="12" rx="1" fill="#1D5EA8" />
      <rect x="11.5" y="10" width="7" height="19" rx="1" fill="#16426E" />
      <rect x="22" y="2" width="7" height="27" rx="1" fill="#102A43" />
    </svg>
  )
}

function PositionBar({ view }) {
  const { bar, position } = view
  if (!bar) return null
  return (
    <figure className={`ssp-report-bar${position.caution ? ' ssp-report-bar--caution' : ''}`}>
      <div className="ssp-report-bar__visual" aria-hidden="true">
        <span className="ssp-report-bar__client" style={{ left: `${bar.client.labelPct}%` }}>{bar.client.label}</span>
        <span className="ssp-report-bar__track">
          {bar.zones.filter((zone) => zone.toPct > zone.fromPct).map((zone) => (
            <span key={zone.key} className={`ssp-report-bar__zone ssp-report-bar__zone--${zone.key}`} style={{ left: `${zone.fromPct}%`, width: `${zone.toPct - zone.fromPct}%` }} />
          ))}
        </span>
        <span className="ssp-report-bar__marker" style={{ left: `${bar.client.xPct}%` }} />
        {bar.ticks.map((tick) => (
          <span key={tick.key} className="ssp-report-bar__tick" style={{ left: `${tick.xPct}%` }} />
        ))}
        {bar.ticks.map((tick) => (
          <span key={`label-${tick.key}`} className="ssp-report-bar__ticklabel" style={{ left: `${tick.labelPct}%` }}>
            <span>{tick.name}</span>
            <strong>{tick.value}</strong>
          </span>
        ))}
      </div>
      <ul className="ssp-report-bar__legend" aria-hidden="true">
        {bar.zones.map((zone) => (
          <li key={zone.key}><span className={`ssp-report-bar__swatch ssp-report-bar__zone--${zone.key}`} />{zone.label}</li>
        ))}
      </ul>
      <figcaption className="ssp-visually-hidden">{bar.summary}</figcaption>
    </figure>
  )
}

function Section({ id, title, children, className = '' }) {
  return (
    <section className={`ssp-report-section ${className}`.trim()} aria-labelledby={id}>
      <h3 id={id} className="ssp-report-h">{title}</h3>
      {children}
    </section>
  )
}

function PageOne({ view, idPrefix }) {
  const id = (name) => `${idPrefix}-${name}`
  return (
    <article className="ssp-report-page" aria-labelledby={id('title')}>
      <header className="ssp-report-brand">
        <span className="ssp-report-brand__mark">
          <Logo size={32} />
          <span>
            <span className="ssp-report-brand__name">{view.brand}</span>
            <span className="ssp-report-brand__tag">{view.tagline}</span>
          </span>
        </span>
        <span className="ssp-report-brand__site">{view.site}</span>
      </header>
      <div className="ssp-report-rule" />

      {view.sampleBand && (
        <p className="ssp-report-sample"><strong>{view.sampleBand.title}</strong> {view.sampleBand.text}</p>
      )}

      <h2 id={id('title')} className="ssp-report-title">{view.title}</h2>
      <p className="ssp-report-subtitle">{view.subtitle}</p>

      <dl className="ssp-report-meta">
        {view.meta.map((item) => (
          <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>
        ))}
      </dl>

      {view.prepared.length > 0 && (
        <dl className="ssp-report-prepared">
          {view.prepared.map((item) => (
            <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>
          ))}
        </dl>
      )}

      <div className="ssp-report-role">
        <p className="ssp-report-kicker">Position</p>
        <p className="ssp-report-role__line">
          <strong>{view.role}</strong>
          {view.firmLine && <span>{view.firmLine}</span>}
        </p>
        {view.limitedNote && <p className="ssp-report-limited" role="note">{view.limitedNote}</p>}
      </div>

      {view.fallbackNote && <p className="ssp-report-note">{view.fallbackNote}</p>}

      <Section id={id('overview')} title="Market pay overview">
        <ul className="ssp-report-tiles">
          {view.tiles.map((tile) => (
            <li key={tile.key} className={`ssp-report-tile${tile.tone ? ` ssp-report-tile--${tile.tone}` : ''}`}>
              <span className="ssp-report-tile__label">{tile.label}</span>
              <span className="ssp-report-tile__sub">{tile.sub}</span>
              <span className="ssp-report-tile__value">{tile.value}<span> /hr</span></span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id={id('position')} title="Client pay position">
        <div className="ssp-report-positionrow">
          <PositionBar view={view} />
          <div className={`ssp-report-gap${view.position.caution ? ' ssp-report-gap--caution' : ''}`}>
            <p className="ssp-report-kicker">Market gap</p>
            <p className="ssp-report-gap__amount">{view.gap.amount}</p>
            <p className="ssp-report-gap__short">{view.gap.short}</p>
            <p className="ssp-report-gap__sentence">{view.gap.sentence}</p>
          </div>
        </div>
      </Section>

      <Section id={id('summary')} title="Executive summary">
        <p className="ssp-report-body">{view.executiveSummary}</p>
      </Section>

      <Section id={id('competitive')} title="Pay competitiveness">
        <ol className="ssp-report-scale">
          {view.levels.map((level) => {
            const warn = level.key === 'severe' || level.key === 'below'
            return (
              <li
                key={level.key}
                className={`ssp-report-step${level.active ? ` is-active${warn ? ' is-warn' : ''}` : ''}`}
                aria-current={level.active ? 'true' : undefined}
              >
                <span className="ssp-report-step__flag" aria-hidden={level.active ? undefined : 'true'}>
                  {level.active ? 'Client rate' : ' '}
                </span>
                <span className="ssp-report-step__label">{level.label}</span>
                <span className="ssp-report-step__rule">{level.rule}</span>
              </li>
            )
          })}
        </ol>
        {view.levelLine && <p className="ssp-report-levelline">{view.levelLine}</p>}
      </Section>

      <Section id={id('ranges')} title="Recommended pay range">
        <ul className="ssp-report-ranges">
          {view.ranges.map((range) => (
            <li key={range.key} className="ssp-report-range">
              <span className="ssp-report-range__label">{range.label}</span>
              <span className="ssp-report-range__value">{range.value}</span>
              <span className="ssp-report-range__rule">{range.rule}</span>
            </li>
          ))}
        </ul>
        <p className="ssp-report-small">{view.rangeNote}</p>
      </Section>

      <footer className="ssp-report-foot">
        <span>{view.runningHead}</span>
        <span>Page 1 of {view.pages}</span>
      </footer>
    </article>
  )
}

function PageTwo({ view, idPrefix }) {
  const id = (name) => `${idPrefix}-${name}`
  const { market, trend } = view
  return (
    <article className="ssp-report-page" aria-label={`${view.title}, page 2 of ${view.pages}`}>
      <header className="ssp-report-brand ssp-report-brand--slim">
        <span className="ssp-report-brand__mark">
          <Logo size={20} />
          <span className="ssp-report-brand__name">{view.brand}</span>
        </span>
        <span className="ssp-report-brand__site">{view.runningHead}</span>
      </header>
      <div className="ssp-report-rule ssp-report-rule--thin" />

      <Section id={id('activity')} title="Market activity" className="ssp-report-section--first">
        {market.scopeLine && <p className="ssp-report-lead">{market.scopeLine}</p>}
        {market.cards.length > 0 ? (
          <ul className="ssp-report-cards">
            {market.cards.map((card) => (
              <li key={card.key} className="ssp-report-card">
                <span className={`ssp-report-card__value${card.tone ? ` ssp-report-card__value--${card.tone}` : ''}`}>{card.value}</span>
                <span className="ssp-report-card__label">{card.label}</span>
                <span className="ssp-report-card__note">{card.note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ssp-report-body">{market.empty}</p>
        )}
        <p className="ssp-report-small">{market.caution}</p>
      </Section>

      <Section id={id('trend')} title="Pay trend">
        <p className="ssp-report-lead">{trend.empty || trend.note}</p>
        {trend.series.length > 0 && (
          <div className="ssp-report-trend">
            {trend.series.map((series) => (
              <div key={series.key} className="ssp-report-trend__series">
                <p className="ssp-report-trend__name">{series.label}</p>
                <ul>
                  {series.points.map((point) => (
                    <li key={point.key} className="ssp-report-trend__row">
                      <span className="ssp-report-trend__period">{point.label}</span>
                      <span className="ssp-report-trend__track" aria-hidden="true">
                        {point.cents !== null && (
                          <span
                            className={`ssp-report-trend__bar${series.key.startsWith('state') ? ' ssp-report-trend__bar--state' : ''}`}
                            style={{ width: `${point.widthPct}%` }}
                          />
                        )}
                      </span>
                      <span className={`ssp-report-trend__value${point.cents === null ? ' is-empty' : ''}`}>{point.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section id={id('read')} title="How to read this report">
        <dl className="ssp-report-defs">
          {view.definitions.map((item) => (
            <div key={item.term}><dt>{item.term}</dt><dd>{item.text}</dd></div>
          ))}
        </dl>
        <div className="ssp-report-rules">
          <div>
            <p className="ssp-report-sub">Pay competitiveness</p>
            <dl className="ssp-report-rulelist">
              {view.rules.map((item) => (
                <div key={item.key}><dt>{item.label}</dt><dd>{item.rule}</dd></div>
              ))}
            </dl>
          </div>
          <div>
            <p className="ssp-report-sub">Recommended pay ranges</p>
            <dl className="ssp-report-rulelist ssp-report-rulelist--wide">
              {view.rangeRules.map((item) => (
                <div key={item.key}><dt>{item.label}</dt><dd>{item.rule}</dd></div>
              ))}
            </dl>
            <p className="ssp-report-body ssp-report-body--small">{view.readClosing}</p>
          </div>
        </div>
      </Section>

      <Section id={id('method')} title="Methodology & disclaimer">
        <p className="ssp-report-body ssp-report-body--small">{view.disclaimer}</p>
        <p className="ssp-report-body ssp-report-body--small">{view.methodNote}</p>
      </Section>

      <footer className="ssp-report-foot">
        <span className="ssp-report-foot__brand"><Logo size={13} />{view.brand} · {view.site}</span>
        <span>Page 2 of {view.pages}</span>
      </footer>
    </article>
  )
}

// While a report is on screen, print shows only its two pages (report.css).
function usePrintOnlyReport() {
  useEffect(() => {
    document.body.classList.add('ssp-report-print')
    return () => document.body.classList.remove('ssp-report-print')
  }, [])
}

export default function ClientReportDocument({ model, idPrefix = 'ssp-report' }) {
  usePrintOnlyReport()
  const view = useMemo(() => reportView(model), [model])
  return (
    <div className="ssp-report-doc">
      <PageOne view={view} idPrefix={idPrefix} />
      <PageTwo view={view} idPrefix={idPrefix} />
    </div>
  )
}
