import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as am5 from '@amcharts/amcharts5'
import * as am5xy from '@amcharts/amcharts5/xy'
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated'
import { SEGMENT_NAMES } from '../constants/segments'
import { useAuth } from '../context/AuthContext'
import { useJobSignals } from '../hooks/useJobSignals'
import { getDefaultIndustry } from '../services/jobSignals'

const dashboardModel = {
  header: {
    title: 'JOB SIGNALS',
    eyebrow: 'SEE WHERE HIRING IS ACCELERATING, STABILIZING OR SLOWING.',
    description: 'Live hiring activity and momentum from LinkedIn job scrapes, grouped by staffing segment.',
    actions: [
      { id: 'help', label: 'How it works', icon: 'info' },
      { id: 'export', label: 'Export', icon: 'download' },
      { id: 'dashboard', label: 'Go to Dashboard', icon: 'screen' },
    ],
  },
  howItWorks: {
    title: 'How Job Signals Works',
    description: 'Job Signals turns LinkedIn hiring activity into a simple view of where demand is growing, stabilizing, or slowing by staffing segment.',
    steps: [
      {
        title: 'Collect',
        description: 'We scrape LinkedIn jobs for staffing firms on a ~2 week cycle and store each run as a dated snapshot.',
      },
      {
        title: 'Normalize',
        description: 'Jobs are joined to Company Details via LinkedIn company ID and rolled up by Primary Segment.',
      },
      {
        title: 'Measure',
        description: 'Momentum compares the latest scrape to the previous scrape. The first scrape is a zero baseline.',
      },
    ],
    note: 'Until a second scrape exists, momentum is shown as a baseline. Top hiring functions use Work Type from LinkedIn jobs.',
    closeLabel: 'Got it',
  },
  summary: {
    ariaLabel: 'Hiring summary',
  },
  momentum: {
    title: 'INDUSTRY HIRING MOMENTUM',
    subtitle: '% Change in active jobs vs previous scrape',
    axisTitle: '% Change in Active Jobs',
  },
  trend: {
    title: 'HIRING TREND OVER TIME',
    chartAriaLabel: 'Hiring trend line chart',
    zoomHint: 'Scroll to zoom · Drag to select · Use the scrollbar to pan',
    yAxisTickCount: 4,
  },
  snapshot: {
    title: 'INDUSTRY SNAPSHOT',
    functionsTitle: 'TOP WORK TYPES',
    functionMetricLabel: 'Open jobs',
    metrics: [
      { key: 'activeJobs', label: 'Active Jobs', changeKey: 'activeJobs' },
      { key: 'newJobs', label: 'Jobs this scrape', changeKey: 'newJobs' },
      { key: 'companies', label: 'Companies Hiring', changeKey: 'companies' },
    ],
  },
}

const parseLocalDate = (value) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const shiftDate = (date, days) => {
  const shifted = new Date(date)
  shifted.setDate(shifted.getDate() + days)
  return shifted
}

const formatDate = (date, includeYear = false) => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  ...(includeYear ? { year: 'numeric' } : {}),
}).format(date)

const formatDateRange = (start, end) => `${formatDate(start)} – ${formatDate(end, true)}`

const generateTimelineLabels = (startValue, endValue, count) => {
  const start = parseLocalDate(startValue).getTime()
  const end = parseLocalDate(endValue).getTime()

  return Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 0 : index / (count - 1)
    const date = new Date(start + (end - start) * progress)
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  })
}

const formatCompactNumber = (value) => new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(value)

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value)

const generateYAxis = (values, tickCount) => {
  const dataMaximum = Math.max(...values, 0)
  if (dataMaximum === 0) {
    return {
      maximum: 10,
      ticks: Array.from({ length: tickCount + 1 }, (_, index) => 10 - index * (10 / tickCount)),
    }
  }
  const roughStep = dataMaximum / tickCount
  const step = Math.ceil(roughStep / 10) * 10 || 10
  const maximum = step * tickCount

  return {
    maximum,
    ticks: Array.from({ length: tickCount + 1 }, (_, index) => maximum - index * step),
  }
}

