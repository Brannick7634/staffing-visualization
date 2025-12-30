import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/Instagram_Profile_1080_FullLogo.png'

function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    
    try {
      const result = await login(formData.email, formData.password)
      if (result.success) {
        navigate('/dashboard')
      } else {
        setError(result.error || 'Invalid email or password')
      }
    } catch (err) {
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <img src={logo} alt="The Staffing Signal logo" className="logo-img" />
          <h1 className="auth-title">Welcome Back</h1>
          <p className="auth-subtitle">Sign in to access The Staffing Signal dashboard</p>
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
          
          <div>
            <div className="form-label">Email address</div>
            <input
              type="email"
              className="form-input"
              placeholder="you@company.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              disabled={loading}
            />
          </div>

          <div>
            <div className="form-label">Password</div>
            <input
              type="password"
              className="form-input"
              placeholder="Enter your password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="cta-submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p className="auth-footer-text">
            Don't have an account?{' '}
            <Link to="/signup" className="auth-link">
              Sign up for access
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

export default Login
