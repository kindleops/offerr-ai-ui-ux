"use client"

import { useState, useEffect, useRef } from "react"
import { TypingText } from "./typing-text"
import { FileText, Shield, PenTool, Check, ArrowRight, Zap } from "lucide-react"

interface ContractPageProps {
  address: string
  onComplete: () => void
}

/* ───── Rotating Signature ───── */

function RotatingSignature() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = 100
    canvas.height = 100
    let frame: number
    const start = performance.now()

    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, 100, 100)
      const cx = 50
      const cy = 50

      // Outer ring
      ctx.beginPath()
      ctx.arc(cx, cy, 38, 0, Math.PI * 2)
      ctx.strokeStyle = "rgba(0, 229, 245, 0.1)"
      ctx.lineWidth = 0.8
      ctx.stroke()

      // Rotating arc
      const startAngle = t * 1.8
      ctx.beginPath()
      ctx.arc(cx, cy, 38, startAngle, startAngle + Math.PI * 0.6)
      ctx.strokeStyle = "rgba(0, 229, 245, 0.5)"
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Pen icon
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(Math.sin(t * 0.7) * 0.12)
      ctx.beginPath()
      ctx.moveTo(-6, 12)
      ctx.lineTo(0, -12)
      ctx.lineTo(6, 12)
      ctx.closePath()
      ctx.strokeStyle = "rgba(0, 229, 245, 0.6)"
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, 12)
      ctx.lineTo(0, 17)
      ctx.strokeStyle = "rgba(0, 229, 245, 0.8)"
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()

      // Glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 42)
      g.addColorStop(0, `rgba(0, 229, 245, ${0.04 + Math.sin(t * 2) * 0.02})`)
      g.addColorStop(1, "rgba(0, 229, 245, 0)")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 100, 100)

      frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={canvasRef} width={100} height={100} className="mx-auto" aria-hidden="true" />
}

/* ───── Document Hologram ───── */