function Icon({ name, size = 22 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  const paths = {
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3M3 12h18M9 12v2h6v-2" /></>,
    rising: <><path d="m4 17 5-5 4 4 7-9" /><path d="M15 7h5v5" /></>,
    falling: <><path d="m4 7 5 5 4-4 7 9" /><path d="M15 17h5v-5" /></>,
    flame: <path d="M13 3s1 4-2 7c-2-2-1-5-1-5S4 9 5 15a7 7 0 0 0 14 0c.4-4-2-7-4-9 0 3-1 5-2 6-1-2 0-5 0-9Z" />,
    heart: <><path d="M20.8 9.2c0 5-8.8 9.8-8.8 9.8S3.2 14.2 3.2 9.2A4.2 4.2 0 0 1 11 7a4.2 4.2 0 0 1 7.8 2.2Z" /><path d="M7 11h3l1-2 2 5 1-3h3" /></>,
    flask: <><path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path d="M8 15h8" /></>,
    bolt: <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    bank: <><path d="m3 9 9-5 9 5M5 10h14M6 10v7M10 10v7M14 10v7M18 10v7M4 20h16" /></>,
    cart: <><path d="M3 4h2l2 11h10l2-7H6" /><circle cx="9" cy="19" r="1" /><circle cx="17" cy="19" r="1" /></>,
    factory: <><path d="M3 21V9l6 3V8l6 4V5h4v16H3Z" /><path d="M7 17h2M12 17h2M17 17h2" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 17v3h16v-3" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
  }

  return <svg {...common}>{paths[name]}</svg>
}

function Sparkline({ direction = 'up', color = 'teal' }) {
  const points = direction === 'up'
    ? '2,29 10,25 17,27 24,19 31,21 38,13 47,17 55,7 65,9 74,5 82,7 91,2'
    : '2,5 11,8 18,7 27,14 35,13 43,20 52,17 61,23 70,21 79,25 88,31'

  return (
    <svg className={`company-sparkline ${color}`} viewBox="0 0 94 34" aria-hidden="true">
      <polyline points={points} />
    </svg>
  )
}

function KpiCard({ icon, label, value, change, comparison, variant = 'teal', sparkline, showArrow = true }) {
  return (
    <article className={`company-kpi-card ${variant}`}>
      <div className="company-kpi-icon"><Icon name={icon} size={27} /></div>
      <div className="company-kpi-content">
        <span className="company-kpi-label">{label}</span>
        <strong className="company-kpi-value">{value}</strong>
        <div className="company-kpi-change">
          <span className="company-kpi-change-main">
            {showArrow && (variant === 'pink' ? '↓ ' : '↑ ')}{change}
          </span>
          {comparison && <small className="company-kpi-change-sub">{comparison}</small>}
        </div>
      </div>
      {sparkline && <Sparkline direction={variant === 'pink' ? 'down' : 'up'} color={variant} />}
    </article>
  )
}

function PageLoader() {
  return (
    <div className="company-page-loader-content" aria-label='Loading Company Data'>
      <div className="spinner" aria-hidden="true" />
      <p>Loading job signals...</p>
    </div>
  )
}

function HowItWorksModal({ content, onClose }) {
  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div className="company-how-overlay" role="presentation" onMouseDown={handleBackdropClick}>
      <section
        className="company-how-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-how-title"
        aria-describedby="company-how-description"
      >
        <button className="company-how-close" type="button" onClick={onClose} aria-label="Close dialog">×</button>
        <div className="company-how-icon"><Icon name="info" size={24} /></div>
        <h2 id="company-how-title">{content.title}</h2>
        <p id="company-how-description">{content.description}</p>
        <div className="company-how-steps">
          {content.steps.map((step, index) => (
            <article key={step.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="company-how-note">{content.note}</p>
        <button className="company-how-action" type="button" onClick={onClose}>{content.closeLabel}</button>
      </section>
    </div>
  )
}

function TrendChart({
  values,
  labels,
  ariaLabel,
  industry,
  metricLabel,
  domainMaximum,
  startDate,
  endDate,
}) {
  const chartRef = useRef(null)

  useLayoutEffect(() => {
    if (!chartRef.current) return undefined

    const root = am5.Root.new(chartRef.current, {
      tooltipContainerBounds: {
        top: 70,
        right: 36,
        bottom: 28,
        left: 36,
      },
    })
    root.setThemes([am5themes_Animated.new(root)])
    root._logo?.dispose()

    const teal = am5.color(0x12c7c7)
    const text = am5.color(0x8996a8)
    const grid = am5.color(0x6d8297)
    const panel = am5.color(0x050b19)

    const chart = root.container.children.push(am5xy.XYChart.new(root, {
      panX: true,
      panY: false,
      wheelX: 'panX',
      wheelY: 'zoomX',
      pinchZoomX: true,
      layout: root.verticalLayout,
      paddingTop: 4,
      paddingRight: 8,
      paddingBottom: 0,
      paddingLeft: 0,
      maxTooltipDistance: -1,
      maxTooltipDistanceBy: 'x',
    }))

    chart.plotContainer.set('wheelable', true)

    const xRenderer = am5xy.AxisRendererX.new(root, {
      minGridDistance: 58,
      strokeOpacity: 0,
    })
    xRenderer.labels.template.setAll({
      fill: text,
      fontSize: 9,
      paddingTop: 7,
    })
    xRenderer.grid.template.setAll({
      stroke: grid,
      strokeOpacity: 0.08,
    })
    xRenderer.ticks.template.set('visible', false)

    const xAxis = chart.xAxes.push(am5xy.DateAxis.new(root, {
      baseInterval: { timeUnit: 'day', count: 1 },
      renderer: xRenderer,
      maxDeviation: 0.2,
      tooltipDateFormat: 'MMM d, yyyy',
    }))

    const yRenderer = am5xy.AxisRendererY.new(root, {
      minGridDistance: 24,
      strokeOpacity: 0,
    })
    yRenderer.labels.template.setAll({
      fill: text,
      fontSize: 9,
      paddingRight: 8,
    })
    yRenderer.labels.template.adapters.add('text', (label, target) => (
      target.dataItem?.get('value') === 0 ? '0' : label
    ))
    yRenderer.grid.template.setAll({
      stroke: grid,
      strokeOpacity: 0.12,
    })
    yRenderer.ticks.template.set('visible', false)

    const yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
      min: 0,
      max: domainMaximum,
      strictMinMax: true,
      maxPrecision: 0,
      numberFormat: '#,###',
      renderer: yRenderer,
    }))

    const tooltip = am5.Tooltip.new(root, {
      getFillFromSprite: false,
      getStrokeFromSprite: false,
      labelText: "[#8fa0b4]{valueX.formatDate('MMM d, yyyy')}[/]\n[bold #f0ffff]{valueY.formatNumber('#,###')}[/]\n[#12c7c7]{industry} · {metricLabel}[/]",
      pointerOrientation: 'horizontal',
      animationDuration: 80,
      autoTextColor: false,
    })
    tooltip.get('background').setAll({
      fill: panel,
      fillOpacity: 0.97,
      stroke: teal,
      strokeOpacity: 0.42,
      cornerRadius: 6,
      shadowColor: am5.color(0x000000),
      shadowBlur: 12,
      shadowOpacity: 0.35,
    })
    tooltip.label.setAll({
      fontSize: 10,
      paddingTop: 8,
      paddingRight: 10,
      paddingBottom: 8,
      paddingLeft: 10,
      textAlign: 'left',
    })

    const series = chart.series.push(am5xy.LineSeries.new(root, {
      name: metricLabel,
      xAxis,
      yAxis,
      valueXField: 'date',
      valueYField: 'value',
      tooltip,
      stroke: teal,
      fill: teal,
      connect: true,
      minBulletDistance: 12,
      snapTooltip: true,
    }))
    series.set('tooltipPosition', 'pointer')

    series.strokes.template.setAll({
      strokeWidth: 2,
      shadowColor: teal,
      shadowBlur: 5,
      shadowOpacity: 0.22,
    })
    series.fills.template.setAll({
      visible: true,
      fillOpacity: 1,
      fillGradient: am5.LinearGradient.new(root, {
        rotation: 90,
        stops: [
          { color: teal, opacity: 0.42 },
          { color: teal, opacity: 0.03 },
        ],
      }),
    })

    series.bullets.push((bulletRoot, bulletSeries, dataItem) => {
      if (!dataItem.dataContext?.isLast) return undefined
      return am5.Bullet.new(bulletRoot, {
        sprite: am5.Circle.new(bulletRoot, {
          radius: 4,
          fill: am5.color(0xd8ffff),
          stroke: teal,
          strokeWidth: 2,
          shadowColor: teal,
          shadowBlur: 8,
          shadowOpacity: 0.8,
        }),
      })
    })

    const cursor = chart.set('cursor', am5xy.XYCursor.new(root, {
      behavior: 'zoomX',
      xAxis,
      snapToSeries: [series],
      snapToSeriesBy: 'x!',
    }))
    cursor.lineY.set('visible', false)
    cursor.lineX.setAll({
      stroke: am5.color(0xd8ffff),
      strokeOpacity: 0.48,
      strokeDasharray: [4, 4],
    })

    const scrollbar = chart.set('scrollbarX', am5.Scrollbar.new(root, {
      orientation: 'horizontal',
      height: 12,
      marginTop: 5,
    }))
    scrollbar.get('background').setAll({
      fill: grid,
      fillOpacity: 0.1,
      cornerRadiusTL: 6,
      cornerRadiusTR: 6,
      cornerRadiusBL: 6,
      cornerRadiusBR: 6,
    })
    scrollbar.thumb.setAll({
      fill: teal,
      fillOpacity: 0.18,
    })
    scrollbar.startGrip.setAll({ scale: 0.65 })
    scrollbar.endGrip.setAll({ scale: 0.65 })
    scrollbar.startGrip.get('background').setAll({ fill: teal, fillOpacity: 0.75 })
    scrollbar.endGrip.get('background').setAll({ fill: teal, fillOpacity: 0.75 })

    chart.zoomOutButton.get('background').setAll({
      fill: panel,
      fillOpacity: 0.92,
      stroke: teal,
      strokeOpacity: 0.45,
    })
    chart.zoomOutButton.get('icon').setAll({
      stroke: teal,
    })

    const startTimestamp = parseLocalDate(startDate).getTime()
    const endTimestamp = parseLocalDate(endDate).getTime()
    const chartData = values.map((value, index) => ({
      date: startTimestamp + ((endTimestamp - startTimestamp) * index) / (values.length - 1),
      value,
      dateLabel: labels[index],
      industry,
      metricLabel,
      isLast: index === values.length - 1,
    }))

    series.data.setAll(chartData)
    series.appear(900)
    chart.appear(900, 80)

    return () => root.dispose()
  }, [ariaLabel, domainMaximum, endDate, industry, labels, metricLabel, startDate, values])

  return <div ref={chartRef} className="company-amchart" role="img" aria-label={ariaLabel} />
}

function formatMomentumLabel(value, isBaseline) {
  if (isBaseline || value == null) return 'Baseline'
  const rounded = Number(value)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(1)}%`
}

function emptySelectedSegment() {
  return {
    icon: 'briefcase',
    activeJobs: 0,
    newJobs: 0,
    companies: 0,
    momentum: null,
    isBaseline: true,
    changes: { activeJobs: null, newJobs: null, companies: null },
    status: 'No matched jobs for this segment yet',
    functions: [],
    trend: {
      'Active Jobs': [0],
      'New Jobs': [0],
      'Companies Hiring': [0],
    },
  }
}

export default function CompanyDetails() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { metrics, loading, error, isConfigured } = useJobSignals()
  const {
    header,
    summary,
    momentum,
    trend,
    snapshot,
    howItWorks,
  } = dashboardModel

  const industryNames = useMemo(() => [...SEGMENT_NAMES].sort(), [])
  const [industry, setIndustry] = useState(() => getDefaultIndustry(user?.primarySegment))
  const [trendTab, setTrendTab] = useState('Active Jobs')
  const [showHowItWorks, setShowHowItWorks] = useState(false)

  useEffect(() => {
    if (!user?.primarySegment) return
    setIndustry(getDefaultIndustry(user.primarySegment))
  }, [user?.primarySegment])

  const selected = metrics?.segments?.[industry] || emptySelectedSegment()
  const trendTabs = Object.keys(selected.trend)
  const momentumRows = metrics?.momentumRows || industryNames.map((name) => ({
    name,
    value: 0,
    isBaseline: true,
    icon: 'briefcase',
  }))
  const axisValues = metrics?.axisValues || [-15, -10, -5, 0, 5, 10, 15]
  const momentumScale = Math.max(...axisValues.map((value) => Math.abs(value)), 1)

  useEffect(() => {
    if (!showHowItWorks) return undefined

    const originalBodyOverflow = document.body.style.overflow
    const originalBodyPaddingRight = document.body.style.paddingRight
    const originalHtmlOverflow = document.documentElement.style.overflow
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`

    const handleEscape = (event) => {
      if (event.key === 'Escape') setShowHowItWorks(false)
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = originalBodyOverflow
      document.body.style.paddingRight = originalBodyPaddingRight
      document.documentElement.style.overflow = originalHtmlOverflow
    }
  }, [showHowItWorks])

  const comparisonLabel = useMemo(() => {
    if (!metrics?.hasPrevious) return 'vs baseline (0)'
    return `vs previous scrape (${metrics.previousDate})`
  }, [metrics])

  const periodLabel = useMemo(() => {
    if (!metrics?.latestDate) return 'Awaiting scrape data'
    if (!metrics.hasPrevious) return `Baseline · ${metrics.latestDate}`
    return `${metrics.previousDate} → ${metrics.latestDate}`
  }, [metrics])

  const values = selected.trend[trendTab] || [0]
  const scrapeDates = metrics?.scrapeDates?.length
    ? metrics.scrapeDates
    : [metrics?.latestDate || new Date().toISOString().slice(0, 10)]

  const trendPointLabels = useMemo(
    () => scrapeDates.map((date) => {
      try {
        return new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(parseLocalDate(date))
      } catch {
        return date
      }
    }),
    [scrapeDates],
  )

  const trendYAxis = useMemo(
    () => generateYAxis(values.length ? values : [0], trend.yAxisTickCount),
    [trend.yAxisTickCount, values],
  )

  const trendStart = scrapeDates[0]
  const trendEnd = scrapeDates[scrapeDates.length - 1]

  const chartValues = values.length > 1 ? values : [values[0] || 0, values[0] || 0]
  const chartLabels = trendPointLabels.length > 1
    ? trendPointLabels
    : [trendPointLabels[0] || trendStart, trendPointLabels[0] || trendEnd]

  const kpiCards = useMemo(() => {
    const s = metrics?.summary
    return [
      {
        id: 'tracked',
        icon: 'briefcase',
        label: 'ACTIVE JOBS TRACKED',
        value: formatCompactNumber(s?.totalActiveJobs || 0),
        change: metrics?.isBaseline ? 'Baseline scrape' : periodLabel,
        comparison: metrics?.latestDate ? `as of ${metrics.latestDate}` : null,
        showArrow: false,
        sparkline: true,
      },
      {
        id: 'growing',
        icon: 'rising',
        label: 'SEGMENTS GROWING',
        value: formatNumber(s?.growing || 0),
        change: metrics?.isBaseline ? 'N/A until next scrape' : `${formatNumber(s?.growing || 0)} up`,
        comparison: comparisonLabel,
        showArrow: !metrics?.isBaseline,
        sparkline: true,
      },
      {
        id: 'declining',
        icon: 'falling',
        label: 'SEGMENTS DECLINING',
        value: formatNumber(s?.declining || 0),
        change: metrics?.isBaseline ? 'N/A until next scrape' : `${formatNumber(s?.declining || 0)} down`,
        comparison: comparisonLabel,
        showArrow: !metrics?.isBaseline,
        variant: 'pink',
        sparkline: true,
      },
      {
        id: 'hottest',
        icon: 'flame',
        label: 'HOTTEST SEGMENT',
        value: s?.hottest || industry,
        change: formatMomentumLabel(selected.momentum, selected.isBaseline),
        showArrow: false,
      },
    ]
  }, [comparisonLabel, industry, metrics, periodLabel, selected.isBaseline, selected.momentum])

  const filterControls = useMemo(() => [
    { id: 'date', icon: 'calendar', label: periodLabel },
    { id: 'location', icon: 'globe', label: 'All Locations' },
  ], [periodLabel])

  const handleIndustryChange = (event) => {
    setIndustry(event.target.value)
  }

  const handleTrendChange = (tab) => {
    setTrendTab(tab)
  }

  const exportData = () => {
    const metricLabels = snapshot.metrics.map((metric) => metric.label)
    const rows = [
      ['Segment', ...metricLabels, 'Momentum'],
      [
        industry,
        ...snapshot.metrics.map((metric) => selected[metric.key]),
        formatMomentumLabel(selected.momentum, selected.isBaseline),
      ],
    ]
    const csv = rows.map((row) => row.join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    link.download = `${industry.toLowerCase().replace(/\s+/g, '-')}-job-signals.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const handleHeaderAction = (actionId) => {
    if (actionId === 'dashboard') {
      navigate('/dashboard')
      return
    }

    if (actionId === 'export') {
      exportData()
      return
    }

    setShowHowItWorks(true)
  }

  if (loading) {
    return (
      <div className="page-wrappers" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 48px)', gap: 0 }}>
        <PageLoader />
      </div>
    )
  }

  if (!isConfigured) {
    return (
      <div className="page-wrappers" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 48px)' }}>
        <p style={{ color: '#91a0b4' }}>Airtable is not configured. Add VITE_AIRTABLE_* env vars to load Job Signals.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-wrappers" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 48px)' }}>
        <p style={{ color: '#ed1764' }}>Failed to load Job Signals: {error}</p>
      </div>
    )
  }

  return (
    <>
      <div className="page-wrapper">
        <div className="dashboard-shell">
          <main className="company-details-page">
            <header className="company-details-header">
              <div>
                <p className="company-title">{header.title}</p>
                <p className="company-eyebrow">{header.eyebrow}</p>
                <p className="company-description">{header.description}</p>
              </div>
              <div className="company-header-actions">
                <div className="company-top-buttons">
                  {header.actions.map((action) => (
                    <button
                      type="button"
                      key={action.id}
                      className={action.id === 'dashboard' ? 'pill-btn' : 'pill-btn secondary'}
                      onClick={() => handleHeaderAction(action.id)}
                    >
                      {action.id !== 'dashboard' && <Icon name={action.icon} size={16} />}
                      {action.label}
                    </button>
                  ))}
                </div>
                <div className="company-filter-buttons">
                  {filterControls.map((control) => (
                    <button type="button" key={control.id} className="pill-btn secondary">
                      <Icon name={control.icon} size={16} />
                      {control.label}
                      <Icon name="chevron" size={14} />
                    </button>
                  ))}
                </div>
              </div>
            </header>

            <section className="company-kpi-grid" aria-label={summary.ariaLabel}>
              {kpiCards.map((card) => (
                <KpiCard key={card.id} {...card} />
              ))}
            </section>

            <section className="company-dashboard-grid">
              <div className="company-left-column">
                <article className="company-panel company-momentum-panel">
                  <div className="company-panel-heading">
                    <div>
                      <h2>{momentum.title} <Icon name="info" size={16} /></h2>
                      <p>{metrics?.isBaseline ? 'Baseline scrape — % change available after the next cycle' : momentum.subtitle}</p>
                    </div>
                    <button type="button" className="company-select-button">
                      {periodLabel} <Icon name="chevron" size={15} />
                    </button>
                  </div>

                  <div
                    className={`company-momentum-chart is-ready${momentumRows.length > 10 ? ' company-momentum-chart--dense' : ''}`}
                    style={{ '--momentum-rows': momentumRows.length }}
                  >
                    <div className="company-industry-list">
                      {momentumRows.map((row) => (
                        <div className="company-industry-name" key={row.name}>
                          <span className={`company-industry-icon${row.value < 0 ? ' negative' : ''}`}>
                            <Icon name={row.icon} size={16} />
                          </span>
                          <span className="company-industry-label" title={row.name}>{row.name}</span>
                        </div>
                      ))}
                    </div>
                    <div className="company-bars">
                      <div className="company-zero-line" />
                      {momentumRows.map((row, index) => (
                        <div
                          className="company-bar-row company-tooltip-target"
                          key={row.name}
                          style={{ '--chart-delay': `${index * 40}ms` }}
                          tabIndex="0"
                          aria-describedby={`momentum-tooltip-${index}`}
                        >
                          <div className="company-bar-side negative">
                            {!row.isBaseline && row.value < 0 && (
                              <span style={{ width: `${Math.abs(row.value) / momentumScale * 100}%` }} />
                            )}
                          </div>
                          <div className="company-bar-side positive">
                            {!row.isBaseline && row.value > 0 && (
                              <span style={{ width: `${row.value / momentumScale * 100}%` }} />
                            )}
                          </div>
                          <strong>{formatMomentumLabel(row.value, row.isBaseline)}</strong>
                          <span className="company-data-tooltip" id={`momentum-tooltip-${index}`} role="tooltip">
                            <strong>{row.name}</strong>
                            <small>
                              {formatMomentumLabel(row.value, row.isBaseline)}
                              {row.isBaseline ? ' · first scrape' : ` · ${momentum.axisTitle}`}
                            </small>
                          </span>
                        </div>
                      ))}
                      <div className="company-axis">
                        {axisValues.map((value) => (
                          <span key={value}>{value > 0 ? '+' : ''}{value}%</span>
                        ))}
                      </div>
                      <div className="company-axis-title">{momentum.axisTitle}</div>
                    </div>
                  </div>
                </article>

                <article className="company-panel company-trend-panel">
                  <div className="company-panel-heading">
                    <h2>{trend.title} <Icon name="info" size={16} /></h2>
                    <select value={industry} onChange={handleIndustryChange} aria-label={trend.title}>
                      {industryNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="company-trend-tabs">
                    {trendTabs.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        className={trendTab === tab ? 'active' : ''}
                        onClick={() => handleTrendChange(tab)}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <div className="company-trend-chart is-ready">
                    <TrendChart
                      key={`${industry}-${trendTab}-${scrapeDates.join(',')}`}
                      values={chartValues}
                      labels={chartLabels}
                      ariaLabel={trend.chartAriaLabel}
                      industry={industry}
                      metricLabel={trendTab}
                      domainMaximum={trendYAxis.maximum}
                      startDate={trendStart}
                      endDate={trendEnd}
                    />
                  </div>
                  <p className="company-trend-zoom-hint">{trend.zoomHint}</p>
                </article>
              </div>

              <article className="company-panel company-snapshot-panel">
                <div className="company-panel-heading">
                  <h2>{snapshot.title}</h2>
                  <select value={industry} onChange={handleIndustryChange} aria-label={snapshot.title}>
                    {industryNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className="company-snapshot-title">
                  <span><Icon name={selected.icon} size={28} /></span>
                  <div>
                    <h3>{industry}</h3>
                    <p>{selected.status}</p>
                  </div>
                </div>
                <div className="company-snapshot-stats">
                  {snapshot.metrics.map((metric) => {
                    const change = selected.changes[metric.changeKey]
                    return (
                      <div key={metric.key}>
                        <strong>{formatNumber(selected[metric.key] || 0)}</strong>
                        <small>{metric.label}</small>
                        <em>
                          {selected.isBaseline || change == null
                            ? 'Baseline'
                            : `${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(1)}%`}
                        </em>
                        <span>{comparisonLabel}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="company-functions is-ready">
                  <h4>{snapshot.functionsTitle}</h4>
                  {selected.functions.length === 0 ? (
                    <p className="company-source" style={{ marginTop: 12 }}>No Work Type data for this segment in the latest scrape.</p>
                  ) : (
                    selected.functions.map((item, index) => (
                      <div
                        className="company-function-row company-tooltip-target"
                        key={item.name}
                        style={{ '--chart-delay': `${index * 80}ms` }}
                        tabIndex="0"
                        aria-describedby={`function-tooltip-${index}`}
                      >
                        <span>{item.name}</span>
                        <div><i style={{ width: `${item.width}%` }} /></div>
                        <strong>{formatNumber(item.value)}</strong>
                        <span className="company-data-tooltip" id={`function-tooltip-${index}`} role="tooltip">
                          <strong>{item.name}</strong>
                          <small>{formatNumber(item.value)} {snapshot.functionMetricLabel}</small>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </section>
          </main>
        </div>
      </div>
      {showHowItWorks && <HowItWorksModal content={howItWorks} onClose={() => setShowHowItWorks(false)} />}
    </>
  )
}
