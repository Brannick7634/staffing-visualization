import { useState, useEffect } from 'react'
import {
  fetchFirms,
  isAirtableConfigured,
} from '../services/airtable'
import { normalizeSegment } from '../constants/segments'

// Helper function to calculate top segments by average 1-year growth
const calculateTopSegments = (firmsData) => {
  // Group firms by segment and calculate average growth
  const segmentGrowth = {}
  
  firmsData.forEach(firm => {
    const segments = firm.segments
    if (!segments) return
    
    // Handle both string and array types
    let segmentList = []
    if (typeof segments === 'string') {
      segmentList = segments.split(',').map(s => s.trim())
    } else if (Array.isArray(segments)) {
      segmentList = segments.map(s => String(s).trim())
    }
    
    // Parse growth value
    let growthValue = 0
    if (firm.growth1Y !== undefined && firm.growth1Y !== null && typeof firm.growth1Y === 'number') {
      // If growth1Y is a number, it's in decimal format (-0.1 = -10%)
      growthValue = firm.growth1Y * 100 // Convert to percentage (-0.1 → -10)
    } else if (firm.growth1YValue !== undefined && firm.growth1YValue !== null) {
      // growth1YValue is already a percentage number (-10 = -10%)
      growthValue = Number(firm.growth1YValue)
    }
    
    if (!isNaN(growthValue)) {
      segmentList.forEach(segment => {
        // Normalize segment name for consistent grouping
        const normalizedSegment = normalizeSegment(segment)
        
        if (!segmentGrowth[normalizedSegment]) {
          segmentGrowth[normalizedSegment] = { total: 0, count: 0 }
        }
        segmentGrowth[normalizedSegment].total += growthValue
        segmentGrowth[normalizedSegment].count += 1
      })
    }
  })

  // Calculate averages and sort
  const segmentAverages = Object.entries(segmentGrowth)
    .map(([segment, data]) => ({
      name: segment,
      avgGrowth: data.total / data.count,
      firmCount: data.count
    }))
    .sort((a, b) => b.avgGrowth - a.avgGrowth)
    .slice(0, 3)
    .map((item) => ({
      name: item.name,
      growth: item.avgGrowth > 0 
        ? `+${item.avgGrowth.toFixed(1)}%` 
        : `${item.avgGrowth.toFixed(1)}%`
    }))

  return segmentAverages.length > 0 ? segmentAverages : []
}

// Helper function to calculate top states by total headcount growth (absolute new employees)
const calculateTopStates = (firmsData) => {
  // State abbreviation to full name mapping
  const stateNames = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming'
  }

  // Group firms by state and calculate total absolute headcount growth
  const stateGrowth = {}
  
  firmsData.forEach(firm => {
    const state = firm.hqStateAbbr
    if (!state) return
    
    const currentEmployees = Number(firm.eeCount) || 0
    // Parse growth value (handle formats like "+15.2%", "15%", "-5%")
    const growthStr = String(firm.growth1Y || firm.growth1YValue || '0%')
      .replace('%', '')
      .replace('+', '')
      .trim()
    const growthPercent = parseFloat(growthStr)
    
    if (!isNaN(growthPercent) && currentEmployees > 0) {
      // Calculate absolute headcount growth: current_employees * (growth% / 100)
      const absoluteGrowth = currentEmployees * (growthPercent / 100)
      
      if (!stateGrowth[state]) {
        stateGrowth[state] = 0
      }
      stateGrowth[state] += absoluteGrowth
    }
  })

  // Sort by total absolute growth and format
  const stateAverages = Object.entries(stateGrowth)
    .map(([stateAbbr, totalGrowth]) => ({
      state: stateAbbr,
      name: stateNames[stateAbbr] || stateAbbr,
      totalGrowth: totalGrowth
    }))
    .sort((a, b) => b.totalGrowth - a.totalGrowth)
    .slice(0, 5)
    .map((item, index) => ({
      rank: index + 1,
      name: item.name,
      growth: item.totalGrowth >= 0 
        ? `+${item.totalGrowth.toLocaleString(undefined, {maximumFractionDigits: 0})}` 
        : `${item.totalGrowth.toLocaleString(undefined, {maximumFractionDigits: 0})}`
    }))

  return stateAverages.length > 0 ? stateAverages : []
}

  // Cache configuration
  const CACHE_KEY = 'airtable_homepage_data'
  const CACHE_DURATION = 60 * 60 * 1000 // 10 minutes in milliseconds

  // Helper to get cached data
  const getCachedData = () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (!cached) return null

      const { data, timestamp } = JSON.parse(cached)
      const now = Date.now()

      // Check if cache is still valid (less than 10 minutes old)
      if (now - timestamp < CACHE_DURATION) {
        return data
      } else {
        localStorage.removeItem(CACHE_KEY)
        return null
      }
    } catch (error) {
      console.error('Error reading cache:', error)
      return null
    }
  }

  // Helper to set cached data
  const setCachedData = (data) => {
    try {
      const cacheObject = {
        data,
        timestamp: Date.now()
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObject))
    } catch (error) {
      console.error('Error writing to cache:', error)
    }
  }

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
    async function loadData() {
      // Check if Airtable is configured
      if (!isAirtableConfigured()) {
        setData((prev) => ({
          ...prev,
          firms: [],
          topStates: [],
          topSegments: [],
          loading: false,
          isConfigured: false,
        }))
        return
      }

      // Try to get cached data first
      const cachedData = getCachedData()
      if (cachedData) {
        setData({
          ...cachedData,
          loading: false,
          isConfigured: true,
        })
        return
      }

      // No valid cache, fetch fresh data
      try {
        setData(prev => ({ ...prev, loading: true }))
        const firms = await fetchFirms()

        const newData = {
          firms: firms,
          topStates: calculateTopStates(firms),
          topSegments: calculateTopSegments(firms),
          loading: false,
          error: null,
          isConfigured: true,
        }

        // Cache the fetched data
        setCachedData({
          firms: newData.firms,
          topStates: newData.topStates,
          topSegments: newData.topSegments,
        })

        setData(newData)
      } catch (error) {
        console.error('Error loading Airtable data:', error)
        setData((prev) => ({
          ...prev,
          loading: false,
          error: error.message,
        }))
      }
      }

      loadData()
    }, []) 

    return data
}