function DocumentHologram() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = 360
    canvas.height = 440
    let frame: number
    const start = performance.now()

    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, 360, 440)

      const docX = 60
      const docY = 30
      const docW = 240
      const docH = 340

      // Glow
      ctx.shadowColor = "rgba(0, 229, 245, 0.1)"
      ctx.shadowBlur = 25
      ctx.strokeStyle = `rgba(0, 229, 245, ${0.15 + Math.sin(t * 0.8) * 0.04})`
      ctx.lineWidth = 0.8
      ctx.strokeRect(docX, docY, docW, docH)
      ctx.shadowBlur = 0

      // Corner fold
      ctx.beginPath()
      ctx.moveTo(docX + docW - 25, docY)
      ctx.lineTo(docX + docW, docY + 25)
      ctx.lineTo(docX + docW - 25, docY + 25)
      ctx.closePath()
      ctx.fillStyle = "rgba(0, 229, 245, 0.06)"
      ctx.fill()
      ctx.strokeStyle = "rgba(0, 229, 245, 0.12)"
      ctx.lineWidth = 0.5
      ctx.stroke()

      // Header
      ctx.fillStyle = "rgba(0, 229, 245, 0.25)"
      ctx.fillRect(docX + 20, docY + 22, 100, 2.5)
      ctx.fillStyle = "rgba(0, 229, 245, 0.1)"
      ctx.fillRect(docX + 20, docY + 32, 60, 1.5)

      // Divider
      ctx.fillStyle = "rgba(0, 229, 245, 0.06)"
      ctx.fillRect(docX + 20, docY + 48, docW - 40, 0.5)

      // Contract lines
      const totalLines = 16
      const linesFilled = Math.min(Math.floor(t * 2), totalLines)
      for (let i = 0; i < totalLines; i++) {
        const ly = docY + 60 + i * 17
        const lw = i % 3 === 2 ? docW - 100 : docW - 50 + (i % 2) * 10

        if (i < linesFilled) {
          ctx.fillStyle = "rgba(0, 229, 245, 0.12)"
          ctx.fillRect(docX + 20, ly, lw, 1.5)
        } else if (i === linesFilled) {
          const lineProgress = t * 2 - linesFilled
          ctx.fillStyle = "rgba(0, 229, 245, 0.15)"
          ctx.fillRect(docX + 20, ly, lw * lineProgress, 1.5)
          const cursorX = docX + 20 + lw * lineProgress
          ctx.fillStyle = `rgba(0, 229, 245, ${(Math.sin(t * 6) + 1) * 0.35 + 0.15})`
          ctx.fillRect(cursorX, ly - 3, 1.5, 8)
        } else {
          ctx.fillStyle = "rgba(0, 229, 245, 0.03)"
          ctx.fillRect(docX + 20, ly, lw, 1.5)
        }
      }

      // Signature area
      if (linesFilled >= totalLines) {
        const sigAlpha = Math.min((t * 2 - totalLines) / 2, 1)
        ctx.strokeStyle = `rgba(0, 229, 245, ${sigAlpha * 0.3})`
        ctx.lineWidth = 0.5
        ctx.setLineDash([3, 3])
        ctx.strokeRect(docX + 120, docY + docH - 55, 100, 28)
        ctx.setLineDash([])
        ctx.font = "7px Inter, sans-serif"
        ctx.fillStyle = `rgba(0, 229, 245, ${sigAlpha * 0.25})`
        ctx.fillText("SIGNATURE", docX + 143, docY + docH - 36)
        ctx.fillText("DATE: __________", docX + 20, docY + docH - 36)
      }

      // Scan line
      const scanY = ((t * 35) % (docH + 20)) + docY - 10
      if (scanY > docY && scanY < docY + docH) {
        const g = ctx.createLinearGradient(0, scanY - 4, 0, scanY + 4)
        g.addColorStop(0, "rgba(0, 229, 245, 0)")
        g.addColorStop(0.5, "rgba(0, 229, 245, 0.06)")
        g.addColorStop(1, "rgba(0, 229, 245, 0)")
        ctx.fillStyle = g
        ctx.fillRect(docX, scanY - 4, docW, 8)
      }

      // Hologram shimmer
      const shimmerX = ((t * 70) % (docW + 60)) + docX - 30
      const shimmerG = ctx.createLinearGradient(shimmerX - 25, 0, shimmerX + 25, 0)
      shimmerG.addColorStop(0, "rgba(0, 229, 245, 0)")
      shimmerG.addColorStop(0.5, "rgba(0, 229, 245, 0.025)")
      shimmerG.addColorStop(1, "rgba(0, 229, 245, 0)")
      ctx.fillStyle = shimmerG
      ctx.fillRect(docX, docY, docW, docH)

      frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={440}
      className="w-full max-w-[320px] mx-auto"
      aria-hidden="true"
    />
  )
}

/* ───── Contract Steps ───── */

const contractSteps = [
  {
    label: "Assembling legal packet...",
    icon: FileText,
    duration: 1500,
    micro: "Verifying property data integrity",
  },
  {
    label: "Generating purchase agreement...",
    icon: PenTool,
    duration: 2500,
    micro: "Embedding offer terms and conditions",
  },
  {
    label: "Applying compliance checks...",
    icon: Shield,
    duration: 1500,
    micro: "State-specific legal validation",
  },
  {
    label: "Preparing deliverable...",
    icon: Zap,
    duration: 1200,
    micro: "Contract ready for review",
  },
]

/* ───── Main Component ───── */

