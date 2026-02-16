"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { NeonProgress } from "./neon-progress"
import {
  Brain, MapPin, TrendingUp, Wrench, BarChart3, Target, Clock, Activity,
  Layers, Zap, DollarSign, ArrowUpRight, Home, FileText, Send, Calculator,
  Shield, Eye, ChevronDown, ChevronUp, Crosshair, Building, Download, Share2,
} from "lucide-react"

/* ───── DATA ───── */
const timelineEvents = [
  { time: "0.00s", label: "Property address validated", icon: MapPin, cat: "Input", detail: "Geocoded to lat/long coordinates" },
  { time: "0.08s", label: "Parcel lookup completed", icon: Layers, cat: "Data", detail: "County assessor records retrieved" },
  { time: "0.15s", label: "Owner insight acquired", icon: Eye, cat: "Data", detail: "Ownership duration: 8.2 years" },
  { time: "0.22s", label: "Zoning classification verified", icon: Building, cat: "Zone", detail: "Residential R-1, single family" },
  { time: "0.34s", label: "Market conditions analyzed", icon: TrendingUp, cat: "Market", detail: "Seller's market, 2.4mo supply" },
  { time: "0.48s", label: "Tax history retrieved", icon: DollarSign, cat: "Tax", detail: "Annual tax: $4,280 | No liens" },
  { time: "0.62s", label: "Sale history compiled", icon: Clock, cat: "History", detail: "Last sold: $195,000 (2018)" },
  { time: "0.78s", label: "6 comparable sales identified", icon: Target, cat: "Comps", detail: "Within 0.5mi, last 6 months" },
  { time: "0.95s", label: "Aerial/footprint scan complete", icon: Crosshair, cat: "Scan", detail: "Lot: 6,200 sqft | Build: 1,840 sqft" },
  { time: "1.21s", label: "Repair cost estimation: $32,500", icon: Wrench, cat: "Repairs", detail: "5 items flagged for review" },
  { time: "1.54s", label: "Neural network consensus reached", icon: Brain, cat: "AI", detail: "47 data points processed" },
  { time: "1.87s", label: "Cash offer generated: $287,500", icon: Zap, cat: "Offer", detail: "Confidence: 94%" },
]

const compsData = [
  { address: "127 Elm St", price: "$310,000", sqft: "1,920", beds: 3, baths: 2, similarity: 94, dist: "0.3mi", sold: "12/15/2025", adjustments: [{ label: "Extra bedroom", value: "+$12,000" }, { label: "Newer build (2019)", value: "+$8,500" }] },
  { address: "342 Oak Ave", price: "$285,000", sqft: "1,760", beds: 3, baths: 2, similarity: 91, dist: "0.4mi", sold: "11/28/2025", adjustments: [{ label: "Smaller lot", value: "-$5,500" }, { label: "Updated kitchen", value: "+$7,200" }] },
  { address: "89 Pine Rd", price: "$265,000", sqft: "1,580", beds: 2, baths: 1, similarity: 87, dist: "0.5mi", sold: "01/03/2026", adjustments: [{ label: "Fewer bathrooms", value: "-$8,500" }, { label: "Corner lot", value: "+$3,200" }] },
  { address: "510 Maple Dr", price: "$340,000", sqft: "2,100", beds: 4, baths: 3, similarity: 83, dist: "0.6mi", sold: "10/22/2025", adjustments: [{ label: "Extra bedroom", value: "+$12,000" }, { label: "Pool", value: "+$17,500" }, { label: "Older build (2005)", value: "-$9,800" }] },
]

