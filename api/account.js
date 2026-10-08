// Subscriber endpoints: /api/subscribe, /api/auth/login, /api/auth/forgot,
// /api/auth/reset, /api/auth/confirm, /api/auth/logout, /api/unsubscribe, /api/preferences.
import subscribe from './_lib/routes/subscribe.js'
import login from './_lib/routes/login.js'
import forgot from './_lib/routes/forgot.js'
import reset from './_lib/routes/reset.js'
import confirm from './_lib/routes/confirm.js'
import logout from './_lib/routes/logout.js'
import unsubscribe from './_lib/routes/unsubscribe.js'
import preferences from './_lib/routes/preferences.js'

const ROUTES = { 'subscribe': subscribe, 'login': login, 'forgot': forgot, 'reset': reset, 'confirm': confirm, 'logout': logout, 'unsubscribe': unsubscribe, 'preferences': preferences }

// One serverless function for several URLs (Vercel Hobby allows 12 functions).
// vercel.json rewrites each public URL here with ?route=<name>.
export default function handler(req, res) {
  const route = req.query && req.query.route
  const fn = Object.prototype.hasOwnProperty.call(ROUTES, route) ? ROUTES[route] : null
  // Every answer from these endpoints is private and must never be cached.
  res.setHeader('Cache-Control', 'no-store')
  if (!fn) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'not_found' }))
  }
  return fn(req, res)
}
