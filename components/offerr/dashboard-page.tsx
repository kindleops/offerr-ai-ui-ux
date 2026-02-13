"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { NeonProgress } from "./neon-progress"
import {
  Brain,
  MapPin,
  TrendingUp,
  Wrench,
  BarChart3,
  Target,
  Clock,
  Activity,
  Layers,
  Zap,
  DollarSign,
  ArrowUpRight,
  Home,
  FileText,
  Send,
  Calculator,
  Shield,
  Eye,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Building,
  Thermometer,
} from "lucide-react"

/* ──────────────────────────────────────────
   1. DATA ACQUISITION TIMELINE
   ────────────────────────────────────────── */

const timelineEvents = [
  { time: "0.00s", label: "Property address validated", icon: MapPin, category: "Input", detail: "Geocoded to lat/long coordinates" },
  { time: "0.08s", label: "Parcel lookup completed", icon: Layers, category: "Data", detail: "County assessor records retrieved" },
  { time: "0.15s", label: "Owner insight acquired", icon: Eye, category: "Data", detail: "Ownership duration: 8.2 years" },
  { time: "0.22s", label: "Zoning classification verified", icon: Building, category: "Zone", detail: "Residential R-1, single family" },
  { time: "0.34s", label: "Market conditions analyzed", icon: TrendingUp, category: "Market", detail: "Seller's market, 2.4mo supply" },
  { time: "0.48s", label: "Tax history retrieved", icon: DollarSign, category: "Tax", detail: "Annual tax: $4,280 | No liens" },
  { time: "0.62s", label: "Sale history compiled", icon: Clock, category: "History", detail: "Last sold: $195,000 (2018)" },
  { time: "0.78s", label: "6 comparable sales identified", icon: Target, category: "Comps", detail: "Within 0.5mi, last 6 months" },
  { time: "0.95s", label: "Aerial/footprint scan complete", icon: Crosshair, category: "Scan", detail: "Lot: 6,200 sqft | Build: 1,840 sqft" },
  { time: "1.21s", label: "Repair cost estimation: $32,500", icon: Wrench, category: "Repairs", detail: "5 items flagged for review" },
  { time: "1.54s", label: "Neural network consensus reached", icon: Brain, category: "AI", detail: "47 data points processed" },
  { time: "1.87s", label: "Cash offer generated: $287,500", icon: Zap, category: "Offer", detail: "Confidence: 94%" },
]

