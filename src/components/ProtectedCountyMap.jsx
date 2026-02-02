import { useEffect, useRef, useState, useMemo } from 'react'
import * as am5 from '@amcharts/amcharts5'
import * as am5map from '@amcharts/amcharts5/map'
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated'
import { CITY_TO_COUNTY_BY_STATE, getCountyForCity } from '../constants/cityCountyMapping'
import { normalizeCityName } from '../utils/cityNormalization'
import { normalizeStateAbbr, getFirmStateAbbr } from '../utils/stateNormalization'

// Import county geodata for all US states
import am5geodata_region_usa_alLow from '@amcharts/amcharts5-geodata/region/usa/alLow'
import am5geodata_region_usa_akLow from '@amcharts/amcharts5-geodata/region/usa/akLow'
import am5geodata_region_usa_azLow from '@amcharts/amcharts5-geodata/region/usa/azLow'
import am5geodata_region_usa_arLow from '@amcharts/amcharts5-geodata/region/usa/arLow'
import am5geodata_region_usa_caLow from '@amcharts/amcharts5-geodata/region/usa/caLow'
import am5geodata_region_usa_coLow from '@amcharts/amcharts5-geodata/region/usa/coLow'
import am5geodata_region_usa_ctLow from '@amcharts/amcharts5-geodata/region/usa/ctLow'
import am5geodata_region_usa_deLow from '@amcharts/amcharts5-geodata/region/usa/deLow'
import am5geodata_region_usa_flLow from '@amcharts/amcharts5-geodata/region/usa/flLow'
import am5geodata_region_usa_gaLow from '@amcharts/amcharts5-geodata/region/usa/gaLow'
import am5geodata_region_usa_hiLow from '@amcharts/amcharts5-geodata/region/usa/hiLow'
import am5geodata_region_usa_idLow from '@amcharts/amcharts5-geodata/region/usa/idLow'
import am5geodata_region_usa_ilLow from '@amcharts/amcharts5-geodata/region/usa/ilLow'
import am5geodata_region_usa_inLow from '@amcharts/amcharts5-geodata/region/usa/inLow'
import am5geodata_region_usa_iaLow from '@amcharts/amcharts5-geodata/region/usa/iaLow'
import am5geodata_region_usa_ksLow from '@amcharts/amcharts5-geodata/region/usa/ksLow'
import am5geodata_region_usa_kyLow from '@amcharts/amcharts5-geodata/region/usa/kyLow'
import am5geodata_region_usa_laLow from '@amcharts/amcharts5-geodata/region/usa/laLow'
import am5geodata_region_usa_meLow from '@amcharts/amcharts5-geodata/region/usa/meLow'
import am5geodata_region_usa_mdLow from '@amcharts/amcharts5-geodata/region/usa/mdLow'
import am5geodata_region_usa_maLow from '@amcharts/amcharts5-geodata/region/usa/maLow'
import am5geodata_region_usa_miLow from '@amcharts/amcharts5-geodata/region/usa/miLow'
import am5geodata_region_usa_mnLow from '@amcharts/amcharts5-geodata/region/usa/mnLow'
import am5geodata_region_usa_msLow from '@amcharts/amcharts5-geodata/region/usa/msLow'
import am5geodata_region_usa_moLow from '@amcharts/amcharts5-geodata/region/usa/moLow'
import am5geodata_region_usa_mtLow from '@amcharts/amcharts5-geodata/region/usa/mtLow'
import am5geodata_region_usa_neLow from '@amcharts/amcharts5-geodata/region/usa/neLow'
import am5geodata_region_usa_nvLow from '@amcharts/amcharts5-geodata/region/usa/nvLow'
import am5geodata_region_usa_nhLow from '@amcharts/amcharts5-geodata/region/usa/nhLow'
import am5geodata_region_usa_njLow from '@amcharts/amcharts5-geodata/region/usa/njLow'
import am5geodata_region_usa_nmLow from '@amcharts/amcharts5-geodata/region/usa/nmLow'
import am5geodata_region_usa_nyLow from '@amcharts/amcharts5-geodata/region/usa/nyLow'
import am5geodata_region_usa_ncLow from '@amcharts/amcharts5-geodata/region/usa/ncLow'
import am5geodata_region_usa_ndLow from '@amcharts/amcharts5-geodata/region/usa/ndLow'
import am5geodata_region_usa_ohLow from '@amcharts/amcharts5-geodata/region/usa/ohLow'
import am5geodata_region_usa_okLow from '@amcharts/amcharts5-geodata/region/usa/okLow'
import am5geodata_region_usa_orLow from '@amcharts/amcharts5-geodata/region/usa/orLow'
import am5geodata_region_usa_paLow from '@amcharts/amcharts5-geodata/region/usa/paLow'
import am5geodata_region_usa_riLow from '@amcharts/amcharts5-geodata/region/usa/riLow'
import am5geodata_region_usa_scLow from '@amcharts/amcharts5-geodata/region/usa/scLow'
import am5geodata_region_usa_sdLow from '@amcharts/amcharts5-geodata/region/usa/sdLow'
import am5geodata_region_usa_tnLow from '@amcharts/amcharts5-geodata/region/usa/tnLow'
import am5geodata_region_usa_txLow from '@amcharts/amcharts5-geodata/region/usa/txLow'
import am5geodata_region_usa_utLow from '@amcharts/amcharts5-geodata/region/usa/utLow'
import am5geodata_region_usa_vtLow from '@amcharts/amcharts5-geodata/region/usa/vtLow'
import am5geodata_region_usa_vaLow from '@amcharts/amcharts5-geodata/region/usa/vaLow'
import am5geodata_region_usa_waLow from '@amcharts/amcharts5-geodata/region/usa/waLow'
import am5geodata_region_usa_wvLow from '@amcharts/amcharts5-geodata/region/usa/wvLow'
import am5geodata_region_usa_wiLow from '@amcharts/amcharts5-geodata/region/usa/wiLow'
import am5geodata_region_usa_wyLow from '@amcharts/amcharts5-geodata/region/usa/wyLow'
import am5geodata_region_usa_dcLow from '@amcharts/amcharts5-geodata/region/usa/dcLow'

