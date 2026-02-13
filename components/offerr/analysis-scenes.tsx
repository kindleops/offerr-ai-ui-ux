"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { TypingText } from "./typing-text"
import { NeonProgress } from "./neon-progress"

interface AnalysisScenesProps {
  address: string
  onComplete: () => void
}

/* ───── Canvas Hook ───── */

function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let frame: number
    const start = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      const cx = w / 2
      const cy = h / 2

      // Grid
      ctx.strokeStyle = "rgba(0, 229, 245, 0.04)"
      ctx.lineWidth = 0.5
      const gridSize = 25
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }

      // Parcel outline with breathing
      const bw = 120
      const bh = 85
      const breathe = Math.sin(t * 0.6) * 2

      // Lot boundary (outer dashed)
      ctx.strokeStyle = "rgba(0, 229, 245, 0.2)"
      ctx.lineWidth = 0.8
      ctx.setLineDash([6, 4])
      ctx.strokeRect(
        cx - bw * 0.8 + breathe,
        cy - bh * 0.7,
        bw * 1.6,
        bh * 1.4
      )
      ctx.setLineDash([])

      // Building footprint
      ctx.strokeStyle = "rgba(0, 229, 245, 0.5)"
      ctx.lineWidth = 1.2
      ctx.strokeRect(cx - bw / 2 + breathe, cy - bh / 2, bw, bh)

      // Roof
      ctx.beginPath()
      ctx.moveTo(cx - bw / 2 - 8 + breathe, cy - bh / 2)
      ctx.lineTo(cx + breathe, cy - bh / 2 - 42)
      ctx.lineTo(cx + bw / 2 + 8 + breathe, cy - bh / 2)
      ctx.strokeStyle = "rgba(0, 229, 245, 0.55)"
      ctx.stroke()

      // Internal rooms
      ctx.strokeStyle = "rgba(0, 229, 245, 0.12)"
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(cx + breathe, cy - bh / 2)
      ctx.lineTo(cx + breathe, cy + bh / 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - bw / 2 + breathe, cy)
      ctx.lineTo(cx + bw / 2 + breathe, cy)
      ctx.stroke()

      // Scan line
      const scanY = ((t * 50) % (h + 40)) - 20
      const gradient = ctx.createLinearGradient(0, scanY - 15, 0, scanY + 15)
      gradient.addColorStop(0, "rgba(0, 229, 245, 0)")
      gradient.addColorStop(0.5, "rgba(0, 229, 245, 0.2)")
      gradient.addColorStop(1, "rgba(0, 229, 245, 0)")
      ctx.fillStyle = gradient
      ctx.fillRect(0, scanY - 15, w, 30)

      // Corner markers
      const corners = [
        [cx - bw / 2, cy - bh / 2],
        [cx + bw / 2, cy - bh / 2],
        [cx - bw / 2, cy + bh / 2],
        [cx + bw / 2, cy + bh / 2],
      ]
      corners.forEach(([x, y]) => {
        ctx.strokeStyle = "rgba(0, 229, 245, 0.7)"
        ctx.lineWidth = 1.5
        const s = 10
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

      // Data points orbiting
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + t * 0.25
        const r = 75 + Math.sin(t * 0.5 + i) * 8
        const px = cx + Math.cos(angle) * r
        const py = cy + Math.sin(angle) * r * 0.55
        const alpha = (Math.sin(t * 2 + i * 1.5) + 1) * 0.3 + 0.15

        ctx.beginPath()
        ctx.arc(px, py, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0, 229, 245, ${alpha})`
        ctx.fill()

        // Connection to building
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(cx, cy)
        ctx.strokeStyle = `rgba(0, 229, 245, ${alpha * 0.15})`
        ctx.lineWidth = 0.3
        ctx.stroke()
      }

      // Dimension labels
      ctx.font = "9px Inter, sans-serif"
      ctx.fillStyle = "rgba(0, 229, 245, 0.35)"
      ctx.fillText("48ft", cx - 12, cy + bh / 2 + 18)
      ctx.fillText("32ft", cx + bw / 2 + 8, cy + 3)
    },
    []
  )

  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene 2: Radar Comp Mapping ───── */

function RadarComps() {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      const cx = w / 2
      const cy = h / 2

      // Radar circles with labels
      for (let i = 1; i <= 5; i++) {
        const r = i * 28
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(0, 229, 245, ${0.12 - i * 0.015})`
        ctx.lineWidth = 0.6
        ctx.stroke()

        if (i <= 3) {
          ctx.font = "7px Inter, sans-serif"
          ctx.fillStyle = "rgba(0, 229, 245, 0.2)"
          ctx.fillText(`${i * 0.5}mi`, cx + r + 3, cy - 2)
        }
      }

      // Cross-hairs
      ctx.strokeStyle = "rgba(0, 229, 245, 0.06)"
      ctx.lineWidth = 0.4
      ctx.beginPath()
      ctx.moveTo(cx, cy - 140)
      ctx.lineTo(cx, cy + 140)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - 140, cy)
      ctx.lineTo(cx + 140, cy)
      ctx.stroke()

      // Radar sweep
      const sweepAngle = (t * 0.7) % (Math.PI * 2)
      const sweepGradient = ctx.createConicGradient(sweepAngle - 0.6, cx, cy)
      sweepGradient.addColorStop(0, "rgba(0, 229, 245, 0)")
      sweepGradient.addColorStop(0.07, "rgba(0, 229, 245, 0.12)")
      sweepGradient.addColorStop(0.12, "rgba(0, 229, 245, 0)")

      ctx.beginPath()
      ctx.arc(cx, cy, 140, 0, Math.PI * 2)
      ctx.fillStyle = sweepGradient
      ctx.fill()

      // Sweep line
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(
        cx + Math.cos(sweepAngle) * 140,
        cy + Math.sin(sweepAngle) * 140
      )
      ctx.strokeStyle = "rgba(0, 229, 245, 0.4)"
      ctx.lineWidth = 0.8
      ctx.stroke()

      // Comp data points
      const comps = [
        { angle: 0.5, dist: 42, label: "$285K", sim: "94%" },
        { angle: 1.2, dist: 78, label: "$310K", sim: "87%" },
        { angle: 2.4, dist: 58, label: "$265K", sim: "91%" },
        { angle: 3.6, dist: 95, label: "$295K", sim: "83%" },
        { angle: 4.5, dist: 50, label: "$340K", sim: "79%" },
        { angle: 5.3, dist: 85, label: "$275K", sim: "88%" },
      ]

      comps.forEach((comp) => {
        const px = cx + Math.cos(comp.angle) * comp.dist
        const py = cy + Math.sin(comp.angle) * comp.dist
        const isActive =
          (sweepAngle % (Math.PI * 2)) > comp.angle - 0.3 &&
          (sweepAngle % (Math.PI * 2)) < comp.angle + 0.6

        // Point
        ctx.beginPath()
        ctx.arc(px, py, isActive ? 5 : 3, 0, Math.PI * 2)
        ctx.fillStyle = isActive
          ? "rgba(0, 229, 245, 0.9)"
          : "rgba(0, 229, 245, 0.35)"
        ctx.fill()

        if (isActive) {
          // Glow
          ctx.beginPath()
          ctx.arc(px, py, 14, 0, Math.PI * 2)
          const g = ctx.createRadialGradient(px, py, 0, px, py, 14)
          g.addColorStop(0, "rgba(0, 229, 245, 0.25)")
          g.addColorStop(1, "rgba(0, 229, 245, 0)")
          ctx.fillStyle = g
          ctx.fill()

          // Label card
          ctx.fillStyle = "rgba(10, 10, 10, 0.8)"
          ctx.fillRect(px + 10, py - 18, 52, 28)
          ctx.strokeStyle = "rgba(0, 229, 245, 0.3)"
          ctx.lineWidth = 0.5
          ctx.strokeRect(px + 10, py - 18, 52, 28)

          ctx.font = "bold 10px Inter, sans-serif"
          ctx.fillStyle = "rgba(0, 229, 245, 0.9)"
          ctx.fillText(comp.label, px + 15, py - 4)
          ctx.font = "8px Inter, sans-serif"
          ctx.fillStyle = "rgba(0, 229, 245, 0.5)"
          ctx.fillText(`Sim: ${comp.sim}`, px + 15, py + 6)
        }

        // Connection
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(px, py)
        ctx.strokeStyle = `rgba(0, 229, 245, ${isActive ? 0.15 : 0.04})`
        ctx.lineWidth = 0.4
        ctx.setLineDash([2, 4])
        ctx.stroke()
        ctx.setLineDash([])
      })

      // Center (subject)
      ctx.beginPath()
      ctx.arc(cx, cy, 5, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(0, 229, 245, 0.9)"
      ctx.fill()

      ctx.beginPath()
      ctx.arc(cx, cy, 12, 0, Math.PI * 2)
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12)
      cg.addColorStop(0, "rgba(0, 229, 245, 0.3)")
      cg.addColorStop(1, "rgba(0, 229, 245, 0)")
      ctx.fillStyle = cg
      ctx.fill()

      // Subject label
      ctx.font = "8px Inter, sans-serif"
      ctx.fillStyle = "rgba(0, 229, 245, 0.4)"
      ctx.fillText("SUBJECT", cx - 18, cy + 20)
    },
    []
  )

  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene 3: 3D Wireframe House ───── */

