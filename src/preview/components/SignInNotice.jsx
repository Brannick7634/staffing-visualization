import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ACCESS } from '../../../shared/signal/contract.js'
import { basePath, FORCE_SITE, usePreview } from '../PreviewContext.jsx'

// Result of the emailed sign-in link. api/_lib/routes/verify.js redirects to
// "/?signin=ok|expired|used|error". Whether the visitor is actually signed in
// comes from the server (snapshot viewer.access), never from this parameter.
const MESSAGES = {
  expired: 'That sign-in link has expired.',
  used: 'That sign-in link was already used.',
  error: 'We could not sign you in just now. Please try the link again.'
}

export default function SignInNotice() {
  const location = useLocation()
  const navigate = useNavigate()
  const { access, snapshotState, site: siteMount } = usePreview()
  const site = FORCE_SITE || siteMount
  const [status, setStatus] = useState(null)

  useEffect(() => {
    const value = new URLSearchParams(location.search).get('signin')
    if (!value) return
    setStatus(value)
    // Drop the parameter so a refresh or shared link doesn't repeat the notice.
    navigate({ pathname: location.pathname, hash: location.hash }, { replace: true })
  }, [location.search, location.pathname, location.hash, navigate])

  if (!status) return null
  let text
  if (status === 'ok') {
    if (access === ACCESS.AUTHORIZED) text = 'You are signed in. Local comparisons and full rankings are unlocked.'
    else if (snapshotState === 'error') text = MESSAGES.error
    else return null
  } else {
    text = MESSAGES[status] || MESSAGES.error
  }
  const offerNewLink = status === 'expired' || status === 'used'
  return (
    <div className="ssp-container">
      <p className="ssp-card" role="status" style={{ margin: '16px 0' }}>
        {text}{' '}
        {offerNewLink && <><Link to={`${basePath(site)}/sign-in`} className="ssp-link">Get a new sign-in link</Link>{' · '}</>}
        <button type="button" className="ssp-link" onClick={() => setStatus(null)}>Dismiss</button>
      </p>
    </div>
  )
}
