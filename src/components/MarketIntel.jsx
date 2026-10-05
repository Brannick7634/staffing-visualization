import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMarketIntel } from '../hooks/useMarketIntel'
import logo from '../assets/Instagram_Profile_1080_FullLogo.png'

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value || 0)

const formatChange = (value) => {
  if (value == null) return null
  const rounded = Number(value)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(1)}%`
}

function Header({ user, onLogout, onCompanyData, onHomeClick }) {
  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <img src={logo} alt="The Staffing Signal logo" className="logo-img" />
        <div className="brand-text">
          <div className="brand-title">The Staffing Signal</div>
          <div className="brand-subtitle">Market Intelligence</div>
        </div>
      </div>
      <div className="top-bar-right">
        <span style={{ marginRight: '10px', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500' }}>
          Hi, {user?.firstName}
        </span>
        <button className="pill-btn" onClick={onHomeClick}>Home</button>
        <button className="pill-btn" onClick={onCompanyData}>Job Signals</button>
        <button className="pill-btn secondary" onClick={onLogout}>Log out</button>
      </div>
    </header>
  )
}

function KpiCard({ label, value, helper, positive }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${positive ? 'text-positive' : ''}`}>{value}</div>
      <div className="kpi-helper">{helper}</div>
    </div>
  )
}

function RankPanel({ title, rows, emptyLabel }) {
  return (
    <div className="mini-panel">
      <div>
        <div className="mini-title">{title}</div>
        <div className="mini-list">
          {rows.length === 0 && <div className="mini-row"><span>{emptyLabel}</span></div>}
          {rows.map((row, index) => {
            const change = formatChange(row.change_pct)
            return (
              <div key={row.key || index} className="mini-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="mini-rank">{index + 1}</div>
                  <span>{row.key}</span>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{formatNumber(row.active_jobs)} jobs</span>
                  {change && (
                    <span className={Number(row.change_pct) >= 0 ? 'text-positive' : 'text-negative'}>
                      {change}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function MarketIntel() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { data, loading, error } = useMarketIntel()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  if (loading) {
    return (
      <div className="page-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" aria-hidden="true" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-wrapper">
        <div className="dashboard-shell">
          <Header user={user} onLogout={handleLogout} onCompanyData={() => navigate('/company-data')} onHomeClick={() => navigate('/dashboard')} />
          <section className="section-block">
            <p style={{ color: '#ed1764' }}>Failed to load market intelligence: {error}</p>
          </section>
        </div>
      </div>
    )
  }

  const summary = data?.summary || {}

  return (
    <div className="page-wrapper">
      <div className="dashboard-shell">
        <Header user={user} onLogout={handleLogout} onCompanyData={() => navigate('/company-data')} onHomeClick={() => navigate('/dashboard')} />

        <section className="section-block">
          <div className="section-eyebrow">LIVE JOB-POSTING DATA ACROSS THE STAFFING INDUSTRY</div>
          <h2 className="section-heading">Market Intelligence</h2>
          <p className="section-subtitle">
            Aggregated hiring demand by market, segment, and role — sourced from live job postings, updated daily.
            {data?.asOf ? ` As of ${data.asOf}.` : ''}
          </p>
        </section>

        <section className="company-kpi-grid" aria-label="Market intelligence summary">
          <KpiCard label="COMPANIES TRACKED" value={formatNumber(summary.companies_tracked)} helper="in the monitored universe" />
          <KpiCard label="COMPANIES ACTIVELY HIRING" value={formatNumber(summary.companies_active)} helper="with at least one open role" />
          <KpiCard label="ACTIVE JOB POSTINGS" value={formatNumber(summary.active_jobs)} helper="currently live" />
          <KpiCard label="HIRING SIGNALS (30D)" value={formatNumber(data?.signalCount30d)} helper="notable hiring-activity events detected" positive />
        </section>

        <section className="section-block" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          <RankPanel title="TOP MARKETS BY ACTIVE JOBS" rows={data?.markets || []} emptyLabel="No market data yet" />
          <RankPanel title="TOP SEGMENTS BY ACTIVE JOBS" rows={data?.segments || []} emptyLabel="No segment data yet" />
          <RankPanel title="TOP ROLE FAMILIES BY ACTIVE JOBS" rows={data?.roles || []} emptyLabel="No role data yet" />
        </section>
      </div>
    </div>
  )
}
