import { useEffect, useRef, useState } from 'react'
import * as am5 from '@amcharts/amcharts5'
import * as am5map from '@amcharts/amcharts5/map'
import am5geodata_usaLow from '@amcharts/amcharts5-geodata/usaLow'
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated'

const STATE_NAMES = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
  'DC': 'District of Columbia'
}

function HeatMap({ heatmapData, filters, setFilters }) {
  const chartDiv = useRef(null)
  const chartRoot = useRef(null)
  const polygonSeries = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const filtersRef = useRef(filters)

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

  // Keep filters ref up to date
  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  // Remove filterRecords and aggregateByState functions - using pre-computed data

  useEffect(() => {
    if (!chartDiv.current) return

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

    const series = chart.series.push(
      am5map.MapPolygonSeries.new(root, {
        geoJSON: am5geodata_usaLow,
        valueField: "value",
        calculateAggregates: false
      })
    )

    series.mapPolygons.template.setAll({
      strokeWidth: 1,
      stroke: am5.color(0xffffff),
      cursorOverStyle: "pointer",
      interactive: true,
      showTooltipOn: "click"
    })

    // Update tooltip content dynamically
    series.mapPolygons.template.adapters.add("tooltipHTML", (text, target) => {
      const dataItem = target.dataItem
      
      // Get state name from polygon ID
      const polygonId = dataItem?.dataContext?.id || ''
      const stateCode = polygonId.replace('US-', '')
      const stateName = STATE_NAMES[stateCode] || stateCode
      
      // Get timeframe label based on current filter
      const getTimeframeLabel = () => {
        if (filtersRef.current.timeframe === '6M Growth') return 'last 6 months'
        if (filtersRef.current.timeframe === '1Y Growth') return 'last 12 months'
        if (filtersRef.current.timeframe === '2Y Growth') return 'last 24 months'
        return 'last 12 months'
      }
      
      if (dataItem && dataItem.dataContext && dataItem.dataContext.firmCount > 0) {
        const d = dataItem.dataContext
        const growth = d.growth || 0
        const firmCount = d.firmCount || 0
        const totalHeadcount = d.totalHeadcount || 0
        const medianTenure = d.medianTenure || 0
        
        return `
          <div style="background: rgba(255, 255, 255, 0.95); padding: 12px 16px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-family: -apple-system, sans-serif; min-width: 280px;">
            <div style="font-size: 16px; font-weight: 700; margin-bottom: 8px; color: #212529;">
              ${stateName} – ${getGrowthLabel(growth)}
            </div>
            <div style="font-size: 14px; margin-bottom: 4px; color: #495057;">
              <strong>Internal employee Headcount:</strong> ${growth > 0 ? '+' : ''}${growth.toFixed(1)}% (${getTimeframeLabel()})
            </div>
            <div style="font-size: 14px; margin-bottom: 4px; color: #495057;">
              <strong>Firms in view:</strong> ${firmCount.toLocaleString()}
            </div>
            <!--<div style="font-size: 14px; margin-bottom: 4px; color: #495057;">
              <strong>Total headcount (est.):</strong> ${totalHeadcount.toLocaleString()}
            </div>-->
          </div>
        `
      } else {
        return `
          <div style="background: rgba(255, 255, 255, 0.95); padding: 12px 16px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-family: -apple-system, sans-serif; min-width: 280px;">
            <div style="font-size: 16px; font-weight: 700; margin-bottom: 8px; color: #212529;">
              ${stateName}
            </div>
            <div style="font-size: 14px; color: #6c757d;">
              No firms in current view
            </div>
          </div>
        `
      }
    })

    series.mapPolygons.template.adapters.add("fill", (fill, target) => {
      const dataItem = target.dataItem
      if (dataItem && dataItem.dataContext && dataItem.dataContext.firmCount > 0) {
        const growth = dataItem.dataContext.growth || 0
        return getColorForGrowth(growth)
      }
      // Return base color for states with no data (will be made transparent via fillOpacity)
      return am5.color(0x1f2950)
    })

    series.mapPolygons.template.adapters.add("fillOpacity", (opacity, target) => {
      const dataItem = target.dataItem
      if (dataItem && dataItem.dataContext && dataItem.dataContext.firmCount > 0) {
        return 1  // Fully opaque for states with data
      }
      return 0.1  // Almost transparent for states with no data
    })

    chartRoot.current = root
    polygonSeries.current = series
    
    // Set map as ready after initialization
    setMapReady(true)

    return () => {
      root.dispose()
      setMapReady(false)
    }
  }, [])

  useEffect(() => {
    if (!polygonSeries.current || !mapReady) return

    // Use pre-computed heatmap data
    const mapData = (heatmapData || []).map(s => ({
      ...s,
      value: s.growth
    }))
    
    polygonSeries.current.data.setAll(mapData)
  }, [heatmapData, filters, mapReady])

  return (
    <div>
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
    </div>
  )
}

// Component to display rankings with pre-computed data
function HeatMapWithRankings({ heatmapData, topStates, topSegments, hideRankings = false }) {
  const [filters, setFilters] = useState({
    timeframe: '1Y Growth',
    size: 'all'
  })

  // Get pre-computed heatmap data based on current filters
  // Parse the new structure: { state: { filter: {g, f} } } -> array format for map
  const getHeatmapDataForFilters = () => {
    if (!heatmapData) return []
    
    const key = `${filters.timeframe}_${filters.size}`
    const result = []
    
    // heatmapData is now: { stateCode: { "1Y Growth_all": {g, f}, ... } }
    Object.entries(heatmapData).forEach(([stateCode, filterData]) => {
      const metrics = filterData[key]
      if (metrics) {
        result.push({
          id: "US-" + stateCode,
          stateCode,
          stateName: STATE_NAMES[stateCode] || stateCode,
          growth: metrics.g,  // abbreviated key
          firmCount: metrics.f  // abbreviated key
        })
      }
    })
    
    return result
  }

  const currentHeatmapData = getHeatmapDataForFilters()

  if (hideRankings) {
    return <HeatMap heatmapData={currentHeatmapData} filters={filters} setFilters={setFilters} />
  }

  return (
    <div className="two-column">
      <div>
        <HeatMap heatmapData={currentHeatmapData} filters={filters} setFilters={setFilters} />
      </div>
      <div className="mini-panel">
        <div style={{ marginTop: '14px' }}>
          <div className="mini-title">Top 5 states by 1-yr growth (avg %)</div>
          <div className="mini-list">
            {(topStates || []).map((state, index) => (
              <div key={state.rank || index} className="mini-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="mini-rank">{state.rank || index + 1}</div>
                  <span>{state.name}</span>
                </div>
                <span className="text-positive">{state.growth}</span>
              </div>
            ))}
          </div>
        </div>

        {topSegments && topSegments.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <div className="mini-title">Top 3 Segments in the U.S by 1-Y Growth</div>
            <div className="mini-list">
              {topSegments.map((segment, index) => {
                // Format segment name: keep USLH, EOR, PEO, IT, MGF as-is, capitalize first letter for others
                const formatSegmentName = (name) => {
                  const upperCaseSegments = ['USLH', 'EOR', 'PEO', 'IT', 'MGF']
                  if (upperCaseSegments.includes(name)) return name
                  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
                }
                
                return (
                  <div key={index} className="mini-row">
                    <span>{formatSegmentName(segment.name)}</span>
                    <span className="text-positive">{segment.growth}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default HeatMapWithRankings