// Map state codes to their geodata
const COUNTY_GEODATA_MAP = {
  'al': am5geodata_region_usa_alLow,
  'ak': am5geodata_region_usa_akLow,
  'az': am5geodata_region_usa_azLow,
  'ar': am5geodata_region_usa_arLow,
  'ca': am5geodata_region_usa_caLow,
  'co': am5geodata_region_usa_coLow,
  'ct': am5geodata_region_usa_ctLow,
  'de': am5geodata_region_usa_deLow,
  'fl': am5geodata_region_usa_flLow,
  'ga': am5geodata_region_usa_gaLow,
  'hi': am5geodata_region_usa_hiLow,
  'id': am5geodata_region_usa_idLow,
  'il': am5geodata_region_usa_ilLow,
  'in': am5geodata_region_usa_inLow,
  'ia': am5geodata_region_usa_iaLow,
  'ks': am5geodata_region_usa_ksLow,
  'ky': am5geodata_region_usa_kyLow,
  'la': am5geodata_region_usa_laLow,
  'me': am5geodata_region_usa_meLow,
  'md': am5geodata_region_usa_mdLow,
  'ma': am5geodata_region_usa_maLow,
  'mi': am5geodata_region_usa_miLow,
  'mn': am5geodata_region_usa_mnLow,
  'ms': am5geodata_region_usa_msLow,
  'mo': am5geodata_region_usa_moLow,
  'mt': am5geodata_region_usa_mtLow,
  'ne': am5geodata_region_usa_neLow,
  'nv': am5geodata_region_usa_nvLow,
  'nh': am5geodata_region_usa_nhLow,
  'nj': am5geodata_region_usa_njLow,
  'nm': am5geodata_region_usa_nmLow,
  'ny': am5geodata_region_usa_nyLow,
  'nc': am5geodata_region_usa_ncLow,
  'nd': am5geodata_region_usa_ndLow,
  'oh': am5geodata_region_usa_ohLow,
  'ok': am5geodata_region_usa_okLow,
  'or': am5geodata_region_usa_orLow,
  'pa': am5geodata_region_usa_paLow,
  'ri': am5geodata_region_usa_riLow,
  'sc': am5geodata_region_usa_scLow,
  'sd': am5geodata_region_usa_sdLow,
  'tn': am5geodata_region_usa_tnLow,
  'tx': am5geodata_region_usa_txLow,
  'ut': am5geodata_region_usa_utLow,
  'vt': am5geodata_region_usa_vtLow,
  'va': am5geodata_region_usa_vaLow,
  'wa': am5geodata_region_usa_waLow,
  'wv': am5geodata_region_usa_wvLow,
  'wi': am5geodata_region_usa_wiLow,
  'wy': am5geodata_region_usa_wyLow,
  'dc': am5geodata_region_usa_dcLow
}