const repairs = [
  { label: "Foundation", cost: "$12,000", costRange: "$10,000 - $14,500", severity: 0.9, x: 0.5, y: 0.82, detail: "Hairline cracks detected on south wall. Likely settling issue requiring pier installation.", confidence: 88 },
  { label: "Roof", cost: "$8,500", costRange: "$7,000 - $10,500", severity: 0.7, x: 0.5, y: 0.15, detail: "Age-related wear on shingles. Full replacement recommended. 3-5 years life remaining.", confidence: 92 },
  { label: "HVAC", cost: "$6,200", costRange: "$5,000 - $7,800", severity: 0.5, x: 0.75, y: 0.42, detail: "Unit is 14 years old. Efficiency below standard. Replacement with modern unit advised.", confidence: 85 },
  { label: "Electrical", cost: "$3,800", costRange: "$2,800 - $4,500", severity: 0.4, x: 0.22, y: 0.48, detail: "Panel is 200A but some outlets lack GFCI protection. Minor update needed.", confidence: 90 },
  { label: "Plumbing", cost: "$2,000", costRange: "$1,200 - $2,800", severity: 0.3, x: 0.62, y: 0.65, detail: "Minor fixture updates needed. Supply lines are copper, in good condition.", confidence: 94 },
]

/* ───── 1. DATA ACQUISITION TIMELINE ───── */
function DataTimeline() {
  const [vis, setVis] = useState(0)
  const [exp, setExp] = useState<number | null>(null)
  useEffect(() => {
    const iv = setInterval(() => setVis((p) => { if (p >= timelineEvents.length) return p; return p + 1 }), 250)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-5">
        <Activity size={14} className="text-neon" />
        <h2 className="font-display text-sm font-semibold text-[#F8F9FA] uppercase tracking-wider">Data Acquisition Timeline</h2>
        <div className="ml-auto text-[9px] text-neon/40 font-mono">1.87s total</div>
      </div>
      <div className="relative">
        <div className="absolute left-[14px] top-2 bottom-2 w-px bg-neon/[0.06]" aria-hidden="true" />
        <div className="space-y-0.5">
          {timelineEvents.map((ev, i) => {
            const show = i < vis; const open = exp === i; const Icon = ev.icon
            return (
              <button key={i} onClick={() => setExp(open ? null : i)}
                className={`relative flex items-start gap-3 py-2 w-full text-left group transition-all ${show ? "opacity-100 translate-x-0" : "opacity-[0.08] -translate-x-1.5"}`}
                style={{ transitionDelay: `${i * 0.02}s` }}>
                <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${show ? "bg-neon/8 border border-neon/15" : "bg-muted/5"}`}>
                  <Icon size={11} className={show ? "text-neon" : "text-[#6C7A89]/20"} />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[9px] text-neon/35">{ev.time}</span>
                    <span className="text-[7px] px-1.5 py-0.5 rounded bg-neon/[0.04] text-neon/40 font-mono uppercase">{ev.cat}</span>
                  </div>
                  <p className="text-[12px] text-[#F8F9FA]/70 font-sans mt-0.5 leading-snug">{ev.label}</p>
                  {open && <p className="text-[10px] text-[#6C7A89]/40 font-mono mt-1 animate-fade-in-up">{ev.detail}</p>}
                </div>
                {show && (
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                    {open ? <ChevronUp size={11} className="text-neon/25" /> : <ChevronDown size={11} className="text-neon/25" />}
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

/* ───── 2. MARKET INTELLIGENCE PANEL ───── */
function MarketIntel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null)

  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext("2d"); if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr; ctx.scale(dpr, dpr)
    let frame: number; const start = performance.now()
    const w = c.offsetWidth, h = c.offsetHeight
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const values = [282, 288, 285, 295, 302, 310, 308, 315, 318, 320, 312, 325]
    const pts = values.map((v, i) => ({ x: 30 + (i / 11) * (w - 60), y: h * 0.15 + (1 - (v - 275) / 55) * h * 0.65, val: v, label: months[i] }))

    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, w, h)
      const prog = Math.min(t / 1.8, 1)
      const show = Math.floor(prog * pts.length)

      // Grid lines
      ctx.strokeStyle = "rgba(0,228,255,0.025)"; ctx.lineWidth = 0.3
      for (let i = 0; i < 5; i++) { const y = h * 0.15 + (i / 4) * h * 0.65; ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(w - 30, y); ctx.stroke() }

      if (show > 1) {
        // Wave fill
        ctx.beginPath(); ctx.moveTo(pts[0].x, h)
        for (let i = 0; i < show; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.lineTo(pts[show - 1].x, h); ctx.closePath()
        const fg = ctx.createLinearGradient(0, 0, 0, h)
        fg.addColorStop(0, "rgba(0,228,255,0.06)"); fg.addColorStop(1, "rgba(0,228,255,0)")
        ctx.fillStyle = fg; ctx.fill()

        // Line
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < show; i++) {
          const xc = (pts[i].x + pts[i - 1].x) / 2, yc = (pts[i].y + pts[i - 1].y) / 2
          ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, xc, yc)
        }
        ctx.strokeStyle = "rgba(0,228,255,0.55)"; ctx.lineWidth = 1.5; ctx.stroke()

        // Dots
        for (let i = 0; i < show; i++) {
          ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 2.5, 0, Math.PI * 2)
          ctx.fillStyle = "rgba(0,228,255,0.6)"; ctx.fill()
        }

        // End glow
        const last = pts[show - 1]
        ctx.beginPath(); ctx.arc(last.x, last.y, 4, 0, Math.PI * 2); ctx.fillStyle = "#00E4FF"; ctx.fill()
        const dg = ctx.createRadialGradient(last.x, last.y, 0, last.x, last.y, 12)
        dg.addColorStop(0, "rgba(0,228,255,0.2)"); dg.addColorStop(1, "rgba(0,228,255,0)")
        ctx.beginPath(); ctx.arc(last.x, last.y, 12, 0, Math.PI * 2); ctx.fillStyle = dg; ctx.fill()
      }

      // Month labels
      ctx.font = "7px Inter, sans-serif"; ctx.fillStyle = "rgba(108,122,137,0.3)"
      pts.forEach((p, i) => { if (i % 2 === 0) ctx.fillText(p.label, p.x - 8, h - 4) })

      frame = requestAnimationFrame(animate)
    }
    animate()

    const handleTouch = (e: TouchEvent | MouseEvent) => {
      const rect = c.getBoundingClientRect()
      const cx = ("touches" in e ? e.touches[0].clientX : e.clientX) - rect.left
      let closest = pts[0]; let minD = Infinity
      pts.forEach((p) => { const d = Math.abs(p.x - cx * (c.width / dpr / rect.width)); if (d < minD) { minD = d; closest = p } })
      if (minD < 30) setTooltip({ x: closest.x, y: closest.y, label: `$${closest.val}K` })
      else setTooltip(null)
    }
    c.addEventListener("touchstart", handleTouch, { passive: true })
    c.addEventListener("mousemove", handleTouch)
    c.addEventListener("mouseleave", () => setTooltip(null))

    return () => { cancelAnimationFrame(frame); c.removeEventListener("touchstart", handleTouch); c.removeEventListener("mousemove", handleTouch) }
  }, [])

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-neon" />
          <h2 className="font-display text-sm font-semibold text-[#F8F9FA] uppercase tracking-wider">Market Intelligence</h2>
        </div>
        <div className="flex items-center gap-1 text-[#14FFA1]/70 text-[10px] font-mono"><ArrowUpRight size={10} />+4.2% YoY</div>
      </div>
      <div className="relative h-40 md:h-48 rounded-xl overflow-hidden mb-4" style={{ background: "rgba(4,7,10,0.6)", border: "1px solid rgba(0,228,255,0.04)" }}>
        <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
        {tooltip && (
          <div className="absolute pointer-events-none glass-card-strong px-2 py-1 rounded text-[9px] font-mono text-neon"
            style={{ left: tooltip.x - 20, top: tooltip.y - 28 }}>{tooltip.label}</div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[{ l: "Median Price", v: "$312K", c: "+4.2%" }, { l: "Inventory", v: "1,247", c: "-8.1%" }, { l: "Days on Market", v: "18", c: "-12%" }, { l: "Sale/List", v: "98.4%", c: "+1.2%" }].map((s) => (
          <div key={s.l} className="px-3 py-2 rounded-lg bg-neon/[0.02]">
            <p className="text-[8px] text-[#6C7A89]/35 font-mono uppercase tracking-wider mb-0.5">{s.l}</p>
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-sm text-[#F8F9FA]">{s.v}</span>
              <span className={`text-[8px] font-mono ${s.c.startsWith("+") ? "text-[#14FFA1]/60" : "text-neon/40"}`}>{s.c}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="px-3 py-2.5 rounded-lg bg-neon/[0.02]"><p className="text-[8px] text-[#6C7A89]/35 font-mono uppercase tracking-wider mb-1.5">Neighborhood</p><NeonProgress value={82} duration={2500} /></div>
        <div className="px-3 py-2.5 rounded-lg bg-neon/[0.02]"><p className="text-[8px] text-[#6C7A89]/35 font-mono uppercase tracking-wider mb-1.5">Risk Index</p><NeonProgress value={23} duration={2500} /></div>
      </div>
    </div>
  )
}

/* ───── 3. COMPARABLE ENGINE ───── */
function CompsEngine() {
  const [expComp, setExpComp] = useState<number | null>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVis(true), 200); return () => clearTimeout(t) }, [])

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target size={14} className="text-neon" />
        <h2 className="font-display text-sm font-semibold text-[#F8F9FA] uppercase tracking-wider">Comparable Engine</h2>
        <div className="ml-auto text-[9px] text-neon/35 font-mono">{compsData.length} comps</div>
      </div>
      <div className="space-y-2">
        {compsData.map((comp, i) => {
          const open = expComp === i
          return (
            <button key={comp.address} onClick={() => setExpComp(open ? null : i)}
              className={`w-full text-left rounded-xl transition-all duration-500 ${open ? "glass-card-strong p-4" : "bg-neon/[0.015] hover:bg-neon/[0.03] p-3.5"} ${vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
              style={{ transitionDelay: `${i * 0.07}s` }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `rgba(0,228,255,${comp.similarity / 1200})`, border: `1px solid rgba(0,228,255,${comp.similarity / 600})` }}>
                  <span className="text-[10px] font-mono font-bold text-neon">{comp.similarity}%</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-sans text-[#F8F9FA]/75 truncate">{comp.address}</span>
                    <span className="font-display font-semibold text-sm text-[#F8F9FA] ml-2 flex-shrink-0">{comp.price}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-[#6C7A89]/35 font-mono mt-0.5">
                    <span>{comp.sqft} sqft</span><span>{comp.beds}bd/{comp.baths}ba</span><span>{comp.dist}</span><span>Sold {comp.sold}</span>
                  </div>
                </div>
                <div className="flex-shrink-0">{open ? <ChevronUp size={13} className="text-neon/25" /> : <ChevronDown size={13} className="text-[#6C7A89]/20" />}</div>
              </div>
              {open && (
                <div className="mt-3 pt-3 border-t border-neon/[0.05] animate-fade-in-up">
                  <p className="text-[8px] text-[#6C7A89]/35 font-mono uppercase tracking-wider mb-2">Adjustments</p>
                  <div className="space-y-1.5">
                    {comp.adjustments.map((adj) => (
                      <div key={adj.label} className="flex items-center justify-between text-[11px]">
                        <span className="text-[#6C7A89]/55 font-sans">{adj.label}</span>
                        <span className={`font-mono font-medium ${adj.value.startsWith("+") ? "text-[#14FFA1]/65" : "text-[#FF4D78]/65"}`}>{adj.value}</span>
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

/* ───── 4. REPAIR ENGINE ───── */
function RepairEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [sel, setSel] = useState<number | null>(null)

  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext("2d"); if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr; ctx.scale(dpr, dpr)
    let frame: number; const start = performance.now()
    const w = c.offsetWidth, h = c.offsetHeight

    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2, cy = h * 0.48, hw = w * 0.42, hh = h * 0.35, rh = h * 0.18

      ctx.strokeStyle = "rgba(0,228,255,0.1)"; ctx.lineWidth = 0.7
      ctx.strokeRect(cx - hw / 2, cy - hh / 2, hw, hh)
      ctx.beginPath(); ctx.moveTo(cx - hw / 2 - 12, cy - hh / 2); ctx.lineTo(cx, cy - hh / 2 - rh); ctx.lineTo(cx + hw / 2 + 12, cy - hh / 2); ctx.closePath(); ctx.stroke()
      ctx.strokeRect(cx - hw * 0.06, cy + hh / 2 - hh * 0.35, hw * 0.12, hh * 0.35)
      ctx.strokeRect(cx - hw * 0.28, cy - hh * 0.12, hw * 0.1, hw * 0.1)
      ctx.strokeRect(cx + hw * 0.18, cy - hh * 0.12, hw * 0.1, hw * 0.1)

      repairs.forEach((r, i) => {
        const px = r.x * w, py = r.y * h
        const pulse = Math.sin(t * 2 + i * 1.3) * 0.3 + 0.7
        const isSel = sel === i
        const rv = Math.round(255 * r.severity), gv = Math.round(80 * (1 - r.severity))

        ctx.beginPath(); ctx.arc(px, py, (isSel ? 18 : 12) + pulse * 4, 0, Math.PI * 2)
        const g = ctx.createRadialGradient(px, py, 0, px, py, (isSel ? 22 : 16) + pulse * 4)
        g.addColorStop(0, `rgba(${rv},${gv},80,${isSel ? 0.22 : 0.12})`); g.addColorStop(1, `rgba(${rv},${gv},80,0)`)
        ctx.fillStyle = g; ctx.fill()

        ctx.beginPath(); ctx.arc(px, py, isSel ? 4.5 : 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rv},${gv},80,${pulse})`; ctx.fill()

        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx, cy)
        ctx.strokeStyle = `rgba(${rv},${gv},80,0.03)`; ctx.lineWidth = 0.3; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([])
      })

      const sa = t * 0.35
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sa) * w * 0.42, cy + Math.sin(sa) * h * 0.42)
      ctx.strokeStyle = "rgba(0,228,255,0.04)"; ctx.lineWidth = 0.5; ctx.stroke()

      frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [sel])

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Wrench size={14} className="text-neon" /><h2 className="font-display text-sm font-semibold text-[#F8F9FA] uppercase tracking-wider">Repair Engine</h2></div>
        <span className="text-xs font-display text-[#F8F9FA] font-semibold">$32,500 est.</span>
      </div>
      <div className="h-48 md:h-56 rounded-xl overflow-hidden mb-4" style={{ background: "rgba(4,7,10,0.6)", border: "1px solid rgba(0,228,255,0.04)" }}>
        <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        {repairs.map((r, i) => {
          const isSel = sel === i; const rv = Math.round(255 * r.severity), gv = Math.round(80 * (1 - r.severity))
          return (
            <button key={r.label} onClick={() => setSel(isSel ? null : i)}
              className={`w-full text-left rounded-lg transition-all duration-300 ${isSel ? "bg-neon/[0.04] p-3" : "p-2.5 hover:bg-neon/[0.015]"}`}>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: `rgb(${rv},${gv},80)`, boxShadow: `0 0 6px rgba(${rv},${gv},80,0.4)` }} />
                <span className="text-[11px] font-sans text-[#F8F9FA]/65 flex-1">{r.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[#6C7A89]/30 font-mono">{r.costRange}</span>
                  <span className="text-[11px] font-display font-semibold text-[#F8F9FA] flex-shrink-0">{r.cost}</span>
                </div>
              </div>
              {isSel && (
                <div className="mt-2 pl-5 animate-fade-in-up">
                  <p className="text-[10px] text-[#6C7A89]/40 font-sans leading-relaxed mb-2">{r.detail}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] text-[#6C7A89]/25 font-mono">Confidence:</span>
                    <div className="flex-1 max-w-[100px]"><NeonProgress value={r.confidence} duration={800} /></div>
                    <span className="text-[9px] font-mono text-neon/40">{r.confidence}%</span>
                  </div>
                  {/* Severity bar */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[8px] text-[#6C7A89]/25 font-mono">Severity:</span>
                    <div className="flex-1 max-w-[100px] h-1 rounded-full bg-[#6C7A89]/10">
                      <div className="h-full rounded-full" style={{ width: `${r.severity * 100}%`, background: `rgb(${rv},${gv},80)`, boxShadow: `0 0 4px rgba(${rv},${gv},80,0.3)` }} />
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

/* ───── 5. INVESTOR MATH ENGINE ───── */
function InvestorMath() {
  const [vis, setVis] = useState(false)
  const [dealStrength, setDealStrength] = useState(0)
  useEffect(() => { const t = setTimeout(() => setVis(true), 300); return () => clearTimeout(t) }, [])
  useEffect(() => {
    if (!vis) return
    const start = performance.now()
    const animate = (now: number) => {
      const p = Math.min((now - start) / 2000, 1)
      setDealStrength(Math.round((1 - Math.pow(1 - p, 3)) * 78))
      if (p < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [vis])

  const steps = [
    { label: "After Repair Value (ARV)", value: "$345,000", note: "Based on 6 comparable sales", dir: "neutral" },
    { label: "x 0.70 Investor Discount", value: "$241,500", note: "70% of ARV standard", dir: "multiply" },
    { label: "Estimated Repairs", value: "-$32,500", note: "5 items flagged", dir: "minus" },
    { label: "Market Risk Index", value: "-$5,175", note: "1.5% buffer applied", dir: "minus" },
    { label: "Wholesale Buffer", value: "-$3,000", note: "Safety margin", dir: "minus" },
    { label: "Holding Costs (90-day)", value: "-$4,500", note: "Est. carrying cost", dir: "minus" },
  ]

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Calculator size={14} className="text-neon" />
        <h2 className="font-display text-sm font-semibold text-[#F8F9FA] uppercase tracking-wider">Investor Math Engine</h2>
      </div>
      {/* Formula header */}
      <div className={`mb-4 px-3 py-2.5 rounded-lg bg-neon/[0.03] border border-neon/[0.08] transition-opacity duration-700 ${vis ? "opacity-100" : "opacity-0"}`}>
        <p className="text-[10px] text-neon/50 font-mono text-center tracking-wider">
          {"(ARV x 0.70) - Repairs - Risk - Buffer - Hold = Final Offer"}
        </p>
      </div>

      <div className="space-y-1.5">
        {steps.map((s, i) => (
          <div key={s.label} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-neon/[0.015] transition-all duration-500 ${vis ? "opacity-100 translate-x-0" : `opacity-0 ${s.dir === "minus" ? "-translate-x-3" : s.dir === "multiply" ? "" : "translate-x-3"}`}`}
            style={{ transitionDelay: `${i * 0.1}s` }}>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-sans text-[#F8F9FA]/65">{s.label}</p>
              <p className="text-[8px] text-[#6C7A89]/30 font-mono">{s.note}</p>
            </div>
            <span className={`text-sm font-display font-semibold flex-shrink-0 ${s.value.startsWith("-") ? "text-[#FF4D78]/65" : s.value.startsWith("x") || s.value.startsWith("$3") || s.value.startsWith("$2") ? "text-neon/65" : "text-[#F8F9FA]"}`}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Deal strength meter */}
        <div className={`mt-4 p-4 rounded-xl glass-card-strong transition-opacity duration-1000 delay-700 ${vis ? "opacity-100" : "opacity-0"}`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] text-[#6C7A89]/40 font-mono uppercase tracking-wider">Deal Strength</p>
          <span className="font-display text-sm font-bold text-neon">{dealStrength}/100</span>
        </div>
        <div className="h-2 rounded-full bg-[#6C7A89]/10 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-100"
            style={{ width: `${dealStrength}%`, background: "linear-gradient(90deg, #00B8D4, #00E4FF, #14FFA1)", boxShadow: "0 0 12px rgba(0,228,255,0.3)" }} />
        </div>

        <div className="mt-3 pt-3 border-t border-neon/[0.06] text-center">
          <p className="text-[8px] text-[#6C7A89]/30 font-mono mb-1">Final Offer</p>
          <p className="font-display text-2xl font-bold neon-text">$287,500</p>
        </div>
      </div>

      {/* Range reasoning */}
        <div className={`mt-3 space-y-1.5 transition-opacity duration-1000 delay-[900ms] ${vis ? "opacity-100" : "opacity-0"}`}>
        <p className="text-[8px] text-[#6C7A89]/35 font-mono uppercase tracking-wider">Offer Range Reasoning</p>
        {[
          { label: "Conservative (Low)", value: "$272,000", reason: "Higher repair buffer + risk" },
          { label: "Targeted (Mid)", value: "$287,500", reason: "Standard investor formula" },
          { label: "Aggressive (High)", value: "$305,000", reason: "Minimal buffer, max confidence" },
        ].map((r) => (
          <div key={r.label} className="flex items-center gap-3 text-[11px] px-3 py-2 rounded-lg bg-neon/[0.01]">
            <span className="text-[#6C7A89]/50 font-sans flex-1">{r.label}</span>
            <span className="text-[8px] text-[#6C7A89]/25 font-mono hidden md:block">{r.reason}</span>
            <span className="font-display font-semibold text-[#F8F9FA]">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───── 6. DEAL VERDICT ───── */
function DealVerdict() {
  const [vis, setVis] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVis(true), 500); return () => clearTimeout(t) }, [])

  return (
    <div className={`relative rounded-2xl p-5 overflow-hidden transition-all duration-700 ${vis ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-3 scale-[0.98]"}`}
      style={{
        transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
        background: "linear-gradient(135deg, rgba(0,228,255,0.06), rgba(20,255,161,0.04), rgba(0,228,255,0.03))",
        border: "1px solid rgba(20,255,161,0.15)",
        boxShadow: "0 0 40px rgba(20,255,161,0.06), 0 8px 32px rgba(0,0,0,0.4)",
      }}>
      {/* Shimmer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute inset-y-0 w-1/3 animate-shimmer-sweep" style={{ background: "linear-gradient(90deg, transparent, rgba(20,255,161,0.03), transparent)" }} />
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-[#14FFA1]" />
          <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-[#14FFA1]/60">Deal Verdict</p>
        </div>
        <h3 className="font-display text-2xl font-bold neon-text-green mb-4">STRONG BUY</h3>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Assignment Spread", value: "$25,000" },
            { label: "Confidence", value: "94%" },
            { label: "Risk Level", value: "Low" },
            { label: "Market Trend", value: "Positive" },
            { label: "Repair Burden", value: "Moderate" },
            { label: "Exit Strategy", value: "Wholesale" },
          ].map((item) => (
            <div key={item.label} className="px-3 py-2 rounded-lg bg-[rgba(20,255,161,0.04)]">
              <p className="text-[8px] text-[#6C7A89]/35 font-mono uppercase tracking-wider mb-0.5">{item.label}</p>
              <p className="font-display text-sm font-semibold text-[#F8F9FA]">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ───── 7. MAIN DASHBOARD ───── */
export function DashboardPage({ address }: { address: string }) {
  const [vis, setVis] = useState(false)
  const [tab, setTab] = useState(0)
  useEffect(() => { const t = setTimeout(() => setVis(true), 200); return () => clearTimeout(t) }, [])

  const tabs = ["Overview", "Intelligence", "Comps", "Repairs", "Investor Math"]

  return (
    <div className="min-h-screen bg-[#04070A] relative pb-28">
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `linear-gradient(rgba(0,228,255,0.01) 1px, transparent 1px), linear-gradient(90deg, rgba(0,228,255,0.01) 1px, transparent 1px)`, backgroundSize: "60px 60px" }}
        aria-hidden="true" />

      <div className="relative max-w-3xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className={`mb-6 transition-all duration-700 ease-out ${vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-neon/[0.06] border border-neon/[0.1] flex items-center justify-center">
              <Home size={16} className="text-neon" />
            </div>
            <div>
              <h1 className="font-display text-xl md:text-2xl font-bold text-[#F8F9FA]">Property Intelligence</h1>
              <div className="flex items-center gap-2 text-[10px] text-[#6C7A89]/40 font-mono"><MapPin size={9} className="text-neon/35" />{address}</div>
            </div>
          </div>

          {/* Floating navbar with glow indicator */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
            {tabs.map((t, i) => (
              <button key={t} onClick={() => setTab(i)}
                className={`relative px-3.5 py-2 rounded-lg text-[11px] font-sans transition-all duration-300 min-h-[36px] flex-shrink-0 ${i === tab ? "bg-neon/[0.08] text-neon border border-neon/[0.15]" : "bg-neon/[0.015] text-[#6C7A89]/50 hover:bg-neon/[0.03] border border-transparent"}`}>
                {t}
                {i === tab && <div className="absolute -bottom-px left-1/4 right-1/4 h-px bg-neon/40" style={{ boxShadow: "0 0 8px rgba(0,228,255,0.3)" }} />}
              </button>
            ))}
          </div>
        </div>

        {/* Offer summary bar */}
        <div className={`glass-card-strong rounded-2xl p-4 mb-5 flex flex-col md:flex-row items-center justify-between gap-3 transition-all duration-700 ease-out delay-100 ${vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="text-center md:text-left">
            <p className="text-[8px] text-[#6C7A89]/35 font-mono uppercase tracking-wider mb-0.5">Cash Offer</p>
            <p className="font-display text-2xl md:text-3xl font-bold neon-text">$287,500</p>
          </div>
          <div className="flex items-center gap-5">
            {[{ l: "ARV", v: "$345K" }, { l: "Repairs", v: "$32.5K" }, { l: "ROI", v: "18.2%" }, { l: "Confidence", v: "94%" }].map((s) => (
              <div key={s.l} className="text-center">
                <p className="text-[7px] text-[#6C7A89]/25 font-mono uppercase tracking-wider">{s.l}</p>
                <p className="font-display text-sm font-semibold text-[#F8F9FA]">{s.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="space-y-5">
          {tab === 0 && (
            <>
              <DealVerdict />
              <div className={`transition-all duration-700 ease-out delay-200 ${vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}><DataTimeline /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className={`transition-all duration-700 ease-out delay-300 ${vis ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}><MarketIntel /></div>
                <div className={`transition-all duration-700 ease-out delay-[400ms] ${vis ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"}`}><RepairEngine /></div>
              </div>
              <div className={`glass-card rounded-2xl p-5 transition-all duration-700 ease-out delay-500 ${vis ? "opacity-100" : "opacity-0"}`}>
                <div className="flex items-center gap-2 mb-4"><Target size={14} className="text-neon" /><h2 className="font-display text-sm font-semibold text-[#F8F9FA] uppercase tracking-wider">Investment Metrics</h2></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[{ l: "Cap Rate", v: 92 }, { l: "Cash-on-Cash", v: 78 }, { l: "GRM Score", v: 85 }, { l: "Risk Score", v: 88 }].map((m, i) => (
                    <div key={m.l} className="px-3 py-2.5 rounded-lg bg-neon/[0.015]"><NeonProgress value={m.v} duration={2000 + i * 200} label={m.l} /></div>
                  ))}
                </div>
              </div>
            </>
          )}
          {tab === 1 && (<><DataTimeline /><MarketIntel /></>)}
          {tab === 2 && <CompsEngine />}
          {tab === 3 && <RepairEngine />}
          {tab === 4 && <InvestorMath />}
        </div>

        {/* Action buttons with ripple */}
        <div className={`mt-8 grid grid-cols-2 md:grid-cols-5 gap-2.5 transition-all duration-700 ease-out delay-[600ms] ${vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          {[
            { label: "Send to Podio", icon: Send, primary: false },
            { label: "Generate Contract", icon: FileText, primary: true },
            { label: "Submit to Title", icon: Shield, primary: false },
            { label: "Export Intel Packet", icon: Download, primary: false },
            { label: "Share Summary", icon: Share2, primary: false },
          ].map((action) => (
            <button key={action.label}
              className={`relative overflow-hidden flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-display font-semibold text-[11px] transition-all duration-300 min-h-[44px] ${action.primary ? "bg-neon text-[#04070A] animate-breathe hover:shadow-[0_0_30px_rgba(0,228,255,0.35)]" : "glass-card-hover text-[#F8F9FA]/70 hover:text-[#F8F9FA]"}`}>
              <action.icon size={14} />{action.label}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <p className="font-display text-base font-bold"><span className="neon-text">Offerr</span><span className="text-[#6C7A89]/30">.ai</span></p>
          <p className="text-[8px] text-[#6C7A89]/18 mt-1 font-mono">AI-Powered Real Estate Intelligence</p>
        </div>
      </div>
    </div>
  )
}
