"use client"

import { useState, useEffect, useRef } from "react"
import { NeonProgress } from "./neon-progress"
import {
  TrendingUp,
  MapPin,
  Home,
  DollarSign,
  BarChart3,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

interface OfferPageProps {
  address: string
  onGenerateContract: () => void
}

/* ───── Animated Number ───── */

function AnimatedNumber({
  target,
  duration = 2000,
  prefix = "",
  suffix = "",
}: {
  target: number
  duration?: number
  prefix?: string
  suffix?: string
}) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [target, duration])

  return (
    <span>
      {prefix}
      {current.toLocaleString()}
      {suffix}
    </span>
  )
}

/* ───── Circular Confidence Ring ───── */

function ConfidenceRing({
  value,
  size = 140,
}: {
  value: number
  size?: number
}) {
  const [current, setCurrent] = useState(0)
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / 2500, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(eased * value)
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [value])

  const offset = circumference - (current / 100) * circumference

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(0, 229, 245, 0.08)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#neonGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.1s ease", filter: "drop-shadow(0 0 6px rgba(0, 229, 245, 0.4))" }}
        />
        <defs>
          <linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00B8C5" />
            <stop offset="100%" stopColor="#00E5F5" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-3xl font-bold neon-text">
          {Math.round(current)}%
        </span>
        <span className="text-[9px] text-muted-foreground/50 font-sans uppercase tracking-wider mt-0.5">
          Confidence
        </span>
      </div>
    </div>
  )
}

/* ───── Staggered Value Display ───── */

