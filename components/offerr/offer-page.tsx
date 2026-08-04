"use client"

import { useState, useEffect, useRef } from "react"
import { NeonProgress } from "./neon-progress"
import { TrendingUp, MapPin, Home, DollarSign, BarChart3, Clock, ArrowRight, Brain } from "lucide-react"

interface OfferPageProps { address: string; onGenerateContract: () => void }

/* ───── Odometer Number ───── */
function OdometerNumber({ target, duration = 2800, prefix = "" }: { target: number; duration?: number; prefix?: string }) {
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 4)
      setCurrent(Math.round(eased * target))
      if (p < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [target, duration])

  const formatted = current.toLocaleString()
  return (
    <span className="inline-flex items-baseline">
      {prefix && <span>{prefix}</span>}
      {formatted.split("").map((char, i) => (
        <span key={`${i}-${char}`} className="inline-block" style={{ animation: `odometer-digit 0.3s ease-out ${i * 0.04}s both` }}>
          {char}
        </span>
      ))}
    </span>
  )
}

/* ───── Confidence Ring with Computation Arcs ───── */
function ConfidenceRing({ value, size = 150 }: { value: number; size?: number }) {
  const [current, setCurrent] = useState(0)
  const strokeWidth = 5
  const r = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * r

  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const p = Math.min((now - start) / 2500, 1)
      setCurrent((1 - Math.pow(1 - p, 3)) * value)
      if (p < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [value])

  const offset = circumference - (current / 100) * circumference

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Outer computation ring */}
      <svg width={size} height={size} className="absolute animate-ring-spin" style={{ animationDuration: "30s" }}>
        <circle cx={size / 2} cy={size / 2} r={r + 12} fill="none" stroke="rgba(0,228,255,0.04)" strokeWidth={0.5} strokeDasharray="3 8" />
      </svg>
      <svg width={size} height={size} className="absolute" style={{ animation: "ring-spin 25s linear infinite reverse" }}>
        <circle cx={size / 2} cy={size / 2} r={r + 8} fill="none" stroke="rgba(0,228,255,0.03)" strokeWidth={0.5} strokeDasharray="5 12" />
      </svg>
      {/* Main ring */}
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,228,255,0.06)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#neonG)" strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.1s ease", filter: "drop-shadow(0 0 8px rgba(0,228,255,0.35))" }} />
        <defs>
          <linearGradient id="neonG" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00B8D4" /><stop offset="100%" stopColor="#00E4FF" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-3xl font-bold neon-text">{Math.round(current)}%</span>
        <span className="text-[8px] text-[#6C7A89]/50 font-mono uppercase tracking-wider mt-0.5">AI Consensus</span>
      </div>
    </div>
  )
}

/* ───── Market Sparkline (tiny inline chart) ───── */
function Sparkline({ data, color = "#00E4FF" }: { data: number[]; color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext("2d"); if (!ctx) return
    const dpr = 2; c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr; ctx.scale(dpr, dpr)
    const w = c.offsetWidth, h = c.offsetHeight
    const max = Math.max(...data), min = Math.min(...data)
    const range = max - min || 1
    ctx.beginPath()
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w, y = h - ((v - min) / range) * h * 0.8 - h * 0.1
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.stroke()
    // Fill below
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, color.replace(")", ",0.15)").replace("rgb", "rgba")); g.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = `${color}10`; ctx.fill()
  }, [data, color])
  return <canvas ref={canvasRef} className="w-full h-full" />
}