function WireframeHouse() {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      const cx = w / 2
      const cy = h / 2
      const rotY = t * 0.4

      const project = (x: number, y: number, z: number) => {
        const cosR = Math.cos(rotY)
        const sinR = Math.sin(rotY)
        const rx = x * cosR - z * sinR
        const rz = x * sinR + z * cosR
        const scale = 280 / (280 + rz)
        return {
          x: cx + rx * scale,
          y: cy + y * scale * 0.8,
          z: rz,
          scale,
        }
      }

      const s = 55
      const baseY = 20
      const roofY = -35
      const peakY = -62

      const vertices = [
        project(-s, baseY, -s),
        project(s, baseY, -s),
        project(s, baseY, s),
        project(-s, baseY, s),
        project(-s * 1.08, roofY, -s * 1.08),
        project(s * 1.08, roofY, -s * 1.08),
        project(s * 1.08, roofY, s * 1.08),
        project(-s * 1.08, roofY, s * 1.08),
        project(0, peakY, -s * 1.08),
        project(0, peakY, s * 1.08),
      ]

      const drawLine = (from: number, to: number, alpha: number = 0.4) => {
        ctx.beginPath()
        ctx.moveTo(vertices[from].x, vertices[from].y)
        ctx.lineTo(vertices[to].x, vertices[to].y)
        ctx.strokeStyle = `rgba(0, 229, 245, ${alpha})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Floor
      drawLine(0, 1, 0.2)
      drawLine(1, 2, 0.2)
      drawLine(2, 3, 0.2)
      drawLine(3, 0, 0.2)
      // Walls
      drawLine(0, 4, 0.3)
      drawLine(1, 5, 0.3)
      drawLine(2, 6, 0.3)
      drawLine(3, 7, 0.3)
      // Roof base
      drawLine(4, 5, 0.4)
      drawLine(5, 6, 0.4)
      drawLine(6, 7, 0.4)
      drawLine(7, 4, 0.4)
      // Roof peak
      drawLine(4, 8, 0.5)
      drawLine(5, 8, 0.5)
      drawLine(6, 9, 0.5)
      drawLine(7, 9, 0.5)
      drawLine(8, 9, 0.5)

      // Damage indicators (pulsing)
      const damages = [
        { pos: project(-25, roofY - 8, -s), label: "Roof Damage", cost: "$8,500" },
        { pos: project(35, baseY - 8, s * 0.7), label: "HVAC System", cost: "$6,200" },
        { pos: project(-s * 0.5, baseY, 0), label: "Foundation", cost: "$12,000" },
      ]
      damages.forEach((d, i) => {
        const alpha = (Math.sin(t * 2.5 + i * 2) + 1) * 0.35 + 0.15

        ctx.beginPath()
        ctx.arc(d.pos.x, d.pos.y, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 70, 70, ${alpha})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(d.pos.x, d.pos.y, 12, 0, Math.PI * 2)
        const g = ctx.createRadialGradient(
          d.pos.x, d.pos.y, 0, d.pos.x, d.pos.y, 12
        )
        g.addColorStop(0, `rgba(255, 70, 70, ${alpha * 0.25})`)
        g.addColorStop(1, "rgba(255, 70, 70, 0)")
        ctx.fillStyle = g
        ctx.fill()

        // Label on hover-like reveal
        if (Math.sin(t * 1.2 + i * 1.5) > 0.3) {
          ctx.font = "8px Inter, sans-serif"
          ctx.fillStyle = `rgba(255, 120, 120, 0.7)`
          ctx.fillText(d.label, d.pos.x + 10, d.pos.y - 3)
          ctx.fillStyle = `rgba(255, 120, 120, 0.45)`
          ctx.fillText(d.cost, d.pos.x + 10, d.pos.y + 8)
        }
      })

      // Measurement scan
      const scanProgress = (t * 0.25) % 1
      const scanY2 = baseY + (roofY - baseY) * scanProgress
      const scanL = project(-s * 1.3, scanY2, 0)
      const scanR = project(s * 1.3, scanY2, 0)
      ctx.beginPath()
      ctx.moveTo(scanL.x, scanL.y)
      ctx.lineTo(scanR.x, scanR.y)
      ctx.strokeStyle = "rgba(0, 229, 245, 0.15)"
      ctx.lineWidth = 0.4
      ctx.setLineDash([2, 3])
      ctx.stroke()
      ctx.setLineDash([])
    },
    []
  )

  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene 4: Neural Network Cube ───── */

function NeuralCube() {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      const cx = w / 2
      const cy = h / 2
      const rotX = t * 0.25
      const rotY = t * 0.35

      const project3D = (x: number, y: number, z: number) => {
        let rx = x * Math.cos(rotY) - z * Math.sin(rotY)
        let rz = x * Math.sin(rotY) + z * Math.cos(rotY)
        let ry = y * Math.cos(rotX) - rz * Math.sin(rotX)
        rz = y * Math.sin(rotX) + rz * Math.cos(rotX)
        const scale = 240 / (240 + rz)
        return { x: cx + rx * scale, y: cy + ry * scale, z: rz }
      }

      // 3x3x3 cube grid
      const nodes: { x: number; y: number; z: number }[] = []
      const spacing = 35
      for (let ix = -1; ix <= 1; ix++) {
        for (let iy = -1; iy <= 1; iy++) {
          for (let iz = -1; iz <= 1; iz++) {
            nodes.push(project3D(ix * spacing, iy * spacing, iz * spacing))
          }
        }
      }

      // Connections
      nodes.forEach((a, i) => {
        nodes.forEach((b, j) => {
          if (i >= j) return
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 90) {
            const firing = Math.sin(t * 3.5 + i * 0.5 + j * 0.3) > 0.65
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = firing
              ? "rgba(0, 229, 245, 0.5)"
              : "rgba(0, 229, 245, 0.05)"
            ctx.lineWidth = firing ? 1.2 : 0.4
            ctx.stroke()

            // Pulse traveling
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

      // Nodes
      nodes.forEach((n, i) => {
        const active = Math.sin(t * 2.5 + i * 0.7) > 0.2
        const size = active ? 3.5 : 2

        ctx.beginPath()
        ctx.arc(n.x, n.y, size, 0, Math.PI * 2)
        ctx.fillStyle = active
          ? "rgba(0, 229, 245, 0.85)"
          : "rgba(0, 229, 245, 0.2)"
        ctx.fill()

        if (active) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, 10, 0, Math.PI * 2)
          const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 10)
          g.addColorStop(0, "rgba(0, 229, 245, 0.15)")
          g.addColorStop(1, "rgba(0, 229, 245, 0)")
          ctx.fillStyle = g
          ctx.fill()
        }
      })

      // Outer data labels
      const labels = ["ARV", "CAP", "ROI", "NOI", "GRM", "DSCR"]
      labels.forEach((label, i) => {
        const angle = (i / labels.length) * Math.PI * 2 + t * 0.15
        const dist = 110 + Math.sin(t + i) * 8
        const sx = cx + Math.cos(angle) * dist
        const sy = cy + Math.sin(angle) * dist

        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(cx, cy)
        ctx.strokeStyle = "rgba(0, 229, 245, 0.06)"
        ctx.lineWidth = 0.4
        ctx.setLineDash([1, 4])
        ctx.stroke()
        ctx.setLineDash([])

        ctx.font = "bold 8px Inter, sans-serif"
        ctx.fillStyle = "rgba(0, 229, 245, 0.35)"
        ctx.fillText(label, sx - 10, sy - 6)
      })
    },
    []
  )

  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene 5: Lock-In ───── */

function LockInAnimation() {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
      const cx = w / 2
      const cy = h / 2

      // Converging rings
      const rings = 6
      for (let i = 0; i < rings; i++) {
        const baseR = 130 - i * 18
        const targetR = 25
        const progress = Math.min(t / 3, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        const r = baseR - (baseR - targetR) * eased

        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(0, 229, 245, ${0.08 + i * 0.04 + eased * 0.2})`
        ctx.lineWidth = 0.8 + eased * 0.5
        ctx.stroke()
      }

      // Lock icon
      if (t > 1.5) {
        const lockAlpha = Math.min((t - 1.5) / 1.5, 1)
        const lw = 22
        const lh = 18

        ctx.strokeStyle = `rgba(0, 229, 245, ${lockAlpha * 0.75})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.roundRect(cx - lw / 2, cy - 2, lw, lh, 3)
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(cx, cy - 2, 9, Math.PI, 0)
        ctx.stroke()

        if (t > 2.5) {
          const dotAlpha = Math.min((t - 2.5) / 0.5, 1)
          ctx.beginPath()
          ctx.arc(cx, cy + 5, 2.5, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(0, 229, 245, ${dotAlpha})`
          ctx.fill()

          // Glow
          ctx.beginPath()
          ctx.arc(cx, cy + 5, 18, 0, Math.PI * 2)
          const g = ctx.createRadialGradient(cx, cy + 5, 0, cx, cy + 5, 18)
          g.addColorStop(0, `rgba(0, 229, 245, ${dotAlpha * 0.25})`)
          g.addColorStop(1, "rgba(0, 229, 245, 0)")
          ctx.fillStyle = g
          ctx.fill()
        }
      }

      // Checkmark
      if (t > 3) {
        const alpha = Math.min((t - 3) / 0.8, 1)

        ctx.beginPath()
        ctx.arc(cx, cy + 48, 14, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(0, 229, 245, ${alpha * 0.5})`
        ctx.lineWidth = 1.2
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(cx - 5, cy + 48)
        ctx.lineTo(cx - 1, cy + 53)
        ctx.lineTo(cx + 6, cy + 42)
        ctx.strokeStyle = `rgba(0, 229, 245, ${alpha})`
        ctx.lineWidth = 1.8
        ctx.stroke()

        // "OFFER LOCKED" text
        ctx.font = "bold 9px Inter, sans-serif"
        ctx.fillStyle = `rgba(0, 229, 245, ${alpha * 0.6})`
        ctx.textAlign = "center"
        ctx.fillText("OFFER LOCKED", cx, cy + 75)
        ctx.textAlign = "start"
      }

      // Converging particles
      if (t < 3) {
        for (let i = 0; i < 14; i++) {
          const angle = (i / 14) * Math.PI * 2 + t * 0.4
          const dist = 130 * (1 - Math.min(t / 3, 1) * 0.85)
          const px = cx + Math.cos(angle) * dist
          const py = cy + Math.sin(angle) * dist

          ctx.beginPath()
          ctx.arc(px, py, 1.8, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(0, 229, 245, ${0.25 + Math.sin(t * 2 + i) * 0.15})`
          ctx.fill()
        }
      }
    },
    []
  )

  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene Configs ───── */

