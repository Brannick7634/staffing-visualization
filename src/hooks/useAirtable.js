import { useState, useEffect } from 'react'
import {
  fetchFirms,
  isAirtableConfigured,
} from '../services/airtable'
import { normalizeSegment } from '../constants/segments'
import { 
  calculateTopSegmentsByGrowth,
  formatGrowthPercentage,
  formatNumber,
  findTopStateForSegment,
  convertDecimalToPercentage
} from '../utils/formulas'
// Formula 10: Calculate top segments by growth
const calculateTopSegments = (firmsData) => {
  const topSegmentsData = calculateTopSegmentsByGrowth(firmsData, 3)
  return topSegmentsData.map(item => ({
    name: item.name,
    growth: formatGrowthPercentage(item.avgGrowth)
  }))
}
// Formula 2 variation: Top states by absolute headcount growth
const calculateTopStates = (firmsData) => {
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
  
  const stateGrowth = {}
  firmsData.forEach(firm => {
    const state = firm.hqStateAbbr
    if (!state) return
    
    const currentEmployees = Number(firm.eeCount) || 0
    const growthDecimal = Number(firm.growth1Y) || 0
    
    if (currentEmployees > 0) {
      // Calculate absolute headcount growth (number of employees added)
      const absoluteGrowth = currentEmployees * growthDecimal
      stateGrowth[state] = (stateGrowth[state] || 0) + absoluteGrowth
    }
  })
  
  return Object.entries(stateGrowth)
    .map(([stateAbbr, totalGrowth]) => ({
      rank: 0, // Will be set after sorting
      name: stateNames[stateAbbr] || stateAbbr,
      growth: formatNumber(Math.round(totalGrowth))
    }))
    .sort((a, b) => {
      const aNum = parseInt(a.growth.replace(/,/g, ''))
      const bNum = parseInt(b.growth.replace(/,/g, ''))
      return bNum - aNum
    })
    .slice(0, 5)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      growth: item.growth >= 0 ? `+${item.growth}` : item.growth
    }))
}
const CACHE_KEY = 'airtable_homepage_data'
const CACHE_DURATION = 60 * 60 * 1000
const getCachedData = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) {
      return null
    }
    const { data, timestamp } = JSON.parse(cached)
    const now = Date.now()
    if (now - timestamp < CACHE_DURATION) {
      if (!data || !data.firms || data.firms.length === 0) {
        localStorage.removeItem(CACHE_KEY)
        return null
      }
      return data
    } else {
      localStorage.removeItem(CACHE_KEY)
      return null
    }
  } catch (error) {
    localStorage.removeItem(CACHE_KEY)
    return null
  }
}
const setCachedData = (data) => {
  try {
    const cacheObject = {
      data,
      timestamp: Date.now()
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObject))
  } catch (error) {
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
      const cachedData = getCachedData()
      if (cachedData) {
        setData({
          ...cachedData,
          loading: false,
          isConfigured: true,
        })
        return
      }
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
        setCachedData({
          firms: newData.firms,
          topStates: newData.topStates,
          topSegments: newData.topSegments,
        })
        setData(newData)
      } catch (error) {
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
