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
} from "lucide-react"

/* ───── AI Analysis Timeline ───── */

const timelineEvents = [
  { time: "0.00s", label: "Property address validated", icon: MapPin, category: "Input" },
  { time: "0.12s", label: "Parcel data retrieved from county records", icon: Layers, category: "Data" },
  { time: "0.34s", label: "6 comparable sales identified (0.5mi)", icon: Target, category: "Comps" },
  { time: "0.58s", label: "Market trend analysis completed", icon: TrendingUp, category: "Analysis" },
  { time: "0.89s", label: "Repair cost estimation: $32,500", icon: Wrench, category: "Repairs" },
  { time: "1.21s", label: "ARV calculated: $345,000", icon: DollarSign, category: "Valuation" },
  { time: "1.54s", label: "Neural network consensus reached", icon: Brain, category: "AI" },
  { time: "1.87s", label: "Cash offer generated: $287,500", icon: Zap, category: "Offer" },
]

function AnalysisTimeline() {
  const [visibleItems, setVisibleItems] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleItems((prev) => {
        if (prev >= timelineEvents.length) {
          clearInterval(interval)
          return prev
        }
        return prev + 1
      })
    }, 400)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="glass-card rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-2 mb-5">
        <Activity size={16} className="text-neon" />
        <h2 className="font-display text-base font-semibold text-foreground">AI Analysis Timeline</h2>
        <div className="ml-auto text-xs text-neon/60 font-mono">1.87s total</div>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border" aria-hidden="true" />

        <div className="space-y-0.5">
          {timelineEvents.map((event, i) => {
            const isVisible = i < visibleItems
            const EventIcon = event.icon

            return (
              <div
                key={i}
                className="relative flex items-start gap-3 py-2.5"
                style={{
                  opacity: isVisible ? 1 : 0.15,
                  transform: isVisible ? "translateX(0)" : "translateX(-10px)",
                  transition: `all 0.4s ease ${i * 0.05}s`,
                }}
              >
                {/* Dot */}
                <div
                  className={`relative z-10 w-[38px] h-[38px] rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    isVisible ? "bg-neon/10 neon-border" : "bg-muted/10"
                  }`}
                >
                  <EventIcon size={14} className={isVisible ? "text-neon" : "text-muted-foreground/30"} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] text-neon/50">{event.time}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neon/5 text-neon/60 font-sans">
                      {event.category}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80 font-sans mt-0.5">{event.label}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ───── Market Intelligence Dashboard ───── */

function MarketIntelligence() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2
    ctx.scale(2, 2)

    let frame: number
    const start = performance.now()
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight

    // Generate market data points
    const dataPoints = Array.from({ length: 24 }, (_, i) => ({
      x: (i / 23) * w,
      y: h * 0.3 + Math.sin(i * 0.5) * h * 0.15 + Math.random() * h * 0.05,
    }))

    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, w, h)

      // Draw filled area
      const progress = Math.min(t / 2, 1)
      const pointsToShow = Math.floor(progress * dataPoints.length)

      if (pointsToShow > 1) {
        // Fill gradient
        ctx.beginPath()
        ctx.moveTo(dataPoints[0].x, h)
        for (let i = 0; i < pointsToShow; i++) {
          ctx.lineTo(dataPoints[i].x, dataPoints[i].y)
        }
        ctx.lineTo(dataPoints[pointsToShow - 1].x, h)
        ctx.closePath()
        const fillG = ctx.createLinearGradient(0, 0, 0, h)
        fillG.addColorStop(0, "rgba(0, 229, 245, 0.1)")
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
        ctx.strokeStyle = "rgba(0, 229, 245, 0.7)"
        ctx.lineWidth = 2
        ctx.stroke()

        // End dot
        const lastPt = dataPoints[pointsToShow - 1]
        ctx.beginPath()
        ctx.arc(lastPt.x, lastPt.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = "#00E5F5"
        ctx.fill()

        // Glow on end dot
        ctx.beginPath()
        ctx.arc(lastPt.x, lastPt.y, 12, 0, Math.PI * 2)
        const dotG = ctx.createRadialGradient(lastPt.x, lastPt.y, 0, lastPt.x, lastPt.y, 12)
        dotG.addColorStop(0, "rgba(0, 229, 245, 0.3)")
        dotG.addColorStop(1, "rgba(0, 229, 245, 0)")
        ctx.fillStyle = dotG
        ctx.fill()
      }

      // Grid lines
      ctx.strokeStyle = "rgba(0, 229, 245, 0.05)"
      ctx.lineWidth = 0.5
      for (let y = 0; y < h; y += h / 4) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }

      frame = requestAnimationFrame(animate)
    }
    animate()

    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="glass-card rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-neon" />
          <h2 className="font-display text-base font-semibold text-foreground">Market Intelligence</h2>
        </div>
        <div className="flex items-center gap-1 text-emerald-400 text-xs font-sans">
          <ArrowUpRight size={12} />
          +4.2% YoY
        </div>
      </div>

      {/* Chart */}
      <div className="h-40 md:h-52 rounded-xl overflow-hidden mb-4" style={{ background: "rgba(10, 10, 10, 0.5)" }}>
        <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Median Price", value: "$312K", change: "+4.2%" },
          { label: "Inventory", value: "1,247", change: "-8.1%" },
          { label: "Days on Market", value: "18", change: "-12%" },
          { label: "Sale/List Ratio", value: "98.4%", change: "+1.2%" },
        ].map((stat) => (
          <div key={stat.label} className="px-3 py-2.5 rounded-lg bg-muted/10">
            <p className="text-[10px] text-muted-foreground/60 font-sans mb-0.5">{stat.label}</p>
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-sm text-foreground">{stat.value}</span>
              <span className={`text-[10px] ${stat.change.startsWith("+") ? "text-emerald-400" : "text-neon/70"}`}>
                {stat.change}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───── Repair Visualizer ───── */

function RepairVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2
    ctx.scale(2, 2)

    let frame: number
    const start = performance.now()
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight

    const repairs = [
      { label: "Roof", x: 0.5, y: 0.18, cost: 8500, severity: 0.7 },
      { label: "HVAC", x: 0.7, y: 0.4, cost: 6200, severity: 0.5 },
      { label: "Foundation", x: 0.35, y: 0.85, cost: 12000, severity: 0.9 },
      { label: "Electrical", x: 0.2, y: 0.5, cost: 3800, severity: 0.4 },
      { label: "Plumbing", x: 0.65, y: 0.65, cost: 2000, severity: 0.3 },
    ]

    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, w, h)

      // Draw 3D house (simplified front view)
      const cx = w / 2
      const cy = h * 0.5
      const houseW = w * 0.5
      const houseH = h * 0.4
      const roofH = h * 0.2

      // Floor
      ctx.strokeStyle = "rgba(0, 229, 245, 0.15)"
      ctx.lineWidth = 1
      ctx.strokeRect(cx - houseW / 2, cy - houseH / 2, houseW, houseH)

      // Roof
      ctx.beginPath()
      ctx.moveTo(cx - houseW / 2 - 15, cy - houseH / 2)
      ctx.lineTo(cx, cy - houseH / 2 - roofH)
      ctx.lineTo(cx + houseW / 2 + 15, cy - houseH / 2)
      ctx.closePath()
      ctx.strokeStyle = "rgba(0, 229, 245, 0.15)"
      ctx.stroke()

      // Door
      const doorW = houseW * 0.15
      const doorH = houseH * 0.4
      ctx.strokeRect(cx - doorW / 2, cy + houseH / 2 - doorH, doorW, doorH)

      // Windows
      const winSize = houseW * 0.12
      ctx.strokeRect(cx - houseW * 0.3, cy - houseH * 0.15, winSize, winSize)
      ctx.strokeRect(cx + houseW * 0.18, cy - houseH * 0.15, winSize, winSize)

      // Repair hotspots
      repairs.forEach((repair, i) => {
        const px = repair.x * w
        const py = repair.y * h
        const pulse = Math.sin(t * 2 + i * 1.2) * 0.3 + 0.7

        // Severity coloring
        const r = Math.round(255 * repair.severity)
        const g = Math.round(100 * (1 - repair.severity))
        const b = 80

        // Outer ring
        ctx.beginPath()
        ctx.arc(px, py, 15 + pulse * 5, 0, Math.PI * 2)
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 20 + pulse * 5)
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.2)`)
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
        ctx.fillStyle = glow
        ctx.fill()

        // Inner dot
        ctx.beginPath()
        ctx.arc(px, py, 4, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${pulse})`
        ctx.fill()

        // Label
        const showLabel = Math.sin(t * 1.5 + i * 0.8) > 0
        if (showLabel) {
          ctx.font = "9px Inter, sans-serif"
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`
          ctx.fillText(`${repair.label}: $${repair.cost.toLocaleString()}`, px + 12, py - 5)
        }

        // Connection line to house
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(cx, cy)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.06)`
        ctx.lineWidth = 0.5
        ctx.setLineDash([2, 4])
        ctx.stroke()
        ctx.setLineDash([])
      })

      // Scan line
      const scanAngle = t * 0.5
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(scanAngle) * w * 0.5, cy + Math.sin(scanAngle) * h * 0.5)
      ctx.strokeStyle = "rgba(0, 229, 245, 0.1)"
      ctx.lineWidth = 1
      ctx.stroke()

      frame = requestAnimationFrame(animate)
    }
    animate()

    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="glass-card rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wrench size={16} className="text-neon" />
          <h2 className="font-display text-base font-semibold text-foreground">Repair Visualizer</h2>
        </div>
        <span className="text-xs font-display text-foreground font-semibold">$32,500 est.</span>
      </div>

      {/* 3D Visualizer */}
      <div
        className="h-56 md:h-72 rounded-xl overflow-hidden mb-4"
        style={{ background: "rgba(10, 10, 10, 0.5)", border: "1px solid rgba(0, 229, 245, 0.08)" }}
      >
        <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
      </div>

      {/* Repair breakdown */}
      <div className="space-y-2.5">
        {[
          { label: "Foundation Repair", cost: "$12,000", pct: 37 },
          { label: "Roof Replacement", cost: "$8,500", pct: 26 },
          { label: "HVAC System", cost: "$6,200", pct: 19 },
          { label: "Electrical Update", cost: "$3,800", pct: 12 },
          { label: "Plumbing", cost: "$2,000", pct: 6 },
        ].map((repair, i) => (
          <div key={repair.label} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-sans text-muted-foreground truncate">{repair.label}</span>
                <span className="text-xs font-display text-foreground ml-2">{repair.cost}</span>
              </div>
              <div className="h-1 rounded-full bg-muted/20 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${repair.pct}%`,
                    background: `linear-gradient(90deg, rgba(255, ${200 - repair.pct * 3}, 80, 0.6), rgba(255, ${100 - repair.pct * 2}, 80, 0.8))`,
                    transitionDelay: `${i * 0.15}s`,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───── Main Dashboard ───── */

export function DashboardPage({ address }: { address: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-screen bg-[#0A0A0A] relative pb-20">
      {/* Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 229, 245, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 229, 245, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-3xl mx-auto px-4 py-10 md:py-16">
        {/* Header */}
        <div
          className="mb-8"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.8s ease",
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-neon/10 flex items-center justify-center">
              <Home size={18} className="text-neon" />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
                Property Intelligence
              </h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-sans">
                <MapPin size={10} className="text-neon/60" />
                {address}
              </div>
            </div>
          </div>

          {/* Quick action pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {["Overview", "Comps", "Financials", "History"].map((tab, i) => (
              <button
                key={tab}
                className={`px-3.5 py-2 rounded-lg text-xs font-sans transition-all duration-300 min-h-[36px] ${
                  i === 0
                    ? "bg-neon/10 text-neon neon-border"
                    : "bg-muted/10 text-muted-foreground hover:bg-muted/20"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Offer summary bar */}
        <div
          className="glass-card-strong rounded-2xl p-5 mb-6 flex flex-col md:flex-row items-center justify-between gap-4"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.8s ease 0.1s",
          }}
        >
          <div className="text-center md:text-left">
            <p className="text-xs text-muted-foreground/60 font-sans mb-1">Cash Offer</p>
            <p className="font-display text-3xl md:text-4xl font-bold neon-text">$287,500</p>
          </div>
          <div className="flex items-center gap-6">
            {[
              { label: "ARV", value: "$345K" },
              { label: "Repairs", value: "$32.5K" },
              { label: "ROI", value: "18.2%" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-[10px] text-muted-foreground/50 font-sans">{s.label}</p>
                <p className="font-display text-sm font-semibold text-foreground">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard grid */}
        <div className="space-y-6">
          {/* Timeline */}
          <div
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(20px)",
              transition: "all 0.8s ease 0.2s",
            }}
          >
            <AnalysisTimeline />
          </div>

          {/* Market + Repairs side by side on desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateX(0)" : "translateX(-20px)",
                transition: "all 0.8s ease 0.3s",
              }}
            >
              <MarketIntelligence />
            </div>
            <div
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateX(0)" : "translateX(20px)",
                transition: "all 0.8s ease 0.4s",
              }}
            >
              <RepairVisualizer />
            </div>
          </div>

          {/* Property metrics */}
          <div
            className="glass-card rounded-2xl p-5 md:p-6"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(20px)",
              transition: "all 0.8s ease 0.5s",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Target size={16} className="text-neon" />
              <h2 className="font-display text-base font-semibold text-foreground">Investment Metrics</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Cap Rate", value: 92 },
                { label: "Cash-on-Cash", value: 78 },
                { label: "GRM Score", value: 85 },
                { label: "Risk Score", value: 88 },
              ].map((m, i) => (
                <div key={m.label}>
                  <NeonProgress value={m.value} duration={2000 + i * 200} label={m.label} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer branding */}
        <div className="text-center mt-12">
          <p className="font-display text-lg font-bold">
            <span className="neon-text">Offerr</span>
            <span className="text-muted-foreground">.ai</span>
          </p>
          <p className="text-[10px] text-muted-foreground/30 mt-1 font-sans">
            AI-Powered Real Estate Intelligence
          </p>
        </div>
      </div>
    </div>
  )
}
