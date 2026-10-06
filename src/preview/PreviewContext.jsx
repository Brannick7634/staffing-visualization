import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ACCESS, COVERAGE, REQUEST } from '../../shared/signal/contract.js'
import { parseHourlyRate } from '../../shared/signal/money.js'
import { DEFAULT_EXAMPLE, sectorForRole } from '../../shared/signal/taxonomy.js'
import { fetchPay, fetchSnapshot, setSimAccess, signOut as apiSignOut } from './api.js'
import { EVENTS, track } from './lib/track.js'

// In-memory state for the homepage preview. Nothing here is written to
// localStorage/sessionStorage except the A/B variant choice. The visitor's rate
// lives only in this context (never in the URL, storage or analytics), and
// name/email are never kept here after a signup — only `signedUp: true`.

const PreviewContext = createContext(null)

const VARIANT_KEY = 'ssp-preview-variant'

export const DEFAULT_SELECTION = Object.freeze({
  sectorKey: DEFAULT_EXAMPLE.sectorKey,
  roleKey: DEFAULT_EXAMPLE.roleKey,
  state: DEFAULT_EXAMPLE.state,
  city: DEFAULT_EXAMPLE.city
})

// `site` = the production mount at "/" (Variant B only, no dev extras).
// Otherwise the dev-only preview mount at /preview/*.
// True in every production build: lets the bundler drop dev-only branches.
export const FORCE_SITE = !import.meta.env.DEV

export function basePath(site) {
  return site ? '' : '/preview'
}

export function homePathFor(variant, site = false) {
  if (site) return '/'
  return variant === 'b' ? '/preview/b' : '/preview'
}

export function variantFromPath(pathname, site = false) {
  const path = (pathname || '').replace(/\/+$/, '')
  if (site) return path === '' ? 'b' : null
  if (path === '/preview') return 'a'
  if (path === '/preview/b') return 'b'
  return null
}

export function sameSelection(a, b) {
  if (!a || !b) return false
  return (a.sectorKey || null) === (b.sectorKey || null) &&
    (a.roleKey || null) === (b.roleKey || null) &&
    (a.state || null) === (b.state || null) &&
    (a.city || null) === (b.city || null)
}

function readStoredVariant() {
  try {
    return window.sessionStorage.getItem(VARIANT_KEY) === 'b' ? 'b' : 'a'
  } catch {
    return 'a'
  }
}

