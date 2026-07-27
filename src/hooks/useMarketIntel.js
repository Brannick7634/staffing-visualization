import { useEffect, useState } from 'react'

export function useMarketIntel() {
  const [state, setState] = useState({ data: null, loading: true, error: null })

  useEffect(() => {
    let isMounted = true

    async function load() {
      try {
        const response = await fetch('/api/jsearch-metrics')
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.error || `Request failed (${response.status})`)
        }
        const data = await response.json()
        if (isMounted) setState({ data, loading: false, error: null })
      } catch (error) {
        if (isMounted) setState({ data: null, loading: false, error: error.message || 'Failed to load market intelligence' })
      }
    }

    load()
    return () => { isMounted = false }
  }, [])

  return state
}
