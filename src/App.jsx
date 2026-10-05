import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

// Page components are lazy so each route downloads only what it needs (the
// /preview bundle never pulls in the dashboard's amCharts code).
const Login = lazy(() => import('./components/Login'))
const Signup = lazy(() => import('./components/Signup'))
const Dashboard = lazy(() => import('./components/Dashboard'))
const ProtectedDashboard = lazy(() => import('./components/ProtectedDashboard'))
const CompanyData = lazy(() => import('./components/CompanyData'))
const MarketIntel = lazy(() => import('./components/MarketIntel'))
// The pay-first site (src/preview/) is the homepage. Production mounts it at
// "/" with <PreviewApp site /> (Variant B, real endpoints, no dev extras).
// The /preview/* mount (Variant A, States Lab, simulated access) exists only
// under vite dev: import.meta.env.DEV is false at build time, so that route
// and DevBanner/StatesLab code paths are dropped from production.
const PreviewApp = lazy(() => import('./preview/PreviewApp.jsx'))

// /dashboard: the existing market dashboard. Signed-in (existing login) users
// get the full protected dashboard; everyone else the public version that
// used to live at "/".
function DashboardRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <ProtectedDashboard /> : <Dashboard />
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/company-data"
              element={
                <ProtectedRoute>
                  <CompanyData />
                </ProtectedRoute>
              }
            />
            <Route path="/dashboard" element={<DashboardRoute />} />
            <Route
              path="/market-intel"
              element={
                <ProtectedRoute>
                  <MarketIntel />
                </ProtectedRoute>
              }
            />
            {import.meta.env.DEV && <Route path="/preview/*" element={<PreviewApp />} />}
            <Route path="/*" element={<PreviewApp site />} />
          </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  )
}

export default App
