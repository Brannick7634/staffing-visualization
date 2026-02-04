import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useProtectedData } from '../hooks/useProtectedData'
import { useAirtableData } from '../hooks/useAirtable'
import { updateUserProfile } from '../services/airtable'
import ProtectedCountyMap from './ProtectedCountyMap'
import HeatMapWithRankings from './HeatMap'
import { SEGMENT_NAMES, SEGMENT_MAPPING, firmHasPrimarySegment, normalizeSegment } from '../constants/segments'
import { US_STATES } from '../constants/usStates'
import { EMPLOYEE_SIZE_BANDS, normalizeEmployeeSize } from '../constants/employeeSizeBands'
import logo from '../assets/Instagram_Profile_1080_FullLogo.png'
import {
  countFirmsInView,
  calculateMedianGrowth,
  calculateTopSegmentsByGrowth,
  findTopCity,
  getUserAverageGrowth,
  calculatePeerMedianGrowth,
  calculatePeerIQRGrowth,
  calculateGrowthGap,
  calculateAverageHeadcountGrowth,
  formatGrowthPercentage,
  formatNumber,
  convertDecimalToPercentage
} from '../utils/formulas'
import { getUniqueValidStates, statesMatch, getFirmStateName } from '../utils/stateNormalization'

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

    // Calculate "Your Average Growth" as average of ALL firms in user's segment
    // Since firms array is already filtered by user's segment (from fetchProtectedFirms),
    // we just calculate the average growth of all these firms
    const allSegmentGrowthValues = firms
      .map(firm => (Number(firm.growth1Y) || 0) * 100)
      .filter(g => !isNaN(g))
    
    const userGrowth = allSegmentGrowthValues.length > 0
      ? allSegmentGrowthValues.reduce((sum, val) => sum + val, 0) / allSegmentGrowthValues.length
      : 0

    // Get normalized size buckets for user
    const userSizeBuckets = normalizeEmployeeSize(user.employeeBandSize).split(',')

    // Filter peer firms: same segment (already filtered) and same employee size
    const peerFirms = firms.filter(firm => {
      const sameSize = userSizeBuckets.includes(firm.employeeSizeBucket)
      return sameSize
    })
    
    // Debug logging for peer firms
    console.log('=== PEER FIRMS CALCULATION ===')
    console.log('User Info:', {
      segment: user.primarySegment,
      sizeBuckets: userSizeBuckets,
      originalSize: user.employeeBandSize
    })
    console.log('Total firms in user segment:', firms.length)
    console.log('Peer firms (same size):', peerFirms.length)
    console.log('User Average Growth (all segment firms):', userGrowth.toFixed(2) + '%')
    console.log('Sample firms:', firms.slice(0, 5).map(f => ({
      id: f.id,
      segment: f.primarySegment,
      sizeBucket: f.employeeSizeBucket,
      growth1Y: f.growth1Y,
      growthPercent: (Number(f.growth1Y) || 0) * 100
    })))
    
    // Get growth values for peer median calculation
    const peerGrowthValues = peerFirms
      .map(firm => (Number(firm.growth1Y) || 0) * 100)
      .filter(g => !isNaN(g))
    
    console.log('Peer growth values (%):', peerGrowthValues.sort((a, b) => a - b))
    console.log('Number of peer firms with valid growth:', peerGrowthValues.length)

    // Formula 17: Calculate peer median growth using the already filtered peer firms
    const peerMedianGrowth = calculateMedianGrowth(peerFirms)
    
    // Calculate IQR growth (outliers removed)
    const iqrData = calculatePeerIQRGrowth(peerFirms) || {}
    
    console.log('Calculated peer median growth:', (peerMedianGrowth || 0).toFixed(2) + '%')
    console.log('Calculated IQR (Q3 - Q1):', (iqrData.iqr || 0).toFixed(2) + '%')
    console.log('Calculated IQR-filtered median:', (iqrData.iqrMedian || 0).toFixed(2) + '%')
    console.log('Outliers eliminated:', iqrData.outliersEliminated || 0)
    console.log('===========================\n')

    // Formula 18: Calculate growth gap
    const gap = calculateGrowthGap(userGrowth, peerMedianGrowth)
    const iqrGap = calculateGrowthGap(userGrowth, iqrData.iqrMedian || 0)

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
      peerMedianGrowth: peerMedianGrowth || 0,
      peerFirmCount: peerFirms.length,
      positionText,
      gap,
      iqr: iqrData.iqr || 0,                       // Actual IQR (Q3 - Q1)
      iqrMedian: iqrData.iqrMedian || 0,           // Median of IQR-filtered values
      iqrQ1: iqrData.q1 || 0,
      iqrQ3: iqrData.q3 || 0,
      iqrGap: iqrGap,
      outliersEliminated: iqrData.outliersEliminated || 0
    }
  }

  const peerData = calculatePeerPosition()

  return (
    <div className="panel" style={{ background: 'linear-gradient(135deg, rgba(16, 217, 205, 0.1) 0%, rgba(253, 18, 123, 0.1) 100%)' }}>
      <div>
        <div className="section-label" style={{ marginBottom: '8px' }}>
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
          gridTemplateColumns: 'repeat(4, 1fr)', 
          gap: '16px',
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>YOUR AVG GROWTH</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: peerData.userGrowth > 0 ? 'var(--accent-teal)' : 'var(--accent-pink)' }}>
              {peerData.userGrowth > 0 ? '+' : ''}{(peerData.userGrowth || 0).toFixed(1)}%
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Avg of all firms in {user?.primarySegment}
            </div>
          </div>
          
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Q1 (25TH PERCENTILE)</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: peerData.iqrQ1 > 0 ? 'var(--accent-teal)' : 'var(--accent-pink)' }}>
              {peerData.iqrQ1 > 0 ? '+' : ''}{(peerData.iqrQ1 || 0).toFixed(1)}%
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Lower quartile growth
            </div>
          </div>

          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>MEDIAN (IQR-FILTERED)</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: peerData.iqrMedian > 0 ? 'var(--accent-teal)' : 'var(--accent-pink)' }}>
              {peerData.iqrMedian > 0 ? '+' : ''}{(peerData.iqrMedian || 0).toFixed(1)}%
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Outliers removed ({peerData.outliersEliminated || 0})
            </div>
          </div>

          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Q3 (75TH PERCENTILE)</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: peerData.iqrQ3 > 0 ? 'var(--accent-teal)' : 'var(--accent-pink)' }}>
              {peerData.iqrQ3 > 0 ? '+' : ''}{(peerData.iqrQ3 || 0).toFixed(1)}%
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Upper quartile growth
            </div>
          </div>
        </div>

        <div style={{ 
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginTop: '16px'
        }}>
          <div style={{ 
            padding: '10px 14px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
            fontSize: '11px',
            color: 'var(--text-muted)'
          }}>
            <strong>Your Avg Growth:</strong> Average of all {firms.length} firms in {user?.primarySegment} segment
            <br />
            <strong>Peer Median:</strong> Median of {peerData.peerFirmCount} firms with same size ({user?.employeeBandSize})
          </div>

          <div style={{ 
            padding: '10px 14px',
            background: 'rgba(16, 217, 205, 0.1)',
            border: '1px solid rgba(16, 217, 205, 0.3)',
            borderRadius: '8px',
            fontSize: '11px',
            color: 'var(--text-muted)'
          }}>
            <span style={{ color: 'var(--accent-teal)', fontWeight: '600' }}>💡 IQR-Filtered Median:</span> Median of middle 50% of peer firms (Q1 to Q3), excluding extreme outliers for stable benchmark.
          </div>
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
  
  // Get state options - use normalized unique valid states
  const stateOptions = getUniqueValidStates(firms)
  
  const employeeBandOptions = [...new Set(firms.map(f => f.employeeSizeBucket).filter(Boolean))].sort()
  const growthBandOptions = [
    'Negative',
    '0-5%',
    '5-10%',
    '10-20%',
    '20%+',
  ]
  
  // Formula 19: Calculate average headcount growth across timeframes
  const calculateAvgHeadcountGrowth = (firm) => {
    return calculateAverageHeadcountGrowth(firm)
  }
  
  // Apply filters to data
  const filteredFirms = firms.filter((firm) => {
    if (filters.segment && !firmHasPrimarySegment(firm, filters.segment)) return false
    
    // Handle state filter with fuzzy matching
    if (filters.state) {
      const firmState = getFirmStateName(firm)
      if (!statesMatch(firmState, filters.state)) return false
    }
    
    if (filters.employeeBand && firm.employeeSizeBucket !== filters.employeeBand) return false
    
    if (filters.growthBand) {
      // growth1Y is a decimal (0.03 = 3%, -0.1 = -10%), convert to percentage
      const growthDecimal = Number(firm.growth1Y) || 0
      const growth = growthDecimal * 100
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
          <label className="filter-label">Segment:</label>
          <select 
            className="filter-select"
            value={filters.segment}
            onChange={(e) => handleFilterChange('segment', e.target.value)}
          >
            <option value="">All Segments</option>
            {segmentOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        
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
          <label className="filter-label">Internal Employee Band:</label>
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
      
      {/* <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>💡</span>
          <span>Scroll horizontally to view all columns →</span>
        </div>
      </div> */}
      
      <div className="table-wrapper" style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: '1000px' }}>
          <thead>
            <tr>
              <th style={{ minWidth: '60px', maxWidth: '70px' }}>Segment</th>
              <th style={{ minWidth: '50px', maxWidth: '60px' }}>HQ<br />Location</th>
              <th style={{ minWidth: '80px', maxWidth: '100px' }}>Company<br />City</th>
              <th style={{ minWidth: '90px', maxWidth: '110px', textAlign: 'center' }}>Internal<br />Employees<br />Headcount</th>
              <th style={{ minWidth: '90px', maxWidth: '110px', textAlign: 'center' }}>Avg<br />Headcount<br />Growth</th>
              <th style={{ minWidth: '90px', maxWidth: '110px', textAlign: 'center' }}>6-Month<br />Growth</th>
              <th style={{ minWidth: '90px', maxWidth: '110px', textAlign: 'center' }}>1-Year<br />Growth</th>
              <th style={{ minWidth: '90px', maxWidth: '110px', textAlign: 'center' }}>2-Year<br />Growth</th>
            </tr>
          </thead>
          <tbody>
            {currentRecords.map((row, index) => {
              const formatGrowthValue = (value) => {
                if (value === null || value === undefined || value === '-') return '-'
                // Value is a decimal (0.03 = 3%, -0.1 = -10%)
                const percentage = convertDecimalToPercentage(value)
                return formatGrowthPercentage(percentage)
              }
              
              const getGrowthClass = (value) => {
                if (value === null || value === undefined || value === '-') return ''
                // Handle both decimal values (0.03) and formatted strings ("+3%")
                let numValue
                if (typeof value === 'string') {
                  numValue = parseFloat(value.replace('%', '').replace('+', ''))
                } else {
                  numValue = Number(value)
                }
                if (isNaN(numValue)) return ''
                if (numValue > 0) return 'text-positive'
                if (numValue < 0) return 'text-negative'
                return ''
              }
              
              // Format segment name: keep USLH, EOR, PEO, IT, MGF as-is, capitalize first letter for others
              const formatSegmentName = (name) => {
                if (!name) return '-'
                const upperCaseSegments = ['USLH', 'EOR', 'PEO', 'IT', 'MGF']
                if (upperCaseSegments.includes(name)) return name
                return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
              }
              
              // Calculate and format average headcount growth
              const avgGrowth = calculateAvgHeadcountGrowth(row)
              const formattedAvgGrowth = formatGrowthPercentage(avgGrowth)
              
              return (
                <tr key={row.id || index}>
                  <td>{formatSegmentName(row.primarySegment)}</td>
                  <td>{getFirmStateName(row) || row.hqLocation || '-'}</td>
                  <td>{row.companyCity || '-'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {row.employeeSizeBucket ? (
                      <span className="chip">{row.employeeSizeBucket}</span>
                    ) : '-'}
                  </td>
                  <td className={getGrowthClass(formattedAvgGrowth)} style={{ textAlign: 'center' }}>
                    {formattedAvgGrowth}
                  </td>
                  <td className={getGrowthClass(row.growth6M)} style={{ textAlign: 'center' }}>
                    {formatGrowthValue(row.growth6M)}
                  </td>
                  <td className={getGrowthClass(row.growth1Y)} style={{ textAlign: 'center' }}>
                    {formatGrowthValue(row.growth1Y)}
                  </td>
                  <td className={getGrowthClass(row.growth2Y)} style={{ textAlign: 'center' }}>
                    {formatGrowthValue(row.growth2Y)}
                  </td>
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

// User Edit Form Component
function UserEditForm({ user, onCancel }) {
  const { updateUser } = useAuth()
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    employeeBandSize: user?.employeeBandSize || '',
    hqState: user?.hqState || '',
    primarySegment: user?.primarySegment || '',
    internalHeadcountGrowth: user?.internalHeadcountGrowth || ''
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Update form data when user changes
  useEffect(() => {
    setFormData({
      firstName: user?.firstName || '',
      employeeBandSize: user?.employeeBandSize || '',
      hqState: user?.hqState || '',
      primarySegment: user?.primarySegment || '',
      internalHeadcountGrowth: user?.internalHeadcountGrowth || ''
    })
  }, [user])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
    setError('')
  }

  const validateForm = () => {
    if (!formData.firstName?.trim()) {
      return 'First name is required'
    }
    if (!formData.employeeBandSize) {
      return 'Company size is required'
    }
    if (!formData.hqState) {
      return 'HQ State is required'
    }
    if (!formData.primarySegment) {
      return 'Segment is required'
    }
    if (!formData.internalHeadcountGrowth) {
      return 'Employee headcount growth is required'
    }
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const result = await updateUserProfile(user.id, formData)
      
      if (result.success) {
        // Update the auth context with new user data
        updateUser(result.user)
        // Close the form
        onCancel()
      } else {
        setError(result.error || 'Failed to update profile')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form id="edit-form" onSubmit={handleSubmit} style={{ 
      display: 'none',
      marginTop: '24px',
      padding: '24px',
      background: 'var(--surface-medium)',
      borderRadius: '8px'
    }}>
      <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--text-primary)' }}>
        Edit Profile Information
      </h3>
      
      {error && (
        <div style={{
          padding: '12px',
          marginBottom: '16px',
          background: 'rgba(253, 18, 123, 0.1)',
          border: '1px solid rgba(253, 18, 123, 0.3)',
          borderRadius: '6px',
          color: 'var(--error-color)',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            EMAIL (Cannot be changed)
          </label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'var(--surface-deep)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-muted)',
              fontSize: '14px',
              cursor: 'not-allowed',
              opacity: 0.6
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            FIRST NAME *
          </label>
          <input
            type="text"
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'var(--surface-deep)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '14px'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            EMPLOYEE BAND SIZE *
          </label>
          <select
            name="employeeBandSize"
            value={formData.employeeBandSize}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'var(--surface-deep)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '14px'
            }}
          >
            <option value="">Select employee band</option>
            {EMPLOYEE_SIZE_BANDS.map((band) => (
              <option key={band} value={band}>{band}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            HQ STATE *
          </label>
          <select
            name="hqState"
            value={formData.hqState}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'var(--surface-deep)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '14px'
            }}
          >
            <option value="">Select state</option>
            {US_STATES.map((state) => (
              <option key={state.value} value={state.label}>
                {state.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            SEGMENT *
          </label>
          <select
            name="primarySegment"
            value={formData.primarySegment}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'var(--surface-deep)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '14px'
            }}
          >
            <option value="">Select segment</option>
            {SEGMENT_NAMES.sort().map(segment => (
              <option key={segment} value={SEGMENT_MAPPING[segment]}>
                {segment}
              </option>
            ))}
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            EMPLOYEE HEADCOUNT GROWTH (%) *
          </label>
          <select
            name="internalHeadcountGrowth"
            value={formData.internalHeadcountGrowth}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'var(--surface-deep)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '14px'
            }}
          >
            <option value="">Select growth range</option>
            <option value="0-5">0-5%</option>
            <option value="5-10">5-10%</option>
            <option value="10-20">10-20%</option>
            <option value="20-50">20-50%</option>
            <option value="50+">50%+</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button
          type="submit"
          disabled={submitting}
          className="pill-btn primary"
          style={{ opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="pill-btn secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// Main Protected Dashboard Component
function ProtectedDashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { firms, loading, isConfigured } = useProtectedData(user)
  const { firms: allFirms, loading: allFirmsLoading } = useAirtableData() // Get all firms data for maps
  const [selectedState, setSelectedState] = useState('')

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  // Data is already filtered by API based on user's segment/state
  
  // Calculate KPIs based on user's data (from API, already filtered by segment)
  const totalFirms = countFirmsInView(firms)
  const medianGrowth = calculateMedianGrowth(firms)
  const topSegmentsData = calculateTopSegmentsByGrowth(firms, 3)
  const topSegment = topSegmentsData[0]?.name || 'N/A'
  const otherSegments = topSegmentsData.slice(1).map(s => s.name).join(', ') || 'None'
  const topCityName = findTopCity(firms)
  
  const cityCounts = {}
  firms.forEach(firm => {
    const city = firm.companyCity
    if (city) cityCounts[city] = (cityCounts[city] || 0) + 1
  })
  const sortedCities = Object.entries(cityCounts).sort(([,a], [,b]) => b - a)
  const otherCities = sortedCities.slice(1, 3).map(([city]) => city).join(', ') || 'None'
  
  const userKPIs = {
    totalFirms: formatNumber(totalFirms),
    medianGrowth: formatGrowthPercentage(medianGrowth),
    topSegment,
    otherSegments,
    topCity: topCityName,
    otherCities
  }

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
                  helper="All firms in your segment"
                />
                <ProtectedKpiCard
                  label="Median 1-yr growth"
                  value={userKPIs.medianGrowth}
                  helper="Compared to all firms in your dataset"
                  positive={parseFloat(userKPIs.medianGrowth) > 0}
                />
                <ProtectedKpiCard
                  label="Your company's segment"
                  value={userKPIs.topSegment}
                  helper={`Also strong: ${userKPIs.otherSegments}`}
                />
                <ProtectedKpiCard
                  label="Top city in your segment"
                  value={userKPIs.topCity}
                  helper={`Also strong: ${userKPIs.otherCities}`}
                />
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Map + Side Panel */}
        <section className="section-block">
          {/* Peer Position Panel - Now on top */}
          {!loading && <PeerPositionPanel user={user} firms={firms} />}

          <div className="panel" style={{ marginTop: '20px' }}>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div className="section-label" style={{ marginBottom: '4px' }}>
                  {selectedState ? `${selectedState} COUNTY DATA` : 'US STAFFING GROWTH BY SIGNAL'}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
                  {selectedState ? 'County-level data for selected state' : 'Heatmap shows all staffing firms data'}
                </p>
              </div>
              <div className="filter-group" style={{ margin: 0 }}>
                <label className="filter-label" style={{ marginRight: '8px', fontSize: '16px', fontWeight: '600' }}>See your segment in a detailed view per State:</label>
                <select 
                  className="filter-select"
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                  style={{ minWidth: '200px' }}
                >
                  <option value="">All States (Heatmap)</option>
                  {US_STATES.map((state) => (
                    <option key={state.value} value={state.label}>
                      {state.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {loading || allFirmsLoading ? (
              <ProtectedLoadingSpinner />
            ) : selectedState ? (
              <ProtectedCountyMap firms={allFirms} userState={selectedState} />
            ) : (
              <HeatMapWithRankings firms={allFirms} hideRankings={true} />
            )}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <div className="section-eyebrow">Your Account Information</div>
                <h2 className="section-heading" style={{ fontSize: '24px', marginBottom: '0' }}>
                  Welcome back, {user?.firstName}!
                </h2>
              </div>
              <button 
                className="pill-btn secondary"
                onClick={() => {
                  const isEditing = document.getElementById('edit-form').style.display === 'block'
                  document.getElementById('edit-form').style.display = isEditing ? 'none' : 'block'
                  document.getElementById('view-info').style.display = isEditing ? 'grid' : 'none'
                }}
              >
                Edit Information
              </button>
            </div>
            
            <div id="view-info" style={{ 
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
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>FIRST NAME</div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{user?.firstName || 'N/A'}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>EMPLOYEE BAND SIZE</div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{user?.employeeBandSize || 'N/A'}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>HQ STATE</div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{user?.hqState || 'N/A'}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>SEGMENT</div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{user?.primarySegment || 'N/A'}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>EMPLOYEE HEADCOUNT GROWTH (%)</div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{user?.internalHeadcountGrowth ? `${user.internalHeadcountGrowth}%` : 'Not provided'}</div>
              </div>
            </div>

            <UserEditForm user={user} onCancel={() => {
              document.getElementById('edit-form').style.display = 'none'
              document.getElementById('view-info').style.display = 'grid'
            }} />
          </div>
        </section>
      </div>
    </div>
  )
}

export default ProtectedDashboard
