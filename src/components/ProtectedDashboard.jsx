import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useProtectedData } from '../hooks/useProtectedData'
import ProtectedCountyMap from './ProtectedCountyMap'
import { SEGMENT_NAMES, firmHasPrimarySegment, normalizeSegment } from '../constants/segments'
import logo from '../assets/Instagram_Profile_1080_FullLogo.png'

// Protected Header Component
function ProtectedHeader({ user, onLogout }) {
  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <img src={logo} alt="The Staffing Signal logo" className="logo-img" />
        <div className="brand-text">
          <div className="brand-title">The Staffing Signal</div>
          <div className="brand-subtitle">Protected Dashboard</div>
        </div>
      </div>
      <div className="top-bar-right">
        <span style={{ 
          marginRight: '10px', 
          color: 'var(--text-primary)',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          Hi, {user?.firstName}
        </span>
        <button className="pill-btn secondary" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  )
}

// Protected KPI Card Component
function ProtectedKpiCard({ label, value, helper, positive }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${positive ? 'text-positive' : ''}`}>{value}</div>
      <div className="kpi-helper">{helper}</div>
    </div>
  )
}



// Protected Mini Panel Component for Rankings
function ProtectedMiniPanel({ topStates }) {
  return (
    <div className="mini-panel">
      <div>
        <div className="mini-title">Top 5 states by 1-yr growth</div>
        <div className="mini-list">
          {topStates.map((state, index) => (
            <div key={state.rank || index} className="mini-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="mini-rank">{state.rank || index + 1}</div>
                <span>{state.name}</span>
              </div>
              <span className="text-positive">{state.growth}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Peer Position Panel Component
function PeerPositionPanel({ user, firms }) {
  // Normalize employee size for comparison
  const normalizeEmployeeSize = (size) => {
    if (!size) return ''
    // Map from user format to database format
    const sizeMap = {
      '1–9 employees': '1-5,6-10',
      '10–24 employees': '11-20,21-50',
      '25–49 employees': '21-50',
      '50–99 employees': '51-100',
      '100–249 employees': '101-250',
      '250–499 employees': '251-500',
      '500–999 employees': '501-1000',
      '1,000+ employees': '>1000'
    }
    return sizeMap[size] || size
  }

  // Calculate peer group comparison
  const calculatePeerPosition = () => {
    if (!user || !firms || firms.length === 0) {
      return {
        position: 'N/A',
        userGrowth: 0,
        peerMedianGrowth: 0,
        peerFirmCount: 0,
        positionText: 'Not enough data',
        gap: 0
      }
    }

    // Get normalized size buckets for user
    const userSizeBuckets = normalizeEmployeeSize(user.employeeBandSize).split(',')

    // Filter peer firms: same segment and same employee size (all companies in database)
    const peerFirms = firms.filter(firm => {
      const sameSegment = user.primarySegment && firmHasPrimarySegment(firm, user.primarySegment)
      const sameSize = userSizeBuckets.includes(firm.employeeSizeBucket)
      
      return sameSegment && sameSize
    })

    // Get user's company growth from the database (find their company in the firms list)
    // Assuming user.email domain or some identifier matches with firms in database
    // For now, we'll get the growth of firms in user's state with same segment and size as a proxy
    const userCompanyFirms = firms.filter(firm => {
      const sameSegment = user.primarySegment && firmHasPrimarySegment(firm, user.primarySegment)
      const sameSize = userSizeBuckets.includes(firm.employeeSizeBucket)
      const sameState = user.hqState && firm.hqStateAbbr === user.hqState.substring(0, 2).toUpperCase()
      
      return sameSegment && sameSize && sameState
    })

    // Calculate user's company growth (average of matching firms in their state)
    const userGrowthValues = userCompanyFirms
      .map(firm => {
        if (firm.growth1YValue !== undefined && firm.growth1YValue !== null) {
          return Number(firm.growth1YValue)
        }
        return 0
      })
      .filter(g => !isNaN(g))

    const userGrowth = userGrowthValues.length > 0
      ? userGrowthValues.reduce((a, b) => a + b, 0) / userGrowthValues.length
      : 0

    // Calculate median growth for ALL peer firms (same segment + same size across all states)
    const peerGrowthValues = peerFirms
      .map(firm => {
        if (firm.growth1YValue !== undefined && firm.growth1YValue !== null) {
          return Number(firm.growth1YValue)
        }
        return 0
      })
      .filter(g => !isNaN(g))
      .sort((a, b) => a - b)

    const peerMedianGrowth = peerGrowthValues.length > 0
      ? peerGrowthValues[Math.floor(peerGrowthValues.length / 2)]
      : 0

    // Calculate gap
    const gap = userGrowth - peerMedianGrowth

    // Determine position
    let position = ''
    let positionText = ''
    
    if (Math.abs(gap) < 2) {
      position = 'close to'
      positionText = `You are tracking closely with your peer group (within ${Math.abs(gap).toFixed(1)}% of median)`
    } else if (gap >= 2) {
      position = 'ahead of'
      positionText = `You are ${gap.toFixed(1)}% ahead of your peer group median`
    } else {
      position = 'behind'
      positionText = `You are ${Math.abs(gap).toFixed(1)}% behind your peer group median`
    }

    return {
      position,
      userGrowth: userGrowth,
      peerMedianGrowth,
      peerFirmCount: peerFirms.length,
      positionText,
      gap,
      userFirmCount: userCompanyFirms.length
    }
  }

  const peerData = calculatePeerPosition()

  return (
    <div className="mini-panel" style={{ background: 'linear-gradient(135deg, rgba(16, 217, 205, 0.1) 0%, rgba(253, 18, 123, 0.1) 100%)' }}>
      <div>
        <div className="mini-title" style={{ fontSize: '14px', marginBottom: '8px' }}>
          My Position vs Market
        </div>
        <div style={{ 
          fontSize: '18px', 
          fontWeight: '700', 
          marginBottom: '16px',
          color: peerData.gap >= 2 ? 'var(--accent-teal)' : peerData.gap <= -2 ? 'var(--accent-pink)' : 'var(--text-primary)'
        }}>
          You are <span style={{ textDecoration: 'underline' }}>{peerData.position}</span> your peer group
        </div>
        
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          {peerData.positionText}
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '12px',
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>YOUR AVG GROWTH</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: peerData.userGrowth > 0 ? 'var(--accent-teal)' : 'var(--accent-pink)' }}>
              {peerData.userGrowth > 0 ? '+' : ''}{peerData.userGrowth.toFixed(1)}%
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {peerData.userFirmCount} firms in {user?.hqState}
            </div>
          </div>
          
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>PEER MEDIAN GROWTH</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: peerData.peerMedianGrowth > 0 ? 'var(--accent-teal)' : 'var(--accent-pink)' }}>
              {peerData.peerMedianGrowth > 0 ? '+' : ''}{peerData.peerMedianGrowth.toFixed(1)}%
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {peerData.peerFirmCount} peer firms
            </div>
          </div>
        </div>

        <div style={{ 
          marginTop: '16px',
          padding: '8px 12px',
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '6px',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}>
          <strong>Peer criteria:</strong> Same segment ({user?.primarySegment}), same size ({user?.employeeBandSize}), all states
        </div>
      </div>
    </div>
  )
}

// Protected Data Table Component
function ProtectedDataTable({ firms }) {
  const [currentPage, setCurrentPage] = useState(1)
  const [filters, setFilters] = useState({
    segment: '',
    state: '',
    employeeBand: '',
    growthBand: '',
  })
  const recordsPerPage = 30
  
  // Get segment options from constants
  const segmentOptions = SEGMENT_NAMES.sort()
  
  const stateOptions = [...new Set(firms.map(f => f.hqStateAbbr).filter(Boolean))].sort()
  const employeeBandOptions = [...new Set(firms.map(f => f.employeeSizeBucket).filter(Boolean))].sort()
  const growthBandOptions = [
    'Negative',
    '0-5%',
    '5-10%',
    '10-20%',
    '20%+',
  ]
  
  // Apply filters to data
  const filteredFirms = firms.filter((firm) => {
    if (filters.segment && !firmHasPrimarySegment(firm, filters.segment)) return false
    if (filters.state && firm.hqStateAbbr !== filters.state) return false
    if (filters.employeeBand && firm.employeeSizeBucket !== filters.employeeBand) return false
    
    if (filters.growthBand) {
      const growth = parseFloat(String(firm.growth1Y || '0%').replace('%', ''))
      if (filters.growthBand === 'Negative' && growth >= 0) return false
      if (filters.growthBand === '0-5%' && (growth < 0 || growth > 5)) return false
      if (filters.growthBand === '5-10%' && (growth < 5 || growth > 10)) return false
      if (filters.growthBand === '10-20%' && (growth < 10 || growth > 20)) return false
      if (filters.growthBand === '20%+' && growth < 20) return false
    }
    
    return true
  })
  
  // Calculate pagination based on filtered data
  const totalPages = Math.ceil(filteredFirms.length / recordsPerPage)
  const startIndex = (currentPage - 1) * recordsPerPage
  const endIndex = startIndex + recordsPerPage
  const currentRecords = filteredFirms.slice(startIndex, endIndex)
  
  // Reset to page 1 when filters change
  const handleFilterChange = (filterName, value) => {
    setFilters((prev) => ({ ...prev, [filterName]: value }))
    setCurrentPage(1)
  }
  
  // Clear all filters
  const clearFilters = () => {
    setFilters({ segment: '', state: '', employeeBand: '', growthBand: '' })
    setCurrentPage(1)
  }
  
  // Handle page changes
  const goToPage = (page) => {
    setCurrentPage(page)
  }
  
  const goToPrevious = () => {
    if (currentPage > 1) goToPage(currentPage - 1)
  }
  
  const goToNext = () => {
    if (currentPage < totalPages) goToPage(currentPage + 1)
  }
  
  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages = []
    const maxPagesToShow = 5
    
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i)
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i)
      } else {
        pages.push(1)
        pages.push('...')
        pages.push(currentPage - 1)
        pages.push(currentPage)
        pages.push(currentPage + 1)
        pages.push('...')
        pages.push(totalPages)
      }
    }
    
    return pages
  }
  
  return (
    <>
      {/* Filters */}
      <div className="table-filters">
        <div className="filter-group">
          <label className="filter-label">HQ State:</label>
          <select 
            className="filter-select"
            value={filters.state}
            onChange={(e) => handleFilterChange('state', e.target.value)}
          >
            <option value="">All States</option>
            {stateOptions.map((option, index) => (
              <option key={`state-${index}-${option}`} value={option}>{option}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label className="filter-label">Employee Band:</label>
          <select 
            className="filter-select"
            value={filters.employeeBand}
            onChange={(e) => handleFilterChange('employeeBand', e.target.value)}
          >
            <option value="">All Bands</option>
            {employeeBandOptions.map((option, index) => (
              <option key={`band-${index}-${option}`} value={option}>{option}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label className="filter-label">Growth Band (1-yr):</label>
          <select 
            className="filter-select"
            value={filters.growthBand}
            onChange={(e) => handleFilterChange('growthBand', e.target.value)}
          >
            <option value="">All Growth</option>
            {growthBandOptions.map((option, index) => (
              <option key={`growth-${index}-${option}`} value={option}>{option}</option>
            ))}
          </select>
        </div>
        
        {(filters.segment || filters.state || filters.employeeBand || filters.growthBand) && (
          <button className="filter-clear-btn" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
      </div>
      
      <div className="table-wrapper" style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: '1800px' }}>
          <thead>
            <tr>
              <th>Company ID</th>
              <th>Segments</th>
              <th>HQ State Abbr</th>
              <th>HQ Location</th>
              <th>Company City</th>
              <th># EE Count</th>
              <th>Employee Size Bucket</th>
              <th>Founded</th>
              <th>Average Tenure</th>
              <th>Tenure Bucket</th>
              <th>6-Month Growth</th>
              <th>1-Year Growth</th>
              <th>2-Year Growth</th>
              <th>LinkedIn URL</th>
              <th>Postal Code</th>
            </tr>
          </thead>
          <tbody>
            {currentRecords.map((row, index) => {
              const formatGrowthValue = (value) => {
                if (!value || value === '-' || value === null || value === undefined) return '-'
                
                // Convert to string and check if it already has a % sign
                const strValue = String(value).trim()
                if (strValue === '0' || strValue === '0%') return '0%'
                
                // Parse the numeric value
                let numValue = parseFloat(strValue.replace('%', ''))
                
                // If the original value was a decimal (like 0.05 or -0.1) without %, 
                // it likely represents a percentage already (5% or -10%)
                if (!strValue.includes('%') && Math.abs(numValue) < 1) {
                  numValue = numValue * 100
                }
                
                if (isNaN(numValue)) return '-'
                
                // Format with sign and percentage
                const sign = numValue > 0 ? '+' : ''
                return `${sign}${numValue.toFixed(1)}%`
              }
              
              const getGrowthClass = (value) => {
                if (!value || value === '-') return ''
                const numValue = parseFloat(String(value).replace('%', ''))
                if (numValue > 0) return 'text-positive'
                if (numValue < 0) return 'text-negative'
                return ''
              }
              
              return (
                <tr key={row.id || index}>
                  <td>{row.companyId || '-'}</td>
                  <td>{row.segments || '-'}</td>
                  <td>{row.hqStateAbbr || '-'}</td>
                  <td>{row.hqLocation || '-'}</td>
                  <td>{row.companyCity || '-'}</td>
                  <td>{row.eeCount ? row.eeCount.toLocaleString() : '-'}</td>
                  <td>
                    {row.employeeSizeBucket ? (
                      <span className="chip">{row.employeeSizeBucket}</span>
                    ) : '-'}
                  </td>
                  <td>{row.founded || '-'}</td>
                  <td>{row.averageTenure ? `${row.averageTenure} yrs` : '-'}</td>
                  <td>
                    {row.tenureBucket ? (
                      <span className="chip">{row.tenureBucket}</span>
                    ) : '-'}
                  </td>
                  <td className={getGrowthClass(row.growth6M)}>
                    {formatGrowthValue(row.growth6M)}
                  </td>
                  <td className={getGrowthClass(row.growth1Y)}>
                    {formatGrowthValue(row.growth1Y)}
                  </td>
                  <td className={getGrowthClass(row.growth2Y)}>
                    {formatGrowthValue(row.growth2Y)}
                  </td>
                  <td>
                    {row.linkedinUrl ? (
                      <a href={row.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-teal)' }}>
                        View
                      </a>
                    ) : '-'}
                  </td>
                  <td>{row.postalCode || '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            className="pagination-btn"
            onClick={goToPrevious}
            disabled={currentPage === 1}
          >
            ← Previous
          </button>
          
          <div className="pagination-numbers">
            {getPageNumbers().map((page, index) => (
              page === '...' ? (
                <span key={`ellipsis-${index}`} className="pagination-ellipsis">...</span>
              ) : (
                <button
                  key={page}
                  className={`pagination-number ${currentPage === page ? 'active' : ''}`}
                  onClick={() => goToPage(page)}
                >
                  {page}
                </button>
              )
            ))}
          </div>
          
          <button 
            className="pagination-btn"
            onClick={goToNext}
            disabled={currentPage === totalPages}
          >
            Next →
          </button>
        </div>
      )}
      
      <div className={`pagination-info ${totalPages <= 1 ? 'pagination-info-no-pages' : ''}`}>
        Showing {filteredFirms.length > 0 ? startIndex + 1 : 0}-{Math.min(endIndex, filteredFirms.length)} of {filteredFirms.length} records
        {filteredFirms.length !== firms.length && (
          <span style={{ color: 'var(--accent-teal)', marginLeft: '8px' }}>
            (filtered from {firms.length} total)
          </span>
        )}
      </div>
    </>
  )
}

// Protected Loading Spinner Component
function ProtectedLoadingSpinner() {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      padding: '40px',
      color: 'var(--text-muted)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner"></div>
        <p>Loading protected data...</p>
      </div>
    </div>
  )
}

// Main Protected Dashboard Component
function ProtectedDashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { firms, loading, isConfigured } = useProtectedData(user)

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  // Data is already filtered by API based on user's segment/state
  
  // Calculate KPIs based on user's filtered data
  const getUserKPIs = () => {
    // Data is already filtered by API, just use firms directly
    
    // 1. Firms in this view
    const totalFirms = firms.length
    
    // 2. Median 1-year growth
    const growthValues = firms
      .map(firm => {
        // growth1Y is a decimal (-0.1 = -10%), growth1YValue is a number (-10 = -10%)
        if (firm.growth1Y !== undefined && firm.growth1Y !== null && typeof firm.growth1Y === 'number') {
          return firm.growth1Y * 100 // Convert decimal to percentage (-0.1 → -10)
        } else if (firm.growth1YValue !== undefined && firm.growth1YValue !== null) {
          return Number(firm.growth1YValue) // Already a percentage (-10 = -10%)
        }
        return 0
      })
      .filter(g => !isNaN(g))
      .sort((a, b) => a - b)
    
    const medianGrowth = growthValues.length > 0
      ? growthValues[Math.floor(growthValues.length / 2)]
      : 0
    
    // 3. Top Segments in this view
    const segmentCounts = {}
    firms.forEach(firm => {
      const segment = firm.primarySegment || 'Unknown'
      segmentCounts[segment] = (segmentCounts[segment] || 0) + 1
    })
    const sortedSegments = Object.entries(segmentCounts)
      .sort(([,a], [,b]) => b - a)
    const topSegment = sortedSegments[0]?.[0] || 'N/A'
    const otherSegments = sortedSegments.slice(1, 3).map(([seg]) => seg).join(', ') || 'None'
    
    // 4. Top City in this view
    const cityCounts = {}
    firms.forEach(firm => {
      const city = firm.companyCity || 'Unknown'
      cityCounts[city] = (cityCounts[city] || 0) + 1
    })
    const sortedCities = Object.entries(cityCounts)
      .sort(([,a], [,b]) => b - a)
    const topCity = sortedCities[0]?.[0] || 'N/A'
    const otherCities = sortedCities.slice(1, 3).map(([city]) => city).join(', ') || 'None'
    
    return {
      totalFirms: totalFirms.toLocaleString(),
      medianGrowth: medianGrowth > 0 ? `+${medianGrowth.toFixed(1)}%` : `${medianGrowth.toFixed(1)}%`,
      topSegment,
      otherSegments,
      topCity,
      otherCities
    }
  }

  const userKPIs = getUserKPIs()

  return (
    <div className="page-wrapper">
      <div className="dashboard-shell">
        <ProtectedHeader 
          user={user} 
          onLogout={handleLogout}
        />

        {/* Section 1: Protected Staffing Dashboard */}
        <section className="section-block">
          <div className="section-label">See if you are ahead, behind or closing the gap.</div>
          <h1 className="section-heading">Get the big picture, then work the list.</h1>
          <p className="section-subtitle">
            Quick snapshot cards up top show the shape of your current view. Scroll down to filter and scan the full list of firms.
          </p>

          <div className="panel">
            {loading ? (
              <ProtectedLoadingSpinner />
            ) : (
              <div className="segment-kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                <ProtectedKpiCard
                  label="Firms in this view"
                  value={userKPIs.totalFirms}
                  helper="After your current filters are applied"
                />
                <ProtectedKpiCard
                  label="Median 1-yr growth"
                  value={userKPIs.medianGrowth}
                  helper="Compared to all firms in your dataset"
                  positive={parseFloat(userKPIs.medianGrowth) > 0}
                />
                <ProtectedKpiCard
                  label="Top Segments in this view"
                  value={userKPIs.topSegment}
                  helper={`Also strong: ${userKPIs.otherSegments}`}
                />
                <ProtectedKpiCard
                  label="Top city in this view"
                  value={userKPIs.topCity}
                  helper={`Also strong: ${userKPIs.otherCities}`}
                />
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Map + Side Panel */}
        <section className="section-block">
          <div className="panel">
            <div className="two-column">
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <div className="section-label" style={{ marginBottom: '4px' }}>
                    {user?.hqState ? `${user.hqState.toUpperCase()} IN THIS VIEW` : 'US STAFFING GROWTH BY SIGNAL'}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
                    Map updates with your current filter
                  </p>
                </div>
                {loading ? <ProtectedLoadingSpinner /> : <ProtectedCountyMap firms={firms} userState={user?.hqState} />}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Peer Position Panel */}
                {!loading && <PeerPositionPanel user={user} firms={firms} />}
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Firms Table */}
        <section className="section-block">
          <div className="section-label">Firms behind the signal</div>
          <h2 className="section-heading" style={{ fontSize: '20px' }}>
            See the actual firms driving each signal.
          </h2>
          <p className="section-subtitle" style={{ fontSize: '12px' }}>
            Filterable table of staffing firms tied to every state and growth signal in your current view.
          </p>

          <div className="panel" style={{ paddingTop: '16px' }}>
            {loading ? <ProtectedLoadingSpinner /> : <ProtectedDataTable firms={firms} />}
          </div>
        </section>

        {/* Section 4: Protected Info */}
        <section className="section-block">
          <div className="panel" style={{ padding: '32px' }}>
            <div className="section-eyebrow">Your Account Information</div>
            <h2 className="section-heading" style={{ fontSize: '24px', marginBottom: '16px' }}>
              Welcome back, {user?.firstName}!
            </h2>
            
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginTop: '24px'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>EMAIL</div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{user?.email}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>COMPANY SIZE</div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{user?.employeeBandSize || 'N/A'}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>HQ STATE</div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{user?.hqState || 'N/A'}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>PRIMARY SEGMENT</div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{user?.primarySegment || 'N/A'}</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default ProtectedDashboard
