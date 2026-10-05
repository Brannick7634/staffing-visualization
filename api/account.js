// Subscriber endpoints: /api/subscribe, /api/auth/magic-link, /api/auth/verify,
// /api/unsubscribe, /api/preferences.
import subscribe from './_lib/routes/subscribe.js'
import magic_link from './_lib/routes/magic-link.js'
import verify from './_lib/routes/verify.js'
import unsubscribe from './_lib/routes/unsubscribe.js'
import preferences from './_lib/routes/preferences.js'

const ROUTES = { 'subscribe': subscribe, 'magic-link': magic_link, 'verify': verify, 'unsubscribe': unsubscribe, 'preferences': preferences }

// One serverless function for several URLs (Vercel Hobby allows 12 functions).
// vercel.json rewrites each public URL here with ?route=<name>.
export default function handler(req, res) {
  const route = req.query && req.query.route
  const fn = Object.prototype.hasOwnProperty.call(ROUTES, route) ? ROUTES[route] : null
  if (!fn) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'not_found' }))
  }
  return fn(req, res)
}
