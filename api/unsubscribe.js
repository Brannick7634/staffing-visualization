// GET or POST /api/unsubscribe?token=...
// One click: sets Unsubscribed + Unsubscribed At. POST supports RFC 8058
// List-Unsubscribe-Post one-click from mail clients. Nothing ever clears it.
import { loadConfig, unavailable, methodNotAllowed, findByEmail, updateRecord, F } from './_lib/subscribers.js'
import { verifyToken } from './_lib/signalSession.js'

function page(res, status, title, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 16px"><h1>${title}</h1><p>${body}</p></body>`)
}

export function createUnsubscribeHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  return async function unsubscribeHandler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, 'GET, POST')
    const conf = loadConfig(env)
    if (!conf.ok) return unavailable(res)
    const token = new URL(req.url || '/', 'http://x').searchParams.get('token')
    const payload = verifyToken(token, conf.cfg.secret, { purpose: 'unsub' })
    if (!payload) return page(res, 400, 'Link not valid', 'This unsubscribe link is not valid. Reply to any of our emails and we will remove you.')
    try {
      const record = await findByEmail(conf.cfg, fetchImpl, payload.email)
      if (record && record.fields?.[F.unsubscribed] !== true) {
        await updateRecord(conf.cfg, fetchImpl, record.id, { [F.unsubscribed]: true, [F.unsubscribedAt]: now().toISOString(), [F.newsletter]: false })
      }
    } catch {
      return page(res, 502, 'Please try again', 'We could not process your unsubscribe just now. Please try the link again.')
    }
    return page(res, 200, 'You are unsubscribed', 'You will not receive any more Staffing Signal emails.')
  }
}

export default createUnsubscribeHandler()
