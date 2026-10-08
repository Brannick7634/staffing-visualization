import { geographyLabel } from '../../../shared/signal/geography.js'
import { formatCents, parseHourlyRate } from '../../../shared/signal/money.js'
import { roleByKey, sectorForRole } from '../../../shared/signal/taxonomy.js'

// Pure helpers for the Client Pay Market Report sign-up gate (browser + node).
// A report return holds the job and place only. The client pay rate is never
// part of it: it stays in PreviewContext's in-memory rateInput.

export const REPORT_RETURN_TARGET = 'client-report'

// The selection shape runPayCheck and the return-to flow use.
export function freezeSelection(selection) {
  if (!selection || !selection.roleKey) return null
  const state = selection.state || null
  return {
    sectorKey: selection.sectorKey || sectorForRole(selection.roleKey)?.key || null,
    roleKey: selection.roleKey,
    state,
    city: state ? (selection.city || null) : null
  }
}

// { target, selection } per the contract. The selection fields are also copied
// to the top level so older readers of pendingReturn (return lines, the signup
// context) keep working unchanged.
export function reportReturn(selection) {
  const frozen = freezeSelection(selection)
  return Object.freeze({ ...(frozen || {}), target: REPORT_RETURN_TARGET, selection: frozen })
}

export function isReportReturn(value) {
  return Boolean(value) && value.target === REPORT_RETURN_TARGET
}

// Saved-search chips for the gate: job, place and the client pay rate. The
// rate text is rendered on screen only; it is never stored or sent. Without a
// job there is no search to show (the rate alone may be the example's).
export function gateChips({ selection = null, rateInput = '' } = {}) {
  const frozen = freezeSelection(selection)
  const role = frozen ? roleByKey(frozen.roleKey) : null
  if (!role) return []
  const chips = [{ key: 'job', text: role.label }]
  const place = geographyLabel(frozen.state, frozen.city)
  if (place) chips.push({ key: 'place', text: place })
  const parsed = parseHourlyRate(rateInput)
  if (parsed.ok) chips.push({ key: 'rate', text: `Client pay ${formatCents(parsed.cents)}/hr` })
  return chips
}
