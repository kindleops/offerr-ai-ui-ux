"use client"

import { useState, useEffect, useRef } from "react"
import { TypingText } from "./typing-text"
import { FileText, Shield, PenTool, Check, ArrowRight, Zap } from "lucide-react"

interface ContractPageProps { address: string; onComplete: () => void }

/* ───── Rotating Signature ───── */
function RotatingSignature() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext("2d"); if (!ctx) return
    c.width = 120; c.height = 120
    let frame: number; const start = performance.now()
    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, 120, 120)
      const cx = 60, cy = 60

      // Outer rings
      ctx.beginPath(); ctx.arc(cx, cy, 48, 0, Math.PI * 2)
      ctx.strokeStyle = "rgba(0,228,255,0.06)"; ctx.lineWidth = 0.6; ctx.stroke()
      ctx.beginPath(); ctx.arc(cx, cy, 42, t * 1.5, t * 1.5 + Math.PI * 0.5)
      ctx.strokeStyle = "rgba(0,228,255,0.35)"; ctx.lineWidth = 1.2; ctx.stroke()
      ctx.beginPath(); ctx.arc(cx, cy, 52, -t * 0.8, -t * 0.8 + Math.PI * 0.3)
      ctx.strokeStyle = "rgba(0,228,255,0.15)"; ctx.lineWidth = 0.8; ctx.stroke()

      // Pen nib
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 0.6) * 0.1)
      ctx.beginPath(); ctx.moveTo(-6, 12); ctx.lineTo(0, -14); ctx.lineTo(6, 12); ctx.closePath()
      ctx.strokeStyle = "rgba(0,228,255,0.5)"; ctx.lineWidth = 1; ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, 18)
      ctx.strokeStyle = "rgba(0,228,255,0.7)"; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.restore()

      // Charging glow
      const glowAlpha = 0.03 + Math.sin(t * 2) * 0.015
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 50)
      g.addColorStop(0, `rgba(0,228,255,${glowAlpha})`); g.addColorStop(1, "rgba(0,228,255,0)")
      ctx.fillStyle = g; ctx.fillRect(0, 0, 120, 120)

      frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={canvasRef} width={120} height={120} className="mx-auto" aria-hidden="true" />
}

