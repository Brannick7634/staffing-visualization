import { Link } from 'react-router-dom'
import { formatCents } from '../../../shared/signal/money.js'
import { FORCE_SITE, usePreview } from '../PreviewContext.jsx'
import '../styles/sections.css'

// "How we count" — public-facing methodology (brief §11 + the verified facts
// in the implementation spec §6), followed by a clearly boxed set of preview
// build notes that are for Andy and are NOT public copy. Data figures shown
// here come from the snapshot payload only.

const DEFAULT_MOMENTUM_BASIS = 'Normalized posting momentum: latest 45 days vs. the previous 45, measured relative to the change across all observed states. Early signal — not raw growth, a demand forecast or a pay change.'

const SECTIONS = [
  { id: 'collect', title: 'What we collect' },
  { id: 'pay', title: 'Advertised pay' },
  { id: 'your-rate', title: 'Your rate stays in your browser' },
  { id: 'read', title: 'How to read a result' },
  { id: 'publish', title: 'When we publish a figure' },
  { id: 'demand', title: 'Demand counts and momentum' },
  { id: 'access', title: 'What free access unlocks' },
  { id: 'fresh', title: 'Freshness' }
]

function Section({ id, title, children }) {
  return (
    <section className="ssp-method__section" aria-labelledby={`ssp-m-${id}`}>
      <h2 id={`ssp-m-${id}`} className="ssp-method__h2">{title}</h2>
      {children}
    </section>
  )
}