/* ───── Main Offer Page ───── */
export function OfferPage({ address, onGenerateContract }: OfferPageProps) {
  const [v, setV] = useState(false)
  const [cards, setCards] = useState(false)
  const [snap, setSnap] = useState(false)
  const [cta, setCta] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setV(true), 200)
    const t2 = setTimeout(() => setCards(true), 1000)
    const t3 = setTimeout(() => setSnap(true), 1600)
    const t4 = setTimeout(() => setCta(true), 2400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [])

  const marketData = [
    { label: "Median Sale Price", value: "$312,000", icon: DollarSign, change: "+4.2%", sparkData: [280, 290, 285, 295, 305, 310, 308, 312] },
    { label: "Avg Days on Market", value: "18 days", icon: Clock, change: "-12%", sparkData: [32, 28, 25, 22, 20, 19, 18, 18] },
    { label: "Price per Sq Ft", value: "$178", icon: Home, change: "+6.1%", sparkData: [155, 158, 162, 165, 170, 172, 175, 178] },
    { label: "Absorption Rate", value: "2.4 months", icon: BarChart3, change: "-8%", sparkData: [3.5, 3.2, 3.0, 2.8, 2.7, 2.5, 2.4, 2.4] },
  ]

  return (
    <div className="min-h-screen bg-[#04070A] relative">
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `linear-gradient(rgba(0,228,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(0,228,255,0.012) 1px, transparent 1px)`, backgroundSize: "60px 60px" }}
        aria-hidden="true" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center top, rgba(0,228,255,0.04) 0%, transparent 55%)" }} aria-hidden="true" />

      <div className="relative max-w-2xl mx-auto px-4 py-10 md:py-16">
        {/* Header */}
        <div className={`text-center mb-8 transition-all duration-700 ease-out ${v ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-card text-[10px] font-mono text-neon/70 mb-3 uppercase tracking-wider">
            <div className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse" />
            AI Analysis Complete
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-[#F8F9FA] mb-2">Your Cash Offer</h1>
          <div className="flex items-center justify-center gap-2 text-xs text-[#6C7A89]/60 font-mono">
            <MapPin size={12} className="text-neon/40" /><span>{address}</span>
          </div>
        </div>

        {/* Main offer card */}
        <div className={`mb-8 transition-all duration-1000 delay-200 ${v ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-6 scale-[0.98]"}`}
          style={{ transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
          <div className="glass-card-strong rounded-2xl p-6 md:p-8 relative overflow-hidden">
            {/* Shimmer */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
              <div className="absolute inset-y-0 w-1/4 animate-shimmer-sweep"
                style={{ background: "linear-gradient(90deg, transparent, rgba(0,228,255,0.025), transparent)" }} />
            </div>

            <div className="relative flex flex-col items-center">
              <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-[#6C7A89]/50 mb-5">Estimated Cash Offer</p>

              {/* Glowing offer number with computation rings */}
              <div className="relative mb-5">
                <div className="absolute -inset-8 rounded-full pointer-events-none"
                  style={{ background: "radial-gradient(ellipse, rgba(0,228,255,0.07) 0%, transparent 65%)" }} aria-hidden="true" />
                <div className="font-display text-5xl md:text-7xl font-bold neon-text-strong relative">
                  <OdometerNumber target={287500} prefix="$" duration={3000} />
                </div>
              </div>

              {/* Low/Mid/High staggered */}
              <div className="flex items-center justify-center gap-6 md:gap-8 mb-6">
                {[{ label: "Low", value: "$272,000" }, { label: "Mid", value: "$287,500" }, { label: "High", value: "$305,000" }].map((item, i) => (
                  <div key={item.label} className={`text-center transition-all duration-600 ${v ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
                    style={{ transitionDelay: `${1 + i * 0.15}s` }}>
                    <p className="text-[10px] text-[#6C7A89]/40 font-sans uppercase tracking-wider mb-1">{item.label}</p>
                    <p className="font-display font-semibold text-[#F8F9FA] text-sm md:text-base">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Confidence ring + AI badge */}
              <div className="flex flex-col items-center gap-3">
                <ConfidenceRing value={94} />
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neon/[0.06] border border-neon/[0.12]">
                  <Brain size={10} className="text-neon/60" />
                  <span className="text-[9px] font-mono text-neon/50">AI Consensus: 94%</span>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-4 w-full mt-6 pt-5 border-t border-[rgba(0,228,255,0.06)]">
                {[{ label: "ARV", value: "$345,000" }, { label: "Est. Repairs", value: "$32,500" }, { label: "Net Profit", value: "$25,000" }].map((s, i) => (
                  <div key={s.label} className={`text-center transition-all duration-500 ${cards ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
                    style={{ transitionDelay: `${i * 0.1}s` }}>
                    <p className="text-[9px] text-[#6C7A89]/35 font-mono uppercase tracking-wider mb-1">{s.label}</p>
                    <p className="font-display font-semibold text-[#F8F9FA] text-sm">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Market Snapshot with sparklines */}
        <div className="mb-8">
          <h2 className={`font-display text-sm font-semibold text-[#F8F9FA]/80 mb-3 uppercase tracking-wider transition-opacity duration-600 ${snap ? "opacity-100" : "opacity-0"}`}>Market Snapshot</h2>
          <div className="grid grid-cols-2 gap-3">
            {marketData.map((item, i) => (
              <div key={item.label} className={`glass-card-hover rounded-xl p-4 relative overflow-hidden transition-all duration-600 ${snap ? "opacity-100 translate-x-0" : `opacity-0 ${i % 2 === 0 ? "-translate-x-5" : "translate-x-5"}`}`}
                style={{ transitionDelay: `${i * 0.08}s`, transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)" }}>
                {/* Background sparkline */}
                <div className="absolute bottom-0 left-0 right-0 h-10 opacity-30 pointer-events-none">
                  <Sparkline data={item.sparkData} color={item.change.startsWith("+") ? "#14FFA1" : "#00E4FF"} />
                </div>
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <item.icon size={12} className="text-neon/45" />
                    <span className="text-[10px] text-[#6C7A89]/45 font-sans">{item.label}</span>
                  </div>
                  <div className="font-display font-semibold text-[#F8F9FA] text-base">{item.value}</div>
                  <div className={`text-[10px] mt-1 font-mono ${item.change.startsWith("+") ? "text-[#14FFA1]/70" : "text-neon/50"}`}>
                    <TrendingUp size={9} className="inline mr-1" />{item.change} YoY
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Valuation Breakdown with confidence tags */}
        <div className={`mb-10 transition-all duration-700 ease-out ${cards ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <h2 className="font-display text-sm font-semibold text-[#F8F9FA]/80 mb-3 uppercase tracking-wider">Valuation Breakdown</h2>
          <div className="space-y-2.5">
            {[
              { label: "Comparable Sales Analysis", value: 96, tag: "Strong" },
              { label: "Location Score", value: 88, tag: "Strong" },
              { label: "Market Trend Alignment", value: 91, tag: "Strong" },
              { label: "Investment Viability", value: 85, tag: "Moderate" },
            ].map((m, i) => (
              <div key={m.label} className="glass-card rounded-xl px-4 py-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-sans uppercase tracking-widest text-[#6C7A89]">{m.label}</span>
                  <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full ${m.tag === "Strong" ? "bg-[#14FFA1]/8 text-[#14FFA1]/60 border border-[#14FFA1]/15" : "bg-neon/8 text-neon/50 border border-neon/15"}`}>{m.tag}</span>
                </div>
                <NeonProgress value={m.value} duration={2000 + i * 300} />
              </div>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className={`flex items-center justify-center gap-3 mb-8 transition-opacity duration-600 ${cta ? "opacity-100" : "opacity-0"}`}>
          {["View Formula Breakdown", "See Market Rationale"].map((label) => (
            <button key={label} className="px-3 py-2 rounded-lg glass-card text-[10px] font-mono text-neon/50 hover:text-neon/70 hover:border-neon/20 transition-all duration-300 min-h-[36px]">
              {label}
            </button>
          ))}
        </div>

        {/* CTA */}
        <div className={`text-center transition-all duration-700 ease-out ${cta ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button onClick={onGenerateContract}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-display font-semibold text-base bg-neon text-[#04070A] animate-breathe hover:shadow-[0_0_45px_rgba(0,228,255,0.4)] active:scale-[0.97] transition-all duration-300 min-h-[52px]">
            Generate Contract<ArrowRight size={18} />
          </button>
          <p className="text-[10px] text-[#6C7A89]/25 mt-3 font-mono">Powered by SignPro.ai</p>
        </div>
      </div>
    </div>
  )
}
