"use client"

import { useEffect, useState } from "react"

interface NeonProgressProps {
  value: number
  duration?: number
  className?: string
  label?: string
}

export function NeonProgress({ value, duration = 2000, className = "", label }: NeonProgressProps) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(eased * value)
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }, [value, duration])

  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-sans uppercase tracking-widest text-muted-foreground">{label}</span>
          <span className="text-xs font-display neon-text">{Math.round(current)}%</span>
        </div>
      )}
      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-100"
          style={{
            width: `${current}%`,
            background: "linear-gradient(90deg, #00B8C5, #00E5F5)",
            boxShadow: "0 0 10px rgba(0, 229, 245, 0.5), 0 0 30px rgba(0, 229, 245, 0.2)",
          }}
        />
      </div>
    </div>
  )
}