function BuildNotes({ snapshot }) {
  const forklift = (snapshot?.nationalPay || []).find((entry) => entry.roleKey === 'forklift-operator')
  const forkliftP25 = forklift && Number.isInteger(forklift.p25Cents) ? formatCents(forklift.p25Cents) : null

  return (
    <aside className="ssp-buildnotes" aria-labelledby="ssp-buildnotes-title">
      <p className="ssp-buildnotes__flag">Not public copy</p>
      <h2 id="ssp-buildnotes-title" className="ssp-buildnotes__title">Preview build notes — for Andy, not public copy</h2>

      <h3 className="ssp-buildnotes__h3">Verification results (read-only inspection of the 2 October data)</h3>
      <ul className="ssp-buildnotes__list">
        <li>
          All five supplied national pay examples reproduce under the preview build and pass the five-firm / 50% rule.
          The figures stay labeled “Development example”.
        </li>
        <li>
          Preview build method: one pay value per posting (the midpoint of an advertised range); the typical rate is
          the middle value of those; the 25th/75th percentiles use Python's <code>statistics.quantiles(n=4)</code>
          “exclusive” method; staffing firms come from a company-level ID list; weekly travel packages are excluded.
        </li>
        <li>
          The production <code>pay_benchmarks</code> table does <strong>not</strong> reproduce these figures: it
          mixes in direct employers, uses linear quantiles and has no single-firm share check. It needs fixing before
          any production benchmark is shown.
        </li>
        <li>
          A Houston, TX Forklift Operator city cell exists in the pipeline but fails the five-firm rule. The preview
          shows no Houston figure, only the “No verified Houston benchmark” message.
        </li>
        <li>
          The deployed <code>/api/signal/*</code> endpoints are not connected to data yet and fail closed (no
          figures). Only the local dev server serves the supplied examples.
        </li>
      </ul>

      <h3 className="ssp-buildnotes__h3">Open items needing a decision or a fix</h3>
      <ul className="ssp-buildnotes__list">
        <li>
          <strong>Quantile method sensitivity.</strong> The supplied Forklift Operator 25th percentile
          {forkliftP25 ? ` (${forkliftP25})` : ''} matches only the exclusive method; linear interpolation gives a
          slightly higher value. Pick and document one method before launch.
        </li>
        <li>
          <strong>Staffing filter.</strong> Confirm the company-level staffing-firm list is the production
          definition, and how it is maintained.
        </li>
        <li>
          <strong>What counts as “new”.</strong> The preview uses the first-observed date. Known pipeline bug: it
          should use the provider posting date when present (<code>COALESCE(posting_date, first_seen)</code>).
          Repost handling and collection gaps still need a written definition.
        </li>
        <li>
          <strong>Momentum formula limits.</strong> Preview formula: (state latest 45 ÷ state previous 45) ÷
          (all-states latest ÷ all-states previous) − 1, blank when the previous window is under 30 postings. It
          offsets overall collection growth; it is not a per-state search-effort adjustment, and comparable history
          is short.
        </li>
        <li>
          <strong>Data rights.</strong> Confirm the provider contracts allow aggregated display, caching and
          redistribution by email.
        </li>
        <li>
          <strong>Newsletter checkbox default.</strong> The signup form's Monthly Signal box is checked by default.
          This needs your approval (or switch it to unchecked), along with the final signup wording.
        </li>
        <li>
          <strong>Free preview allowlist.</strong> “Top five heating states and top three cities from the default
          nationwide ranking” is a proposed interpretation of the access rule. Please confirm it.
        </li>
        <li>
          <strong>Share deferred.</strong> The approved image's Share button is left out of v1 because a share link
          could leak the visitor's entered rate.
        </li>
        <li>
          <strong>About page copy.</strong> The ownership line on the About stub is draft copy for your approval.
        </li>
      </ul>
    </aside>
  )
}

export default function MethodologyPage() {
  const { snapshot, homePath, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const meta = snapshot?.snapshot
  const momentumBasis = snapshot?.momentum?.basis || DEFAULT_MOMENTUM_BASIS

  return (
    <div className="ssp-page ssp-method">
      <div className="ssp-container ssp-method__layout">
        <header className="ssp-method__head">
          <p className="ssp-eyebrow">Methodology</p>
          <h1 className="ssp-page__title">How we count</h1>
          <p className="ssp-lede">
            The Staffing Signal summarizes pay that staffing firms advertise in public job postings. Here is what we
            collect, how we turn it into a benchmark, and what the numbers can and cannot tell you.
          </p>
          {meta?.label && (
            <p className="ssp-method__snapshot ssp-muted">
              Snapshot: {meta.label}
              {meta.methodologyVersion ? ` · methodology ${meta.methodologyVersion}` : ' · methodology version: not yet assigned'}
            </p>
          )}
        </header>

        <nav className="ssp-method__toc" aria-label="On this page">
          <p className="ssp-method__tochead">On this page</p>
          <ul>
            {SECTIONS.map((s) => <li key={s.id}><a href={`#ssp-m-${s.id}`}>{s.title}</a></li>)}
            {!site && <li><a href="#ssp-buildnotes-title">Preview build notes</a></li>}
          </ul>
        </nav>

        <div className="ssp-method__body">
          <Section id="collect" title="What we collect">
            <p>
              We collect public job postings from staffing firms each week, from two job-data providers. Organizations
              hiring directly for themselves are excluded: these benchmarks use staffing-firm postings only.
            </p>
            <p>
              We remove duplicates before counting, including the same posting seen through both providers and
              repeated postings. What we hold is observed coverage of the market, not a census of every staffing job in
              the United States.
            </p>
            <p>
              Some postings name a state but not a city. We never invent a city or use a firm's headquarters instead,
              so city totals need not add up to state totals. Pay data is richer in some states (for example CA, CO,
              NY, WA, IL and MD); that is a coverage observation, not proof that those figures represent other states.
            </p>
          </Section>

          <Section id="pay" title="Advertised pay">
            <p>
              Pay comes from structured pay fields or recognizable pay text in a posting. It is <strong>advertised</strong>
              {' '}pay, not what anyone was actually paid.
            </p>
            <ul className="ssp-method__list">
              <li>Each posting counts once. When a posting advertises a range, we use the midpoint of that range rather than treating both ends as two postings.</li>
              <li>Salaried pay is converted to an hourly figure using 2,080 hours a year, and we say so where it applies.</li>
              <li>Weekly travel packages are kept separate. They can include stipends, so they are never compared with an hourly base rate.</li>
              <li>We never mix pay currencies, pay periods or different jobs in one benchmark.</li>
              <li>The “typical advertised rate” is the middle of the advertised rates. The “middle half” runs from the 25th to the 75th percentile of advertised rates.</li>
            </ul>
          </Section>

          <Section id="your-rate" title="Your rate stays in your browser">
            <p>
              When you check a rate, our server sends back only the benchmark range for the job and place you chose.
              The comparison with your rate happens on your device. Your rate is not sent to our server, not put in the
              page address, not recorded in analytics, and never added to the advertised-pay data.
            </p>
          </Section>

          <Section id="read" title="How to read a result">
            <ul className="ssp-method__list">
              <li><strong>Below the typical advertised range:</strong> your rate is under the 25th percentile of advertised rates.</li>
              <li><strong>Within the typical advertised range:</strong> your rate is between the 25th and 75th percentiles, inclusive.</li>
              <li><strong>Above the typical advertised range:</strong> your rate is over the 75th percentile. That does not make it the highest rate in the market.</li>
            </ul>
            <p>
              The bar is a dollar scale, not a percentile estimate. Two summary points cannot tell us your exact
              percentile, so we don't show one. Advertised rates do not predict whether an order will fill.
            </p>
          </Section>

          <Section id="publish" title="When we publish a figure">
            <p>We publish a figure only when both of these are true for that exact job, place, pay type and period:</p>
            <ul className="ssp-method__list">
              <li>at least <strong>three distinct staffing firms</strong> contribute, and</li>
              <li>no single firm contributes <strong>more than 50%</strong> of the underlying observations.</li>
            </ul>
            <p>
              A pay figure must pass using only the firms that contribute usable pay — a large number of postings does
              not make a pay benchmark publishable. When a figure fails, it is unavailable to everyone; signing up never
              overrides it. We never display an individual staffing firm or posting.
            </p>
            <p>
              These rules reduce the risk of revealing any one firm. They are not a legal safe harbor or a guarantee of
              anonymity.
            </p>
          </Section>

          <Section id="demand" title="Demand counts and momentum">
            <p>
              Posting counts are new staffing-firm postings we observed in a period. They show observed activity — not
              verified open orders, worker shortages, unique vacancies, placements or profit.
            </p>
            <p>{momentumBasis}</p>
            <p>
              When there is not enough comparable history we show “Not enough comparable history” rather than 0% or
              “steady”. More postings do not mean pay is rising.
            </p>
          </Section>

          <Section id="access" title="What free access unlocks">
            <p>
              Anyone can see nationwide pay ranges, the top five heating states and the top three cities from the
              default nationwide ranking. Free access adds every publishable state and city view, full rankings,
              cooling markets and preferences. Access does not mean every job and place has data.
            </p>
          </Section>

          <Section id="fresh" title="Freshness">
            <p>
              Data refreshes weekly; The Monthly Signal is published monthly. Nothing here is real time. We show the
              date of the last successful refresh next to results
              {meta?.lastSuccessfulRefresh ? ` (currently ${meta.lastSuccessfulRefresh})` : ' — that date is not available yet'}.
            </p>
          </Section>

          {!site && <BuildNotes snapshot={snapshot} />}

          <p className="ssp-method__back">
            <Link to={{ pathname: homePath || '/preview', hash: '#pay-check' }} className="ssp-link">
              <span aria-hidden="true">←</span> Back to the pay check
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
