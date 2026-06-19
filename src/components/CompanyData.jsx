import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as am5 from '@amcharts/amcharts5'
import * as am5xy from '@amcharts/amcharts5/xy'
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated'

const dashboardModel = {
  defaultIndustry: 'Healthcare',
  header: {
    title: 'JOB SIGNALS',
    eyebrow: 'SEE WHERE HIRING IS ACCELERATING, STABILIZING OR SLOWING.',
    description: 'Live hiring activity and momentum based on 50,000+ job boards and company career pages worldwide.',
    loadingDelay: 1400,
    actions: [
      { id: 'dashboard', label: 'Go to Dashboard', icon: 'screen' },
      { id: 'help', label: 'How it works', icon: 'info' },
      { id: 'export', label: 'Export', icon: 'download' },
    ],
  },
  howItWorks: {
    title: 'How Job Signals Works',
    description: 'Job Signals turns live hiring activity into a simple view of where demand is growing, stabilizing, or slowing.',
    steps: [
      {
        title: 'Collect',
        description: 'We monitor job boards and company career pages for newly opened and recently closed roles.',
      },
      {
        title: 'Normalize',
        description: 'Listings are grouped by industry, location, and hiring function so changes can be compared consistently.',
      },
      {
        title: 'Measure',
        description: 'Momentum compares the current hiring window with the previous period to highlight meaningful movement.',
      },
    ],
    note: 'The figures on this page are demonstration data and can be replaced by your API response.',
    closeLabel: 'Got it',
  },
  filters: {
    rangeEnd: '2024-06-18',
    rangeDays: 31,
    comparisonDays: 30,
    location: 'All Locations',
  },
  summary: {
    ariaLabel: 'Hiring summary',
    cards: [
      { id: 'tracked', icon: 'briefcase', label: 'ACTIVE JOBS TRACKED', value: 4200000, change: 6.4, sparkline: true },
      { id: 'growing', icon: 'rising', label: 'INDUSTRIES GROWING', value: 18, change: 2, sparkline: true },
      { id: 'declining', icon: 'falling', label: 'INDUSTRIES DECLINING', value: 7, change: 1, variant: 'pink', sparkline: true },
      { id: 'hottest', icon: 'flame', label: 'HOTTEST SECTOR' },
    ],
  },
  momentum: {
    title: 'INDUSTRY HIRING MOMENTUM',
    subtitle: '% Change in active jobs over the last 30 days',
    periodLabel: 'Change: Last 30 days',
    axisTitle: '% Change in Active Jobs',
    axisValues: [-15, -10, -5, 0, 5, 10, 15],
    rows: [
      { name: 'Healthcare', value: 12, icon: 'heart' },
      { name: 'Life Sciences', value: 9, icon: 'flask' },
      { name: 'Energy', value: 7, icon: 'bolt' },
      { name: 'Technology', value: 3, icon: 'screen' },
      { name: 'Finance', value: -2, icon: 'bank' },
      { name: 'Retail', value: -5, icon: 'cart' },
      { name: 'Manufacturing', value: -11, icon: 'factory' },
    ],
  },
  trend: {
    title: 'HIRING TREND OVER TIME',
    chartAriaLabel: 'Hiring trend line chart',
    zoomHint: 'Scroll to zoom · Drag to select · Use the scrollbar to pan',
    startMonth: '2023-10-02',
    endMonth: '2024-10-02',
    yAxisTickCount: 4,
    series: {
      'Active Jobs': [58, 61, 67, 72, 75, 82, 78, 86, 91, 88, 97, 104, 112, 119, 116, 125, 132, 139, 136, 145, 151, 148, 156, 160, 155, 164, 161, 168, 172, 178],
      'New Jobs': [28, 31, 29, 36, 39, 42, 38, 44, 48, 45, 51, 56, 61, 58, 64, 70, 67, 74, 78, 73, 80, 84, 81, 87, 91, 89, 95, 98, 101, 106],
      'Companies Hiring': [42, 44, 47, 46, 51, 54, 52, 57, 60, 58, 63, 67, 65, 70, 73, 75, 72, 78, 82, 80, 85, 88, 86, 91, 94, 92, 97, 100, 103, 107],
    },
  },
  snapshot: {
    title: 'INDUSTRY SNAPSHOT',
    functionsTitle: 'TOP HIRING FUNCTIONS',
    functionMetricLabel: 'Open jobs',
    comparisonLabel: 'vs 30 days ago',
    metrics: [
      { key: 'activeJobs', label: 'Active Jobs', changeKey: 'activeJobs' },
      { key: 'newJobs', label: 'New Jobs (30 days)', changeKey: 'newJobs' },
      { key: 'companies', label: 'Companies Hiring', changeKey: 'companies' },
    ],
  },
  source: {
    label: 'Source',
    detail: '50,000+ job boards and company career pages',
  },
  industries: {
    Healthcare: {
      icon: 'heart',
      trendFactor: 1,
      momentum: 12,
      activeJobs: 142301,
      newJobs: 36150,
      companies: 18620,
      changes: { activeJobs: 12, newJobs: 9.4, companies: 8.1 },
      status: 'Strong hiring momentum',
      functions: [
        { name: 'Nursing', value: 32540, width: 100 },
        { name: 'Clinical Operations', value: 18870, width: 72 },
        { name: 'Medical Research', value: 14230, width: 52 },
        { name: 'Regulatory Affairs', value: 9610, width: 36 },
        { name: 'Health Informatics', value: 7420, width: 25 },
      ],
    },
    Technology: {
      icon: 'screen',
      trendFactor: 0.91,
      momentum: 8,
      activeJobs: 118742,
      newJobs: 29480,
      companies: 15930,
      changes: { activeJobs: 8, newJobs: 6.7, companies: 5.9 },
      status: 'Steady hiring momentum',
      functions: [
        { name: 'Software Engineering', value: 28710, width: 100 },
        { name: 'Data & Analytics', value: 21940, width: 78 },
        { name: 'Cybersecurity', value: 15360, width: 55 },
        { name: 'Product Management', value: 10480, width: 38 },
        { name: 'Cloud Infrastructure', value: 8930, width: 31 },
      ],
    },
    Energy: {
      icon: 'bolt',
      trendFactor: 0.78,
      momentum: 7,
      activeJobs: 94825,
      newJobs: 21960,
      companies: 11405,
      changes: { activeJobs: 7, newJobs: 5.8, companies: 4.9 },
      status: 'Positive hiring momentum',
      functions: [
        { name: 'Field Operations', value: 20450, width: 100 },
        { name: 'Engineering', value: 16520, width: 81 },
        { name: 'Project Development', value: 11340, width: 56 },
        { name: 'Environmental Safety', value: 7880, width: 39 },
        { name: 'Grid Technology', value: 6120, width: 30 },
      ],
    },
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
  const dataMaximum = Math.max(...values)
  const roughStep = dataMaximum / tickCount
  const step = Math.ceil(roughStep / 10) * 10
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
          <span>{showArrow && (variant === 'pink' ? '↓ ' : '↑ ')}{change}</span>
          {comparison && <small>{comparison}</small>}
        </div>
      </div>
      {sparkline && <Sparkline direction={variant === 'pink' ? 'down' : 'up'} color={variant} />}
    </article>
  )
}

