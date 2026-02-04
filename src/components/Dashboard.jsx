import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAirtableData } from '../hooks/useAirtable'
import { submitLeadRequest } from '../services/airtable'
import HeatMapWithRankings from './HeatMap'
import { US_STATES } from '../constants/usStates'
import { SEGMENT_NAMES, firmHasPrimarySegment, normalizeSegment, SEGMENT_MAPPING } from '../constants/segments'
import { EMPLOYEE_SIZE_BANDS } from '../constants/employeeSizeBands'
import logo from '../assets/Instagram_Profile_1080_FullLogo.png'
import { 
  countFirmsInSegment, 
  findTopStateForSegment, 
  calculateSegmentGrowth,
  formatGrowthPercentage,
  formatNumber,
  convertDecimalToPercentage
} from '../utils/formulas'
import { getFirmStateName, statesMatch } from '../utils/stateNormalization'

// Header Component
function Header({ user, onLogin, onSignup, onGotoDashboard }) {
  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <img src={logo} alt="The Staffing Signal logo" className="logo-img" />
        <div className="brand-text">
          <div className="brand-title">The Staffing Signal</div>
          <div className="brand-subtitle">See how you stack up</div>
        </div>
      </div>
      <div className="top-bar-right">
        {user ? (
          <>
            <span style={{ 
              marginRight: '10px', 
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              Hi, {user.firstName}
            </span>
            <button className="pill-btn" onClick={onGotoDashboard}>
              Go to Dashboard
            </button>
          </>
        ) : (
          <>
            <button className="pill-btn secondary" onClick={onLogin}>Log in</button>
            <button className="pill-btn" onClick={onSignup}>Get full access</button>
          </>
        )}
      </div>
    </header>
  )
}

// Tab Pills Component
function TabPills({ tabs, activeTab, onTabClick }) {
  return (
    <div className="tabs-row">
      {tabs.map((tab, index) => (
        <div
          key={index}
          className={`tab-pill ${activeTab === index ? 'active' : ''}`}
          onClick={() => onTabClick(index)}
        >
          {tab}
        </div>
      ))}
    </div>
  )
}

// KPI Card Component
function KpiCard({ label, value, helper, positive }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${positive ? 'text-positive' : ''}`}>{value}</div>
      <div className="kpi-helper">{helper}</div>
    </div>
  )
}

// Filter Pills Component
function FilterPills({ filters }) {
  return (
    <div className="filter-row">
      {filters.map((filter, index) => (
        <div key={index} className={`pill-filter ${filter.active ? 'active' : ''}`}>
          <span className="pill-dot"></span>{filter.label}
        </div>
      ))}
    </div>
  )
}

// Mini Panel Component for Rankings
function MiniPanel({ topStates, topSegments }) {
  return (
    <div className="mini-panel">
      <div>
        <div className="mini-title">Top 5 states by 1-yr growth (avg %)</div>
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

      <div style={{ marginTop: '14px' }}>
        <div className="mini-title">Top 3 Segments in the U.S by 1-Y Growth</div>
        <div className="mini-list">
          {topSegments.map((segment, index) => {
            // Format segment name: keep USLH, EOR, PEO, IT, MGF as-is, capitalize first letter for others
            const formatSegmentName = (name) => {
              const upperCaseSegments = ['USLH', 'EOR', 'PEO', 'IT', 'MGF']
              if (upperCaseSegments.includes(name)) return name
              return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
            }
            
            return (
              <div key={index} className="mini-row">
                <span>{formatSegmentName(segment.name)}</span>
                <span className="text-positive">{segment.growth}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

  // Data Table Component
  function DataTable({ firms, onFiltersChange, currentFilters }) {
    const [currentPage, setCurrentPage] = useState(1)
    const recordsPerPage = 5  // Limit to 5 records per page

    // Filter to show only unique state-segment combinations (pick first occurrence)
    // Sort by state and limit to 1 segment per state
    const getUniqueStateSegmentFirms = (firmsList) => {
      const stateSegmentMap = new Map()
      
      // Group firms by state and collect unique segments
      firmsList.forEach(firm => {
        const state = String(firm.hqLocation || firm.hqStateAbbr || '').trim()
        const segment = normalizeSegment(firm.primarySegment || '')
        
        if (!state || !segment) return
        
        if (!stateSegmentMap.has(state)) {
          stateSegmentMap.set(state, new Map())
        }
        
        const segmentsForState = stateSegmentMap.get(state)
        
        // Only add if we haven't seen this segment for this state and haven't reached 1 segment
        if (!segmentsForState.has(segment) && segmentsForState.size < 1) {
          segmentsForState.set(segment, firm)
        }
      })
      
      // Convert back to array and get all states
      const result = []
      const allStates = Array.from(stateSegmentMap.keys())
      
      // Shuffle the states to get random order
      const shuffledStates = allStates.sort(() => Math.random() - 0.5)
      
      // Take only first 5 states
      shuffledStates.slice(0, 5).forEach(state => {
        const segmentsForState = stateSegmentMap.get(state)
        segmentsForState.forEach(firm => {
          result.push(firm)
        })
      })
      
      return result
    }

    // Apply table filters first (segment filter removed - controlled by top-level TabPills)
    const tableFilteredFirms = firms.filter((firm) => {
      // Apply employee size filter
      if (currentFilters.employeeSize && firm.employeeSizeBucket !== currentFilters.employeeSize) {
        return false
      }
      
      // Apply state filter with fuzzy matching
      if (currentFilters.state) {
        const firmState = getFirmStateName(firm)
        if (!statesMatch(firmState, currentFilters.state)) {
          return false
        }
      }
      
      return true
    })

    // Then get unique state-segment combinations from filtered data
    const filteredFirms = getUniqueStateSegmentFirms(tableFilteredFirms)

    // Filter options - use segment mapping
  const segmentOptions = SEGMENT_NAMES.sort()
  
  const employeeSizeOptions = EMPLOYEE_SIZE_BANDS
  
  const stateOptions = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
    'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
    'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
    'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
      'West Virginia', 'Wisconsin', 'Wyoming',
    ]

    // Calculate pagination based on filtered data - limit to just 1 page with 5 records
  const totalPages = 1  // Only show 1 page
  const maxRecords = 5  // Show maximum 5 records
  const limitedFirms = filteredFirms.slice(0, maxRecords)
  const startIndex = 0
  const endIndex = limitedFirms.length
  const currentRecords = limitedFirms
  
  // Reset to page 1 when filters change
  const handleFilterChange = (filterName, value) => {
    onFiltersChange({ ...currentFilters, [filterName]: value })
    setCurrentPage(1)
  }
  
  // Clear all filters
  const clearFilters = () => {
    onFiltersChange({ segment: '', employeeSize: '', state: '' })
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
      if (currentPage <= 2) {
        // Show first 4 pages + last page
        for (let i = 1; i <= 4; i++) pages.push(i)
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 1) {
        // Show first page + last 4 pages
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i)
      } else {
        // Show first, current-1, current, current+1, last
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
          <label className="filter-label">Internal Employees Headcount:</label>
          <select 
            className="filter-select"
            value={currentFilters.employeeSize}
            onChange={(e) => handleFilterChange('employeeSize', e.target.value)}
          >
            <option value="">All Sizes</option>
            {employeeSizeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label className="filter-label">State:</label>
          <select 
            className="filter-select"
            value={currentFilters.state}
            onChange={(e) => handleFilterChange('state', e.target.value)}
          >
            <option value="">All States</option>
            {stateOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        
        {(currentFilters.employeeSize || currentFilters.state) && (
          <button className="filter-clear-btn" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
      </div>
      
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Segment</th>
              <th className="col-hq-location">HQ Location</th>
              <th>Company City</th>
              <th className="col-employee-size">Employee Size Bucket</th>
              <th>Growth 1Y %</th>
            </tr>
          </thead>
          <tbody>
            {currentRecords.map((row, index) => {
              // Determine growth value styling and format as percentage
              const getGrowthClass = (value) => {
                if (!value || value === '-') return ''
                const numValue = parseFloat(value)
                if (numValue > 0) return 'text-positive'
                if (numValue < 0) return 'text-negative'
                return ''
              }
              
              const formatGrowth = (value) => {
                if (value === null || value === undefined || value === '-') return '-'
                // Value is a decimal (0.03 = 3%, -0.1 = -10%)
                const percentage = convertDecimalToPercentage(value)
                return formatGrowthPercentage(percentage)
              }
              
              // Format segment name: keep USLH, EOR, PEO, IT, MGF as-is, capitalize first letter for others
              const formatSegmentName = (name) => {
                if (!name) return '-'
                const upperCaseSegments = ['USLH', 'EOR', 'PEO', 'IT', 'MGF']
                if (upperCaseSegments.includes(name)) return name
                return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
              }
              
              return (
                <tr key={row.id || index}>
                  <td>{formatSegmentName(row.primarySegment)}</td>
                  <td className="col-hq-location">{getFirmStateName(row) || row.hqLocation || '-'}</td>
                  <td>{row.companyCity || '-'}</td>
                  <td className="col-employee-size">
                    {row.employeeSizeBucket ? (
                      <span className="chip">{row.employeeSizeBucket}</span>
                    ) : '-'}
                  </td>
                  <td className={getGrowthClass(row.growth1Y)}>
                    {formatGrowth(row.growth1Y)}
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
    </>
  )
}

// CTA Form Component
function CTAForm() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    firstName: '',
    email: '',
    password: '',
    confirmPassword: '',
    employeeBand: '',
    hqState: '',
    primarySegment: '',
    internalHeadcountGrowth: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false)
  const [disclaimerAgreed, setDisclaimerAgreed] = useState(false)
  const [pendingFormData, setPendingFormData] = useState(null)

  const validatePassword = (password) => {
    const minLength = 8
    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password)

    if (password.length < minLength) {
      return 'Password must be at least 8 characters long'
    }
    if (!hasUpperCase) {
      return 'Password must contain at least one uppercase letter'
    }
    if (!hasLowerCase) {
      return 'Password must contain at least one lowercase letter'
    }
    if (!hasNumber) {
      return 'Password must contain at least one number'
    }
    if (!hasSpecialChar) {
      return 'Password must contain at least one special character (!@#$%^&*(),.?":{}|<>)'
    }
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    // Validate required fields
    if (!formData.employeeBand) {
      setError('Employee band size is required')
      return
    }
    
    if (!formData.internalHeadcountGrowth) {
      setError('Internal headcount growth is required')
      return
    }
    
    const passwordError = validatePassword(formData.password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    // Show disclaimer modal instead of submitting directly
    setPendingFormData(formData)
    setShowDisclaimerModal(true)
  }

  const handleDisclaimerCancel = () => {
    setShowDisclaimerModal(false)
    setDisclaimerAgreed(false)
    setPendingFormData(null)
  }

  const handleDisclaimerAgree = async () => {
    if (!disclaimerAgreed) {
      setError('Please check the box to acknowledge and agree.')
      return
    }

    setShowDisclaimerModal(false)
    setSubmitting(true)
    
    try {
      // Submit to Airtable Staffing Signal Staffing Signal Leads Table (Test) with password
      await submitLeadRequest({
        firstName: pendingFormData.firstName,
        email: pendingFormData.email,
        password: pendingFormData.password,
        employeeBandSize: pendingFormData.employeeBand,
        hqState: pendingFormData.hqState,
        primarySegment: pendingFormData.primarySegment.trim(),
        internalHeadcountGrowth: pendingFormData.internalHeadcountGrowth
      })
      
      navigate('/login')
    } catch (error) {
      setError('Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
      setPendingFormData(null)
      setDisclaimerAgreed(false)
    }
  }

  return (
    <>
      {/* Disclaimer Modal */}
      {showDisclaimerModal && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h2 className="modal-title">Data Notice and User Acknowledgment</h2>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '16px', lineHeight: '1.6' }}>
                The Staffing Signal displays estimates and insights built from public websites and third-party sources, 
                plus our own aggregation and modeling. This information may be incomplete, delayed, inaccurate, or out of date. 
                Metrics like company size, growth rates, segment labels, and location can be misreported by source sites and 
                may not match a company's internal records.
              </p>
              <p style={{ marginBottom: '12px', fontWeight: '600' }}>
                By continuing, you acknowledge and agree:
              </p>
              <ol style={{ marginLeft: '20px', marginBottom: '20px', lineHeight: '1.6' }}>
                <li style={{ marginBottom: '8px' }}>
                  The data and insights are provided "as is" for informational purposes only.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  You will not rely on this information as the sole basis for business, legal, insurance, compliance, 
                  financial, or hiring decisions.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  You are responsible for independently verifying any information before acting on it.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  The Staffing Signal is not affiliated with or endorsed by any listed company unless explicitly stated.
                </li>
              </ol>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                cursor: 'pointer',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                marginTop: '20px'
              }}>
                <input
                  type="checkbox"
                  checked={disclaimerAgreed}
                  onChange={(e) => setDisclaimerAgreed(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', fontWeight: '500' }}>
                  I understand and agree.
                </span>
              </label>
            </div>
            <div className="modal-footer">
              <button 
                className="pill-btn secondary" 
                onClick={handleDisclaimerCancel}
                style={{ minWidth: '120px' }}
                type="button"
              >
                Cancel
              </button>
              <button 
                className="pill-btn primary" 
                onClick={handleDisclaimerAgree}
                disabled={!disclaimerAgreed}
                style={{ minWidth: '180px', opacity: disclaimerAgreed ? 1 : 0.5 }}
                type="button"
              >
                I Agree and Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <form className="cta-form" onSubmit={handleSubmit}>
      {error && (
        <div style={{ 
          color: '#ff3e8a', 
          fontSize: '14px', 
          marginBottom: '16px',
          padding: '12px',
          background: 'rgba(255, 62, 138, 0.1)',
          borderRadius: '8px'
        }}>
          {error}
        </div>
      )}

      <div className="cta-form-row">
        <div>
          <div className="form-label">First name</div>
          <input
            type="text"
            className="form-input"
            placeholder="First name"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            required
          />
        </div>
        <div>
          <div className="form-label">Email address</div>
          <input
            type="email"
            className="form-input"
            placeholder="you@company.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </div>

      <div className="cta-form-row">
        <div>
          <div className="form-label">Password</div>
          <input
            type="password"
            className="form-input"
            placeholder="Create a password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
          <div className="helper-text" style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-secondary)' }}>
            Must be 8+ characters with uppercase, lowercase, number, and special character
          </div>
        </div>
        <div>
          <div className="form-label">Confirm password</div>
          <input
            type="password"
            className="form-input"
            placeholder="Confirm your password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          />
        </div>
      </div>

      <div className="cta-form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div>
          <div className="form-label">Employee Band Size</div>
          <select
            className="form-select"
            value={formData.employeeBand}
            onChange={(e) => setFormData({ ...formData, employeeBand: e.target.value })}
          >
            <option value="">Select employee band</option>
            {EMPLOYEE_SIZE_BANDS.map((band) => (
              <option key={band} value={band}>{band}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="form-label">HQ state</div>
          <select
            className="form-select"
            value={formData.hqState}
            onChange={(e) => setFormData({ ...formData, hqState: e.target.value })}
          >
            <option value="">Select state</option>
            {US_STATES.map((state) => (
              <option key={state.value} value={state.label}>
                {state.value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="form-label">Segment*</div>
          <select
            className="form-select"
            value={formData.primarySegment}
            onChange={(e) => setFormData({ ...formData, primarySegment: e.target.value })}
            required
          >
            <option value="">Select segment</option>
            {Object.entries(SEGMENT_MAPPING).sort(([a], [b]) => a.localeCompare(b)).map(([displayName, airtableValue]) => (
              <option key={airtableValue} value={airtableValue}>{displayName}</option>
            ))}
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      <div className="helper-text" style={{ marginTop: '-8px', marginBottom: '16px' }}>
        * Segment = the staffing segment where your company has the most payroll.
      </div>

      <div>
        <div className="form-label">Employee Headcount Growth (%)</div>
        <select
          className="form-select"
          value={formData.internalHeadcountGrowth}
          onChange={(e) => setFormData({ ...formData, internalHeadcountGrowth: e.target.value })}
        >
          <option value="">Select growth range</option>
          <option value="0-5">0-5%</option>
          <option value="5-10">5-10%</option>
          <option value="10-20">10-20%</option>
          <option value="20-50">20-50%</option>
          <option value="50+">50%+</option>
        </select>
      </div>

      <button type="submit" className="cta-submit" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Request full access'}
      </button>
    </form>
    </>
  )
}

// Loading Spinner Component
function LoadingSpinner() {
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
        <p>Loading data...</p>
      </div>
    </div>
  )
}

// Main Dashboard Component
function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  
  // Initialize activeTab from sessionStorage or default to 0
  const [activeTab, setActiveTab] = useState(() => {
    const saved = sessionStorage.getItem('selectedSegmentTab')
    return saved ? parseInt(saved, 10) : 0
  })
  
  const [tableFilters, setTableFilters] = useState({
    segment: '',
    employeeSize: '',
    state: '',
  })

  const segments = ['All segments', ...SEGMENT_NAMES.sort()]

  // Save activeTab to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('selectedSegmentTab', activeTab.toString())
  }, [activeTab])

  // Fetch ALL data once - no server-side filtering
  const { firms, topStates, topSegments, loading, isConfigured } = useAirtableData()

  const handleLogin = () => {
    navigate('/login')
  }

  const handleSignup = () => {
    navigate('/signup')
  }

  const handleGotoDashboard = () => {
    navigate('/dashboard')
  }

  // Filter firms based on selected segment tab
  const getFilteredFirmsBySegment = () => {
    if (activeTab === 0 || segments[activeTab] === 'All segments') {
      return firms
    }

    const selectedSegment = segments[activeTab]
    return firms.filter(firm => firmHasPrimarySegment(firm, selectedSegment))
  }

  // Calculate stats based on filtered firms
  // Using formulas from src/utils/formulas.js
  const getSegmentStats = () => {
    const filteredFirms = getFilteredFirmsBySegment()
    const selectedSegment = activeTab === 0 ? 'All segments' : segments[activeTab]
    
    // Formula 1: Count firms in segment
    const totalFirms = countFirmsInSegment(filteredFirms, selectedSegment)
    
    // Formula 2: Find top state for segment
    const topStateCode = findTopStateForSegment(filteredFirms, selectedSegment)
    const topStateName = topStateCode !== 'N/A' 
      ? (US_STATES.find(s => s.value === topStateCode)?.label || topStateCode)
      : 'N/A'
    
    // Formula 3: Calculate 1-year growth for segment
    const avgGrowth = calculateSegmentGrowth(filteredFirms, selectedSegment)
    
    return {
      totalFirms: formatNumber(totalFirms),
      topState: topStateName,
      yearGrowth: formatGrowthPercentage(avgGrowth),
    }
  }

  const segmentStats = getSegmentStats()
  const segmentFilteredFirms = getFilteredFirmsBySegment()

  const mapFilters = [
    { label: 'All segments', active: true },
    { label: 'Size band: 50–500 FTE', active: false },
    { label: 'Time frame: Last 12 months', active: true },
    { label: 'Growth band: All', active: false },
    { label: 'Signal tags', active: false },
  ]

  const staticTableFilters = [
    { label: 'Segment: Industrial, Healthcare, IT', active: true },
    { label: 'Location: All states', active: false },
    { label: 'Headcount growth band: 0–20% 1-year', active: false },
    { label: 'Size band: 50–500 internal FTE', active: false },
    { label: 'Signal tags', active: false },
  ]

  return (
    <div className="page-wrapper">
      <div className="dashboard-shell">
        <Header 
          user={user} 
          onLogin={handleLogin} 
          onSignup={handleSignup} 
          onGotoDashboard={handleGotoDashboard} 
        />

        {/* Section 1: Staffing Dashboard */}
        <section className="section-block">
          <div className="section-label">Staffing Dashboard</div>
          <h1 className="section-heading">See the signal for each staffing segment.</h1>
          <p className="section-subtitle">
            Filter thousands of staffing firms by segment, location, growth, and more.
          </p>

          <div className="panel">
            <TabPills tabs={segments} activeTab={activeTab} onTabClick={setActiveTab} />

            {loading ? (
              <LoadingSpinner />
            ) : (
              <div className="segment-kpis">
                <KpiCard
                  label="Firms in this segment"
                  value={segmentStats.totalFirms}
                  helper={activeTab === 0 ? "All segments combined in this view." : `Firms in ${segments[activeTab]} segment.`}
                />
                <KpiCard
                  label="Top state for this segment"
                  value={segmentStats.topState}
                  helper="By total headcount growth."
                />
                <KpiCard
                  label="1-year growth for this segment"
                  value={segmentStats.yearGrowth}
                  helper="Average across all firms in the segment."
                  positive={parseFloat(segmentStats.yearGrowth) > 0}
                />
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Map + Side Panel */}
        <section className="section-block">
          <div className="section-label">US staffing growth by signal</div>
          <h2 className="section-heading" style={{ fontSize: '20px' }}>
            Where the market is heating up by state and segment.
          </h2>

          <div className="panel">
            {loading ? <LoadingSpinner /> : <HeatMapWithRankings key={`heatmap-${activeTab}`} firms={segmentFilteredFirms} />}
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
      {loading ? <LoadingSpinner /> : (
        <DataTable
          firms={segmentFilteredFirms}
          onFiltersChange={setTableFilters}
          currentFilters={tableFilters}
        />
      )}
    </div>
        </section>

        {/* Section 4: CTA */}
        {!user && (
          <section className="section-block">
            <div className="cta-section">
              <div>
                <div className="section-eyebrow">Unlock the full Staffing Signal dashboard.</div>
                <div className="cta-title">Get full dashboard access for your staffing firm.</div>
                <p className="cta-subtitle">
                  See where you sit in the market and what signals matter most for your growth, risk, and margin.
                </p>
                <ul className="cta-list">
                  <li>Interactive US map built on your world.</li>
                  <li>Advanced filters by segment, size, tenure, and growth window.</li>
                  <li>Firm-level benchmarking vs. your peer group and competitors.</li>
                  <li>Access to new risk and compliance signal layers.</li>
                </ul>
                <p className="cta-subtitle" style={{ marginTop: '20px' }}>
                  The Staffing Signal – built by staffing risk specialists for staffing leaders.
                </p>
              </div>
              <CTAForm />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

export default Dashboard
