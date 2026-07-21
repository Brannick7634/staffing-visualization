import { useEffect, useState } from 'react'
import { fetchJobSignalsMetrics } from '../services/jobSignals'
import { isAirtableConfigured } from '../services/airtable'

export function useJobSignals() {
  const [state, setState] = useState({
    metrics: null,
    loading: true,
    error: null,
    isConfigured: false,
  })

  useEffect(() => {
    let mounted = true

    async function load() {
      if (!isAirtableConfigured()) {
        if (mounted) {
          setState({
            metrics: null,
            loading: false,
            error: null,
            isConfigured: false,
          })
        }
        return
      }

      try {
        if (mounted) {
          setState((prev) => ({ ...prev, loading: true, error: null, isConfigured: true }))
        }
        const metrics = await fetchJobSignalsMetrics()
        if (mounted) {
          setState({
            metrics,
            loading: false,
            error: null,
            isConfigured: true,
          })
        }
      } catch (err) {
        if (mounted) {
          setState({
            metrics: null,
            loading: false,
            error: err.message || 'Failed to load job signals',
            isConfigured: true,
          })
        }
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

  return state
}
