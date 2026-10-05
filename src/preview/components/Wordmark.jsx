// The Staffing Signal wordmark: the existing brand logo as a rounded badge plus
// the serif name and a small-caps descriptor.
import logo from '../../assets/staffing-signal-logo-160.png'

export default function Wordmark({ compact = false, tagline = true }) {
  return (
    <span className={`ssp-wordmark${compact ? ' ssp-wordmark--compact' : ''}`}>
      <img className="ssp-wordmark__logo" src={logo} alt="" aria-hidden="true" width="40" height="40" />
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
