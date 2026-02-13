"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { TypingText } from "./typing-text"
import { NeonProgress } from "./neon-progress"

interface AnalysisScenesProps {
  address: string
  onComplete: () => void
}

/* ───── Scene Canvas Renderers ───── */

function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let frame: number
    const start = performance.now()

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2
      canvas.height = canvas.offsetHeight * 2
      ctx.scale(2, 2)
    }
    resize()

    const animate = () => {
      const t = (performance.now() - start) / 1000
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)
      draw(ctx, canvas.offsetWidth, canvas.offsetHeight, t)
      frame = requestAnimationFrame(animate)
    }
    animate()

    window.addEventListener("resize", resize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", resize)
    }
  }, [draw])

  return canvasRef
}

/* ───── Scene 1: Wireframe Property Scan ───── */

function WireframeScan() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const cx = w / 2
    const cy = h / 2

    // Draw grid
    ctx.strokeStyle = "rgba(0, 229, 245, 0.06)"
    ctx.lineWidth = 0.5
    for (let x = 0; x < w; x += 30) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y < h; y += 30) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }

    // Draw parcel outline (rectangle building shape)
    const bw = 140
    const bh = 100
    const offset = Math.sin(t * 0.5) * 3

    ctx.strokeStyle = "rgba(0, 229, 245, 0.6)"
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])

    // Main building
    ctx.strokeRect(cx - bw / 2 + offset, cy - bh / 2, bw, bh)

    // Roof
    ctx.beginPath()
    ctx.moveTo(cx - bw / 2 - 10 + offset, cy - bh / 2)
    ctx.lineTo(cx + offset, cy - bh / 2 - 50)
    ctx.lineTo(cx + bw / 2 + 10 + offset, cy - bh / 2)
    ctx.stroke()

    ctx.setLineDash([])

    // Scan line
    const scanY = ((t * 60) % (h + 40)) - 20
    const gradient = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20)
    gradient.addColorStop(0, "rgba(0, 229, 245, 0)")
    gradient.addColorStop(0.5, "rgba(0, 229, 245, 0.3)")
    gradient.addColorStop(1, "rgba(0, 229, 245, 0)")
    ctx.fillStyle = gradient
    ctx.fillRect(0, scanY - 20, w, 40)

    // Corner markers
    const corners = [
      [cx - bw / 2, cy - bh / 2],
      [cx + bw / 2, cy - bh / 2],
      [cx - bw / 2, cy + bh / 2],
      [cx + bw / 2, cy + bh / 2],
    ]
    corners.forEach(([x, y]) => {
      ctx.strokeStyle = "rgba(0, 229, 245, 0.8)"
      ctx.lineWidth = 2
      const s = 8
      ctx.beginPath()
      ctx.moveTo(x - s, y)
      ctx.lineTo(x, y)
      ctx.lineTo(x, y - s)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x + s, y)
      ctx.lineTo(x, y)
      ctx.lineTo(x, y + s)
      ctx.stroke()
    })

    // Data points blinking
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + t * 0.3
      const r = 80 + Math.sin(t + i) * 10
      const px = cx + Math.cos(angle) * r
      const py = cy + Math.sin(angle) * r * 0.6
      const alpha = (Math.sin(t * 2 + i * 1.5) + 1) * 0.3 + 0.2

      ctx.beginPath()
      ctx.arc(px, py, 3, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(0, 229, 245, ${alpha})`
      ctx.fill()
    }
  }, [])

  const canvasRef = useCanvas(draw)

  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene 2: Radar Comp Mapping ───── */

function RadarComps() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const cx = w / 2
    const cy = h / 2

    // Radar circles
    for (let i = 1; i <= 4; i++) {
      const r = i * 40
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(0, 229, 245, ${0.15 - i * 0.02})`
      ctx.lineWidth = 0.8
      ctx.stroke()
    }

    // Radar sweep
    const sweepAngle = (t * 0.8) % (Math.PI * 2)
    const sweepGradient = ctx.createConicGradient(sweepAngle - 0.5, cx, cy)
    sweepGradient.addColorStop(0, "rgba(0, 229, 245, 0)")
    sweepGradient.addColorStop(0.08, "rgba(0, 229, 245, 0.15)")
    sweepGradient.addColorStop(0.12, "rgba(0, 229, 245, 0)")

    ctx.beginPath()
    ctx.arc(cx, cy, 160, 0, Math.PI * 2)
    ctx.fillStyle = sweepGradient
    ctx.fill()

    // Sweep line
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(sweepAngle) * 160, cy + Math.sin(sweepAngle) * 160)
    ctx.strokeStyle = "rgba(0, 229, 245, 0.5)"
    ctx.lineWidth = 1
    ctx.stroke()

    // Comp points
    const comps = [
      { angle: 0.5, dist: 50, label: "$285K" },
      { angle: 1.2, dist: 90, label: "$310K" },
      { angle: 2.4, dist: 70, label: "$265K" },
      { angle: 3.6, dist: 110, label: "$295K" },
      { angle: 4.5, dist: 60, label: "$340K" },
      { angle: 5.3, dist: 100, label: "$275K" },
    ]

    comps.forEach((comp, i) => {
      const px = cx + Math.cos(comp.angle) * comp.dist
      const py = cy + Math.sin(comp.angle) * comp.dist
      const isActive = (sweepAngle % (Math.PI * 2)) > comp.angle - 0.2 &&
                       (sweepAngle % (Math.PI * 2)) < comp.angle + 0.5

      // Point
      ctx.beginPath()
      ctx.arc(px, py, isActive ? 5 : 3, 0, Math.PI * 2)
      ctx.fillStyle = isActive ? "rgba(0, 229, 245, 0.9)" : "rgba(0, 229, 245, 0.4)"
      ctx.fill()

      // Glow when active
      if (isActive) {
        ctx.beginPath()
        ctx.arc(px, py, 12, 0, Math.PI * 2)
        const g = ctx.createRadialGradient(px, py, 0, px, py, 12)
        g.addColorStop(0, "rgba(0, 229, 245, 0.3)")
        g.addColorStop(1, "rgba(0, 229, 245, 0)")
        ctx.fillStyle = g
        ctx.fill()

        // Label
        ctx.font = "10px Inter, sans-serif"
        ctx.fillStyle = "rgba(0, 229, 245, 0.8)"
        ctx.fillText(comp.label, px + 10, py - 5)
      }

      // Connection to center
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(px, py)
      ctx.strokeStyle = `rgba(0, 229, 245, ${isActive ? 0.2 : 0.06})`
      ctx.lineWidth = 0.5
      ctx.setLineDash([2, 4])
      ctx.stroke()
      ctx.setLineDash([])
    })

    // Center point (subject property)
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(0, 229, 245, 0.9)"
    ctx.fill()

    ctx.beginPath()
    ctx.arc(cx, cy, 10, 0, Math.PI * 2)
    const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 10)
    centerGlow.addColorStop(0, "rgba(0, 229, 245, 0.4)")
    centerGlow.addColorStop(1, "rgba(0, 229, 245, 0)")
    ctx.fillStyle = centerGlow
    ctx.fill()
  }, [])

  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene 3: Rotating 3D Wireframe House ───── */

