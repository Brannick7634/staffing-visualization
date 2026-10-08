// Safety net only: local pay is free, so the server should never lock a state
// or city benchmark. If a locked response ever arrives (publishable, but
// `requires_free_account` with no figures), this explains it without showing
// or guessing any local figure, and offers the free account.
export function shortRate(rateCents) {
  if (!Number.isSafeInteger(rateCents) || rateCents <= 0) return null
  const dollars = Math.floor(rateCents / 100)
  const cents = rateCents % 100
  const whole = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return cents === 0 ? `$${whole}` : `$${whole}.${String(cents).padStart(2, '0')}`
}

export default function LocalGate({ rateCents, placeName, onUnlock }) {
  const rate = shortRate(rateCents)
  const lead = rate ? `See how your client’s ${rate}/hour compares. ` : ''

  return (
    <div className="ssp-lock ssp-gate">
      <div className="ssp-gate__head">
        <span className="ssp-gate__icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="18" height="18" focusable="false">
            <rect x="4" y="9" width="12" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </span>
        <h3 className="ssp-gate__title">Sign up free to see {placeName} rates</h3>
      </div>
      {/* Decorative placeholder only: the server never sends locked figures. */}
      <div className="ssp-gate__blur" aria-hidden="true">
        <span>$••.••<small>/hr median</small></span>
        <span>$••.••<small>– $••.•• market range</small></span>
      </div>
      <p className="ssp-gate__body">
        {lead}A free account (name, work email and a password) shows this local benchmark and lets you create, print, download and email Client Pay Market Reports.
      </p>
      {typeof onUnlock === 'function' && (
        <div className="ssp-gate__actions">
          <button type="button" className="ssp-btn ssp-btn--primary" onClick={() => onUnlock()}>
            Sign Up Free
          </button>
        </div>
      )}
    </div>
  )
}