// State name to abbreviation mapping (lowercase for geodata imports)
const STATE_NAME_TO_ABBR = {
  'Alabama': 'al', 'Alaska': 'ak', 'Arizona': 'az', 'Arkansas': 'ar',
  'California': 'ca', 'Colorado': 'co', 'Connecticut': 'ct', 'Delaware': 'de',
  'Florida': 'fl', 'Georgia': 'ga', 'Hawaii': 'hi', 'Idaho': 'id',
  'Illinois': 'il', 'Indiana': 'in', 'Iowa': 'ia', 'Kansas': 'ks',
  'Kentucky': 'ky', 'Louisiana': 'la', 'Maine': 'me', 'Maryland': 'md',
  'Massachusetts': 'ma', 'Michigan': 'mi', 'Minnesota': 'mn', 'Mississippi': 'ms',
  'Missouri': 'mo', 'Montana': 'mt', 'Nebraska': 'ne', 'Nevada': 'nv',
  'New Hampshire': 'nh', 'New Jersey': 'nj', 'New Mexico': 'nm', 'New York': 'ny',
  'North Carolina': 'nc', 'North Dakota': 'nd', 'Ohio': 'oh', 'Oklahoma': 'ok',
  'Oregon': 'or', 'Pennsylvania': 'pa', 'Rhode Island': 'ri', 'South Carolina': 'sc',
  'South Dakota': 'sd', 'Tennessee': 'tn', 'Texas': 'tx', 'Utah': 'ut',
  'Vermont': 'vt', 'Virginia': 'va', 'Washington': 'wa', 'West Virginia': 'wv',
  'Wisconsin': 'wi', 'Wyoming': 'wy', 'District of Columbia': 'dc'
}

// State FIPS codes for filtering counties
const STATE_FIPS = {
  'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06', 'CO': '08',
  'CT': '09', 'DE': '10', 'FL': '12', 'GA': '13', 'HI': '15', 'ID': '16',
  'IL': '17', 'IN': '18', 'IA': '19', 'KS': '20', 'KY': '21', 'LA': '22',
  'ME': '23', 'MD': '24', 'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28',
  'MO': '29', 'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33', 'NJ': '34',
  'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39', 'OK': '40',
  'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45', 'SD': '46', 'TN': '47',
  'TX': '48', 'UT': '49', 'VT': '50', 'VA': '51', 'WA': '53', 'WV': '54',
  'WI': '55', 'WY': '56', 'DC': '11'
}


// Match main heatmap color scheme
const getColorForGrowth = (growth) => {
  if (growth <= -25) return am5.color(0x7F1D1D) // deep red
  if (growth <= -11) return am5.color(0xDC2626) // red
  if (growth < 0) return am5.color(0xFCA5A5)    // light red
  if (growth <= 10) return am5.color(0xBBF7D0)  // light green
  if (growth <= 25) return am5.color(0x22C55E)  // green
  return am5.color(0x14532D)                     // deep green
}

const getGrowthLabel = (growth) => {
  if (growth <= -25) return "Declining significantly"
  if (growth <= -11) return "Declining moderately"
  if (growth < 0) return "Declining slightly"
  if (growth <= 10) return "Growing moderately"
  if (growth <= 25) return "Growing strongly"
  return "Growing significantly"
}

