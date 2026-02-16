"use client"

import { useState, useEffect, useRef } from "react"
import { Search } from "lucide-react"

interface HeroSectionProps {
  onSearch: (address: string) => void
}

function useTypingPlaceholder(phrases: string[], speed = 55, pause = 2200) {
  const [text, setText] = useState("")
  const [phraseIdx, setPhraseIdx] = useState(0)

  useEffect(() => {
    let i = 0
    let typing = true
    let timeout: ReturnType<typeof setTimeout>
    const step = () => {
      const phrase = phrases[phraseIdx]
      if (typing) {
        if (i <= phrase.length) { setText(phrase.slice(0, i)); i++; timeout = setTimeout(step, speed) }
        else { typing = false; timeout = setTimeout(step, pause) }
      } else {
        if (i > 0) { i--; setText(phrase.slice(0, i)); timeout = setTimeout(step, speed / 2.5) }
        else { typing = true; setPhraseIdx((p) => (p + 1) % phrases.length) }
      }
    }
    timeout = setTimeout(step, 700)
    return () => clearTimeout(timeout)
  }, [phraseIdx, phrases, speed, pause])

  return text
}

export function HeroSection({ onSearch }: HeroSectionProps) {
  const [visible, setVisible] = useState(false)
  const [logoVisible, setLogoVisible] = useState(false)
  const [textVisible, setTextVisible] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [address, setAddress] = useState("")
  const [logoPulsed, setLogoPulsed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const ringCanvasRef = useRef<HTMLCanvasElement>(null)

  const placeholder = useTypingPlaceholder([
    "1234 Oak Street, Austin TX 78701",
    "5678 Maple Ave, Dallas TX 75201",
    "910 Pine Blvd, Miami FL 33101",
    "2200 Lake Dr, Denver CO 80202",
  ])

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 100)
    const t2 = setTimeout(() => { setLogoVisible(true); setLogoPulsed(true) }, 500)
    const t3 = setTimeout(() => setLogoPulsed(false), 1500)
    const t4 = setTimeout(() => setTextVisible(true), 1100)
    const t5 = setTimeout(() => setSearchVisible(true), 1700)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5) }
  }, [])

  /* Computation rings behind search */
  useEffect(() => {
    const canvas = ringCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let frame: number
    const start = performance.now()
    const resize = () => { canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; ctx.scale(2, 2) }
    resize()
    const animate = () => {
      const t = (performance.now() - start) / 1000
      const w = canvas.offsetWidth; const h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2; const cy = h / 2
      for (let i = 0; i < 3; i++) {
        const r = 60 + i * 40
        ctx.beginPath()
        const startA = t * (0.3 + i * 0.15) + i * 1.2
        ctx.arc(cx, cy, r, startA, startA + Math.PI * (0.8 + Math.sin(t + i) * 0.3))
        ctx.strokeStyle = `rgba(0, 228, 255, ${0.04 - i * 0.008})`
        ctx.lineWidth = 0.6
        ctx.stroke()
      }
      frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (address.trim()) onSearch(address.trim())
  }

  return (
    <section
      className={`relative flex flex-col items-center justify-center min-h-screen px-4 py-20 transition-opacity duration-1000 ease-out ${visible ? "opacity-100" : "opacity-0"}`}
    >
      {/* Grid overlay */}
      <div
        className="absolute inset-0 animate-grid-fade pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(0,228,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,228,255,0.025) 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
        }}
        aria-hidden="true"
      />

      {/* Deep radial glow */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(0,228,255,0.045) 0%, rgba(0,180,220,0.015) 35%, transparent 65%)" }}
        aria-hidden="true"
      />

      {/* Scan line */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute left-0 right-0 h-px scan-line"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(0,228,255,0.05) 15%, rgba(0,228,255,0.1) 50%, rgba(0,228,255,0.05) 85%, transparent 100%)" }}
        />
      </div>

      {/* Logo */}
      <div
        className={`relative mb-8 transition-all duration-1000 ${logoVisible ? "opacity-100" : "opacity-0"} ${logoPulsed ? "scale-105" : "scale-100"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}
      >
        <h1 className="font-display text-6xl md:text-8xl lg:text-9xl font-bold tracking-tight">
          <span className="neon-text-strong">Offerr</span>
          <span className="text-muted-foreground/40">.ai</span>
        </h1>
        {logoPulsed && (
          <div
            className="absolute -inset-10 rounded-3xl pointer-events-none"
            style={{ boxShadow: "0 0 100px rgba(0,228,255,0.15), 0 0 200px rgba(0,228,255,0.04)" }}
            aria-hidden="true"
          />
        )}
        {/* Subtle ring behind logo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-neon/[0.04] animate-ring-spin pointer-events-none" aria-hidden="true" />
      </div>

      {/* Tagline */}
      <div
        className={`text-center mb-12 max-w-md transition-all duration-1000 ease-out ${textVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3.5"}`}
      >
        <p className="text-lg md:text-xl text-[#6C7A89] font-sans leading-relaxed">
          Institutional-grade AI valuation engine.
        </p>
        <p className="text-xs text-[#6C7A89]/50 font-mono mt-2 tracking-[0.25em] uppercase">
          Analyze. Value. Close.
        </p>
      </div>

      {/* Search bar with computation ring canvas behind it */}
      <form onSubmit={handleSubmit}
        className={`relative w-full max-w-lg transition-all duration-700 ${searchVisible ? "opacity-100 translate-y-0 scale-x-100" : "opacity-0 translate-y-2 scale-x-[0.96]"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}
      >
        <canvas
          ref={ringCanvasRef}
          className="absolute -inset-16 w-[calc(100%+128px)] h-[calc(100%+128px)] pointer-events-none opacity-60"
          aria-hidden="true"
        />

        {/* Animated gradient glow */}
        <div
          className={`absolute -inset-1.5 rounded-2xl pointer-events-none transition-opacity duration-700 ${searchFocused ? "opacity-100" : "opacity-20"}`}
          style={{
            background: "linear-gradient(135deg, rgba(0,228,255,0.1), rgba(20,255,161,0.03), rgba(0,228,255,0.07))",
            filter: "blur(20px)",
          }}
          aria-hidden="true"
        />

        <div
          className={`relative flex items-center rounded-xl border transition-all duration-500 ${searchFocused ? "neon-border-strong bg-[#080C10] scale-[1.02]" : "border-[rgba(0,228,255,0.08)] bg-[#0A0E14] scale-100"}`}
        >
          <Search
            className={`ml-4 transition-colors duration-300 flex-shrink-0 ${searchFocused ? "text-neon" : "text-[#6C7A89]/40"}`}
            size={18} aria-hidden="true"
          />
          <input
            ref={inputRef} type="text"
            placeholder={address ? "" : placeholder}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="flex-1 bg-transparent px-4 py-4 md:py-5 text-base md:text-lg font-sans text-[#F8F9FA] placeholder:text-[#6C7A89]/30 focus:outline-none"
            aria-label="Property address"
          />
          <button
            type="submit"
            className="mr-2 px-6 py-2.5 md:px-7 md:py-3 rounded-lg font-display font-semibold text-sm tracking-wide transition-all duration-300 bg-neon text-[#04070A] hover:shadow-[0_0_30px_rgba(0,228,255,0.35)] active:scale-95 min-h-[44px]"
            style={{ boxShadow: searchFocused ? "0 0 25px rgba(0,228,255,0.25)" : "none" }}
          >
            Analyze
          </button>
        </div>

        <p className={`text-center text-[11px] text-[#6C7A89]/25 mt-3 font-mono transition-opacity duration-500 ${searchVisible ? "opacity-100" : "opacity-0"}`}>
          Enter any U.S. property address
        </p>
      </form>

      {/* Stats row */}
      <div
        className={`flex flex-wrap items-center justify-center gap-10 md:gap-14 mt-16 transition-all duration-1000 delay-[400ms] ${searchVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
      >
        {[
          { value: "2.4M+", label: "Properties Analyzed" },
          { value: "<3s", label: "Avg. Offer Time" },
          { value: "97.8%", label: "Accuracy Rate" },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="font-display text-xl md:text-2xl font-bold neon-text">{stat.value}</div>
            <div className="text-[10px] text-[#6C7A89]/35 mt-1 font-sans uppercase tracking-wider">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Bottom fade line */}
      <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center transition-opacity duration-1000 delay-1000 ${searchVisible ? "opacity-25" : "opacity-0"}`}>
        <div className="w-px h-10 bg-gradient-to-b from-transparent via-neon/15 to-transparent" />
      </div>
    </section>
  )
}
