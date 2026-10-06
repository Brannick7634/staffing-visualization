// Client-side password rules. They mirror the server (api/_lib) so the visitor
// sees a problem before submitting; the server still checks everything.
// Passwords are never trimmed, logged, stored in the browser or tracked.

export const PASSWORD_MIN = 8
// bcrypt only uses the first 72 bytes, so the server rejects anything longer.
export const PASSWORD_MAX_BYTES = 72

export const PASSWORD_HINT = 'At least 8 characters.'

function utf8Length(value) {
  return new TextEncoder().encode(value).length
}

// Returns an error message, or '' when the password is acceptable.
export function passwordProblem(value) {
  if (typeof value !== 'string' || value === '') return 'Enter a password.'
  // Count characters as code points, like the server ([...value].length).
  if ([...value].length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (utf8Length(value) > PASSWORD_MAX_BYTES) return 'That password is too long. Use at most 72 bytes (emoji and accented letters count as 2 to 4 each).'
  return ''
}

// Email handed over in router state (e.g. from the signup form's "account
// exists" links), never read from the URL. Returns '' when absent or invalid.
export function stateEmail(state) {
  const value = state && typeof state.email === 'string' ? state.email.trim() : ''
  return value.length <= 254 ? value : ''
}
