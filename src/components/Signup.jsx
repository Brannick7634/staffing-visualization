import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { submitLeadRequest } from '../services/airtable'
import { US_STATES } from '../constants/usStates'
import { SEGMENT_NAMES, SEGMENT_MAPPING } from '../constants/segments'
import { EMPLOYEE_SIZE_BANDS } from '../constants/employeeSizeBands'
import logo from '../assets/Instagram_Profile_1080_FullLogo.png'

function Signup() {
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
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
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
    setError('') // Clear any previous errors
    
    try {
      // Submit to Airtable Staffing Signal Staffing Signal Leads Table (Test) with password
      const result = await submitLeadRequest({
        firstName: pendingFormData.firstName,
        email: pendingFormData.email,
        password: pendingFormData.password,
        employeeBandSize: pendingFormData.employeeBand,
        hqState: pendingFormData.hqState,
        primarySegment: pendingFormData.primarySegment,
        internalHeadcountGrowth: pendingFormData.internalHeadcountGrowth
      })
      
      if (result.success) {
        navigate('/login')
      } else {
        setError(result.error || 'Failed to submit. Please try again.')
      }
    } catch (err) {
      setError('Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
      setPendingFormData(null)
      setDisclaimerAgreed(false)
    }
  }

  return (
    <div className="auth-page">
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
              >
                Cancel
              </button>
              <button 
                className="pill-btn primary" 
                onClick={handleDisclaimerAgree}
                disabled={!disclaimerAgreed}
                style={{ minWidth: '180px', opacity: disclaimerAgreed ? 1 : 0.5 }}
              >
                I Agree and Continue
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="auth-container auth-container-wide">
        <div className="auth-header">
          <img src={logo} alt="The Staffing Signal logo" className="logo-img" />
          <h1 className="auth-title">Request Full Access</h1>
          <p className="auth-subtitle">
            Get full dashboard access for your staffing firm. See where you sit in the market.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
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
                required
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
                required
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
                required
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
                required
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
                required
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
              <div className="form-label">Segment*</div>
              <select
                className="form-select"
                value={formData.primarySegment}
                onChange={(e) => setFormData({ ...formData, primarySegment: e.target.value })}
                required
              >
                <option value="">Select Segment</option>
                {SEGMENT_NAMES.sort().map(segment => (
                  <option key={segment} value={SEGMENT_MAPPING[segment]}>{segment}</option>
                ))}
                <option value="other">Other</option>
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
            {submitting ? 'Submitting...' : 'Request Full Access'}
          </button>
        </form>

        <div className="auth-footer">
          <p className="auth-footer-text">
            Already have an account?{' '}
            <Link to="/login" className="auth-link">
              Sign in
            </Link>
          </p>
          <p className="auth-footer-text" style={{ marginTop: '8px' }}>
            <Link to="/" className="auth-link">
              ← Back to main page
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Signup