function storeVariant(variant) {
  try {
    window.sessionStorage.setItem(VARIANT_KEY, variant)
  } catch {
    // Storage blocked: the variant simply is not remembered.
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function scrollToId(id) {
  const el = document.getElementById(id)
  if (!el) return false
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  return true
}

function hasFigures(part) {
  return Boolean(part) && Number.isSafeInteger(part.p25Cents) && Number.isSafeInteger(part.p75Cents)
}

const IDLE_CHECK = Object.freeze({
  requestState: REQUEST.IDLE,
  response: null,
  error: null,
  selection: null,
  rateCents: null,
  isExample: false
})

export function PreviewProvider({ children, site = false }) {
  const location = useLocation()
  const navigate = useNavigate()

  const [variant, setVariant] = useState(() => site ? 'b' : (variantFromPath(location.pathname) || readStoredVariant()))

  const [snap, setSnap] = useState({ data: null, state: REQUEST.LOADING, error: null })
  const snapRequest = useRef(0)

  const [selection, setSelectionState] = useState(DEFAULT_SELECTION)
  const [rateInput, setRateInput] = useState(DEFAULT_EXAMPLE.rateInput)
  const [signedUp, setSignedUp] = useState(false)
  const [pendingReturn, setPendingReturn] = useState(null)
  const [payCheck, setPayCheck] = useState(IDLE_CHECK)
  const [focusRequest, setFocusRequest] = useState(null)

  const payRequest = useRef(0)
  const payCheckRef = useRef(payCheck)
  const rateInputRef = useRef(rateInput)
  const pendingRef = useRef(pendingReturn)
  const variantRef = useRef(variant)
  const localSeen = useRef(false)

  payCheckRef.current = payCheck
  rateInputRef.current = rateInput
  pendingRef.current = pendingReturn
  variantRef.current = variant

  const onHome = variantFromPath(location.pathname, site) !== null
  const onHomeRef = useRef(onHome)
  onHomeRef.current = onHome

  useEffect(() => {
    const fromPath = variantFromPath(location.pathname, site)
    if (fromPath && fromPath !== variantRef.current) {
      setVariant(fromPath)
      storeVariant(fromPath)
    }
  }, [location.pathname])

  const reloadSnapshot = useCallback(async () => {
    const id = ++snapRequest.current
    setSnap((prev) => ({ ...prev, state: REQUEST.LOADING, error: null }))
    try {
      const data = await fetchSnapshot()
      if (id !== snapRequest.current) return data
      setSnap({ data, state: REQUEST.READY, error: null })
      return data
    } catch (error) {
      if (id === snapRequest.current) setSnap((prev) => ({ data: prev.data, state: REQUEST.ERROR, error }))
      return null
    }
  }, [])

  const trackPayResult = useCallback((response, checkedSelection) => {
    const result = response?.result
    if (!result) return
    const base = {
      roleKey: checkedSelection.roleKey,
      sectorKey: checkedSelection.sectorKey,
      geographyLevel: result.geography?.level,
      coverage: result.coverage,
      access: result.access,
      variant: variantRef.current
    }
    if (!checkedSelection.state) {
      if (result.coverage === COVERAGE.PUBLISHABLE && hasFigures(result)) track(EVENTS.NATIONAL_RESULT_VIEWED, base)
      return
    }
    track(EVENTS.LOCAL_BENCHMARK_REQUESTED, base)
    const fallbackPublishable = response.fallback?.coverage === COVERAGE.PUBLISHABLE
    const available = result.coverage === COVERAGE.PUBLISHABLE || fallbackPublishable
    track(available ? EVENTS.LOCAL_COVERAGE_AVAILABLE : EVENTS.LOCAL_COVERAGE_UNAVAILABLE, base)
    const locked = (result.coverage === COVERAGE.PUBLISHABLE && result.access === ACCESS.REQUIRES_FREE_ACCOUNT) ||
      (fallbackPublishable && response.fallback.access === ACCESS.REQUIRES_FREE_ACCOUNT)
    if (locked) track(EVENTS.GATE_SHOWN, base)
    if (result.coverage === COVERAGE.PUBLISHABLE && hasFigures(result) && !localSeen.current) {
      localSeen.current = true
      track(EVENTS.FIRST_LOCAL_RESULT_VIEWED, base)
    }
  }, [])

  // Fetch benchmark bounds for a selection. The rate stays in memory and is
  // only used client-side for the verdict.
  const runPayCheck = useCallback(async ({ selection: checked, rateCents, isExample = false }) => {
    const id = ++payRequest.current
    const frozen = {
      sectorKey: checked.sectorKey || null,
      roleKey: checked.roleKey || null,
      state: checked.state || null,
      city: checked.state ? (checked.city || null) : null
    }
    setPayCheck((prev) => ({ ...prev, requestState: REQUEST.LOADING, error: null, selection: frozen, rateCents, isExample }))
    try {
      const response = await fetchPay(frozen)
      if (id !== payRequest.current) return
      setPayCheck({ requestState: REQUEST.READY, response, error: null, selection: frozen, rateCents, isExample })
      if (!isExample) trackPayResult(response, frozen)
    } catch (error) {
      if (id !== payRequest.current) return
      setPayCheck({ requestState: REQUEST.ERROR, response: null, error, selection: frozen, rateCents, isExample })
    }
  }, [trackPayResult])

  const retryPayCheck = useCallback(() => {
    const last = payCheckRef.current
    if (!last.selection) return
    runPayCheck({ selection: last.selection, rateCents: last.rateCents, isExample: last.isExample })
  }, [runPayCheck])

  // First load: snapshot plus the national example (Forklift Operator, $17.00).
  useEffect(() => {
    reloadSnapshot()
    const parsed = parseHourlyRate(DEFAULT_EXAMPLE.rateInput)
    runPayCheck({ selection: DEFAULT_SELECTION, rateCents: parsed.ok ? parsed.cents : null, isExample: true })
  }, [reloadSnapshot, runPayCheck])

  const access = snap.data?.viewer?.access === ACCESS.AUTHORIZED ? ACCESS.AUTHORIZED : ACCESS.PUBLIC
  const simulated = snap.data?.viewer?.simulated === true

  // When access changes (dev toggle or simulated signup), re-run the last
  // comparison so a gated answer never lingers after unlocking (or vice versa).
  const prevAccess = useRef(null)
  useEffect(() => {
    if (!snap.data) return
    if (prevAccess.current !== null && prevAccess.current !== access) retryPayCheck()
    prevAccess.current = access
  }, [access, snap.data, retryPayCheck])

  const setSelection = useCallback((partial) => {
    setSelectionState((prev) => {
      const next = { ...prev, ...partial }
      if (!next.state) next.city = null
      return next
    })
  }, [])

  const setAccess = useCallback(async (next) => {
    const target = next === ACCESS.AUTHORIZED ? ACCESS.AUTHORIZED : ACCESS.PUBLIC
    try {
      await setSimAccess(target)
    } catch (error) {
      return { ok: false, error }
    }
    if (target === ACCESS.PUBLIC) setSignedUp(false)
    await reloadSnapshot()
    return { ok: true }
  }, [reloadSnapshot])

  const markSignedUp = useCallback(() => {
    setSignedUp(true)
  }, [])

  // Sign out: the server clears the session cookie; then forget the in-memory
  // signup state, refresh access and go home. Even if the request fails we
  // reload the snapshot so the header reflects what the server says.
  const signOut = useCallback(async () => {
    let ok = true
    try {
      await apiSignOut()
    } catch {
      ok = false
    }
    setSignedUp(false)
    setPendingReturn(null)
    await reloadSnapshot()
    navigate(homePathFor(variantRef.current, site))
    return { ok }
  }, [navigate, reloadSnapshot, site])

  const requestFocus = useCallback((field) => {
    setFocusRequest((prev) => ({ field, n: (prev?.n || 0) + 1 }))
  }, [])

  const goHome = useCallback((hash) => {
    if (onHomeRef.current) {
      if (hash) scrollToId(hash)
      return
    }
    navigate({ pathname: homePathFor(variantRef.current, site), hash: hash ? `#${hash}` : '' })
  }, [navigate, site])

  const requestFreeAccess = useCallback((context, { navigateTo = true } = {}) => {
    setPendingReturn(context ? { ...context } : null)
    if (!navigateTo) return
    if (onHomeRef.current && document.getElementById('free-access')) {
      scrollToId('free-access')
      window.setTimeout(() => {
        const field = document.getElementById('invite-name')
        if (field) field.focus({ preventScroll: true })
      }, prefersReducedMotion() ? 0 : 450)
      return
    }
    navigate(`${basePath(site)}/free-access`)
  }, [navigate, site])

  const pickRole = useCallback((roleKey) => {
    const sector = sectorForRole(roleKey)
    if (!sector) return
    setSelectionState({ sectorKey: sector.key, roleKey, state: null, city: null })
    goHome('pay-check')
    requestFocus('role')
  }, [goHome, requestFocus])

  // After a (simulated) signup: restore the exact comparison the visitor asked
  // for and re-run it with the rate still held in memory.
  const returnToComparison = useCallback((context) => {
    const target = context || pendingRef.current
    setPendingReturn(null)
    if (!target || !target.roleKey) return false
    const restored = {
      sectorKey: target.sectorKey || sectorForRole(target.roleKey)?.key || null,
      roleKey: target.roleKey,
      state: target.state || null,
      city: target.state ? (target.city || null) : null
    }
    setSelectionState(restored)
    const parsed = parseHourlyRate(rateInputRef.current)
    if (parsed.ok) runPayCheck({ selection: restored, rateCents: parsed.cents })
    goHome('pay-check')
    return true
  }, [goHome, runPayCheck])

  const parsedRate = useMemo(() => parseHourlyRate(rateInput), [rateInput])
  const isOutOfDate = payCheck.requestState === REQUEST.READY && Boolean(payCheck.selection) && (
    !sameSelection(selection, payCheck.selection) ||
    !parsedRate.ok ||
    parsedRate.cents !== payCheck.rateCents
  )

  const value = useMemo(() => ({
    variant,
    homePath: homePathFor(variant, site),
    site,
    base: basePath(site),
    snapshot: snap.data,
    snapshotState: snap.state,
    snapshotError: snap.error,
    reloadSnapshot,
    access,
    simulated,
    setAccess,
    selection,
    setSelection,
    rateInput,
    setRateInput,
    signedUp,
    markSignedUp,
    signOut,
    pendingReturn,
    requestFreeAccess,
    pickRole,
    returnToComparison,
    payCheck,
    runPayCheck,
    retryPayCheck,
    isOutOfDate,
    focusRequest,
    requestFocus,
    goHome
  }), [site, variant, snap, reloadSnapshot, access, simulated, setAccess, selection, setSelection, rateInput,
    signedUp, markSignedUp, signOut, pendingReturn, requestFreeAccess, pickRole, returnToComparison, payCheck,
    runPayCheck, retryPayCheck, isOutOfDate, focusRequest, requestFocus, goHome])

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
}

export function usePreview() {
  const ctx = useContext(PreviewContext)
  if (!ctx) throw new Error('usePreview must be used inside <PreviewProvider>')
  return ctx
}