/* ───── Document Hologram ───── */
function DocumentHologram() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext("2d"); if (!ctx) return
    c.width = 360; c.height = 460
    let frame: number; const start = performance.now()
    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, 360, 460)
      const dx = 55, dy = 25, dw = 250, dh = 380

      // Glowing border
      ctx.shadowColor = "rgba(0,228,255,0.08)"; ctx.shadowBlur = 30
      ctx.strokeStyle = `rgba(0,228,255,${0.12 + Math.sin(t * 0.7) * 0.03})`; ctx.lineWidth = 0.7
      ctx.strokeRect(dx, dy, dw, dh); ctx.shadowBlur = 0

      // Corner fold
      ctx.beginPath(); ctx.moveTo(dx + dw - 25, dy); ctx.lineTo(dx + dw, dy + 25); ctx.lineTo(dx + dw - 25, dy + 25); ctx.closePath()
      ctx.fillStyle = "rgba(0,228,255,0.04)"; ctx.fill(); ctx.strokeStyle = "rgba(0,228,255,0.08)"; ctx.lineWidth = 0.4; ctx.stroke()

      // Header block
      ctx.fillStyle = "rgba(0,228,255,0.2)"; ctx.fillRect(dx + 22, dy + 22, 110, 2.5)
      ctx.fillStyle = "rgba(0,228,255,0.08)"; ctx.fillRect(dx + 22, dy + 32, 65, 1.5)
      ctx.fillStyle = "rgba(0,228,255,0.04)"; ctx.fillRect(dx + 22, dy + 48, dw - 44, 0.5)

      // Contract lines filling in
      const totalLines = 18
      const filled = Math.min(Math.floor(t * 1.8), totalLines)
      for (let i = 0; i < totalLines; i++) {
        const ly = dy + 62 + i * 17
        const lw = i % 3 === 2 ? dw - 110 : dw - 55 + (i % 2) * 12
        if (i < filled) {
          ctx.fillStyle = "rgba(0,228,255,0.1)"; ctx.fillRect(dx + 22, ly, lw, 1.5)
        } else if (i === filled) {
          const lp = t * 1.8 - filled
          ctx.fillStyle = "rgba(0,228,255,0.12)"; ctx.fillRect(dx + 22, ly, lw * lp, 1.5)
          const curX = dx + 22 + lw * lp
          ctx.fillStyle = `rgba(0,228,255,${(Math.sin(t * 6) + 1) * 0.3 + 0.15})`; ctx.fillRect(curX, ly - 3, 1.5, 8)
        } else {
          ctx.fillStyle = "rgba(0,228,255,0.02)"; ctx.fillRect(dx + 22, ly, lw, 1.5)
        }
      }

      // Signature area
      if (filled >= totalLines) {
        const sa = Math.min((t * 1.8 - totalLines) / 2, 1)
        ctx.strokeStyle = `rgba(0,228,255,${sa * 0.25})`; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3])
        ctx.strokeRect(dx + 130, dy + dh - 55, 100, 28); ctx.setLineDash([])
        ctx.font = "6px Inter, sans-serif"; ctx.fillStyle = `rgba(0,228,255,${sa * 0.2})`
        ctx.fillText("SIGNATURE", dx + 153, dy + dh - 36); ctx.fillText("DATE: __________", dx + 22, dy + dh - 36)

        // Signature charging glow
        if (sa > 0.5) {
          const cg = ctx.createRadialGradient(dx + 180, dy + dh - 41, 0, dx + 180, dy + dh - 41, 25)
          cg.addColorStop(0, `rgba(0,228,255,${(sa - 0.5) * 0.1})`); cg.addColorStop(1, "rgba(0,228,255,0)")
          ctx.fillStyle = cg; ctx.fillRect(dx + 130, dy + dh - 65, 100, 50)
        }
      }

      // Scan line
      const scanY = ((t * 30) % (dh + 20)) + dy - 10
      if (scanY > dy && scanY < dy + dh) {
        const sg = ctx.createLinearGradient(0, scanY - 3, 0, scanY + 3)
        sg.addColorStop(0, "rgba(0,228,255,0)"); sg.addColorStop(0.5, "rgba(0,228,255,0.05)"); sg.addColorStop(1, "rgba(0,228,255,0)")
        ctx.fillStyle = sg; ctx.fillRect(dx, scanY - 3, dw, 6)
      }

      // Hologram shimmer
      const sx = ((t * 60) % (dw + 60)) + dx - 30
      const shg = ctx.createLinearGradient(sx - 20, 0, sx + 20, 0)
      shg.addColorStop(0, "rgba(0,228,255,0)"); shg.addColorStop(0.5, "rgba(0,228,255,0.02)"); shg.addColorStop(1, "rgba(0,228,255,0)")
      ctx.fillStyle = shg; ctx.fillRect(dx, dy, dw, dh)

      frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={canvasRef} width={360} height={460} className="w-full max-w-[320px] mx-auto" aria-hidden="true" />
}

/* ───── Contract Steps ───── */
const contractSteps = [
  { label: "Verifying property data...", icon: FileText, duration: 1500, micro: "Cross-referencing county records" },
  { label: "Generating purchase agreement...", icon: PenTool, duration: 2500, micro: "Embedding offer terms and conditions" },
  { label: "Applying legal compliance checks...", icon: Shield, duration: 1500, micro: "State-specific legal validation" },
  { label: "Contract ready for review", icon: Zap, duration: 1200, micro: "Preparing deliverable packet" },
]

