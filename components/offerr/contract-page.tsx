"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { TypingText } from "./typing-text"
import { FileText, Shield, PenTool, Check, ArrowRight } from "lucide-react"

interface ContractPageProps {
  address: string
  onComplete: () => void
}

/* Rotating signature icon */
function RotatingSignature() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = 120
    canvas.height = 120
    let frame: number
    const start = performance.now()

    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, 120, 120)

      const cx = 60
      const cy = 60

      // Outer ring
      ctx.beginPath()
      ctx.arc(cx, cy, 45, 0, Math.PI * 2)
      ctx.strokeStyle = "rgba(0, 229, 245, 0.15)"
      ctx.lineWidth = 1
      ctx.stroke()

      // Rotating arc
      const startAngle = t * 2
      ctx.beginPath()
      ctx.arc(cx, cy, 45, startAngle, startAngle + Math.PI * 0.7)
      ctx.strokeStyle = "rgba(0, 229, 245, 0.6)"
      ctx.lineWidth = 2
      ctx.stroke()

      // Pen icon (simplified)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(Math.sin(t * 0.8) * 0.15)

      // Pen body
      ctx.beginPath()
      ctx.moveTo(-8, 14)
      ctx.lineTo(0, -14)
      ctx.lineTo(8, 14)
      ctx.closePath()
      ctx.strokeStyle = "rgba(0, 229, 245, 0.7)"
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Pen tip
      ctx.beginPath()
      ctx.moveTo(0, 14)
      ctx.lineTo(0, 20)
      ctx.strokeStyle = "rgba(0, 229, 245, 0.9)"
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.restore()

      // Glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 50)
      g.addColorStop(0, `rgba(0, 229, 245, ${0.05 + Math.sin(t * 2) * 0.03})`)
      g.addColorStop(1, "rgba(0, 229, 245, 0)")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 120, 120)

      frame = requestAnimationFrame(animate)
    }
    animate()

    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={canvasRef} width={120} height={120} className="mx-auto" aria-hidden="true" />
}

/* Document hologram */
function DocumentHologram() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = 400
    canvas.height = 500
    let frame: number
    const start = performance.now()

    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, 400, 500)

      // Document outline
      const docX = 80
      const docY = 40
      const docW = 240
      const docH = 340

      // Shadow / glow behind doc
      ctx.shadowColor = "rgba(0, 229, 245, 0.15)"
      ctx.shadowBlur = 30
      ctx.strokeStyle = `rgba(0, 229, 245, ${0.2 + Math.sin(t) * 0.05})`
      ctx.lineWidth = 1
      ctx.strokeRect(docX, docY, docW, docH)
      ctx.shadowBlur = 0

      // Folded corner
      ctx.beginPath()
      ctx.moveTo(docX + docW - 30, docY)
      ctx.lineTo(docX + docW, docY + 30)
      ctx.lineTo(docX + docW - 30, docY + 30)
      ctx.closePath()
      ctx.fillStyle = "rgba(0, 229, 245, 0.08)"
      ctx.fill()
      ctx.strokeStyle = "rgba(0, 229, 245, 0.2)"
      ctx.stroke()

      // Header line
      ctx.fillStyle = "rgba(0, 229, 245, 0.3)"
      ctx.fillRect(docX + 20, docY + 25, 120, 3)

      // Horizontal divider
      ctx.fillStyle = "rgba(0, 229, 245, 0.1)"
      ctx.fillRect(docX + 20, docY + 45, docW - 40, 1)

      // Contract lines filling in
      const totalLines = 16
      const linesFilled = Math.min(Math.floor(t * 2.5), totalLines)
      for (let i = 0; i < totalLines; i++) {
        const ly = docY + 60 + i * 18
        const lw = (i % 3 === 2) ? docW - 100 : docW - 50 + (i % 2) * 10

        if (i < linesFilled) {
          // Filled line
          ctx.fillStyle = "rgba(0, 229, 245, 0.15)"
          ctx.fillRect(docX + 20, ly, lw, 2)
        } else if (i === linesFilled) {
          // Currently filling line
          const lineProgress = (t * 2.5 - linesFilled)
          ctx.fillStyle = "rgba(0, 229, 245, 0.2)"
          ctx.fillRect(docX + 20, ly, lw * lineProgress, 2)

          // Cursor
          const cursorX = docX + 20 + lw * lineProgress
          ctx.fillStyle = `rgba(0, 229, 245, ${(Math.sin(t * 6) + 1) * 0.4 + 0.2})`
          ctx.fillRect(cursorX, ly - 4, 2, 10)
        } else {
          // Empty line placeholder
          ctx.fillStyle = "rgba(0, 229, 245, 0.04)"
          ctx.fillRect(docX + 20, ly, lw, 2)
        }
      }

      // Signature area
      if (linesFilled >= totalLines) {
        const sigAlpha = Math.min((t * 2.5 - totalLines) / 2, 1)
        ctx.strokeStyle = `rgba(0, 229, 245, ${sigAlpha * 0.4})`
        ctx.lineWidth = 0.5
        ctx.setLineDash([3, 3])
        ctx.strokeRect(docX + 120, docY + docH - 60, 100, 30)
        ctx.setLineDash([])

        ctx.font = "8px Inter, sans-serif"
        ctx.fillStyle = `rgba(0, 229, 245, ${sigAlpha * 0.3})`
        ctx.fillText("SIGNATURE", docX + 140, docY + docH - 35)

        // Date
        ctx.fillText("DATE: __________", docX + 20, docY + docH - 35)
      }

      // Scan line effect
      const scanY = ((t * 40) % (docH + 20)) + docY - 10
      if (scanY > docY && scanY < docY + docH) {
        const g = ctx.createLinearGradient(0, scanY - 5, 0, scanY + 5)
        g.addColorStop(0, "rgba(0, 229, 245, 0)")
        g.addColorStop(0.5, "rgba(0, 229, 245, 0.08)")
        g.addColorStop(1, "rgba(0, 229, 245, 0)")
        ctx.fillStyle = g
        ctx.fillRect(docX, scanY - 5, docW, 10)
      }

      // Hologram shimmer
      const shimmerX = ((t * 80) % (docW + 60)) + docX - 30
      const shimmerG = ctx.createLinearGradient(shimmerX - 30, 0, shimmerX + 30, 0)
      shimmerG.addColorStop(0, "rgba(0, 229, 245, 0)")
      shimmerG.addColorStop(0.5, "rgba(0, 229, 245, 0.04)")
      shimmerG.addColorStop(1, "rgba(0, 229, 245, 0)")
      ctx.fillStyle = shimmerG
      ctx.fillRect(docX, docY, docW, docH)

      frame = requestAnimationFrame(animate)
    }
    animate()

    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={canvasRef} width={400} height={500} className="w-full max-w-sm mx-auto" aria-hidden="true" />
}

