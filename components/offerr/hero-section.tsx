"use client"

import { useState, useEffect, useRef } from "react"
import { Search } from "lucide-react"

interface HeroSectionProps {
  onSearch: (address: string) => void
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

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 100)
    const t2 = setTimeout(() => {
      setLogoVisible(true)
      setLogoPulsed(true)
    }, 400)
    const t3 = setTimeout(() => setLogoPulsed(false), 1200)
    const t4 = setTimeout(() => setTextVisible(true), 900)
    const t5 = setTimeout(() => setSearchVisible(true), 1500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearTimeout(t5)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (address.trim()) {
      onSearch(address.trim())
    }
  }

  return (
    <section
      className="relative flex flex-col items-center justify-center min-h-screen px-4 py-20"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}
    >
      {/* Grid overlay */}
      <div
        className="absolute inset-0 animate-grid-fade pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 229, 245, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 229, 245, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
        aria-hidden="true"
      />

      {/* Radial glow behind logo */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(0, 229, 245, 0.06) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Logo */}
      <div
        className="relative mb-8"
        style={{
          opacity: logoVisible ? 1 : 0,
          transform: logoPulsed ? "scale(1.08)" : "scale(1)",
          transition: "opacity 0.6s ease, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight">
          <span className="neon-text">Offerr</span>
          <span className="text-muted-foreground">.ai</span>
        </h1>
        {logoPulsed && (
          <div
            className="absolute inset-0 rounded-lg pointer-events-none"
            style={{
              boxShadow: "0 0 60px rgba(0, 229, 245, 0.3), 0 0 120px rgba(0, 229, 245, 0.1)",
            }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Subtitle */}
      <div
        className="text-center mb-12 max-w-xl"
        style={{
          opacity: textVisible ? 1 : 0,
          transform: textVisible ? "translateY(0)" : "translateY(16px)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
        }}
      >
        <p className="text-lg md:text-xl text-muted-foreground font-sans leading-relaxed">
          Instant AI-powered cash offers for any property.
          <br />
          <span className="text-foreground font-medium">Analyze. Value. Close.</span>
        </p>
      </div>

      {/* Search bar */}
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg"
        style={{
          opacity: searchVisible ? 1 : 0,
          transform: searchVisible ? "translateY(0) scaleX(1)" : "translateY(10px) scaleX(0.9)",
          transition: "opacity 0.6s ease, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <div
          className={`relative flex items-center rounded-xl border transition-all duration-500 ${
            searchFocused
              ? "neon-border-strong bg-[#0F0F0F]"
              : "border-[rgba(0,229,245,0.15)] bg-[#111111]"
          }`}
          style={{
            transform: searchFocused ? "scale(1.02)" : "scale(1)",
            transition: "transform 0.3s ease, box-shadow 0.5s ease, border-color 0.5s ease",
          }}
        >
          <Search
            className={`ml-4 transition-colors duration-300 ${
              searchFocused ? "text-neon" : "text-muted-foreground"
            }`}
            size={20}
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Enter any property address..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="flex-1 bg-transparent px-4 py-4 md:py-5 text-base md:text-lg font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            aria-label="Property address"
          />
          <button
            type="submit"
            className="mr-2 px-5 py-2.5 md:px-6 md:py-3 rounded-lg font-display font-semibold text-sm tracking-wide transition-all duration-300 bg-neon text-[#0A0A0A] hover:shadow-[0_0_30px_rgba(0,229,245,0.4)] active:scale-95 min-h-[44px]"
            style={{
              boxShadow: searchFocused
                ? "0 0 20px rgba(0, 229, 245, 0.3)"
                : "none",
            }}
          >
            Analyze
          </button>
        </div>

        {/* Decorative hint */}
        <p
          className="text-center text-xs text-muted-foreground/40 mt-3 font-sans transition-opacity duration-500"
          style={{ opacity: searchVisible ? 1 : 0 }}
        >
          Try: 123 Main Street, Austin TX 78701
        </p>
      </form>

      {/* Stats bar */}
      <div
        className="flex flex-wrap items-center justify-center gap-6 md:gap-10 mt-16"
        style={{
          opacity: searchVisible ? 1 : 0,
          transform: searchVisible ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 1s ease 0.3s, transform 1s ease 0.3s",
        }}
      >
        {[
          { value: "2.4M+", label: "Properties Analyzed" },
          { value: "<3s", label: "Avg. Offer Time" },
          { value: "97.8%", label: "Accuracy Rate" },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="font-display text-xl md:text-2xl font-bold neon-text">{stat.value}</div>
            <div className="text-xs text-muted-foreground/60 mt-1 font-sans">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        style={{
          opacity: searchVisible ? 0.4 : 0,
          transition: "opacity 1s ease 0.6s",
        }}
      >
        <div className="w-5 h-8 rounded-full border border-muted-foreground/30 flex items-start justify-center p-1">
          <div
            className="w-1 h-2 rounded-full bg-neon"
            style={{ animation: "float 2s ease-in-out infinite" }}
          />
        </div>
      </div>
    </section>
  )
}
