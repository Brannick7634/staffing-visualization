import { useId } from 'react'
import { competitivenessExplanation } from './format.js'

// The five-step Pay Competitiveness scale (rules in clientReport.js), with the
// client's level marked. Rendered as an ordered list so the order and the
// current step are announced, not only coloured.
export default function CompetitivenessScale({ levels, active }) {
  const headingId = useId()
  if (!Array.isArray(levels) || !active) return null
  return (
    <section className="ssp-insights__section ssp-insights__compete" aria-labelledby={headingId}>
      <div className="ssp-insights__compete-head">
        <h3 id={headingId} className="ssp-insights__h">Pay Competitiveness</h3>
        <p className={`ssp-insights__level ssp-insights__level--${active.key}`}>{active.label}</p>
      </div>
      <ol className="ssp-scale">
        {levels.map((level) => (
          <li
            key={level.key}
            className={`ssp-scale__step ssp-scale__step--${level.key}${level.active ? ' is-active' : ''}`}
            aria-current={level.active ? 'true' : undefined}
          >
            <span className="ssp-scale__bar" aria-hidden="true" />
            <span className="ssp-scale__label">{level.label}</span>
            <span className="ssp-scale__rule">{level.rule}</span>
            {level.active && <span className="ssp-scale__tag">Client rate</span>}
          </li>
        ))}
      </ol>
      <p className="ssp-insights__explain">{competitivenessExplanation(active.key)}</p>
    </section>
  )
}