const scenes = [
  {
    id: "parcel",
    title: "Parcel Verification",
    subtitle: "Retrieving county parcel data and lot boundaries...",
    microText: "Accessing public records API",
    progress: 20,
    Component: WireframeScan,
    duration: 3500,
  },
  {
    id: "comps",
    title: "Market Comparables",
    subtitle: "Analyzing similarity across 3-mile radius...",
    microText: "6 comparable sales identified",
    progress: 40,
    Component: RadarComps,
    duration: 3500,
  },
  {
    id: "repair",
    title: "Repair Estimation",
    subtitle: "Scanning structural integrity and repair costs...",
    microText: "Cross-referencing contractor databases",
    progress: 60,
    Component: WireframeHouse,
    duration: 3500,
  },
  {
    id: "neural",
    title: "Investor Math Engine",
    subtitle: "Applying investor-grade heuristics across 47 data points...",
    microText: "Neural network consensus forming",
    progress: 80,
    Component: NeuralCube,
    duration: 3500,
  },
  {
    id: "lockin",
    title: "Finalizing Cash Offer",
    subtitle: "Locking in your personalized offer amount...",
    microText: "Confidence threshold exceeded",
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
    <div className="fixed inset-0 bg-[#060606] flex flex-col items-center justify-center z-50">
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 229, 245, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 229, 245, 0.025) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
        aria-hidden="true"
      />

      {/* Ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(0, 229, 245, 0.04) 0%, transparent 60%)",
        }}
        aria-hidden="true"
      />

      {/* Scene content */}
      <div
        className="flex flex-col items-center w-full max-w-md px-4"
        style={{
          opacity: sceneTransition ? 0 : 1,
          transform: sceneTransition ? "scale(0.97)" : "scale(1)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}
      >
        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-6">
          {scenes.map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-full transition-all duration-500"
              style={{
                width: i === currentScene ? "28px" : "10px",
                background:
                  i < currentScene
                    ? "#00E5F5"
                    : i === currentScene
                      ? "linear-gradient(90deg, #00B8C5, #00E5F5)"
                      : "rgba(0, 229, 245, 0.12)",
                boxShadow:
                  i === currentScene
                    ? "0 0 10px rgba(0, 229, 245, 0.4)"
                    : "none",
              }}
            />
          ))}
        </div>

        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-neon/40 mb-1.5">
          Step {currentScene + 1} of {scenes.length}
        </p>
        <h2 className="font-display text-2xl md:text-3xl font-bold neon-text mb-1 text-center text-balance">
          {scene.title}
        </h2>

        {/* Canvas */}
        <div
          className="w-full aspect-square max-w-[280px] my-5 rounded-xl overflow-hidden"
          style={{
            border: "1px solid rgba(0, 229, 245, 0.08)",
            background: "rgba(8, 8, 8, 0.9)",
            boxShadow: "inset 0 0 40px rgba(0, 229, 245, 0.02)",
          }}
        >
          <SceneComponent />
        </div>

        {/* Typing status */}
        <div className="h-6 mb-1">
          <TypingText
            key={scene.id}
            text={scene.subtitle}
            speed={22}
            className="text-sm text-muted-foreground font-sans"
          />
        </div>

        {/* Micro text */}
        <p className="text-[10px] text-muted-foreground/30 font-mono mb-5">
          {scene.microText}
        </p>

        {/* Progress */}
        <div className="w-full max-w-xs">
          <NeonProgress
            value={scene.progress}
            duration={scene.duration - 800}
            label="Analysis Progress"
          />
        </div>

        {/* Address */}
        <p className="text-[10px] text-muted-foreground/25 mt-6 font-mono">
          {address}
        </p>
      </div>
    </div>
  )
}
