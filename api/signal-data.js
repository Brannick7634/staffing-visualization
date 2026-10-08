// Pay data endpoints: /api/signal/snapshot, /api/signal/pay, /api/signal/report,
// and POST /api/signal/client-report/email.
import signal_snapshot from './_lib/routes/signal-snapshot.js'
import signal_pay from './_lib/routes/signal-pay.js'
import signal_report from './_lib/routes/signal-report.js'
import client_report_email from './_lib/routes/client-report-email.js'

const ROUTES = {
  'signal-snapshot': signal_snapshot,
  'signal-pay': signal_pay,
  'signal-report': signal_report,
  // Off (404) until SIGNAL_CLIENT_REPORT_EMAIL_ENABLED=1; the handler checks.
  'client-report-email': client_report_email
}

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