export function ContractPage({ address, onComplete }: ContractPageProps) {
  const [visible, setVisible] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [stepsComplete, setStepsComplete] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (currentStep >= contractSteps.length) {
      setStepsComplete(true)
      return
    }
    const timer = setTimeout(() => {
      setCurrentStep((prev) => prev + 1)
    }, contractSteps[currentStep].duration)
    return () => clearTimeout(timer)
  }, [currentStep])

  return (
    <div className="min-h-screen bg-[#060606] relative">
      {/* Grid */}
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

      <div className="relative max-w-xl mx-auto px-4 py-10 md:py-16">
        {/* Header */}
        <div
          className="text-center mb-6"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(16px)",
            transition: "all 0.8s ease",
          }}
        >
          <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-1">
            Contract Generation
          </h1>
          <p className="text-[10px] text-muted-foreground/40 font-mono">{address}</p>
        </div>

        {/* Signature */}
        <div style={{ opacity: visible ? 1 : 0, transition: "opacity 1s ease 0.3s" }}>
          <RotatingSignature />
        </div>

        {/* Document */}
        <div
          className="my-4"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(16px)",
            transition: "all 1s ease 0.4s",
          }}
        >
          <div className="glass-card rounded-2xl p-3 overflow-hidden relative">
            {/* Glowing frame */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                boxShadow: "inset 0 0 40px rgba(0, 229, 245, 0.03)",
              }}
              aria-hidden="true"
            />
            <DocumentHologram />
          </div>
        </div>

        {/* Step indicators */}
        <div className="space-y-2.5 mb-6">
          {contractSteps.map((step, i) => {
            const isComplete = i < currentStep
            const isActive = i === currentStep && !stepsComplete
            const StepIcon = step.icon

            return (
              <div
                key={step.label}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-500 ${
                  isComplete
                    ? "glass-card-strong"
                    : isActive
                      ? "glass-card neon-border"
                      : "opacity-20"
                }`}
                style={{
                  opacity: visible ? (isComplete || isActive ? 1 : 0.2) : 0,
                  transform: visible ? "translateX(0)" : "translateX(-16px)",
                  transition: `all 0.5s ease ${i * 0.12}s`,
                }}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
                    isComplete
                      ? "bg-neon/15 text-neon"
                      : isActive
                        ? "bg-neon/8 text-neon animate-pulse"
                        : "bg-muted/10 text-muted-foreground/30"
                  }`}
                >
                  {isComplete ? <Check size={13} /> : <StepIcon size={13} />}
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className={`text-sm font-sans block ${
                      isComplete || isActive
                        ? "text-foreground"
                        : "text-muted-foreground/30"
                    }`}
                  >
                    {isActive ? <TypingText text={step.label} speed={18} /> : step.label}
                  </span>
                  {(isComplete || isActive) && (
                    <span className="text-[9px] text-muted-foreground/30 font-mono">
                      {step.micro}
                    </span>
                  )}
                </div>
                {isActive && (
                  <div className="ml-auto flex-shrink-0">
                    <div className="w-4 h-4 rounded-full border-[1.5px] border-neon border-t-transparent animate-spin" />
                  </div>
                )}
                {isComplete && (
                  <div className="ml-auto text-[9px] text-neon/40 font-mono flex-shrink-0">
                    Done
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* SignPro badge */}
        <div
          className="flex items-center justify-center mb-6"
          style={{ opacity: visible ? 1 : 0, transition: "opacity 1s ease 0.5s" }}
        >
          <div className="glass-card rounded-full px-4 py-2 flex items-center gap-2">
            <Shield size={12} className="text-neon/50" />
            <span className="text-[10px] font-sans text-muted-foreground/50">
              Powered by <span className="text-neon/70 font-medium">SignPro.ai</span>
            </span>
          </div>
        </div>

        {/* CTA */}
        {stepsComplete && (
          <div className="text-center animate-fade-in-up">
            <button
              onClick={onComplete}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-display font-semibold text-base bg-neon text-[#0A0A0A] animate-breathe hover:shadow-[0_0_40px_rgba(0,229,245,0.5)] active:scale-[0.97] transition-all duration-300 min-h-[52px]"
            >
              View Full Dashboard
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
