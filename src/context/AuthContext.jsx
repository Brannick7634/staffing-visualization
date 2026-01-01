import { createContext, useContext, useState, useEffect } from 'react'
import { verifyCredentials } from '../services/airtable'

const AuthContext = createContext(null)

// Token expiry: 4 hours in milliseconds
const TOKEN_EXPIRY_HOURS = 4
const TOKEN_EXPIRY_MS = TOKEN_EXPIRY_HOURS * 60 * 60 * 1000

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

// Generate a simple token
const generateToken = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

// Check if token is expired
const isTokenExpired = (expiryTime) => {
  return Date.now() > expiryTime
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing session on mount
    const storedToken = localStorage.getItem('authToken')
    const storedUser = localStorage.getItem('user')
    const tokenExpiry = localStorage.getItem('tokenExpiry')

    if (storedToken && storedUser && tokenExpiry) {
      if (!isTokenExpired(parseInt(tokenExpiry))) {
        setUser(JSON.parse(storedUser))
      } else {
        // Token expired, clear storage
        localStorage.removeItem('authToken')
        localStorage.removeItem('user')
        localStorage.removeItem('tokenExpiry')
      }
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    try {
      // Verify credentials with Airtable
      const result = await verifyCredentials(email, password)
      
      if (result.success) {
        const token = generateToken()
        const expiryTime = Date.now() + TOKEN_EXPIRY_MS
        
        const userSession = {
          email: result.user.email,
          firstName: result.user.firstName,
          employeeBandSize: result.user.employeeBandSize,
          hqState: result.user.hqState,
          primarySegment: result.user.primarySegment,
          internalHeadcountGrowth: result.user.internalHeadcountGrowth
        }

        // Store token and user data
        localStorage.setItem('authToken', token)
        localStorage.setItem('user', JSON.stringify(userSession))
        localStorage.setItem('tokenExpiry', expiryTime.toString())
        
        setUser(userSession)
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, error: 'Login failed. Please try again.' }
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('authToken')
    localStorage.removeItem('user')
    localStorage.removeItem('tokenExpiry')
  }

  // Check if user is authenticated
  const isAuthenticated = () => {
    const token = localStorage.getItem('authToken')
    const tokenExpiry = localStorage.getItem('tokenExpiry')
    
    if (!token || !tokenExpiry) return false
    
    if (isTokenExpired(parseInt(tokenExpiry))) {
      logout()
      return false
    }
    
    return true
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  )
}
