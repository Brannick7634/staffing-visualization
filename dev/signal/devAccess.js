// DEVELOPMENT ONLY. Simulated access for the local preview.
//
// The cookie `ssp_sim_access=authorized` stands in for a signed-in free
// account so both access states can be demonstrated. It is not
// authentication. Only the Vite dev plugin (apply: 'serve') uses this module;
// the deployed api/signal/* endpoints use the real session and ignore cookies.
import { ACCESS } from '../../shared/signal/contract.js'

export const SIM_ACCESS_COOKIE = 'ssp_sim_access'

// Minimal cookie-header parser; returns a plain object (no prototype).
export function parseCookies(header) {
  const out = Object.create(null)
  if (typeof header !== 'string' || !header) return out
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (name && !(name in out)) out[name] = value
  }
  return out
}

export function devAccess(req) {
  const cookies = parseCookies(req && req.headers ? req.headers.cookie : '')
  const access = cookies[SIM_ACCESS_COOKIE] === ACCESS.AUTHORIZED ? ACCESS.AUTHORIZED : ACCESS.PUBLIC
  return { access, simulated: true }
}

// Set-Cookie value that sets (authorized) or clears (public) simulated access.
export function simAccessCookie(access) {
  const base = 'Path=/; HttpOnly; SameSite=Lax'
  return access === ACCESS.AUTHORIZED
    ? `${SIM_ACCESS_COOKIE}=${ACCESS.AUTHORIZED}; ${base}`
    : `${SIM_ACCESS_COOKIE}=; ${base}; Max-Age=0`
}
