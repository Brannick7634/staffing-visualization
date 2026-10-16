// Canonical + indexing rules for the SPA (repair brief §7). The same private
// list is sent as an X-Robots-Tag header by vercel.json (crawlers that do not
// run JavaScript); tests keep the two in sync.
export const CANONICAL_ORIGIN = 'https://www.thestaffingsignal.com'

export const PRIVATE_PATHS = [
  '/client-report', '/preferences', '/email-preferences', '/sign-in', '/forgot-password',
  '/reset-password', '/confirm-email', '/free-access', '/login', '/signup', '/dashboard',
  '/company-data', '/market-intel', '/preview'
]

export function isPrivatePath(pathname) {
  const path = typeof pathname === 'string' ? pathname.replace(/\/+$/, '') || '/' : '/'
  return PRIVATE_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
}

// Path only: never a query string or hash (tokens, rates).
export function canonicalFor(pathname) {
  const path = typeof pathname === 'string' && pathname.startsWith('/') ? pathname.replace(/\/+$/, '') || '/' : '/'
  return `${CANONICAL_ORIGIN}${path === '/' ? '/' : path}`
}
