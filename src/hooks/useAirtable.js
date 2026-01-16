import { useState, useEffect } from 'react'
import {
  fetchFirms,
  isAirtableConfigured,
} from '../services/airtable'
import { normalizeSegment } from '../constants/segments'
const calculateTopSegments = (firmsData) => {
  const segmentGrowth = {}
  firmsData.forEach(firm => {
    const primarySegment = firm.primarySegment
    if (!primarySegment) return
    const normalizedSegment = normalizeSegment(String(primarySegment).trim())
    if (!normalizedSegment) return
    // growth1Y is a decimal (0.03 = 3%, -0.1 = -10%)
    const growthDecimal = Number(firm.growth1Y) || 0
    const growthValue = growthDecimal * 100
    
    if (!isNaN(growthValue)) {
      if (!segmentGrowth[normalizedSegment]) {
        segmentGrowth[normalizedSegment] = { total: 0, count: 0 }
      }
      segmentGrowth[normalizedSegment].total += growthValue
      segmentGrowth[normalizedSegment].count += 1
    }
  })
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
    // growth1Y is a decimal (0.03 = 3%, -0.1 = -10%)
    const growthDecimal = Number(firm.growth1Y) || 0
    const growthPercent = growthDecimal * 100
    if (!isNaN(growthPercent) && currentEmployees > 0) {
      const absoluteGrowth = currentEmployees * (growthPercent / 100)
      if (!stateGrowth[state]) {
        stateGrowth[state] = 0
      }
      stateGrowth[state] += absoluteGrowth
    }
  })
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
const CACHE_KEY = 'airtable_homepage_data'
const CACHE_DURATION = 1000
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
