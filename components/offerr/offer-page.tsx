"use client"

import { useState, useEffect, useRef } from "react"
import { NeonProgress } from "./neon-progress"
import { TrendingUp, MapPin, Home, DollarSign, BarChart3, Clock, ArrowRight } from "lucide-react"

interface OfferPageProps {
  address: string
  onGenerateContract: () => void
}

function AnimatedNumber({ target, duration = 2000, prefix = "", suffix = "" }: {
  target: number
  duration?: number
  prefix?: string
  suffix?: string
}) {
  const [current, setCurrent] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(eased * target))
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setDone(true)
      }
    }
    requestAnimationFrame(animate)
  }, [target, duration])

  return (
    <span className={done ? "animate-pulse-glow rounded-lg" : ""}>
      {prefix}{current.toLocaleString()}{suffix}
    </span>
  )
}

export function OfferPage({ address, onGenerateContract }: OfferPageProps) {
  const [visible, setVisible] = useState(false)
  const [cardsVisible, setCardsVisible] = useState(false)
  const [snapshotVisible, setSnapshotVisible] = useState(false)
  const [ctaVisible, setCtaVisible] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 200)
    const t2 = setTimeout(() => setCardsVisible(true), 800)
    const t3 = setTimeout(() => setSnapshotVisible(true), 1400)
    const t4 = setTimeout(() => setCtaVisible(true), 2000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [])

  const marketData = [
    { label: "Median Sale Price", value: "$312,000", icon: DollarSign, change: "+4.2%" },
    { label: "Avg Days on Market", value: "18 days", icon: Clock, change: "-12%" },
    { label: "Price per Sq Ft", value: "$178", icon: Home, change: "+6.1%" },
    { label: "Absorption Rate", value: "2.4 months", icon: BarChart3, change: "-8%" },
  ]

  return (
    <div className="min-h-screen bg-[#0A0A0A] relative">
      {/* Background elements */}
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

      {/* Radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center top, rgba(0, 229, 245, 0.06) 0%, transparent 60%)",
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-3xl mx-auto px-4 py-12 md:py-20">
        {/* Header */}
        <div
          className="text-center mb-10"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.8s ease",
          }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-card text-xs font-sans text-neon/80 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse" />
            AI Analysis Complete
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            Your Cash Offer
          </h1>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <MapPin size={14} className="text-neon/60" />
            <span>{address}</span>
          </div>
        </div>

        {/* Main offer card */}
        <div
          className="mb-8"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0) scale(1)" : "translateY(30px) scale(0.97)",
            transition: "all 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s",
          }}
        >
          <div className="glass-card-strong rounded-2xl p-6 md:p-10 text-center">
            <p className="text-xs font-sans uppercase tracking-[0.3em] text-muted-foreground mb-4">
              Estimated Cash Offer
            </p>
            <div className="font-display text-5xl md:text-7xl font-bold neon-text mb-4">
              <AnimatedNumber target={287500} prefix="$" duration={2500} />
            </div>

            {/* Offer range */}
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground mb-6">
              <span>Low: $272,000</span>
              <div className="w-px h-4 bg-border" />
              <span>Mid: $287,500</span>
              <div className="w-px h-4 bg-border" />
              <span>High: $305,000</span>
            </div>

            {/* Confidence bar */}
            <NeonProgress value={94} duration={3000} label="Confidence Score" className="max-w-sm mx-auto" />

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-[rgba(0,229,245,0.1)]">
              {[
                { label: "ARV", value: "$345,000" },
                { label: "Est. Repairs", value: "$32,500" },
                { label: "Net Profit", value: "$25,000" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="text-xs text-muted-foreground/60 font-sans mb-1">{stat.label}</p>
                  <p className="font-display font-semibold text-foreground text-sm md:text-base">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Market Snapshot Cards */}
        <div className="mb-8">
          <h2
            className="font-display text-lg font-semibold text-foreground mb-4"
            style={{
              opacity: snapshotVisible ? 1 : 0,
              transition: "opacity 0.6s ease",
            }}
          >
            Market Snapshot
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {marketData.map((item, i) => (
              <div
                key={item.label}
                className="glass-card rounded-xl p-4 group hover:neon-border transition-all duration-300"
                style={{
                  opacity: snapshotVisible ? 1 : 0,
                  transform: snapshotVisible ? "translateX(0)" : `translateX(${i % 2 === 0 ? "-" : ""}30px)`,
                  transition: `all 0.6s ease ${i * 0.1}s`,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <item.icon size={14} className="text-neon/60" />
                  <span className="text-xs text-muted-foreground font-sans">{item.label}</span>
                </div>
                <div className="font-display font-semibold text-foreground text-base md:text-lg">{item.value}</div>
                <div className={`text-xs mt-1 font-sans ${item.change.startsWith("+") ? "text-emerald-400" : "text-neon/70"}`}>
                  <TrendingUp size={10} className="inline mr-1" />
                  {item.change}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div
          className="mb-10"
          style={{
            opacity: cardsVisible ? 1 : 0,
            transform: cardsVisible ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.8s ease",
          }}
        >
          <h2 className="font-display text-lg font-semibold text-foreground mb-4">Valuation Breakdown</h2>
          <div className="space-y-3">
            {[
              { label: "Comparable Sales Analysis", value: 96 },
              { label: "Location Score", value: 88 },
              { label: "Market Trend Alignment", value: 91 },
              { label: "Investment Viability", value: 85 },
            ].map((metric, i) => (
              <div key={metric.label} className="glass-card rounded-xl p-4">
                <NeonProgress
                  value={metric.value}
                  duration={2000 + i * 300}
                  label={metric.label}
                />
              </div>
            ))}
          </div>
        </div>

        {/* CTA Button */}
        <div
          className="text-center"
          style={{
            opacity: ctaVisible ? 1 : 0,
            transform: ctaVisible ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.8s ease",
          }}
        >
          <button
            onClick={onGenerateContract}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-display font-semibold text-lg bg-neon text-[#0A0A0A] animate-breathe hover:shadow-[0_0_40px_rgba(0,229,245,0.5)] active:scale-95 transition-all duration-300 min-h-[52px]"
          >
            Generate Contract
            <ArrowRight size={20} />
          </button>
          <p className="text-xs text-muted-foreground/40 mt-3 font-sans">
            Powered by SignPro.ai
          </p>
        </div>
      </div>
    </div>
  )
}
