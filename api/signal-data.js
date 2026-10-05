// Pay data endpoints: /api/signal/snapshot, /api/signal/pay, /api/signal/report.
import signal_snapshot from './_lib/routes/signal-snapshot.js'
import signal_pay from './_lib/routes/signal-pay.js'
import signal_report from './_lib/routes/signal-report.js'

const ROUTES = { 'signal-snapshot': signal_snapshot, 'signal-pay': signal_pay, 'signal-report': signal_report }

// One serverless function for several URLs (Vercel Hobby allows 12 functions).
// vercel.json rewrites each public URL here with ?route=<name>.
export default function handler(req, res) {
  const route = req.query && req.query.route
  let fn = Object.prototype.hasOwnProperty.call(ROUTES, route) ? ROUTES[route] : null
  // Monthly report API stays off until SIGNAL_REPORT_ENABLED=1 is set in Vercel.
  if (route === 'signal-report' && process.env.SIGNAL_REPORT_ENABLED !== '1') fn = null
  if (!fn) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'not_found' }))
  }
  return fn(req, res)
}
