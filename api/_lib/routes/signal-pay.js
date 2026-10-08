// GET /api/signal/pay?role=&state=&city= (production). The visitor's pay rate
// is never a parameter. Fails closed with 503 until a verified aggregate feed
// is connected.
//
// Pay is public at every level, and each answer carries the selected place's
// market context, so a per-IP limit slows anyone stepping through every city
// and state to rebuild the gated rankings (best effort: in-memory per warm
// instance, see security.js).
import { createPayHandler } from '../signal/handlers.js'
import { productionAdapter } from '../signal/productionAdapter.js'
import { sessionAccess } from '../signal/sessionAccess.js'
import { rateLimit } from '../security.js'
import { CONTRACT_VERSION } from '../../../shared/signal/contract.js'

export const PAY_RATE_LIMIT = Object.freeze({ limit: 60, windowMs: 10 * 60 * 1000 })

const LIMITED_BODY = Object.freeze({
  contractVersion: CONTRACT_VERSION,
  error: { code: 'rate_limited', message: 'Too many pay checks in a short time. Please wait a few minutes and try again.' }
})

const handler = createPayHandler({ adapter: productionAdapter, resolveAccess: sessionAccess })

export default function signalPay(req, res) {
  if (!rateLimit(req, res, { key: 'signal-pay', ...PAY_RATE_LIMIT, body: LIMITED_BODY })) return undefined
  return handler(req, res)
}
