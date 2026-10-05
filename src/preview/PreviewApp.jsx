import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Footer from './components/Footer.jsx'
import Header from './components/Header.jsx'
import FreeAccessPage from './pages/FreeAccessPage.jsx'
import HomePage from './pages/HomePage.jsx'
import MethodologyPage from './pages/MethodologyPage.jsx'
import PreferencesPage from './pages/PreferencesPage.jsx'
import PrivacyPage from './pages/PrivacyPage.jsx'
import SignInNotice from './components/SignInNotice.jsx'
import { PreviewProvider } from './PreviewContext.jsx'
import './styles/base.css'

// The pay-first site. Two mounts (both lazy-loaded from App.jsx):
//   <PreviewApp site />  production homepage at "/": Variant B, real pages only.
//   <PreviewApp />       dev-only preview at /preview/*: Variant A, States Lab,
//                        stubs, DevBanner and the simulated-access toggle.

// Dev-only modules: guarded by import.meta.env.DEV so production builds drop
// them (and their chunks) entirely.
const DEV = import.meta.env.DEV
const DevBanner = DEV ? lazy(() => import('./components/DevBanner.jsx')) : null
const StatesLabPage = DEV ? lazy(() => import('./pages/StatesLabPage.jsx')) : null
const StubPage = DEV ? lazy(() => import('./pages/StubPage.jsx')) : null

const STUBS = ['market-report', 'hot-jobs', 'my-market', 'monthly-signal', 'about', 'contact']

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// Scroll to the top on page changes, or to an in-page section when a link
// carries a hash (e.g. /preview#pay-check from another preview page).
function ScrollManager() {
  const location = useLocation()
  useEffect(() => {
    if (location.hash) {
      const id = decodeURIComponent(location.hash.slice(1))
      let tries = 0
      let timer
      const attempt = () => {
        const el = document.getElementById(id)
        if (el) {
          el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
          return
        }
        tries += 1
        if (tries < 20) timer = window.setTimeout(attempt, 50)
      }
      attempt()
      return () => window.clearTimeout(timer)
    }
    window.scrollTo(0, 0)
    return undefined
  }, [location.pathname, location.hash, location.key])
  return null
}

function useBodyClass(name) {
  useEffect(() => {
    document.body.classList.add(name)
    return () => document.body.classList.remove(name)
  }, [name])
}

// Small inline-SVG favicon for the preview only (index.html is shared with
// the existing site, so it is not edited). Restores the previous icon on exit.
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="6" fill="#075968"/>' +
  '<path d="M6 22h4l3-9 4 13 3-8h6" fill="none" stroke="#fff" stroke-width="2.5" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>'
)

function usePreviewFavicon(enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    let link = document.querySelector('link[rel="icon"]')
    const created = !link
    const previous = link ? link.getAttribute('href') : null
    if (created) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.type = 'image/svg+xml'
    link.href = FAVICON
    return () => {
      if (created) link.remove()
      else link.setAttribute('href', previous)
    }
  }, [enabled])
}

export default function PreviewApp({ site = false }) {
  useBodyClass('ssp-body')
  // Production keeps index.html's favicon (the Staffing Signal logo).
  usePreviewFavicon(!site)

  useEffect(() => {
    const previous = document.title
    document.title = site ? 'The Staffing Signal — staffing pay benchmarks' : 'The Staffing Signal — homepage preview'
    return () => { document.title = previous }
  }, [site])

  return (
    <PreviewProvider site={site}>
      <div className="ssp">
        <a href="#ssp-main" className="ssp-skip">Skip to main content</a>
        {DEV && !site && <Suspense fallback={null}><DevBanner /></Suspense>}
        <Header />
        <main id="ssp-main" className="ssp-main" tabIndex={-1}>
          <ScrollManager />
          <SignInNotice />
          {(site || !DEV) ? (
            <Routes>
              <Route index element={<HomePage variant="b" />} />
              <Route path="free-access" element={<FreeAccessPage />} />
              <Route path="preferences" element={<PreferencesPage />} />
              <Route path="email-preferences" element={<Navigate to="/preferences" replace />} />
              <Route path="methodology" element={<MethodologyPage />} />
              <Route path="privacy" element={<PrivacyPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          ) : (
          <Suspense fallback={null}>
          <Routes>
            <Route path="privacy" element={<PrivacyPage />} />
            <Route index element={<HomePage variant="a" />} />
            <Route path="b" element={<HomePage variant="b" />} />
            <Route path="free-access" element={<FreeAccessPage />} />
            <Route path="preferences" element={<PreferencesPage />} />
            <Route path="methodology" element={<MethodologyPage />} />
            <Route path="states" element={<StatesLabPage />} />
            {STUBS.map((slug) => (
              <Route key={slug} path={slug} element={<StubPage />} />
            ))}
            <Route path="email-preferences" element={<Navigate to="/preview/preferences" replace />} />
            <Route path="*" element={<Navigate to="/preview" replace />} />
          </Routes>
          </Suspense>
          )}
        </main>
        <Footer />
      </div>
    </PreviewProvider>
  )
}
