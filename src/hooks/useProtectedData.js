import { useState, useEffect } from 'react'
import { fetchProtectedFirms } from '../services/airtable'

/**
 * Custom hook to fetch protected dashboard data based on user's segment/state
 */
export function useProtectedData(user) {
  const [firms, setFirms] = useState([])
  const [loading, setLoading] = useState(true)
  const [isConfigured, setIsConfigured] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)

      // Check if Airtable is configured
      const hasAirtableConfig = import.meta.env.VITE_AIRTABLE_API_KEY && 
                                import.meta.env.VITE_AIRTABLE_BASE_ID

      setIsConfigured(hasAirtableConfig)

      if (hasAirtableConfig && user) {
        try {
          const data = await fetchProtectedFirms(user)
          setFirms(data)
        } catch (error) {
          console.error('Error loading protected data:', error)
          setFirms([])
        }
      } else {
        // No data if not configured or no user
        setFirms([])
      }

      setLoading(false)
    }

    loadData()
  }, [user?.primarySegment, user?.hqState]) // Reload if user's segment or state changes

  return { firms, loading, isConfigured }
}