function StaggeredValues({ items, visible }: { items: { label: string; value: string }[]; visible: boolean }) {
  return (
    <div className="flex items-center justify-center gap-6 md:gap-8">
      {items.map((item, i) => (
        <div
          key={item.label}
          className="text-center"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(12px)",
            transition: `all 0.6s ease ${0.8 + i * 0.15}s`,
          }}
        >
          <p className="text-[10px] text-muted-foreground/40 font-sans uppercase tracking-wider mb-1">
            {item.label}
          </p>
          <p className="font-display font-semibold text-foreground text-sm md:text-base">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  )
}

/* ───── Main Component ───── */

export function OfferPage({ address, onGenerateContract }: OfferPageProps) {
  const [visible, setVisible] = useState(false)
  const [cardsVisible, setCardsVisible] = useState(false)
  const [snapshotVisible, setSnapshotVisible] = useState(false)
  const [ctaVisible, setCtaVisible] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 200)
    const t2 = setTimeout(() => setCardsVisible(true), 900)
    const t3 = setTimeout(() => setSnapshotVisible(true), 1500)
    const t4 = setTimeout(() => setCtaVisible(true), 2200)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    }
  }, [])

  const marketData = [
    { label: "Median Sale Price", value: "$312,000", icon: DollarSign, change: "+4.2%" },
    { label: "Avg Days on Market", value: "18 days", icon: Clock, change: "-12%" },
    { label: "Price per Sq Ft", value: "$178", icon: Home, change: "+6.1%" },
    { label: "Absorption Rate", value: "2.4 months", icon: BarChart3, change: "-8%" },
  ]

  return (
    <div className="min-h-screen bg-[#060606] relative">
      {/* Grid bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 229, 245, 0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 229, 245, 0.015) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
        aria-hidden="true"
      />

      {/* Radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center top, rgba(0, 229, 245, 0.05) 0%, transparent 60%)",
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-2xl mx-auto px-4 py-10 md:py-16">
        {/* Header */}
        <div
          className="text-center mb-8"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(16px)",
            transition: "all 0.8s ease",
          }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-card text-[10px] font-mono text-neon/70 mb-3 uppercase tracking-wider">
            <div className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse" />
            AI Analysis Complete
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            Your Cash Offer
          </h1>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60 font-mono">
            <MapPin size={12} className="text-neon/40" />
            <span>{address}</span>
          </div>
        </div>

        {/* Main offer card */}
        <div
          className="mb-8"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0) scale(1)" : "translateY(24px) scale(0.98)",
            transition: "all 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s",
          }}
        >
          <div className="glass-card-strong rounded-2xl p-6 md:p-8 relative overflow-hidden">
            {/* Shimmer sweep */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
              <div
                className="absolute inset-y-0 w-1/3 animate-shimmer-sweep"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(0,229,245,0.03), transparent)",
                }}
              />
            </div>

            <div className="relative flex flex-col items-center">
              <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground/50 mb-5">
                Estimated Cash Offer
              </p>

              {/* Glowing offer amount */}
              <div className="relative mb-5">
                <div
                  className="absolute -inset-6 rounded-xl pointer-events-none"
                  style={{
                    background: "radial-gradient(ellipse, rgba(0,229,245,0.08) 0%, transparent 70%)",
                  }}
                  aria-hidden="true"
                />
                <div className="font-display text-5xl md:text-7xl font-bold neon-text-strong relative">
                  <AnimatedNumber target={287500} prefix="$" duration={2500} />
                </div>
              </div>

              {/* Low / Mid / High staggered */}
              <StaggeredValues
                visible={visible}
                items={[
                  { label: "Low", value: "$272,000" },
                  { label: "Mid", value: "$287,500" },
                  { label: "High", value: "$305,000" },
                ]}
              />

              {/* Confidence ring */}
              <div className="mt-6 mb-4">
                <ConfidenceRing value={94} />
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-4 w-full mt-4 pt-5 border-t border-[rgba(0,229,245,0.08)]">
                {[
                  { label: "ARV", value: "$345,000" },
                  { label: "Est. Repairs", value: "$32,500" },
                  { label: "Net Profit", value: "$25,000" },
                ].map((stat, i) => (
                  <div
                    key={stat.label}
                    className="text-center"
                    style={{
                      opacity: cardsVisible ? 1 : 0,
                      transform: cardsVisible ? "translateY(0)" : "translateY(8px)",
                      transition: `all 0.5s ease ${i * 0.1}s`,
                    }}
                  >
                    <p className="text-[9px] text-muted-foreground/40 font-mono uppercase tracking-wider mb-1">
                      {stat.label}
                    </p>
                    <p className="font-display font-semibold text-foreground text-sm">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Market Snapshot */}
        <div className="mb-8">
          <h2
            className="font-display text-sm font-semibold text-foreground/80 mb-3 uppercase tracking-wider"
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
                className="glass-card-hover rounded-xl p-4"
                style={{
                  opacity: snapshotVisible ? 1 : 0,
                  transform: snapshotVisible
                    ? "translateX(0)"
                    : `translateX(${i % 2 === 0 ? "-" : ""}24px)`,
                  transition: `all 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08}s`,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <item.icon size={13} className="text-neon/50" />
                  <span className="text-[10px] text-muted-foreground/50 font-sans">
                    {item.label}
                  </span>
                </div>
                <div className="font-display font-semibold text-foreground text-base">
                  {item.value}
                </div>
                <div
                  className={`text-[10px] mt-1 font-mono ${
                    item.change.startsWith("+")
                      ? "text-emerald-400/80"
                      : "text-neon/50"
                  }`}
                >
                  <TrendingUp size={9} className="inline mr-1" />
                  {item.change}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Valuation Breakdown */}
        <div
          className="mb-10"
          style={{
            opacity: cardsVisible ? 1 : 0,
            transform: cardsVisible ? "translateY(0)" : "translateY(16px)",
            transition: "all 0.8s ease",
          }}
        >
          <h2 className="font-display text-sm font-semibold text-foreground/80 mb-3 uppercase tracking-wider">
            Valuation Breakdown
          </h2>
          <div className="space-y-2.5">
            {[
              { label: "Comparable Sales Analysis", value: 96 },
              { label: "Location Score", value: 88 },
              { label: "Market Trend Alignment", value: 91 },
              { label: "Investment Viability", value: 85 },
            ].map((metric, i) => (
              <div key={metric.label} className="glass-card rounded-xl px-4 py-3.5">
                <NeonProgress
                  value={metric.value}
                  duration={2000 + i * 300}
                  label={metric.label}
                />
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div
          className="text-center"
          style={{
            opacity: ctaVisible ? 1 : 0,
            transform: ctaVisible ? "translateY(0)" : "translateY(16px)",
            transition: "all 0.8s ease",
          }}
        >
          <button
            onClick={onGenerateContract}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-display font-semibold text-base bg-neon text-[#0A0A0A] animate-breathe hover:shadow-[0_0_40px_rgba(0,229,245,0.5)] active:scale-[0.97] transition-all duration-300 min-h-[52px]"
          >
            Generate Contract
            <ArrowRight size={18} />
          </button>
          <p className="text-[10px] text-muted-foreground/30 mt-3 font-mono">
            Powered by SignPro.ai
          </p>
        </div>
      </div>
    </div>
  )
}
