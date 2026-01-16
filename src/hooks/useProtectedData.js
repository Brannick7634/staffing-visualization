import { useState, useEffect } from 'react'
import { fetchProtectedFirms } from '../services/airtable'
const CACHE_KEY_PREFIX = 'airtable_protected_data'
const CACHE_DURATION = 1000
const getCacheKey = (user) => {
  if (!user) return null
  const segment = user.primarySegment || 'no-segment'
  const state = user.hqState || 'no-state'
  return `${CACHE_KEY_PREFIX}_${segment}_${state}`
}
const getCachedData = (user) => {
  try {
    const cacheKey = getCacheKey(user)
    if (!cacheKey) return null
    const cached = localStorage.getItem(cacheKey)
    if (!cached) {
      return null
    }
    const { data, timestamp } = JSON.parse(cached)
    const now = Date.now()
    if (now - timestamp < CACHE_DURATION) {
      if (!data || !data.firms || !Array.isArray(data.firms)) {
        localStorage.removeItem(cacheKey)
        return null
      }
      return data
    } else {
      localStorage.removeItem(cacheKey)
      return null
    }
  } catch (error) {
    const cacheKey = getCacheKey(user)
    if (cacheKey) localStorage.removeItem(cacheKey)
    return null
  }
}
const setCachedData = (user, data) => {
  try {
    const cacheKey = getCacheKey(user)
    if (!cacheKey) return
    const cacheObject = {
      data,
      timestamp: Date.now()
    }
    localStorage.setItem(cacheKey, JSON.stringify(cacheObject))
  } catch (error) {
  }
}
export function useProtectedData(user) {
  const [firms, setFirms] = useState([])
  const [loading, setLoading] = useState(true)
  const [isConfigured, setIsConfigured] = useState(false)
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const hasAirtableConfig = import.meta.env.VITE_AIRTABLE_API_KEY && 
                                import.meta.env.VITE_AIRTABLE_BASE_ID
      setIsConfigured(hasAirtableConfig)
      if (hasAirtableConfig && user) {
        const cachedData = getCachedData(user)
        if (cachedData) {
          setFirms(cachedData.firms)
          setLoading(false)
          return
        }
        try {
          const data = await fetchProtectedFirms(user)
          setFirms(data)
          setCachedData(user, { firms: data })
        } catch (error) {
          setFirms([])
        }
      } else {
        setFirms([])
      }
      setLoading(false)
    }
    loadData()
  }, [user?.primarySegment, user?.hqState])
  return { firms, loading, isConfigured }
}
