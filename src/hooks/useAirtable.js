import { useState, useEffect } from 'react'
import {
  fetchDashboardMetrics,
  computeDashboardMetrics,
  storeDashboardMetrics,
  isAirtableConfigured,
} from '../services/airtable'

// Module-level flag to prevent double computation
let isComputing = false
let computePromise = null

export function useAirtableData() {
  const [data, setData] = useState({
    firms: [],
    topStates: [],
    topSegments: [],
    loading: true,
    error: null,
    isConfigured: false,
  })
  
  useEffect(() => {
    let isMounted = true
    
    async function loadData() {
      if (!isAirtableConfigured()) {
        if (isMounted) {
          setData((prev) => ({
            ...prev,
            firms: [],
            topStates: [],
            topSegments: [],
            loading: false,
            isConfigured: false,
          }))
        }
        return
      }
      
      try {
        if (isMounted) {
          setData(prev => ({ ...prev, loading: true }))
        }
        
        let metrics = await fetchDashboardMetrics()
        
        if (!metrics) {
          if (isComputing) {
            if (computePromise) {
              metrics = await computePromise
            }
          } else {
            isComputing = true
            
            computePromise = (async () => {
              const newMetrics = await computeDashboardMetrics()
              const storeResult = await storeDashboardMetrics(newMetrics)
              isComputing = false
              computePromise = null
              return newMetrics
            })()
            
            metrics = await computePromise
          }
        } else {
          const computedAt = new Date(metrics.computedAt)
          const now = new Date()
          const hoursSinceComputed = (now - computedAt) / (1000 * 60 * 60)
          
          if (hoursSinceComputed > 7) {
            if (!isComputing) {
              isComputing = true
              
              ;(async () => {
                try {
                  const newMetrics = await computeDashboardMetrics()
                  const storeResult = await storeDashboardMetrics(newMetrics)
                  if (storeResult.success) {
                    const freshMetrics = await fetchDashboardMetrics()
                    if (freshMetrics && isMounted) {
                      setData({
                        firms: freshMetrics.tableFirms || [],
                        topStates: freshMetrics.topStatesByGrowth || [],
                        topSegments: freshMetrics.topSegmentsByGrowth || [],
                        metrics: freshMetrics,
                        loading: false,
                        error: null,
                        isConfigured: true,
                      })
                    }
                  }
                } catch (error) {
                  // Silent fail
                } finally {
                  isComputing = false
                  computePromise = null
                }
              })()
            }
          }
        }
        
        // Use the metrics (either fetched or newly computed)
        if (isMounted && metrics) {
          setData({
            firms: metrics.tableFirms || [],
            topStates: metrics.topStatesByGrowth || [],
            topSegments: metrics.topSegmentsByGrowth || [],
            metrics: metrics, // Store full metrics for other components
            loading: false,
            error: null,
            isConfigured: true,
          })
        }
      } catch (error) {
        isComputing = false
        computePromise = null
        if (isMounted) {
          setData((prev) => ({
            ...prev,
            loading: false,
            error: error.message,
          }))
        }
      }
    }
    
    loadData()
    
    return () => {
      isMounted = false
    }
  }, [])
  
  return data
}
