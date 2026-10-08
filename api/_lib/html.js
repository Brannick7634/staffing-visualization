// HTML escaping for server-built email bodies. Every user-supplied or derived
// string goes through esc() before it is placed in HTML (text or attribute).
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
