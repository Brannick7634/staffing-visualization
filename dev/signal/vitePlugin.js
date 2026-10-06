// DEVELOPMENT ONLY. Vite plugin (apply: 'serve') that mounts /api/signal/*
// on the local dev server so the preview works without Vercel:
//   GET  /api/signal/snapshot, GET /api/signal/pay   (same handlers as production,
//        wired to the development fixture + simulated access cookie)
//   POST /api/signal/dev/access | dev/signup | dev/login | dev/forgot |
//        dev/reset | dev/logout | dev/notify | dev/preferences
//   GET  /api/signal/dev/scenarios
//
// It shims the Vercel request/response helpers the handlers expect
// (req.query, JSON req.body capped at 10 kB, res.status, res.json). Request
// bodies and query strings are never logged. Not active for `vite build`.
import { createReportHandler } from '../../api/_lib/routes/signal-report.js'
import path from 'node:path'
import { createSnapshotHandler, createPayHandler, sendJson } from '../../api/_lib/signal/handlers.js'
import { createFixtureAdapter } from './fixtureAdapter.js'
import { devAccess } from './devAccess.js'
import {
  createDevAccessHandler, createDevAccountStore, createDevSignupHandler,
  createDevLoginHandler, createDevForgotHandler, createDevResetHandler,
  createDevLogoutHandler, createDevNotifyHandler, createDevPreferencesHandler,
  createDevScenariosHandler
} from './devEndpoints.js'

export const BODY_LIMIT_BYTES = 10 * 1024
const PREFIX = '/api/signal'

// URLSearchParams -> Vercel-style query object (repeated keys become arrays).
export function parseQuery(searchParams) {
  const query = Object.create(null)
  for (const [key, value] of searchParams) {
    if (key in query) query[key] = [].concat(query[key], value)
    else query[key] = value
  }
  return query
}

// Read a JSON request body. Resolves { ok:true, body } or
// { ok:false, status, code }. Never logs or echoes the body.
export function readJsonBody(req, limit = BODY_LIMIT_BYTES) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > limit) {
      req.resume()
      return finish({ ok: false, status: 413, code: 'payload_too_large' })
    }
    const type = String(req.headers['content-type'] || '').toLowerCase()
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > limit) return finish({ ok: false, status: 413, code: 'payload_too_large' })
      chunks.push(chunk)
    })
    req.on('error', () => finish({ ok: false, status: 400, code: 'invalid_body' }))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw.trim()) return finish({ ok: true, body: null })
      if (!type.startsWith('application/json')) return finish({ ok: false, status: 415, code: 'unsupported_media_type' })
      try {
        finish({ ok: true, body: JSON.parse(raw) })
      } catch {
        finish({ ok: false, status: 400, code: 'invalid_json' })
      }
    })
  })
}

function shimResponse(res) {
  if (typeof res.status !== 'function') {
    res.status = (code) => {
      res.statusCode = code
      return res
    }
  }
  if (typeof res.json !== 'function') {
    res.json = (body) => {
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
      return res
    }
  }
}

export function createSignalRoutes({ fixturePath } = {}) {
  const adapter = createFixtureAdapter(fixturePath ? { fixturePath } : {})
  const accounts = createDevAccountStore()
  return new Map([
    [`${PREFIX}/snapshot`, createSnapshotHandler({ adapter, resolveAccess: devAccess })],
    [`${PREFIX}/pay`, createPayHandler({ adapter, resolveAccess: devAccess })],
    // Real report files; simulated access; dev area = Texas / Houston.
    [`${PREFIX}/report`, createReportHandler({ resolveAccess: devAccess, loadArea: async () => ({ state: 'TX', cityKey: 'TX:houston' }) })],
    [`${PREFIX}/dev/access`, createDevAccessHandler()],
    [`${PREFIX}/dev/signup`, createDevSignupHandler(accounts)],
    [`${PREFIX}/dev/login`, createDevLoginHandler(accounts)],
    [`${PREFIX}/dev/forgot`, createDevForgotHandler(accounts)],
    [`${PREFIX}/dev/reset`, createDevResetHandler(accounts)],
    [`${PREFIX}/dev/logout`, createDevLogoutHandler()],
    [`${PREFIX}/dev/notify`, createDevNotifyHandler()],
    [`${PREFIX}/dev/preferences`, createDevPreferencesHandler()],
    [`${PREFIX}/dev/scenarios`, createDevScenariosHandler()]
  ])
}

export function createSignalMiddleware(routes) {
  return async function signalMiddleware(req, res, next) {
    const url = req.url || ''
    if (url !== PREFIX && !url.startsWith(`${PREFIX}/`) && !url.startsWith(`${PREFIX}?`)) return next()
    shimResponse(res)
    let parsed
    try {
      parsed = new URL(url, 'http://localhost')
    } catch {
      return sendJson(res, 400, { error: { code: 'invalid_request' } })
    }
    const handler = routes.get(parsed.pathname.replace(/\/+$/, ''))
    if (!handler) return sendJson(res, 404, { error: { code: 'not_found' } })
    req.query = parseQuery(parsed.searchParams)
    if (req.method === 'POST') {
      const read = await readJsonBody(req)
      if (!read.ok) return sendJson(res, read.status, { error: { code: read.code } })
      req.body = read.body
    }
    try {
      await handler(req, res)
    } catch {
      if (!res.headersSent) sendJson(res, 500, { error: { code: 'internal_error', message: 'Something went wrong.' } })
    }
  }
}

export default function signalDevPlugin() {
  let root = process.cwd()
  return {
    name: 'staffing-signal-dev-api',
    apply: 'serve',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      const routes = createSignalRoutes({ fixturePath: path.join(root, 'dev-fixtures', 'supplied-october-2026.json') })
      server.middlewares.use(createSignalMiddleware(routes))
    }
  }
}