const ProtectedCountyMap = ({ firms, userState }) => {
  const chartDiv = useRef(null)
  const chartRoot = useRef(null)
  const polygonSeries = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  
  const [filters, setFilters] = useState({
    timeframe: '1Y Growth',
    size: 'all'
  })

  const filterRecords = (records) => {
    
    let filtered = records.filter(r => getFirmStateAbbr(r))
    
    // Filter by user's state with fuzzy matching
    if (userState) {
      const normalizedUserState = normalizeStateAbbr(userState)
      
      filtered = filtered.filter(r => {
        const firmState = getFirmStateAbbr(r)
        return firmState === normalizedUserState
      })
      
      if (filtered.length > 0) {
      }
    }
    
    if (filters.size !== 'all') {
      filtered = filtered.filter(r => {
        const count = Number(r.eeCount) || 0
        if (filters.size === 'small') return count < 50
        if (filters.size === 'medium') return count >= 50 && count <= 500
        if (filters.size === 'large') return count > 500
        return true
      })
    }
    
    return filtered
  }

  const aggregateByCity = (records) => {
    
    const cityData = {}
    
    records.forEach(r => {
      // Handle both string and array formats for city
      let city = r.companyCity
      if (Array.isArray(city)) {
        city = city[0] // Take first element if array
      }
      if (!city) return
      
      // Normalize city name: trim whitespace and standardize
      city = city.trim()
      
      if (!cityData[city]) {
        cityData[city] = {
          firms: [],
          headcount: 0,
          tenures: [],
          growths: []
        }
      }
      
      cityData[city].firms.push(r)
      cityData[city].headcount += Number(r.eeCount) || 0
      
      const tenure = Number(r.averageTenure) || 0
      if (tenure > 0) cityData[city].tenures.push(tenure)
      
      // Get growth based on selected timeframe
      // Growth values are decimals (0.03 = 3%, -0.1 = -10%)
      let growthDecimal = 0
      if (filters.timeframe === '1Y Growth') {
        growthDecimal = Number(r.growth1Y) || 0
      } else if (filters.timeframe === '6M Growth') {
        growthDecimal = Number(r.growth6M) || 0
      } else if (filters.timeframe === '2Y Growth') {
        growthDecimal = Number(r.growth2Y) || 0
      }
      
      // Convert decimal to percentage (0.03 -> 3)
      const growth = growthDecimal * 100
      
      if (isNaN(growth)) return
      
      cityData[city].growths.push(growth)
    })
    
    const aggregated = Object.entries(cityData).map(([city, data]) => {
      const avgGrowth = data.growths.length > 0 
        ? data.growths.reduce((a, b) => a + b, 0) / data.growths.length 
        : 0
      
      const medianTenure = data.tenures.length > 0
        ? data.tenures.sort((a, b) => a - b)[Math.floor(data.tenures.length / 2)]
        : 0
      
      return {
        city: city,
        growth: avgGrowth,
        firmCount: data.firms.length,
        totalHeadcount: data.headcount,
        medianTenure: medianTenure
      }
    })
    
    return aggregated
  }

  useEffect(() => {
    
    if (!chartDiv.current) {
      return
    }

    setMapReady(false) // Reset FIRST before initializing new chart
    polygonSeries.current = null // Reset polygon series immediately


    // Initialize chart
    const root = am5.Root.new(chartDiv.current)
    root.setThemes([am5themes_Animated.new(root)])
    
    const chart = root.container.children.push(
      am5map.MapChart.new(root, {
        panX: "translateX",
        panY: "translateY",
        projection: am5map.geoAlbersUsa(),
        wheelY: "none", // Disable mouse wheel zoom
        maxZoomLevel: 4, // Limit maximum zoom level
        minZoomLevel: 1  // Set minimum zoom level
      })
    )

    // Add zoom control buttons
    const zoomControl = chart.set("zoomControl", am5map.ZoomControl.new(root, {
      zoomStep: 0.5 // Smaller zoom increments (default is 2)
    }))
    zoomControl.homeButton.set("visible", false) // Hide home button, keep only +/-


    // Load state county map
    const loadCountyMap = () => {
      try {
        // Convert state name to lowercase code
        const stateCode = STATE_NAME_TO_ABBR[userState] || userState.toLowerCase()
        
        const geodata = COUNTY_GEODATA_MAP[stateCode]
        
        if (!geodata) {
          return
        }
        
        
        // Create polygon series with county data
        const series = chart.series.push(
          am5map.MapPolygonSeries.new(root, {
            geoJSON: geodata
          })
        )
        

        series.mapPolygons.template.setAll({
          tooltipText: "{name}",
          interactive: true,
          strokeWidth: 0.5,
          stroke: am5.color(0xffffff),
          showTooltipOn: "click"
        })


        series.mapPolygons.template.states.create("hover", {
          fill: am5.color(0x4FE3D9)
        })

        series.mapPolygons.template.adapters.add("fill", (fill, target) => {
          const dataItem = target.dataItem
          if (dataItem && dataItem.dataContext.growth !== undefined) {
            const growth = dataItem.dataContext.growth || 0
            return getColorForGrowth(growth)
          }
          return am5.color(0x1f2950)
        })

        series.mapPolygons.template.adapters.add("tooltipHTML", (text, target) => {
          const dataItem = target.dataItem
          if (dataItem && dataItem.dataContext) {
            const d = dataItem.dataContext
            const countyName = d.name || 'Unknown'
            const growth = d.growth || 0
            const firmCount = d.firmCount || 0
            const totalHeadcount = d.totalHeadcount || 0
            const medianTenure = d.medianTenure || 0
            const cities = d.cities || []
            
            if (firmCount === 0) {
              return `<div style="background: white; padding: 12px 16px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-family: -apple-system, sans-serif;">
                <div style="font-size: 14px; color: #495057;">${countyName}: No data</div>
              </div>`
            }
            
            // Build cities list HTML
            let citiesHTML = ''
            if (cities.length > 0) {
              citiesHTML = '<div style="font-size: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #dee2e6;">'
              citiesHTML += '<div style="font-weight: 600; margin-bottom: 4px; color: #212529;">Cities:</div>'
              cities.forEach(city => {
                citiesHTML += `<div style="color: #495057; margin-bottom: 2px;">• ${city.name}: ${city.firmCount} firms, ${city.growth > 0 ? '+' : ''}${city.growth.toFixed(1)}% growth</div>`
              })
              citiesHTML += '</div>'
            }
            
            return `
              <div style="background: white; padding: 12px 16px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-family: -apple-system, sans-serif; min-width: 280px; max-width: 400px;">
                <div style="font-size: 16px; font-weight: 700; margin-bottom: 8px; color: #212529;">
                  ${countyName} – ${getGrowthLabel(growth)}
                </div>
                <div style="font-size: 14px; margin-bottom: 4px; color: #495057;">
                  <strong>Internal employee Headcount:</strong> ${growth > 0 ? '+' : ''}${growth.toFixed(1)}% (last 12 months)
                </div>
                <div style="font-size: 14px; margin-bottom: 4px; color: #495057;">
                  <strong>Firms in county:</strong> ${firmCount.toLocaleString()}
                </div>
                <div style="font-size: 14px; margin-bottom: 4px; color: #495057;">
                  <strong>Total headcount (est.):</strong> ${totalHeadcount.toLocaleString()}
                </div>
                ${citiesHTML}
              </div>
            `
          }
          return text
        })

        // Wait for series to finish loading
        series.events.once("datavalidated", () => {
          polygonSeries.current = series
          // Force a state change by setting to false first if already true
          setMapReady(false)
          setTimeout(() => {
            setMapReady(true) // Signal that map is ready for data updates
          }, 0)
        })
        
      } catch (error) {
      }
    }

    loadCountyMap()
    chartRoot.current = root

    return () => {
      root.dispose()
    }
  }, [userState])

  useEffect(() => {
    
    if (!polygonSeries.current || !mapReady) {
      return
    }

    const filtered = filterRecords(firms)
    
    const cityAggregates = aggregateByCity(filtered)
    
    // Match cities to counties and update polygon data
    if (polygonSeries.current) {
      const polygons = polygonSeries.current.mapPolygons.values
      
      // Get state code for lookup
      const stateCode = STATE_NAME_TO_ABBR[userState] || userState.toLowerCase()
      const upperStateCode = stateCode.toUpperCase()
      
      // Get city-to-county mapping for this state from the CSV-based constants
      const cityToCountyMap = CITY_TO_COUNTY_BY_STATE[upperStateCode] || {}
      
      // Aggregate cities by county
      const countyData = {}
      const unmappedCities = [] // Track cities without county mapping
      
      cityAggregates.forEach(city => {
        const cityName = normalizeCityName(city.city) // Use normalization
        let countyName = cityToCountyMap[cityName]
        
        // If no exact match, try to find a partial match (for data quality issues)
        if (!countyName) {
          // Check if the city name contains a known state city
          const possibleMatches = Object.keys(cityToCountyMap).filter(knownCity => 
            cityName.includes(knownCity) || knownCity.includes(cityName)
          )
          
          if (possibleMatches.length === 1) {
            countyName = cityToCountyMap[possibleMatches[0]]
          }
        }
        
        if (countyName) {
          if (!countyData[countyName]) {
            countyData[countyName] = {
              cities: [],
              totalHeadcount: 0,
              growths: [],
              tenures: []
            }
          }
          
          countyData[countyName].cities.push({
            name: city.city,
            firmCount: city.firmCount,
            growth: city.growth,
            headcount: city.totalHeadcount
          })
          countyData[countyName].totalHeadcount += city.totalHeadcount
          countyData[countyName].growths.push(city.growth)
          countyData[countyName].tenures.push(city.medianTenure)
        } else {
          // Track unmapped cities for debugging
          unmappedCities.push({
            city: city.city,
            firmCount: city.firmCount,
            headcount: city.totalHeadcount
          })
        }
      })
      
      
      let matchedCount = 0
      let unmatchedCounties = []
      
      polygons.forEach(polygon => {
        if (polygon.dataItem?.dataContext) {
          const countyName = polygon.dataItem.dataContext.name || ''
          const cleanName = countyName.replace(/\s+County$/i, '').toLowerCase().trim()
          
          const data = countyData[cleanName]
          
          if (data && data.growths.length > 0) {
            const avgGrowth = data.growths.reduce((a, b) => a + b, 0) / data.growths.length
            const avgTenure = data.tenures.reduce((a, b) => a + b, 0) / data.tenures.length
            const totalFirms = data.cities.reduce((sum, city) => sum + city.firmCount, 0)
            
            
            polygon.dataItem.dataContext = {
              ...polygon.dataItem.dataContext,
              growth: avgGrowth,
              firmCount: totalFirms,
              totalHeadcount: data.totalHeadcount,
              medianTenure: avgTenure,
              cities: data.cities
            }
            
            // Force the polygon to update its fill color
            const fillColor = getColorForGrowth(avgGrowth)
            polygon.set("fill", fillColor)
            
            matchedCount++
          } else {
            unmatchedCounties.push(cleanName)
            // Set default color for counties with no data
            polygon.set("fill", am5.color(0x1f2950))
          }
        }
      })
      
    }
  }, [firms, filters, userState, mapReady])

  return (
    <>
      <div className="heatmap-filters">
        <div className="filter-group">
          <label className="filter-label">Growth timeframe:</label>
          <select 
            className="filter-select"
            value={filters.timeframe}
            onChange={(e) => setFilters({...filters, timeframe: e.target.value})}
          >
            <option value="2Y Growth">Last 24 months</option>
            <option value="1Y Growth">Last 12 months</option>
            <option value="6M Growth">Last 6 months</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label className="filter-label">Internal headcount:</label>
          <select 
            className="filter-select"
            value={filters.size}
            onChange={(e) => setFilters({...filters, size: e.target.value})}
          >
            <option value="all">All sizes</option>
            <option value="small">Small (&lt; 50)</option>
            <option value="medium">Medium (50-500)</option>
            <option value="large">Large (&gt; 500)</option>
          </select>
        </div>
      </div>

      <div ref={chartDiv} className="heatmap-chart"></div>
    </>
  )
};

export default ProtectedCountyMap;