function WireframeHouse() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const cx = w / 2
    const cy = h / 2
    const rotY = t * 0.5

    // Simple 3D house wireframe with rotation
    const project = (x: number, y: number, z: number) => {
      const cosR = Math.cos(rotY)
      const sinR = Math.sin(rotY)
      const rx = x * cosR - z * sinR
      const rz = x * sinR + z * cosR
      const scale = 300 / (300 + rz)
      return {
        x: cx + rx * scale,
        y: cy + y * scale * 0.8,
        z: rz,
        scale,
      }
    }

    // House vertices (base)
    const s = 60
    const baseY = 20
    const roofY = -40
    const peakY = -70

    const vertices = [
      // Base floor
      project(-s, baseY, -s),
      project(s, baseY, -s),
      project(s, baseY, s),
      project(-s, baseY, s),
      // Roof base
      project(-s * 1.1, roofY, -s * 1.1),
      project(s * 1.1, roofY, -s * 1.1),
      project(s * 1.1, roofY, s * 1.1),
      project(-s * 1.1, roofY, s * 1.1),
      // Roof peak (front/back)
      project(0, peakY, -s * 1.1),
      project(0, peakY, s * 1.1),
    ]

    const drawLine = (from: number, to: number, alpha: number = 0.5) => {
      ctx.beginPath()
      ctx.moveTo(vertices[from].x, vertices[from].y)
      ctx.lineTo(vertices[to].x, vertices[to].y)
      ctx.strokeStyle = `rgba(0, 229, 245, ${alpha})`
      ctx.lineWidth = 1.2
      ctx.stroke()
    }

    // Floor
    drawLine(0, 1, 0.3)
    drawLine(1, 2, 0.3)
    drawLine(2, 3, 0.3)
    drawLine(3, 0, 0.3)

    // Walls
    drawLine(0, 4, 0.4)
    drawLine(1, 5, 0.4)
    drawLine(2, 6, 0.4)
    drawLine(3, 7, 0.4)

    // Roof base
    drawLine(4, 5, 0.5)
    drawLine(5, 6, 0.5)
    drawLine(6, 7, 0.5)
    drawLine(7, 4, 0.5)

    // Roof peak
    drawLine(4, 8, 0.6)
    drawLine(5, 8, 0.6)
    drawLine(6, 9, 0.6)
    drawLine(7, 9, 0.6)
    drawLine(8, 9, 0.6)

    // Damage indicators (pulsing red dots)
    const damages = [
      project(-30, roofY - 10, -s),
      project(40, baseY - 10, s * 0.8),
      project(-s * 0.5, baseY, 0),
    ]
    damages.forEach((d, i) => {
      const alpha = (Math.sin(t * 3 + i * 2) + 1) * 0.3 + 0.2
      ctx.beginPath()
      ctx.arc(d.x, d.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 80, 80, ${alpha})`
      ctx.fill()

      ctx.beginPath()
      ctx.arc(d.x, d.y, 10, 0, Math.PI * 2)
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 10)
      g.addColorStop(0, `rgba(255, 80, 80, ${alpha * 0.3})`)
      g.addColorStop(1, "rgba(255, 80, 80, 0)")
      ctx.fillStyle = g
      ctx.fill()
    })

    // Measurement lines
    const scanProgress = (t * 0.3) % 1
    const scanY2 = baseY + (roofY - baseY) * scanProgress
    const scanLeft = project(-s * 1.3, scanY2, 0)
    const scanRight = project(s * 1.3, scanY2, 0)

    ctx.beginPath()
    ctx.moveTo(scanLeft.x, scanLeft.y)
    ctx.lineTo(scanRight.x, scanRight.y)
    ctx.strokeStyle = "rgba(0, 229, 245, 0.2)"
    ctx.lineWidth = 0.5
    ctx.setLineDash([2, 3])
    ctx.stroke()
    ctx.setLineDash([])
  }, [])

  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene 4: Neural Network Cube ───── */

function NeuralCube() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const cx = w / 2
    const cy = h / 2

    const rotX = t * 0.3
    const rotY = t * 0.4

    const project3D = (x: number, y: number, z: number) => {
      // Rotate Y
      let rx = x * Math.cos(rotY) - z * Math.sin(rotY)
      let rz = x * Math.sin(rotY) + z * Math.cos(rotY)
      // Rotate X
      let ry = y * Math.cos(rotX) - rz * Math.sin(rotX)
      rz = y * Math.sin(rotX) + rz * Math.cos(rotX)

      const scale = 250 / (250 + rz)
      return { x: cx + rx * scale, y: cy + ry * scale, z: rz }
    }

    // Cube nodes (3x3x3 grid)
    const nodes: { x: number; y: number; z: number }[] = []
    const spacing = 40
    for (let ix = -1; ix <= 1; ix++) {
      for (let iy = -1; iy <= 1; iy++) {
        for (let iz = -1; iz <= 1; iz++) {
          nodes.push(project3D(ix * spacing, iy * spacing, iz * spacing))
        }
      }
    }

    // Draw connections
    nodes.forEach((a, i) => {
      nodes.forEach((b, j) => {
        if (i >= j) return
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 100) {
          const firing = Math.sin(t * 4 + i * 0.5 + j * 0.3) > 0.7
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = firing
            ? "rgba(0, 229, 245, 0.6)"
            : "rgba(0, 229, 245, 0.08)"
          ctx.lineWidth = firing ? 1.5 : 0.5
          ctx.stroke()

          // Pulse traveling along connection
          if (firing) {
            const progress = (t * 2 + i * 0.3) % 1
            const px = a.x + (b.x - a.x) * progress
            const py = a.y + (b.y - a.y) * progress
            ctx.beginPath()
            ctx.arc(px, py, 2, 0, Math.PI * 2)
            ctx.fillStyle = "rgba(0, 229, 245, 0.8)"
            ctx.fill()
          }
        }
      })
    })

    // Draw nodes
    nodes.forEach((n, i) => {
      const active = Math.sin(t * 3 + i * 0.7) > 0.3
      const size = active ? 4 : 2.5

      ctx.beginPath()
      ctx.arc(n.x, n.y, size, 0, Math.PI * 2)
      ctx.fillStyle = active ? "rgba(0, 229, 245, 0.9)" : "rgba(0, 229, 245, 0.3)"
      ctx.fill()

      if (active) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, 12, 0, Math.PI * 2)
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 12)
        g.addColorStop(0, "rgba(0, 229, 245, 0.2)")
        g.addColorStop(1, "rgba(0, 229, 245, 0)")
        ctx.fillStyle = g
        ctx.fill()
      }
    })

    // Data streams flowing into cube
    for (let s = 0; s < 4; s++) {
      const angle = (s / 4) * Math.PI * 2 + t * 0.2
      const dist = 120 + Math.sin(t + s) * 20
      const sx = cx + Math.cos(angle) * dist
      const sy = cy + Math.sin(angle) * dist

      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(cx, cy)
      ctx.strokeStyle = "rgba(0, 229, 245, 0.1)"
      ctx.lineWidth = 0.5
      ctx.setLineDash([1, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // Label
      ctx.font = "9px Inter, sans-serif"
      ctx.fillStyle = "rgba(0, 229, 245, 0.4)"
      const labels = ["ARV", "CAP", "ROI", "NOI"]
      ctx.fillText(labels[s], sx - 8, sy - 8)
    }
  }, [])

  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene 5: Lock-In Animation ───── */

function LockInAnimation() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const cx = w / 2
    const cy = h / 2

    // Outer ring converging
    const rings = 5
    for (let i = 0; i < rings; i++) {
      const baseR = 120 - i * 20
      const targetR = 30
      const progress = Math.min(t / 3, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const r = baseR - (baseR - targetR) * eased

      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(0, 229, 245, ${0.15 + i * 0.05 + eased * 0.2})`
      ctx.lineWidth = 1 + eased
      ctx.stroke()
    }

    // Lock icon forming
    if (t > 1.5) {
      const lockAlpha = Math.min((t - 1.5) / 1.5, 1)

      // Lock body
      const lw = 24
      const lh = 20
      ctx.strokeStyle = `rgba(0, 229, 245, ${lockAlpha * 0.8})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(cx - lw / 2, cy - 2, lw, lh, 3)
      ctx.stroke()

      // Lock shackle
      ctx.beginPath()
      ctx.arc(cx, cy - 2, 10, Math.PI, 0)
      ctx.stroke()

      // Inner dot
      if (t > 2.5) {
        const dotAlpha = Math.min((t - 2.5) / 0.5, 1)
        ctx.beginPath()
        ctx.arc(cx, cy + 6, 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0, 229, 245, ${dotAlpha})`
        ctx.fill()

        // Glow
        ctx.beginPath()
        ctx.arc(cx, cy + 6, 20, 0, Math.PI * 2)
        const g = ctx.createRadialGradient(cx, cy + 6, 0, cx, cy + 6, 20)
        g.addColorStop(0, `rgba(0, 229, 245, ${dotAlpha * 0.3})`)
        g.addColorStop(1, "rgba(0, 229, 245, 0)")
        ctx.fillStyle = g
        ctx.fill()
      }
    }

    // Checkmark appearing
    if (t > 3) {
      const checkAlpha = Math.min((t - 3) / 0.8, 1)

      // Check circle
      ctx.beginPath()
      ctx.arc(cx, cy + 50, 16, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(0, 229, 245, ${checkAlpha * 0.6})`
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Check mark
      ctx.beginPath()
      ctx.moveTo(cx - 6, cy + 50)
      ctx.lineTo(cx - 1, cy + 55)
      ctx.lineTo(cx + 7, cy + 43)
      ctx.strokeStyle = `rgba(0, 229, 245, ${checkAlpha})`
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Particles converging
    if (t < 3) {
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + t * 0.5
        const maxDist = 140
        const dist = maxDist * (1 - Math.min(t / 3, 1) * 0.8)
        const px = cx + Math.cos(angle) * dist
        const py = cy + Math.sin(angle) * dist

        ctx.beginPath()
        ctx.arc(px, py, 2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0, 229, 245, ${0.3 + Math.sin(t * 2 + i) * 0.2})`
        ctx.fill()
      }
    }
  }, [])

  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene Configs ───── */

