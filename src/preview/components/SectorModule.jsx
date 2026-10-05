import { useState } from 'react'
import { ACCESS, COVERAGE } from '../../../shared/signal/contract.js'
import { formatCents } from '../../../shared/signal/money.js'
import { DataModeChip } from './IssueStrip.jsx'
import { TabList } from './MarketPreview.jsx'
import '../styles/sections.css'

// "Read it for your business." Sector tabs (ARIA tabs). Everything inside a
// panel belongs to that sector only: roles from the snapshot's sector list,
// pay rows only for that sector's roles with a national benchmark in
// snapshot.nationalPay. Specialties are navigation, not a ranking. Picking a
// role loads it into the calculator only on click (the open result is then
// marked out of date); switching tabs never touches the calculator.

const USES = [
  'Pay conversations with clients',
  'Recruiting context for open orders',
  'Exploring observed market activity'
]

function hasFigures(entry) {
  return entry &&
    entry.coverage === COVERAGE.PUBLISHABLE &&
    (entry.access === ACCESS.PUBLIC || entry.access === ACCESS.AUTHORIZED) &&
    Number.isInteger(entry.typicalCents)
}

// 'Professional' -> 'professional'; acronyms such as 'IT' stay as written.
function sectorNoun(label) {
  return /^[A-Z]+$/.test(label) ? label : label.toLowerCase()
}

function payRowsFor(sector, nationalPay) {
  const entries = (Array.isArray(nationalPay) ? nationalPay : []).filter((entry) => entry.sectorKey === sector.key && hasFigures(entry))
  const order = new Map((sector.roles || []).map((role, index) => [role.key, index]))
  return entries.sort((a, b) => (order.get(a.roleKey) ?? 99) - (order.get(b.roleKey) ?? 99))
}

function RoleButton({ role, onPickRole }) {
  return (
    <li className="ssp-roles__item">
      <button
        type="button"
        className="ssp-roles__btn"
        onClick={() => onPickRole(role.key)}
        aria-label={`Load ${role.label} into the pay check`}
      >
        <span className="ssp-roles__name">{role.label}</span>
        <span className="ssp-roles__meta">
          {role.hasNationalBenchmark ? 'National example available' : 'No benchmark in our data'}
        </span>
        <span className="ssp-roles__go" aria-hidden="true">Check pay →</span>
      </button>
    </li>
  )
}

function RolesCard({ sector, onPickRole }) {
  const roles = Array.isArray(sector.roles) ? sector.roles : []
  const specialties = roles.filter((role) => role.specialtyOf)
  const healthcare = sector.key === 'healthcare' && specialties.length > 0
  const list = healthcare ? specialties : roles
  const titleId = `ssp-sector-${sector.key}-roles`

  return (
    <article className="ssp-card ssp-sector__card" aria-labelledby={titleId}>
      <h3 id={titleId} className="ssp-card__title">{healthcare ? 'Explore nurse specialties' : 'Explore roles'}</h3>
      {list.length > 0 ? (
        <>
          <p className="ssp-sector__note ssp-muted">
            {healthcare
              ? 'Not ranked: specialty demand counts were not supplied. Choose one to load it into the pay check.'
              : 'Not ranked. Choose one to load it into the pay check.'}
          </p>
          <ul className="ssp-roles">
            {list.map((role) => <RoleButton key={role.key} role={role} onPickRole={onPickRole} />)}
          </ul>
        </>
      ) : (
        <p className="ssp-muted">No title-level roles for this sector in our data.</p>
      )}
    </article>
  )
}

function PayCard({ sector, nationalPay, mode }) {
  const rows = payRowsFor(sector, nationalPay)
  const titleId = `ssp-sector-${sector.key}-pay`
  const typicalLabel = rows.find((row) => row.typicalLabel)?.typicalLabel || 'Typical advertised rate'

  return (
    <article className="ssp-card ssp-sector__card" aria-labelledby={titleId}>
      <div className="ssp-sector__cardhead">
        <h3 id={titleId} className="ssp-card__title">Typical staffing-firm pay · nationwide</h3>
        {rows.length > 0 && <DataModeChip mode={mode} />}
      </div>
      {rows.length > 0 ? (
        <>
          <p className="ssp-sector__note ssp-muted">{typicalLabel}, per hour. Only roles with a national benchmark are listed.</p>
          <ul className="ssp-payrows">
            {rows.map((row) => (
              <li key={row.roleKey} className="ssp-payrows__row">
                <span className="ssp-payrows__role">{row.roleLabel}</span>
                <span className="ssp-payrows__value ssp-num">
                  {formatCents(row.typicalCents)}<span className="ssp-payrows__unit">/hr</span>
                </span>
                {Number.isInteger(row.p25Cents) && Number.isInteger(row.p75Cents) && (
                  <span className="ssp-payrows__range ssp-num ssp-muted">
                    Middle half {formatCents(row.p25Cents)}–{formatCents(row.p75Cents)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="ssp-sector__foot ssp-muted">Staffing-firm postings only. Advertised pay, not actual pay.</p>
        </>
      ) : (
        <div className="ssp-sector__empty">
          <p>No title-level pay benchmarks for {sectorNoun(sector.label)} roles in our data.</p>
          {sector.familiesNote && <p className="ssp-muted">{sector.familiesNote}</p>}
        </div>
      )}
    </article>
  )
}

function UsesCard({ sector }) {
  const titleId = `ssp-sector-${sector.key}-uses`
  return (
    <article className="ssp-card ssp-sector__card" aria-labelledby={titleId}>
      <h3 id={titleId} className="ssp-card__title">What this data is good for</h3>
      <ul className="ssp-uses">
        {USES.map((use) => (
          <li key={use}>
            <span className="ssp-uses__tick" aria-hidden="true">✓</span>
            {use}
          </li>
        ))}
      </ul>
      <p className="ssp-sector__foot ssp-muted">Not a prediction of fills, placements or profit.</p>
    </article>
  )
}

export default function SectorModule({ snapshot, onPickRole }) {
  const sectors = Array.isArray(snapshot?.sectors) ? snapshot.sectors : []
  const [active, setActive] = useState(() => sectors[0]?.key || null)
  if (sectors.length === 0) return null
  const current = sectors.find((sector) => sector.key === active) || sectors[0]
  const pick = typeof onPickRole === 'function' ? onPickRole : () => {}

  return (
    <section className="ssp-section ssp-section--tint ssp-sector" aria-labelledby="ssp-sector-title">
      <div className="ssp-container">
        <div className="ssp-sechead ssp-sechead--tabs">
          <div className="ssp-sechead__text">
            <h2 id="ssp-sector-title" className="ssp-h2">Read it for your business.</h2>
            <p className="ssp-lede">Explore staffing roles and advertised pay in your sector.</p>
          </div>
          <TabList
            idPrefix="ssp-sector"
            label="Sector"
            tabs={sectors.map((sector) => ({ key: sector.key, label: sector.label }))}
            active={current.key}
            onChange={setActive}
            className="ssp-tabs--sectors"
          />
        </div>

        {sectors.map((sector) => (
          <div
            key={sector.key}
            role="tabpanel"
            id={`ssp-sector-panel-${sector.key}`}
            aria-labelledby={`ssp-sector-tab-${sector.key}`}
            hidden={sector.key !== current.key}
            className="ssp-grid-3 ssp-sector__panel"
          >
            {sector.key === current.key && (
              <>
                <RolesCard sector={sector} onPickRole={pick} />
                <PayCard sector={sector} nationalPay={snapshot.nationalPay} mode={snapshot.dataMode} />
                <UsesCard sector={sector} />
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