function DataAcquisitionTimeline() {
  const [visibleItems, setVisibleItems] = useState(0)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleItems((prev) => {
        if (prev >= timelineEvents.length) {
          clearInterval(interval)
          return prev
        }
        return prev + 1
      })
    }, 300)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-5">
        <Activity size={15} className="text-neon" />
        <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Data Acquisition Timeline
        </h2>
        <div className="ml-auto text-[10px] text-neon/50 font-mono">1.87s total</div>
      </div>

      <div className="relative">
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-[rgba(0,229,245,0.08)]" aria-hidden="true" />

        <div className="space-y-0.5">
          {timelineEvents.map((event, i) => {
            const isVisible = i < visibleItems
            const isExpanded = expandedIdx === i
            const EventIcon = event.icon

            return (
              <button
                key={i}
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
                className="relative flex items-start gap-3 py-2 w-full text-left group"
                style={{
                  opacity: isVisible ? 1 : 0.1,
                  transform: isVisible ? "translateX(0)" : "translateX(-8px)",
                  transition: `all 0.4s ease ${i * 0.03}s`,
                }}
              >
                <div
                  className={`relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    isVisible
                      ? "bg-neon/8 border border-neon/20"
                      : "bg-muted/5"
                  }`}
                >
                  <EventIcon
                    size={12}
                    className={isVisible ? "text-neon" : "text-muted-foreground/20"}
                  />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[9px] text-neon/40">{event.time}</span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-neon/5 text-neon/50 font-mono uppercase">
                      {event.category}
                    </span>
                  </div>
                  <p className="text-[13px] text-foreground/75 font-sans mt-0.5 leading-snug">
                    {event.label}
                  </p>
                  {isExpanded && (
                    <p className="text-[10px] text-muted-foreground/40 font-mono mt-1 animate-fade-in-up">
                      {event.detail}
                    </p>
                  )}
                </div>
                {isVisible && (
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                    {isExpanded ? (
                      <ChevronUp size={12} className="text-neon/30" />
                    ) : (
                      <ChevronDown size={12} className="text-neon/30" />
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────
   2. MARKET INTELLIGENCE PANEL
   ────────────────────────────────────────── */

function MarketIntelligence() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    ctx.scale(dpr, dpr)

    let frame: number
    const start = performance.now()
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight

    const dataPoints = Array.from({ length: 24 }, (_, i) => ({
      x: (i / 23) * w,
      y: h * 0.3 + Math.sin(i * 0.5) * h * 0.15 + Math.random() * h * 0.04,
    }))

    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, w, h)

      const progress = Math.min(t / 2, 1)
      const pointsToShow = Math.floor(progress * dataPoints.length)

      // Grid
      ctx.strokeStyle = "rgba(0, 229, 245, 0.03)"
      ctx.lineWidth = 0.4
      for (let y = 0; y < h; y += h / 5) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }

      if (pointsToShow > 1) {
        // Fill
        ctx.beginPath()
        ctx.moveTo(dataPoints[0].x, h)
        for (let i = 0; i < pointsToShow; i++) {
          ctx.lineTo(dataPoints[i].x, dataPoints[i].y)
        }
        ctx.lineTo(dataPoints[pointsToShow - 1].x, h)
        ctx.closePath()
        const fillG = ctx.createLinearGradient(0, 0, 0, h)
        fillG.addColorStop(0, "rgba(0, 229, 245, 0.08)")
        fillG.addColorStop(1, "rgba(0, 229, 245, 0)")
        ctx.fillStyle = fillG
        ctx.fill()

        // Line
        ctx.beginPath()
        ctx.moveTo(dataPoints[0].x, dataPoints[0].y)
        for (let i = 1; i < pointsToShow; i++) {
          const xc = (dataPoints[i].x + dataPoints[i - 1].x) / 2
          const yc = (dataPoints[i].y + dataPoints[i - 1].y) / 2
          ctx.quadraticCurveTo(dataPoints[i - 1].x, dataPoints[i - 1].y, xc, yc)
        }
        ctx.strokeStyle = "rgba(0, 229, 245, 0.6)"
        ctx.lineWidth = 1.5
        ctx.stroke()

        // End dot
        const last = dataPoints[pointsToShow - 1]
        ctx.beginPath()
        ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = "#00E5F5"
        ctx.fill()
        ctx.beginPath()
        ctx.arc(last.x, last.y, 10, 0, Math.PI * 2)
        const dotG = ctx.createRadialGradient(last.x, last.y, 0, last.x, last.y, 10)
        dotG.addColorStop(0, "rgba(0, 229, 245, 0.25)")
        dotG.addColorStop(1, "rgba(0, 229, 245, 0)")
        ctx.fillStyle = dotG
        ctx.fill()
      }

      frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-neon" />
          <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
            Market Intelligence
          </h2>
        </div>
        <div className="flex items-center gap-1 text-emerald-400/80 text-[10px] font-mono">
          <ArrowUpRight size={10} />
          +4.2% YoY
        </div>
      </div>

      <div
        className="h-36 md:h-44 rounded-xl overflow-hidden mb-4"
        style={{ background: "rgba(6, 6, 6, 0.6)", border: "1px solid rgba(0,229,245,0.05)" }}
      >
        <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
      </div>

      {/* Market stats */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: "Median Price", value: "$312K", change: "+4.2%" },
          { label: "Inventory", value: "1,247", change: "-8.1%" },
          { label: "Days on Market", value: "18", change: "-12%" },
          { label: "Sale/List Ratio", value: "98.4%", change: "+1.2%" },
        ].map((stat) => (
          <div key={stat.label} className="px-3 py-2 rounded-lg bg-[rgba(0,229,245,0.03)]">
            <p className="text-[9px] text-muted-foreground/40 font-mono uppercase tracking-wider mb-0.5">
              {stat.label}
            </p>
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-sm text-foreground">
                {stat.value}
              </span>
              <span
                className={`text-[9px] font-mono ${
                  stat.change.startsWith("+") ? "text-emerald-400/70" : "text-neon/50"
                }`}
              >
                {stat.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Neighborhood & Risk */}
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <div className="px-3 py-2.5 rounded-lg bg-[rgba(0,229,245,0.03)]">
          <p className="text-[9px] text-muted-foreground/40 font-mono uppercase tracking-wider mb-1.5">
            Neighborhood Score
          </p>
          <NeonProgress value={82} duration={2500} />
        </div>
        <div className="px-3 py-2.5 rounded-lg bg-[rgba(0,229,245,0.03)]">
          <p className="text-[9px] text-muted-foreground/40 font-mono uppercase tracking-wider mb-1.5">
            Risk Index
          </p>
          <NeonProgress value={23} duration={2500} />
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────
   3. COMPARABLE ENGINE
   ────────────────────────────────────────── */

const compsData = [
  {
    address: "127 Elm St",
    price: "$310,000",
    sqft: "1,920",
    beds: 3,
    baths: 2,
    similarity: 94,
    soldDate: "12/15/2025",
    adjustments: [
      { label: "Extra bedroom", value: "+$12,000" },
      { label: "Newer build (2019)", value: "+$8,500" },
    ],
  },
  {
    address: "342 Oak Ave",
    price: "$285,000",
    sqft: "1,760",
    beds: 3,
    baths: 2,
    similarity: 91,
    soldDate: "11/28/2025",
    adjustments: [
      { label: "Smaller lot", value: "-$5,500" },
      { label: "Updated kitchen", value: "+$7,200" },
    ],
  },
  {
    address: "89 Pine Rd",
    price: "$265,000",
    sqft: "1,580",
    beds: 2,
    baths: 1,
    similarity: 87,
    soldDate: "01/03/2026",
    adjustments: [
      { label: "Fewer bathrooms", value: "-$8,500" },
      { label: "Corner lot", value: "+$3,200" },
    ],
  },
  {
    address: "510 Maple Dr",
    price: "$340,000",
    sqft: "2,100",
    beds: 4,
    baths: 3,
    similarity: 83,
    soldDate: "10/22/2025",
    adjustments: [
      { label: "Extra bedroom", value: "+$12,000" },
      { label: "Pool", value: "+$17,500" },
      { label: "Older build (2005)", value: "-$9,800" },
    ],
  },
]

function ComparableEngine() {
  const [expandedComp, setExpandedComp] = useState<number | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target size={15} className="text-neon" />
        <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Comparable Engine
        </h2>
        <div className="ml-auto text-[10px] text-neon/40 font-mono">
          {compsData.length} comps
        </div>
      </div>

      <div className="space-y-2">
        {compsData.map((comp, i) => {
          const isExpanded = expandedComp === i

          return (
            <button
              key={comp.address}
              onClick={() => setExpandedComp(isExpanded ? null : i)}
              className={`w-full text-left rounded-xl transition-all duration-400 ${
                isExpanded
                  ? "glass-card-strong p-4"
                  : "bg-[rgba(0,229,245,0.02)] hover:bg-[rgba(0,229,245,0.04)] p-3.5"
              }`}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(8px)",
                transition: `all 0.5s ease ${i * 0.08}s`,
              }}
            >
              {/* Header row */}
              <div className="flex items-center gap-3">
                {/* Similarity badge */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `rgba(0, 229, 245, ${comp.similarity / 1000})`,
                    border: `1px solid rgba(0, 229, 245, ${comp.similarity / 500})`,
                  }}
                >
                  <span className="text-[11px] font-mono font-bold text-neon">
                    {comp.similarity}%
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-sans text-foreground/80 truncate">
                      {comp.address}
                    </span>
                    <span className="font-display font-semibold text-sm text-foreground ml-2 flex-shrink-0">
                      {comp.price}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground/40 font-mono mt-0.5">
                    <span>{comp.sqft} sqft</span>
                    <span>{comp.beds}bd / {comp.baths}ba</span>
                    <span>Sold {comp.soldDate}</span>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {isExpanded ? (
                    <ChevronUp size={14} className="text-neon/30" />
                  ) : (
                    <ChevronDown size={14} className="text-muted-foreground/20" />
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-[rgba(0,229,245,0.06)] animate-fade-in-up">
                  <p className="text-[9px] text-muted-foreground/40 font-mono uppercase tracking-wider mb-2">
                    Adjustments
                  </p>
                  <div className="space-y-1.5">
                    {comp.adjustments.map((adj) => (
                      <div
                        key={adj.label}
                        className="flex items-center justify-between text-[11px]"
                      >
                        <span className="text-muted-foreground/60 font-sans">
                          {adj.label}
                        </span>
                        <span
                          className={`font-mono font-medium ${
                            adj.value.startsWith("+")
                              ? "text-emerald-400/70"
                              : "text-rose-400/70"
                          }`}
                        >
                          {adj.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────
   4. REPAIR & CONDITION ENGINE
   ────────────────────────────────────────── */

function RepairEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedRepair, setSelectedRepair] = useState<number | null>(null)

  const repairs = [
    { label: "Foundation", cost: "$12,000", severity: 0.9, x: 0.5, y: 0.82, detail: "Hairline cracks detected on south wall. Likely settling issue requiring pier installation.", confidence: 88 },
    { label: "Roof", cost: "$8,500", severity: 0.7, x: 0.5, y: 0.15, detail: "Age-related wear on shingles. Estimated 3-5 years remaining life. Full replacement recommended.", confidence: 92 },
    { label: "HVAC", cost: "$6,200", severity: 0.5, x: 0.75, y: 0.42, detail: "Unit is 14 years old. Efficiency below standard. Replacement with modern unit advised.", confidence: 85 },
    { label: "Electrical", cost: "$3,800", severity: 0.4, x: 0.22, y: 0.48, detail: "Panel is 200A but some outlets lack GFCI protection. Minor update needed.", confidence: 90 },
    { label: "Plumbing", cost: "$2,000", severity: 0.3, x: 0.62, y: 0.65, detail: "Minor fixture updates needed. Supply lines are copper, in good condition.", confidence: 94 },
  ]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    ctx.scale(dpr, dpr)

    let frame: number
    const start = performance.now()
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight

    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, w, h)

      const cx = w / 2
      const cy = h * 0.48
      const houseW = w * 0.42
      const houseH = h * 0.35
      const roofH = h * 0.18

      // House wireframe
      ctx.strokeStyle = "rgba(0, 229, 245, 0.12)"
      ctx.lineWidth = 0.8
      ctx.strokeRect(cx - houseW / 2, cy - houseH / 2, houseW, houseH)

      ctx.beginPath()
      ctx.moveTo(cx - houseW / 2 - 12, cy - houseH / 2)
      ctx.lineTo(cx, cy - houseH / 2 - roofH)
      ctx.lineTo(cx + houseW / 2 + 12, cy - houseH / 2)
      ctx.closePath()
      ctx.stroke()

      // Door & windows
      const doorW = houseW * 0.12
      const doorH = houseH * 0.35
      ctx.strokeRect(cx - doorW / 2, cy + houseH / 2 - doorH, doorW, doorH)
      const winSize = houseW * 0.1
      ctx.strokeRect(cx - houseW * 0.28, cy - houseH * 0.12, winSize, winSize)
      ctx.strokeRect(cx + houseW * 0.18, cy - houseH * 0.12, winSize, winSize)

      // Repair hotspots
      repairs.forEach((repair, i) => {
        const px = repair.x * w
        const py = repair.y * h
        const pulse = Math.sin(t * 2 + i * 1.3) * 0.3 + 0.7
        const isSelected = selectedRepair === i

        const r = Math.round(255 * repair.severity)
        const g = Math.round(100 * (1 - repair.severity))
        const b = 80

        // Outer pulse
        ctx.beginPath()
        ctx.arc(px, py, (isSelected ? 18 : 12) + pulse * 5, 0, Math.PI * 2)
        const glow = ctx.createRadialGradient(
          px, py, 0, px, py, (isSelected ? 22 : 16) + pulse * 5
        )
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${isSelected ? 0.25 : 0.15})`)
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
        ctx.fillStyle = glow
        ctx.fill()

        // Inner dot
        ctx.beginPath()
        ctx.arc(px, py, isSelected ? 5 : 3.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${pulse})`
        ctx.fill()

        // Connection to house center
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(cx, cy)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.04)`
        ctx.lineWidth = 0.4
        ctx.setLineDash([2, 4])
        ctx.stroke()
        ctx.setLineDash([])
      })

      // Scanning beam
      const scanAngle = t * 0.4
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(
        cx + Math.cos(scanAngle) * w * 0.45,
        cy + Math.sin(scanAngle) * h * 0.45
      )
      ctx.strokeStyle = "rgba(0, 229, 245, 0.06)"
      ctx.lineWidth = 0.6
      ctx.stroke()

      frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [selectedRepair])

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wrench size={15} className="text-neon" />
          <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
            Repair Engine
          </h2>
        </div>
        <span className="text-xs font-display text-foreground font-semibold">$32,500 est.</span>
      </div>

      {/* Visualizer */}
      <div
        className="h-48 md:h-56 rounded-xl overflow-hidden mb-4"
        style={{ background: "rgba(6, 6, 6, 0.6)", border: "1px solid rgba(0,229,245,0.05)" }}
      >
        <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
      </div>

      {/* Repair list */}
      <div className="space-y-2">
        {repairs.map((repair, i) => {
          const isSelected = selectedRepair === i
          return (
            <button
              key={repair.label}
              onClick={() => setSelectedRepair(isSelected ? null : i)}
              className={`w-full text-left rounded-lg transition-all duration-300 ${
                isSelected ? "bg-[rgba(0,229,245,0.05)] p-3" : "p-2.5 hover:bg-[rgba(0,229,245,0.02)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    background: `rgb(${Math.round(255 * repair.severity)}, ${Math.round(100 * (1 - repair.severity))}, 80)`,
                    boxShadow: `0 0 6px rgba(${Math.round(255 * repair.severity)}, ${Math.round(100 * (1 - repair.severity))}, 80, 0.4)`,
                  }}
                />
                <span className="text-[12px] font-sans text-foreground/70 flex-1">
                  {repair.label}
                </span>
                <span className="text-[12px] font-display font-semibold text-foreground flex-shrink-0">
                  {repair.cost}
                </span>
              </div>

              {isSelected && (
                <div className="mt-2 pl-5 animate-fade-in-up">
                  <p className="text-[10px] text-muted-foreground/40 font-sans leading-relaxed mb-1.5">
                    {repair.detail}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground/30 font-mono">
                      Confidence:
                    </span>
                    <div className="flex-1 max-w-[100px]">
                      <NeonProgress value={repair.confidence} duration={1000} />
                    </div>
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────
   5. INVESTOR MATH ENGINE
   ────────────────────────────────────────── */

function InvestorMath() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 400)
    return () => clearTimeout(t)
  }, [])

  const formulaSteps = [
    { label: "After Repair Value (ARV)", value: "$345,000", note: "Based on 6 comparable sales" },
    { label: "Estimated Repairs", value: "-$32,500", note: "5 items flagged" },
    { label: "Market Risk Index", value: "-$5,175", note: "1.5% buffer applied" },
    { label: "Investor Discount", value: "x 0.70", note: "70% of ARV standard" },
    { label: "Wholesale Buffer", value: "-$3,000", note: "Safety margin" },
    { label: "Holding Costs", value: "-$4,500", note: "Est. 90-day hold" },
  ]

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Calculator size={15} className="text-neon" />
        <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Investor Math Engine
        </h2>
      </div>

      <div className="space-y-2">
        {formulaSteps.map((step, i) => (
          <div
            key={step.label}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[rgba(0,229,245,0.02)]"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(6px)",
              transition: `all 0.5s ease ${i * 0.08}s`,
            }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-sans text-foreground/70">{step.label}</p>
              <p className="text-[9px] text-muted-foreground/30 font-mono">{step.note}</p>
            </div>
            <span
              className={`text-sm font-display font-semibold flex-shrink-0 ${
                step.value.startsWith("-")
                  ? "text-rose-400/70"
                  : step.value.startsWith("x")
                    ? "text-neon/70"
                    : "text-foreground"
              }`}
            >
              {step.value}
            </span>
          </div>
        ))}
      </div>

      {/* Final formula */}
      <div
        className="mt-4 p-4 rounded-xl glass-card-strong text-center"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 1s ease 0.6s",
        }}
      >
        <p className="text-[9px] text-muted-foreground/40 font-mono uppercase tracking-wider mb-2">
          Formula Applied
        </p>
        <p className="text-[11px] text-neon/60 font-mono">
          {"(ARV x 0.70) - Repairs - Risk - Buffer - Hold"}
        </p>
        <div className="mt-3 pt-3 border-t border-[rgba(0,229,245,0.08)]">
          <p className="text-[9px] text-muted-foreground/30 font-mono mb-1">Final Offer</p>
          <p className="font-display text-2xl font-bold neon-text">$287,500</p>
        </div>
      </div>

      {/* Offer range reasoning */}
      <div
        className="mt-3 space-y-2"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 1s ease 0.8s",
        }}
      >
        <p className="text-[9px] text-muted-foreground/40 font-mono uppercase tracking-wider">
          Offer Range Reasoning
        </p>
        {[
          { label: "Conservative (Low)", value: "$272,000", reason: "Higher repair buffer + risk" },
          { label: "Targeted (Mid)", value: "$287,500", reason: "Standard investor formula" },
          { label: "Aggressive (High)", value: "$305,000", reason: "Minimal buffer, max confidence" },
        ].map((range) => (
          <div key={range.label} className="flex items-center gap-3 text-[11px]">
            <span className="text-muted-foreground/50 font-sans flex-1">{range.label}</span>
            <span className="font-display font-semibold text-foreground">{range.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────
   6. BLOOMBERG-STYLE DASHBOARD
   ────────────────────────────────────────── */

export function DashboardPage({ address }: { address: string }) {
  const [visible, setVisible] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200)
    return () => clearTimeout(t)
  }, [])

  const tabs = ["Overview", "Intelligence", "Comps", "Repairs", "Investor Math"]

  return (
    <div className="min-h-screen bg-[#060606] relative pb-24">
      {/* Grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 229, 245, 0.012) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 229, 245, 0.012) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-3xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div
          className="mb-6"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(16px)",
            transition: "all 0.8s ease",
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-neon/8 border border-neon/15 flex items-center justify-center">
              <Home size={16} className="text-neon" />
            </div>
            <div>
              <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">
                Property Intelligence
              </h1>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40 font-mono">
                <MapPin size={9} className="text-neon/40" />
                {address}
              </div>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
            {tabs.map((tab, i) => (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                className={`px-3 py-2 rounded-lg text-[11px] font-sans transition-all duration-300 min-h-[36px] flex-shrink-0 ${
                  i === activeTab
                    ? "bg-neon/10 text-neon border border-neon/20"
                    : "bg-[rgba(0,229,245,0.02)] text-muted-foreground/50 hover:bg-[rgba(0,229,245,0.04)] border border-transparent"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Offer summary bar */}
        <div
          className="glass-card-strong rounded-2xl p-4 mb-5 flex flex-col md:flex-row items-center justify-between gap-3"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(16px)",
            transition: "all 0.8s ease 0.1s",
          }}
        >
          <div className="text-center md:text-left">
            <p className="text-[9px] text-muted-foreground/40 font-mono uppercase tracking-wider mb-0.5">
              Cash Offer
            </p>
            <p className="font-display text-2xl md:text-3xl font-bold neon-text">$287,500</p>
          </div>
          <div className="flex items-center gap-5">
            {[
              { label: "ARV", value: "$345K" },
              { label: "Repairs", value: "$32.5K" },
              { label: "ROI", value: "18.2%" },
              { label: "Confidence", value: "94%" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-[8px] text-muted-foreground/30 font-mono uppercase tracking-wider">
                  {s.label}
                </p>
                <p className="font-display text-sm font-semibold text-foreground">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="space-y-5">
          {/* Overview Tab */}
          {activeTab === 0 && (
            <>
              <div
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(16px)",
                  transition: "all 0.8s ease 0.2s",
                }}
              >
                <DataAcquisitionTimeline />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div
                  style={{
                    opacity: visible ? 1 : 0,
                    transform: visible ? "translateX(0)" : "translateX(-16px)",
                    transition: "all 0.8s ease 0.3s",
                  }}
                >
                  <MarketIntelligence />
                </div>
                <div
                  style={{
                    opacity: visible ? 1 : 0,
                    transform: visible ? "translateX(0)" : "translateX(16px)",
                    transition: "all 0.8s ease 0.4s",
                  }}
                >
                  <RepairEngine />
                </div>
              </div>

              {/* Investment Metrics */}
              <div
                className="glass-card rounded-2xl p-5"
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(16px)",
                  transition: "all 0.8s ease 0.5s",
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Target size={15} className="text-neon" />
                  <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
                    Investment Metrics
                  </h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Cap Rate", value: 92 },
                    { label: "Cash-on-Cash", value: 78 },
                    { label: "GRM Score", value: 85 },
                    { label: "Risk Score", value: 88 },
                  ].map((m, i) => (
                    <div key={m.label} className="px-3 py-2.5 rounded-lg bg-[rgba(0,229,245,0.02)]">
                      <NeonProgress
                        value={m.value}
                        duration={2000 + i * 200}
                        label={m.label}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Intelligence Tab */}
          {activeTab === 1 && (
            <>
              <DataAcquisitionTimeline />
              <MarketIntelligence />
            </>
          )}

          {/* Comps Tab */}
          {activeTab === 2 && <ComparableEngine />}

          {/* Repairs Tab */}
          {activeTab === 3 && <RepairEngine />}

          {/* Investor Math Tab */}
          {activeTab === 4 && <InvestorMath />}
        </div>

        {/* Action buttons */}
        <div
          className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(16px)",
            transition: "all 0.8s ease 0.6s",
          }}
        >
          {[
            { label: "Send to Podio", icon: Send, variant: "glass" as const },
            { label: "Generate Contract", icon: FileText, variant: "primary" as const },
            { label: "Submit to Title", icon: Shield, variant: "glass" as const },
          ].map((action) => (
            <button
              key={action.label}
              className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-display font-semibold text-sm transition-all duration-300 min-h-[48px] ${
                action.variant === "primary"
                  ? "bg-neon text-[#0A0A0A] animate-breathe hover:shadow-[0_0_30px_rgba(0,229,245,0.4)]"
                  : "glass-card-hover text-foreground/80 hover:text-foreground"
              }`}
            >
              <action.icon size={15} />
              {action.label}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-10">
          <p className="font-display text-base font-bold">
            <span className="neon-text">Offerr</span>
            <span className="text-muted-foreground/40">.ai</span>
          </p>
          <p className="text-[9px] text-muted-foreground/20 mt-1 font-mono">
            AI-Powered Real Estate Intelligence
          </p>
        </div>
      </div>
    </div>
  )
}
