// DEVELOPMENT ONLY. POST /api/signal/client-report/email on the dev server.
//
// Runs the REAL handler (validation, limits, daily cap, server-side figures,
// PDF render, email template) with three development stand-ins:
//   * sign-in = the simulated-access cookie (a fixed fake dev account);
//   * Airtable = an in-memory row holding only the daily cap counters;
//   * Resend = a fake sender that answers success and sends nothing.
// Nothing leaves the machine and nothing is logged except a fixed line.
import { randomBytes } from 'node:crypto'
import { ACCESS } from '../../shared/signal/contract.js'
import { createClientReportEmailHandler } from '../../api/_lib/routes/client-report-email.js'
import { requestOrigin } from '../../api/_lib/security.js'
import { devAccess } from './devAccess.js'

export const DEV_SENDER = Object.freeze({ email: 'dev-preview@example.test', name: 'Dev Preview' })

// Same-origin in dev: the page's origin must match the dev server's Host.
export function devSameOrigin(req) {
  const origin = requestOrigin(req)
  const host = typeof req?.headers?.host === 'string' ? req.headers.host.toLowerCase() : ''
  return Boolean(origin && host) && (origin === `http://${host}` || origin === `https://${host}`)
}

export function createDevClientReportEmailHandler({ adapter, env = process.env, renderPdf, logger = console } = {}) {
  const record = { id: 'recDevPreview', fields: {} }
  const ok = (data) => ({ ok: true, status: 200, json: async () => data })
  const fetchImpl = async (url, opts = {}) => {
    const host = new URL(url).hostname
    if (host === 'api.resend.com') {
      logger.info('[signal dev] simulated client report email (nothing was sent)')
      return ok({ id: 'dev-simulated' })
    }
    if (host === 'api.airtable.com' && opts.method === 'PATCH') {
      const body = JSON.parse(opts.body)
      for (const r of body.records) if (r.id === record.id) Object.assign(record.fields, r.fields)
      return ok({ records: body.records })
    }
    // The re-read when a failed send gives back its reservation.
    if (host === 'api.airtable.com' && (opts.method || 'GET') === 'GET') return ok({ records: [record] })
    throw new Error('dev_fetch_blocked')
  }
  const devEnv = {
    SIGNAL_CLIENT_REPORT_EMAIL_ENABLED: '1',
    AIRTABLE_API_KEY: 'dev-simulated',
    SIGNAL_SESSION_SECRET: randomBytes(32).toString('hex'),
    SIGNAL_SITE_URL: 'http://localhost',
    RESEND_API_KEY: 'dev-simulated',
    SIGNAL_FROM_EMAIL: 'The Staffing Signal (dev) <dev@example.test>',
    ...(env.SIGNAL_REPORT_EMAIL_DAILY_CAP ? { SIGNAL_REPORT_EMAIL_DAILY_CAP: env.SIGNAL_REPORT_EMAIL_DAILY_CAP } : {})
  }
  return createClientReportEmailHandler({
    env: devEnv,
    fetchImpl,
    adapter,
    logger,
    ...(renderPdf ? { renderPdf } : {}),
    checkOrigin: devSameOrigin,
    // The fake dev account counts as having confirmed its email.
    authenticate: async (req) => (devAccess(req).access === ACCESS.AUTHORIZED ? { ...DEV_SENDER, record, verified: true } : null)
  })
}
