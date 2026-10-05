import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ACCESS } from '../../../shared/signal/contract.js'
import { usePreview } from '../PreviewContext.jsx'

// Always-visible development notice with the simulated access toggle. This is
// not authentication: the dev middleware alone honours the simulated cookie.
export default function DevBanner() {
  const { access, setAccess, variant } = usePreview()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function choose(next) {
    if (busy || next === access) return
    setBusy(true)
    setError(false)
    const result = await setAccess(next)
    setBusy(false)
    if (!result.ok) setError(true)
  }

  return (
    <div className="ssp-devbanner" role="region" aria-label="Development preview">
      <div className="ssp-container ssp-devbanner__row">
        <p className="ssp-devbanner__text">
          <strong>Development preview</strong>
          <span className="ssp-devbanner__long">
            <span aria-hidden="true"> · </span>Figures are supplied examples; publication checks not verified
            <span aria-hidden="true"> · </span>Signup and sign-in are simulated
          </span>
          <span className="ssp-devbanner__short">
            <span aria-hidden="true"> · </span>Example figures; simulated sign-in
          </span>
        </p>
        <div className="ssp-devbanner__controls">
          <div className="ssp-devbanner__seg" role="group" aria-label="Access (simulated)">
            <span className="ssp-devbanner__seg-label" aria-hidden="true">Access:</span>
            <button
              type="button"
              aria-pressed={access === ACCESS.PUBLIC}
              disabled={busy}
              onClick={() => choose(ACCESS.PUBLIC)}
            >
              Signed out
            </button>
            <button
              type="button"
              aria-pressed={access === ACCESS.AUTHORIZED}
              disabled={busy}
              onClick={() => choose(ACCESS.AUTHORIZED)}
            >
              Signed in <span className="ssp-devbanner__sim">(simulated)</span>
            </button>
          </div>
          <nav className="ssp-devbanner__links" aria-label="Preview tools">
            <Link to="/preview/states">States lab</Link>
            <span className="ssp-devbanner__variants">
              <span className="ssp-devbanner__vword">Variant</span>
              <Link to="/preview" aria-current={variant === 'a' ? 'true' : undefined} aria-label="Variant A">A</Link>
              <span aria-hidden="true"> | </span>
              <Link to="/preview/b" aria-current={variant === 'b' ? 'true' : undefined} aria-label="Variant B">B</Link>
            </span>
          </nav>
          {error && <span className="ssp-devbanner__error" role="alert">Could not switch access.</span>}
        </div>
      </div>
    </div>
  )
}
