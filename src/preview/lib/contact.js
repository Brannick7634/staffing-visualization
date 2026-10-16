// Accepts only an approved https:// link or a mailto: address (VITE_CONTACT_URL).
export function contactUrl(raw) {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (/^https:\/\/[^\s]+$/i.test(value)) return value
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return value
  return null
}
