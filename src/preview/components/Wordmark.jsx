// The Staffing Signal wordmark: three ascending bars plus the serif name and a
// small-caps descriptor. Pure inline SVG + text (no image assets).
export default function Wordmark({ compact = false, tagline = true }) {
  return (
    <span className={`ssp-wordmark${compact ? ' ssp-wordmark--compact' : ''}`}>
      <svg className="ssp-wordmark__bars" viewBox="0 0 30 30" aria-hidden="true" focusable="false">
        <rect x="1" y="17" width="7" height="12" rx="1" fill="#1D5EA8" />
        <rect x="11.5" y="10" width="7" height="19" rx="1" fill="#16426E" />
        <rect x="22" y="2" width="7" height="27" rx="1" fill="#102A43" />
      </svg>
      <span className="ssp-wordmark__text">
        <span className="ssp-wordmark__name">
          <span className="ssp-wordmark__the">The</span>
          <span className="ssp-wordmark__main">Staffing Signal</span>
        </span>
        {tagline && <span className="ssp-wordmark__tag">Staffing market intelligence</span>}
      </span>
    </span>
  )
}
