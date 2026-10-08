import { useId, useRef, useState } from 'react'
import { marketActivityItems, nextTabIndex, trendRows } from './format.js'

// Market Activity | Pay Trend: a WAI-ARIA tablist (roving tabindex, arrow
// keys, Home/End). Both panels show aggregates only: posting and firm counts,
// state momentum and the monthly market median.

const TABS = [
  { key: 'activity', label: 'Market Activity' },
  { key: 'trend', label: 'Pay Trend' }
]

function MarketActivity({ market, requested }) {
  const items = marketActivityItems(market)
  if (items.length === 0) {
    return (
      <p className="ssp-insights__empty">
        {requested?.level === 'nationwide'
          ? 'Choose a state or city to see local market activity.'
          : `There isn’t enough published market activity for ${requested?.label || 'this market'} yet.`}
      </p>
    )
  }
  return (
    <>
      <ul className="ssp-activity">
        {items.map((item) => (
          <li key={item.key} className={`ssp-activity__item ssp-activity__item--${item.key}`}>
            <span className="ssp-activity__label">{item.label}</span>
            <span className={`ssp-activity__value ssp-num${item.tone ? ` ssp-${item.tone}` : ''}`}>{item.value}</span>
            {item.note && <span className="ssp-activity__note">{item.note}</span>}
            {item.early && <span className="ssp-chip ssp-activity__chip">Early signal</span>}
          </li>
        ))}
      </ul>
      <p className="ssp-insights__fine">
        Counts cover all staffing jobs, not only this job title. Observed postings, not verified open orders.
      </p>
    </>
  )
}

function PayTrend({ trend }) {
  const groups = trendRows(trend)
  if (!groups) {
    return (
      <p className="ssp-insights__empty">
        Not enough monthly history for this job title yet. Pay trend history began in Aug 2026.
      </p>
    )
  }
  return (
    <>
      <div className="ssp-paytrend">
        {groups.map((group) => (
          <figure key={group.key} className="ssp-paytrend__group">
            <figcaption className="ssp-paytrend__title">{group.label}</figcaption>
            <ul className="ssp-paytrend__rows">
              {group.points.map((point) => (
                <li key={point.period} className={`ssp-paytrend__row${point.typicalCents === null ? ' is-empty' : ''}`}>
                  <span className="ssp-paytrend__period">{point.label}</span>
                  <span className="ssp-paytrend__track" aria-hidden="true">
                    {point.typicalCents !== null && <span className="ssp-paytrend__bar" style={{ width: `${point.widthPct}%` }} />}
                  </span>
                  <span className="ssp-paytrend__value ssp-num">{point.valueText}</span>
                </li>
              ))}
            </ul>
          </figure>
        ))}
      </div>
      <p className="ssp-insights__fine">
        Market median of advertised pay in each monthly snapshot. Pay trend history began in Aug 2026.
      </p>
    </>
  )
}

export default function InsightTabs({ market, trend, requested }) {
  const [selected, setSelected] = useState(0)
  const baseId = useId()
  const tabRefs = useRef([])
  const tabId = (key) => `${baseId}-tab-${key}`
  const panelId = (key) => `${baseId}-panel-${key}`

  function onKeyDown(event) {
    const next = nextTabIndex(selected, event.key, TABS.length)
    if (next === null) return
    event.preventDefault()
    setSelected(next)
    const el = tabRefs.current[next]
    if (el) el.focus()
  }

  return (
    <section className="ssp-insights__section ssp-insights__tabs" aria-label="Market context">
      <div className="ssp-itabs" role="tablist" aria-label="Market context" onKeyDown={onKeyDown}>
        {TABS.map((tab, index) => (
          <button
            key={tab.key}
            ref={(el) => { tabRefs.current[index] = el }}
            type="button"
            role="tab"
            id={tabId(tab.key)}
            className="ssp-itabs__tab"
            aria-selected={index === selected ? 'true' : 'false'}
            aria-controls={panelId(tab.key)}
            tabIndex={index === selected ? 0 : -1}
            onClick={() => setSelected(index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {TABS.map((tab, index) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={panelId(tab.key)}
          className="ssp-itabs__panel"
          aria-labelledby={tabId(tab.key)}
          tabIndex={0}
          hidden={index !== selected}
        >
          {tab.key === 'activity' ? <MarketActivity market={market} requested={requested} /> : <PayTrend trend={trend} />}
        </div>
      ))}
    </section>
  )
}