/* Contract steps */
const contractSteps = [
  { label: "Verifying property data", icon: FileText, duration: 1500 },
  { label: "Generating purchase agreement", icon: PenTool, duration: 2500 },
  { label: "Applying legal compliance checks", icon: Shield, duration: 1500 },
  { label: "Contract ready for review", icon: Check, duration: 1000 },
]

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
    <div className="min-h-screen bg-[#0A0A0A] relative">
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

      <div className="relative max-w-2xl mx-auto px-4 py-12 md:py-20">
        {/* Header */}
        <div
          className="text-center mb-8"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.8s ease",
          }}
        >
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            Contract Generation
          </h1>
          <p className="text-sm text-muted-foreground font-sans">{address}</p>
        </div>

        {/* Signature icon */}
        <div
          style={{
            opacity: visible ? 1 : 0,
            transition: "opacity 1s ease 0.3s",
          }}
        >
          <RotatingSignature />
        </div>

        {/* Document hologram */}
        <div
          className="my-6"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: "all 1s ease 0.5s",
          }}
        >
          <div className="glass-card rounded-2xl p-4 overflow-hidden">
            <DocumentHologram />
          </div>
        </div>

        {/* Step indicators */}
        <div className="space-y-3 mb-8">
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
                      : "opacity-30"
                }`}
                style={{
                  opacity: visible ? (isComplete || isActive ? 1 : 0.3) : 0,
                  transform: visible ? "translateX(0)" : "translateX(-20px)",
                  transition: `all 0.5s ease ${i * 0.15}s`,
                }}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isComplete
                      ? "bg-neon/20 text-neon"
                      : isActive
                        ? "bg-neon/10 text-neon animate-pulse"
                        : "bg-muted/20 text-muted-foreground"
                  }`}
                >
                  {isComplete ? <Check size={14} /> : <StepIcon size={14} />}
                </div>
                <span
                  className={`text-sm font-sans transition-colors duration-300 ${
                    isComplete || isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {isActive ? (
                    <TypingText text={step.label} speed={20} />
                  ) : (
                    step.label
                  )}
                </span>
                {isActive && (
                  <div className="ml-auto">
                    <div className="w-4 h-4 rounded-full border-2 border-neon border-t-transparent animate-spin" />
                  </div>
                )}
                {isComplete && (
                  <div className="ml-auto text-xs text-neon/60 font-sans">Done</div>
                )}
              </div>
            )
          })}
        </div>

        {/* SignPro badge */}
        <div
          className="flex items-center justify-center gap-2 mb-8"
          style={{
            opacity: visible ? 1 : 0,
            transition: "opacity 1s ease 0.6s",
          }}
        >
          <div className="glass-card rounded-full px-4 py-2 flex items-center gap-2">
            <Shield size={14} className="text-neon/60" />
            <span className="text-xs font-sans text-muted-foreground">
              Powered by <span className="text-neon font-medium">SignPro.ai</span>
            </span>
          </div>
        </div>

        {/* CTA when complete */}
        {stepsComplete && (
          <div
            className="text-center"
            style={{
              animation: "fade-in-up 0.8s ease forwards",
            }}
          >
            <button
              onClick={onComplete}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-display font-semibold text-lg bg-neon text-[#0A0A0A] animate-breathe hover:shadow-[0_0_40px_rgba(0,229,245,0.5)] active:scale-95 transition-all duration-300 min-h-[52px]"
            >
              View Full Dashboard
              <ArrowRight size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
