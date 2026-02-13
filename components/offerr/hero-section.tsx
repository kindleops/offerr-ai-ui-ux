"use client"

import { useState, useEffect, useRef } from "react"
import { Search } from "lucide-react"

interface HeroSectionProps {
  onSearch: (address: string) => void
}

function useTypingPlaceholder(phrases: string[], speed = 60, pause = 2000) {
  const [text, setText] = useState("")
  const [phraseIdx, setPhraseIdx] = useState(0)

  useEffect(() => {
    let i = 0
    let typing = true
    let timeout: ReturnType<typeof setTimeout>

    const step = () => {
      const phrase = phrases[phraseIdx]
      if (typing) {
        if (i <= phrase.length) {
          setText(phrase.slice(0, i))
          i++
          timeout = setTimeout(step, speed)
        } else {
          typing = false
          timeout = setTimeout(step, pause)
        }
      } else {
        if (i > 0) {
          i--
          setText(phrase.slice(0, i))
          timeout = setTimeout(step, speed / 2)
        } else {
          typing = true
          setPhraseIdx((p) => (p + 1) % phrases.length)
        }
      }
    }
    timeout = setTimeout(step, 600)
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

  const placeholder = useTypingPlaceholder([
    "1234 Oak Street, Austin TX 78701",
    "5678 Maple Ave, Dallas TX 75201",
    "910 Pine Blvd, Miami FL 33101",
  ])

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 100)
    const t2 = setTimeout(() => {
      setLogoVisible(true)
      setLogoPulsed(true)
    }, 400)
    const t3 = setTimeout(() => setLogoPulsed(false), 1400)
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
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.8s ease" }}
    >
      {/* Grid overlay */}
      <div
        className="absolute inset-0 animate-grid-fade pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 229, 245, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 229, 245, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
        aria-hidden="true"
      />

      {/* Central radial glow */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(0, 229, 245, 0.05) 0%, rgba(0, 180, 200, 0.02) 40%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Scan line */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute left-0 right-0 h-px scan-line"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(0,229,245,0.06) 20%, rgba(0,229,245,0.12) 50%, rgba(0,229,245,0.06) 80%, transparent 100%)",
          }}
        />
      </div>

      {/* Logo */}
      <div
        className="relative mb-6"
        style={{
          opacity: logoVisible ? 1 : 0,
          transform: logoPulsed ? "scale(1.06)" : "scale(1)",
          transition:
            "opacity 0.8s ease, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight">
          <span className="neon-text-strong">Offerr</span>
          <span className="text-muted-foreground/60">.ai</span>
        </h1>
        {logoPulsed && (
          <div
            className="absolute -inset-8 rounded-3xl pointer-events-none"
            style={{
              boxShadow:
                "0 0 80px rgba(0, 229, 245, 0.2), 0 0 160px rgba(0, 229, 245, 0.06)",
            }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Tagline */}
      <div
        className="text-center mb-10 max-w-md"
        style={{
          opacity: textVisible ? 1 : 0,
          transform: textVisible ? "translateY(0)" : "translateY(14px)",
          transition: "opacity 1s ease, transform 1s ease",
        }}
      >
        <p className="text-base md:text-lg text-muted-foreground font-sans leading-relaxed">
          Institutional-grade AI valuation engine.
        </p>
        <p className="text-sm text-muted-foreground/50 font-sans mt-1">
          Analyze. Value. Close.
        </p>
      </div>

      {/* Search bar */}
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg"
        style={{
          opacity: searchVisible ? 1 : 0,
          transform: searchVisible
            ? "translateY(0) scaleX(1)"
            : "translateY(8px) scaleX(0.95)",
          transition:
            "opacity 0.8s ease, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Animated gradient glow behind search bar */}
        <div
          className="absolute -inset-1 rounded-2xl pointer-events-none transition-opacity duration-700"
          style={{
            opacity: searchFocused ? 1 : 0.3,
            background:
              "linear-gradient(135deg, rgba(0,229,245,0.12), rgba(0,180,200,0.04), rgba(0,229,245,0.08))",
            filter: "blur(16px)",
          }}
          aria-hidden="true"
        />

        <div
          className={`relative flex items-center rounded-xl border transition-all duration-500 ${
            searchFocused
              ? "neon-border-strong bg-[#0C0C0C]"
              : "border-[rgba(0,229,245,0.12)] bg-[#0E0E0E]"
          }`}
          style={{
            transform: searchFocused ? "scale(1.02)" : "scale(1)",
            transition:
              "transform 0.3s ease, box-shadow 0.5s ease, border-color 0.5s ease",
          }}
        >
          <Search
            className={`ml-4 transition-colors duration-300 flex-shrink-0 ${
              searchFocused ? "text-neon" : "text-muted-foreground/40"
            }`}
            size={18}
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            placeholder={address ? "" : placeholder}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="flex-1 bg-transparent px-4 py-4 md:py-5 text-base md:text-lg font-sans text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
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

        <p
          className="text-center text-[11px] text-muted-foreground/30 mt-3 font-mono transition-opacity duration-500"
          style={{ opacity: searchVisible ? 1 : 0 }}
        >
          Enter any U.S. property address
        </p>
      </form>

      {/* Stats */}
      <div
        className="flex flex-wrap items-center justify-center gap-8 md:gap-12 mt-14"
        style={{
          opacity: searchVisible ? 1 : 0,
          transform: searchVisible ? "translateY(0)" : "translateY(16px)",
          transition: "opacity 1s ease 0.3s, transform 1s ease 0.3s",
        }}
      >
        {[
          { value: "2.4M+", label: "Properties Analyzed" },
          { value: "<3s", label: "Avg. Offer Time" },
          { value: "97.8%", label: "Accuracy Rate" },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="font-display text-xl md:text-2xl font-bold neon-text">
              {stat.value}
            </div>
            <div className="text-[10px] text-muted-foreground/40 mt-1 font-sans uppercase tracking-wider">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom fade indicator */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center"
        style={{
          opacity: searchVisible ? 0.3 : 0,
          transition: "opacity 1s ease 0.8s",
        }}
      >
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-neon/20 to-transparent" />
      </div>
    </section>
  )
}
