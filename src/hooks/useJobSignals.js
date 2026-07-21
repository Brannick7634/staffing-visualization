import { useEffect, useState } from 'react'
import {
  fetchJobSignalsMetrics,
  computeJobSignalsMetricsLive,
  storeJobSignalsMetrics,
  isJobSignalsCacheStale,
} from '../services/jobSignals'
import { isAirtableConfigured } from '../services/airtable'

// Module-level flag to prevent double computation (same as homepage useAirtable)
let isComputing = false
let computePromise = null

export function useJobSignals() {
  const [state, setState] = useState({
    metrics: null,
    loading: true,
    error: null,
    isConfigured: false,
  })

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      if (!isAirtableConfigured()) {
        if (isMounted) {
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
        if (isMounted) {
          setState((prev) => ({ ...prev, loading: true, error: null, isConfigured: true }))
        }

        let metrics = await fetchJobSignalsMetrics()

        if (!metrics) {
          // No Airtable cache — compute once and store (like homepage DashboardMetrices)
          if (isComputing) {
            if (computePromise) {
              metrics = await computePromise
            }
          } else {
            isComputing = true
            computePromise = (async () => {
              const newMetrics = await computeJobSignalsMetricsLive()
              await storeJobSignalsMetrics(newMetrics)
              isComputing = false
              computePromise = null
              return newMetrics
            })()
            metrics = await computePromise
          }
        } else if (isJobSignalsCacheStale(metrics.computedAt)) {
          // Cache older than 7 days — show it now, refresh in background
          if (!isComputing) {
            isComputing = true
            ;(async () => {
              try {
                const newMetrics = await computeJobSignalsMetricsLive()
                const storeResult = await storeJobSignalsMetrics(newMetrics)
                if (storeResult.success) {
                  const freshMetrics = await fetchJobSignalsMetrics()
                  if (freshMetrics && isMounted) {
                    setState({
                      metrics: freshMetrics,
                      loading: false,
                      error: null,
                      isConfigured: true,
                    })
                  }
                }
              } catch {
                // Silent fail — keep showing cached metrics
              } finally {
                isComputing = false
                computePromise = null
              }
            })()
          }
        }

        if (isMounted && metrics) {
          setState({
            metrics,
            loading: false,
            error: null,
            isConfigured: true,
          })
        }
      } catch (error) {
        isComputing = false
        computePromise = null
        if (isMounted) {
          setState({
            metrics: null,
            loading: false,
            error: error.message || 'Failed to load job signals',
            isConfigured: true,
          })
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [])

  return state
}