/* ───── Main ───── */
export function ContractPage({ address, onComplete }: ContractPageProps) {
  const [vis, setVis] = useState(false)
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => { const t = setTimeout(() => setVis(true), 200); return () => clearTimeout(t) }, [])
  useEffect(() => {
    if (step >= contractSteps.length) { setDone(true); return }
    const timer = setTimeout(() => setStep((p) => p + 1), contractSteps[step].duration)
    return () => clearTimeout(timer)
  }, [step])

  return (
    <div className="min-h-screen bg-[#04070A] relative">
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `linear-gradient(rgba(0,228,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(0,228,255,0.012) 1px, transparent 1px)`, backgroundSize: "60px 60px" }}
        aria-hidden="true" />

      <div className="relative max-w-xl mx-auto px-4 py-10 md:py-16">
        {/* Header */}
        <div className="text-center mb-6" style={{ opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(16px)", transition: "all 0.8s ease" }}>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-[#F8F9FA] mb-1">Contract Generation</h1>
          <p className="text-[10px] text-[#6C7A89]/35 font-mono">{address}</p>
        </div>

        {/* Signature animation */}
        <div style={{ opacity: vis ? 1 : 0, transition: "opacity 1s ease 0.3s" }}><RotatingSignature /></div>

        {/* Document hologram with glowing frame */}
        <div className="my-4" style={{ opacity: vis ? 1 : 0, transform: vis ? "translateY(0)" : "translateY(16px)", transition: "all 1s ease 0.4s" }}>
          <div className="glass-card rounded-2xl p-3 overflow-hidden relative">
            <div className="absolute inset-0 rounded-2xl pointer-events-none animate-pulse-glow" aria-hidden="true" />
            <DocumentHologram />
          </div>
        </div>

        {/* Step progress */}
        <div className="space-y-2 mb-6">
          {contractSteps.map((s, i) => {
            const isComplete = i < step; const isActive = i === step && !done; const Icon = s.icon
            return (
              <div key={s.label}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-500 ${isComplete ? "glass-card-strong" : isActive ? "glass-card neon-border" : "opacity-15"}`}
                style={{ opacity: vis ? (isComplete || isActive ? 1 : 0.15) : 0, transform: vis ? "translateX(0)" : "translateX(-16px)", transition: `all 0.5s ease ${i * 0.1}s` }}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 flex-shrink-0 ${isComplete ? "bg-neon/[0.12] text-neon" : isActive ? "bg-neon/[0.06] text-neon animate-pulse" : "bg-[#6C7A89]/5 text-[#6C7A89]/20"}`}>
                  {isComplete ? <Check size={12} /> : <Icon size={12} />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-sans block ${isComplete || isActive ? "text-[#F8F9FA]" : "text-[#6C7A89]/25"}`}>
                    {isActive ? <TypingText text={s.label} speed={16} /> : s.label}
                  </span>
                  {(isComplete || isActive) && <span className="text-[8px] text-[#6C7A89]/25 font-mono">{s.micro}</span>}
                </div>
                {isActive && <div className="ml-auto flex-shrink-0"><div className="w-4 h-4 rounded-full border-[1.5px] border-neon border-t-transparent animate-spin" /></div>}
                {isComplete && <div className="ml-auto text-[8px] text-neon/35 font-mono flex-shrink-0">Done</div>}
              </div>
            )
          })}
        </div>

        {/* SignPro badge */}
        <div className="flex items-center justify-center mb-6" style={{ opacity: vis ? 1 : 0, transition: "opacity 1s ease 0.5s" }}>
          <div className="glass-card rounded-full px-4 py-2 flex items-center gap-2">
            <Shield size={11} className="text-neon/45" />
            <span className="text-[10px] font-sans text-[#6C7A89]/45">Powered by <span className="text-neon/60 font-medium">SignPro.ai</span></span>
          </div>
        </div>

        {/* CTA */}
        {done && (
          <div className="text-center animate-fade-in-up">
            <button onClick={onComplete}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-display font-semibold text-base bg-neon text-[#04070A] animate-breathe hover:shadow-[0_0_45px_rgba(0,228,255,0.4)] active:scale-[0.97] transition-all duration-300 min-h-[52px]">
              View Full Dashboard<ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