function PageLoader() {
  return (
    <main className="company-page-loader" role="status" aria-label="Loading Job Signals">
      <div className="company-page-loader-content">
        <div className="spinner" aria-hidden="true" />
        <p>Loading data...</p>
      </div>
    </main>
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
      numberFormat: "#'K'",
      renderer: yRenderer,
    }))

    const tooltip = am5.Tooltip.new(root, {
      getFillFromSprite: false,
      getStrokeFromSprite: false,
      labelText: "[#8fa0b4]{valueX.formatDate('MMM d, yyyy')}[/]\n[bold #f0ffff]{valueY}K[/]\n[#12c7c7]{industry} · {metricLabel}[/]",
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

export default function CompanyDetails() {
  const navigate = useNavigate()
  const {
    defaultIndustry,
    header,
    filters,
    summary,
    momentum,
    trend,
    snapshot,
    source,
    howItWorks,
    industries,
  } = dashboardModel
  const trendTabs = Object.keys(trend.series)
  const industryNames = Object.keys(industries)
  const [industry, setIndustry] = useState(defaultIndustry)
  const [trendTab, setTrendTab] = useState(trendTabs[0])
  const [pageLoading, setPageLoading] = useState(true)
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const selected = industries[industry]

  useEffect(() => {
    document.body.classList.add('company-details-body')
    const apiTimer = window.setTimeout(() => setPageLoading(false), header.loadingDelay)

    return () => {
      document.body.classList.remove('company-details-body')
      window.clearTimeout(apiTimer)
    }
  }, [header.loadingDelay])

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

  const dateContext = useMemo(() => {
    const end = parseLocalDate(filters.rangeEnd)
    const start = shiftDate(end, -(filters.rangeDays - 1))
    const previousEnd = shiftDate(start, -1)
    const previousStart = shiftDate(previousEnd, -(filters.comparisonDays - 1))

    return {
      rangeLabel: formatDateRange(start, end),
      comparisonLabel: `vs ${formatDate(previousStart)} – ${formatDate(previousEnd)}`,
    }
  }, [filters.comparisonDays, filters.rangeDays, filters.rangeEnd])

  const values = useMemo(() => {
    const base = trend.series[trendTab]
    return base.map(value => Math.round(value * selected.trendFactor))
  }, [selected.trendFactor, trend.series, trendTab])

  const trendPointLabels = useMemo(
    () => generateTimelineLabels(trend.startMonth, trend.endMonth, values.length),
    [trend.endMonth, trend.startMonth, values.length],
  )

  const trendYAxis = useMemo(
    () => generateYAxis(values, trend.yAxisTickCount),
    [trend.yAxisTickCount, values],
  )

  const momentumScale = useMemo(
    () => Math.max(...momentum.axisValues.map(value => Math.abs(value))),
    [momentum.axisValues],
  )

  const kpiCards = useMemo(() => summary.cards.map(card => {
    if (card.id === 'hottest') {
      return {
        ...card,
        value: industry,
        change: `+${selected.momentum}% momentum`,
        showArrow: false,
      }
    }

    return {
      ...card,
      value: card.id === 'tracked' ? formatCompactNumber(card.value) : formatNumber(card.value),
      change: card.id === 'tracked' ? `${card.change.toFixed(1)}%` : formatNumber(card.change),
      comparison: dateContext.comparisonLabel,
      showArrow: true,
    }
  }), [dateContext.comparisonLabel, industry, selected.momentum, summary.cards])

  const filterControls = useMemo(() => [
    { id: 'date', icon: 'calendar', label: dateContext.rangeLabel },
    { id: 'location', icon: 'globe', label: filters.location },
  ], [dateContext.rangeLabel, filters.location])

  const handleIndustryChange = (event) => {
    setIndustry(event.target.value)
  }

  const handleTrendChange = (tab) => {
    setTrendTab(tab)
  }

  const exportData = () => {
    const metricLabels = snapshot.metrics.map(metric => metric.label)
    const rows = [
      ['Industry', ...metricLabels, 'Momentum'],
      [
        industry,
        ...snapshot.metrics.map(metric => selected[metric.key]),
        `${selected.momentum}%`,
      ],
    ]
    const csv = rows.map(row => row.join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    link.download = `${industry.toLowerCase()}-job-signals.csv`
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

  if (pageLoading) return <PageLoader />

  return (
    <>
      <main className="company-details-page">
      <header className="company-details-header">
        <div>
          <p className="company-title">{header.title}</p>
          <p className="company-eyebrow">{header.eyebrow}</p>
          <p className="company-description">{header.description}</p>
        </div>
        <div className="company-header-actions">
          <div className="company-top-buttons">
            {header.actions.map(action => (
              <button
                type="button"
                key={action.id}
                className={action.id === 'dashboard' ? 'pill-btn company-dashboard-button' : undefined}
                onClick={() => handleHeaderAction(action.id)}
              >
                {action.id !=='dashboard' && <Icon name={action.icon} size={18} />}
                {action.label}
              </button>
            ))}
          </div>
          <div className="company-filter-buttons">
            {filterControls.map(control => (
              <button type="button" key={control.id}>
                <Icon name={control.icon} size={19} />
                {control.label}
                <Icon name="chevron" size={17} />
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="company-kpi-grid" aria-label={summary.ariaLabel}>
        {kpiCards.map(card => (
          <KpiCard key={card.id} {...card} />
        ))}
      </section>

      <section className="company-dashboard-grid">
        <div className="company-left-column">
          <article className="company-panel company-momentum-panel">
            <div className="company-panel-heading">
              <div>
                <h2>{momentum.title} <Icon name="info" size={16} /></h2>
                <p>{momentum.subtitle}</p>
              </div>
              <button type="button" className="company-select-button">{momentum.periodLabel} <Icon name="chevron" size={15} /></button>
            </div>

            <div className="company-momentum-chart is-ready">
              <div className="company-industry-list">
                {momentum.rows.map(row => (
                  <div className="company-industry-name" key={row.name}>
                    <span className={row.value < 0 ? 'negative' : ''}><Icon name={row.icon} size={16} /></span>
                    {row.name}
                  </div>
                ))}
              </div>
              <div className="company-bars">
                <div className="company-zero-line" />
                {momentum.rows.map((row, index) => (
                  <div
                    className="company-bar-row company-tooltip-target"
                    key={row.name}
                    style={{ '--chart-delay': `${index * 70}ms` }}
                    tabIndex="0"
                    aria-describedby={`momentum-tooltip-${index}`}
                  >
                    <div className="company-bar-side negative">
                      {row.value < 0 && <span style={{ width: `${Math.abs(row.value) / momentumScale * 100}%` }} />}
                    </div>
                    <div className="company-bar-side positive">
                      {row.value > 0 && <span style={{ width: `${row.value / momentumScale * 100}%` }} />}
                    </div>
                    <strong>{row.value > 0 ? '+' : ''}{row.value.toFixed(1)}%</strong>
                    <span className="company-data-tooltip" id={`momentum-tooltip-${index}`} role="tooltip">
                      <strong>{row.name}</strong>
                      <small>{row.value > 0 ? '+' : ''}{row.value.toFixed(1)}% · {momentum.axisTitle}</small>
                    </span>
                  </div>
                ))}
                <div className="company-axis">
                  {momentum.axisValues.map(value => <span key={value}>{value > 0 ? '+' : ''}{value}%</span>)}
                </div>
                <div className="company-axis-title">{momentum.axisTitle}</div>
              </div>
            </div>
          </article>

          <article className="company-panel company-trend-panel">
            <div className="company-panel-heading">
              <h2>{trend.title} <Icon name="info" size={16} /></h2>
              <select value={industry} onChange={handleIndustryChange} aria-label={trend.title}>
                {industryNames.map(name => <option key={name}>{name}</option>)}
              </select>
            </div>
            <div className="company-trend-tabs">
              {trendTabs.map(tab => (
                <button key={tab} type="button" className={trendTab === tab ? 'active' : ''} onClick={() => handleTrendChange(tab)}>{tab}</button>
              ))}
            </div>
            <div className="company-trend-chart is-ready">
              <TrendChart
                key={`${industry}-${trendTab}`}
                values={values}
                labels={trendPointLabels}
                ariaLabel={trend.chartAriaLabel}
                industry={industry}
                metricLabel={trendTab}
                domainMaximum={trendYAxis.maximum}
                startDate={trend.startMonth}
                endDate={trend.endMonth}
              />
            </div>
            <p className="company-trend-zoom-hint">{trend.zoomHint}</p>
            <p className="company-source">{source.label}: {source.detail} <Icon name="info" size={13} /></p>
          </article>
        </div>

        <article className="company-panel company-snapshot-panel">
          <div className="company-panel-heading">
            <h2>{snapshot.title}</h2>
            <select value={industry} onChange={handleIndustryChange} aria-label={snapshot.title}>
              {industryNames.map(name => <option key={name}>{name}</option>)}
            </select>
          </div>
          <div className="company-snapshot-title">
            <span><Icon name={selected.icon} size={28} /></span>
            <div><h3>{industry}</h3><p>{selected.status}</p></div>
          </div>
          <div className="company-snapshot-stats">
            {snapshot.metrics.map(metric => (
              <div key={metric.key}>
                <strong>{formatNumber(selected[metric.key])}</strong>
                <small>{metric.label}</small>
                <em>↑ {selected.changes[metric.changeKey].toFixed(1)}%</em>
                <span>{snapshot.comparisonLabel}</span>
              </div>
            ))}
          </div>
          <div className="company-functions is-ready">
            <h4>{snapshot.functionsTitle}</h4>
            {selected.functions.map((item, index) => (
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
            ))}
          </div>
        </article>
      </section>
      </main>
      {showHowItWorks && <HowItWorksModal content={howItWorks} onClose={() => setShowHowItWorks(false)} />}
    </>
  )
}