const scenes = [
  {
    id: "parcel",
    title: "Parcel Verification",
    subtitle: "Scanning property boundaries and lot dimensions...",
    progress: 20,
    Component: WireframeScan,
    duration: 3500,
  },
  {
    id: "comps",
    title: "Market Comparables",
    subtitle: "Mapping comparable sales within 0.5mi radius...",
    progress: 40,
    Component: RadarComps,
    duration: 3500,
  },
  {
    id: "repair",
    title: "Repair Estimation",
    subtitle: "Analyzing structural integrity and repair costs...",
    progress: 60,
    Component: WireframeHouse,
    duration: 3500,
  },
  {
    id: "neural",
    title: "Investor Math Engine",
    subtitle: "Running neural valuation across 47 data points...",
    progress: 80,
    Component: NeuralCube,
    duration: 3500,
  },
  {
    id: "lockin",
    title: "Finalizing Cash Offer",
    subtitle: "Locking in your personalized offer amount...",
    progress: 100,
    Component: LockInAnimation,
    duration: 4000,
  },
]

/* ───── Main Component ───── */

export function AnalysisScenes({ address, onComplete }: AnalysisScenesProps) {
  const [currentScene, setCurrentScene] = useState(0)
  const [sceneTransition, setSceneTransition] = useState(true)

  useEffect(() => {
    if (currentScene >= scenes.length) {
      onComplete()
      return
    }

    let nextTimer: ReturnType<typeof setTimeout>

    setSceneTransition(true)
    const fadeInTimer = setTimeout(() => setSceneTransition(false), 100)

    const sceneTimer = setTimeout(() => {
      setSceneTransition(true)
      nextTimer = setTimeout(() => {
        setCurrentScene((prev) => prev + 1)
      }, 600)
    }, scenes[currentScene].duration)

    return () => {
      clearTimeout(fadeInTimer)
      clearTimeout(sceneTimer)
      clearTimeout(nextTimer)
    }
  }, [currentScene, onComplete])

  if (currentScene >= scenes.length) return null

  const scene = scenes[currentScene]
  const SceneComponent = scene.Component

  return (
    <div className="fixed inset-0 bg-[#0A0A0A] flex flex-col items-center justify-center z-50">
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 229, 245, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 229, 245, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
        aria-hidden="true"
      />

      {/* Scene content */}
      <div
        className="flex flex-col items-center w-full max-w-lg px-4"
        style={{
          opacity: sceneTransition ? 0 : 1,
          transform: sceneTransition ? "scale(0.97)" : "scale(1)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}
      >
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {scenes.map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-full transition-all duration-500"
              style={{
                width: i === currentScene ? "32px" : "12px",
                background:
                  i < currentScene
                    ? "#00E5F5"
                    : i === currentScene
                      ? "linear-gradient(90deg, #00B8C5, #00E5F5)"
                      : "rgba(0, 229, 245, 0.15)",
                boxShadow:
                  i === currentScene
                    ? "0 0 10px rgba(0, 229, 245, 0.4)"
                    : "none",
              }}
            />
          ))}
        </div>

        {/* Scene title */}
        <p className="text-xs font-sans uppercase tracking-[0.3em] text-neon/60 mb-2">
          Step {currentScene + 1} of {scenes.length}
        </p>
        <h2 className="font-display text-2xl md:text-3xl font-bold neon-text mb-1 text-center text-balance">
          {scene.title}
        </h2>

        {/* Canvas viewport */}
        <div
          className="w-full aspect-square max-w-xs my-6 rounded-xl overflow-hidden"
          style={{
            border: "1px solid rgba(0, 229, 245, 0.1)",
            background: "rgba(10, 10, 10, 0.8)",
          }}
        >
          <SceneComponent />
        </div>

        {/* Typing status */}
        <div className="h-6 mb-4">
          <TypingText
            key={scene.id}
            text={scene.subtitle}
            speed={25}
            className="text-sm text-muted-foreground font-sans"
          />
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs">
          <NeonProgress value={scene.progress} duration={scene.duration - 800} label="Analysis Progress" />
        </div>

        {/* Address */}
        <p className="text-xs text-muted-foreground/40 mt-6 font-mono">
          {address}
        </p>
      </div>
    </div>
  )
}
