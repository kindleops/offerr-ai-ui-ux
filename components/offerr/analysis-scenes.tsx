"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { TypingText } from "./typing-text"
import { NeonProgress } from "./neon-progress"

interface AnalysisScenesProps { address: string; onComplete: () => void }

/* ───── Canvas Hook ───── */
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
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize) }
  }, [draw])
  return canvasRef
}

/* ───── Scene 1: Wireframe Property Scan ───── */
function WireframeScan() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const cx = w / 2, cy = h / 2

    // Faint grid
    ctx.strokeStyle = "rgba(0,228,255,0.025)"
    ctx.lineWidth = 0.4
    for (let x = 0; x < w; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    for (let y = 0; y < h; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }

    const bw = 130, bh = 90, breathe = Math.sin(t * 0.5) * 2

    // Lot boundary dashed
    ctx.strokeStyle = "rgba(0,228,255,0.15)"
    ctx.lineWidth = 0.7
    ctx.setLineDash([5, 4])
    ctx.strokeRect(cx - bw * 0.85 + breathe, cy - bh * 0.75, bw * 1.7, bh * 1.5)
    ctx.setLineDash([])

    // Building footprint
    ctx.strokeStyle = "rgba(0,228,255,0.45)"
    ctx.lineWidth = 1.2
    ctx.strokeRect(cx - bw / 2 + breathe, cy - bh / 2, bw, bh)

    // Roof
    ctx.beginPath()
    ctx.moveTo(cx - bw / 2 - 10 + breathe, cy - bh / 2)
    ctx.lineTo(cx + breathe, cy - bh / 2 - 45)
    ctx.lineTo(cx + bw / 2 + 10 + breathe, cy - bh / 2)
    ctx.strokeStyle = "rgba(0,228,255,0.5)"
    ctx.lineWidth = 1.3
    ctx.stroke()

    // Room dividers
    ctx.strokeStyle = "rgba(0,228,255,0.08)"
    ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(cx + breathe, cy - bh / 2); ctx.lineTo(cx + breathe, cy + bh / 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - bw / 2 + breathe, cy); ctx.lineTo(cx + bw / 2 + breathe, cy); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - bw / 4 + breathe, cy); ctx.lineTo(cx - bw / 4 + breathe, cy + bh / 2); ctx.stroke()

    // Scan line
    const scanY = ((t * 40) % (h + 40)) - 20
    const sg = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20)
    sg.addColorStop(0, "rgba(0,228,255,0)")
    sg.addColorStop(0.5, "rgba(0,228,255,0.15)")
    sg.addColorStop(1, "rgba(0,228,255,0)")
    ctx.fillStyle = sg
    ctx.fillRect(0, scanY - 20, w, 40)

    // Corner markers
    const corners = [[cx - bw / 2, cy - bh / 2], [cx + bw / 2, cy - bh / 2], [cx - bw / 2, cy + bh / 2], [cx + bw / 2, cy + bh / 2]]
    corners.forEach(([x, y]) => {
      ctx.strokeStyle = "rgba(0,228,255,0.65)"
      ctx.lineWidth = 1.5
      const s = 10
      ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x, y); ctx.lineTo(x, y - s); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x + s, y); ctx.lineTo(x, y); ctx.lineTo(x, y + s); ctx.stroke()
    })

    // Data points orbiting
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + t * 0.2
      const r = 82 + Math.sin(t * 0.4 + i) * 6
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.5
      const alpha = (Math.sin(t * 1.5 + i * 1.2) + 1) * 0.25 + 0.12
      ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fillStyle = `rgba(0,228,255,${alpha})`; ctx.fill()
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx, cy); ctx.strokeStyle = `rgba(0,228,255,${alpha * 0.1})`; ctx.lineWidth = 0.3; ctx.stroke()
    }

    // Dimension labels
    ctx.font = "8px Inter, sans-serif"
    ctx.fillStyle = "rgba(0,228,255,0.3)"
    ctx.fillText("48ft", cx - 10, cy + bh / 2 + 16)
    ctx.fillText("32ft", cx + bw / 2 + 8, cy + 3)
    ctx.fillText("LOT: 6,200 SQFT", cx - 32, cy + bh * 0.75 + 28)
  }, [])
  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene 2: Radar Comp Mapping ───── */
function RadarComps() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const cx = w / 2, cy = h / 2

    // Radar rings with distance labels
    for (let i = 1; i <= 5; i++) {
      const r = i * 26
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(0,228,255,${0.08 - i * 0.01})`; ctx.lineWidth = 0.5; ctx.stroke()
      if (i <= 3) { ctx.font = "7px Inter, sans-serif"; ctx.fillStyle = "rgba(0,228,255,0.18)"; ctx.fillText(`${i * 0.5}mi`, cx + r + 3, cy - 2) }
    }

    // Cross-hairs
    ctx.strokeStyle = "rgba(0,228,255,0.04)"; ctx.lineWidth = 0.3
    ctx.beginPath(); ctx.moveTo(cx, cy - 130); ctx.lineTo(cx, cy + 130); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - 130, cy); ctx.lineTo(cx + 130, cy); ctx.stroke()

    // Sweep
    const sweepAngle = (t * 0.6) % (Math.PI * 2)
    const sweepG = ctx.createConicGradient(sweepAngle - 0.5, cx, cy)
    sweepG.addColorStop(0, "rgba(0,228,255,0)")
    sweepG.addColorStop(0.06, "rgba(0,228,255,0.1)")
    sweepG.addColorStop(0.1, "rgba(0,228,255,0)")
    ctx.beginPath(); ctx.arc(cx, cy, 130, 0, Math.PI * 2); ctx.fillStyle = sweepG; ctx.fill()

    // Sweep line
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweepAngle) * 130, cy + Math.sin(sweepAngle) * 130)
    ctx.strokeStyle = "rgba(0,228,255,0.35)"; ctx.lineWidth = 0.7; ctx.stroke()

    // Comps
    const comps = [
      { angle: 0.5, dist: 40, label: "$285K", sim: "94%" },
      { angle: 1.2, dist: 75, label: "$310K", sim: "87%" },
      { angle: 2.4, dist: 55, label: "$265K", sim: "91%" },
      { angle: 3.6, dist: 90, label: "$295K", sim: "83%" },
      { angle: 4.5, dist: 48, label: "$340K", sim: "79%" },
      { angle: 5.3, dist: 82, label: "$275K", sim: "88%" },
    ]
    comps.forEach((c) => {
      const px = cx + Math.cos(c.angle) * c.dist
      const py = cy + Math.sin(c.angle) * c.dist
      const active = (sweepAngle % (Math.PI * 2)) > c.angle - 0.3 && (sweepAngle % (Math.PI * 2)) < c.angle + 0.5

      ctx.beginPath(); ctx.arc(px, py, active ? 4.5 : 2.5, 0, Math.PI * 2)
      ctx.fillStyle = active ? "rgba(0,228,255,0.9)" : "rgba(0,228,255,0.3)"; ctx.fill()

      if (active) {
        ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2)
        const g = ctx.createRadialGradient(px, py, 0, px, py, 14)
        g.addColorStop(0, "rgba(0,228,255,0.2)"); g.addColorStop(1, "rgba(0,228,255,0)")
        ctx.fillStyle = g; ctx.fill()

        // Label
        ctx.fillStyle = "rgba(4,7,10,0.85)"
        ctx.fillRect(px + 10, py - 18, 50, 26)
        ctx.strokeStyle = "rgba(0,228,255,0.25)"; ctx.lineWidth = 0.5
        ctx.strokeRect(px + 10, py - 18, 50, 26)
        ctx.font = "bold 9px Inter, sans-serif"; ctx.fillStyle = "rgba(0,228,255,0.9)"
        ctx.fillText(c.label, px + 14, py - 5)
        ctx.font = "7px Inter, sans-serif"; ctx.fillStyle = "rgba(0,228,255,0.45)"
        ctx.fillText(`Sim: ${c.sim}`, px + 14, py + 5)
      }

      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py)
      ctx.strokeStyle = `rgba(0,228,255,${active ? 0.12 : 0.03})`; ctx.lineWidth = 0.3
      ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([])
    })

    // Center
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,228,255,0.9)"; ctx.fill()
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14)
    cg.addColorStop(0, "rgba(0,228,255,0.25)"); cg.addColorStop(1, "rgba(0,228,255,0)")
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill()
    ctx.font = "7px Inter, sans-serif"; ctx.fillStyle = "rgba(0,228,255,0.35)"; ctx.fillText("SUBJECT", cx - 16, cy + 20)
  }, [])
  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene 3: 3D Wireframe House ───── */
function WireframeHouse() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const cx = w / 2, cy = h / 2, rotY = t * 0.35
    const project = (x: number, y: number, z: number) => {
      const c = Math.cos(rotY), s = Math.sin(rotY)
      const rx = x * c - z * s, rz = x * s + z * c
      const sc = 280 / (280 + rz)
      return { x: cx + rx * sc, y: cy + y * sc * 0.8, z: rz, scale: sc }
    }

    const sz = 55, baseY = 20, roofY = -35, peakY = -64
    const v = [
      project(-sz, baseY, -sz), project(sz, baseY, -sz), project(sz, baseY, sz), project(-sz, baseY, sz),
      project(-sz * 1.08, roofY, -sz * 1.08), project(sz * 1.08, roofY, -sz * 1.08),
      project(sz * 1.08, roofY, sz * 1.08), project(-sz * 1.08, roofY, sz * 1.08),
      project(0, peakY, -sz * 1.08), project(0, peakY, sz * 1.08),
    ]

    const line = (a: number, b: number, alpha: number = 0.35) => {
      ctx.beginPath(); ctx.moveTo(v[a].x, v[a].y); ctx.lineTo(v[b].x, v[b].y)
      ctx.strokeStyle = `rgba(0,228,255,${alpha})`; ctx.lineWidth = 0.9; ctx.stroke()
    }

    // Floor
    line(0, 1, 0.15); line(1, 2, 0.15); line(2, 3, 0.15); line(3, 0, 0.15)
    // Walls
    line(0, 4, 0.25); line(1, 5, 0.25); line(2, 6, 0.25); line(3, 7, 0.25)
    // Roof base
    line(4, 5, 0.35); line(5, 6, 0.35); line(6, 7, 0.35); line(7, 4, 0.35)
    // Roof peak
    line(4, 8, 0.45); line(5, 8, 0.45); line(6, 9, 0.45); line(7, 9, 0.45); line(8, 9, 0.45)

    // Damage hotspots
    const damages = [
      { pos: project(-25, roofY - 8, -sz), label: "Roof Damage", cost: "$8,500", sev: 0.7 },
      { pos: project(35, baseY - 8, sz * 0.7), label: "HVAC System", cost: "$6,200", sev: 0.5 },
      { pos: project(-sz * 0.5, baseY, 0), label: "Foundation", cost: "$12,000", sev: 0.9 },
    ]
    damages.forEach((d, i) => {
      const alpha = (Math.sin(t * 2.2 + i * 2) + 1) * 0.3 + 0.2
      const r = Math.round(255 * d.sev), g = Math.round(80 * (1 - d.sev))
      ctx.beginPath(); ctx.arc(d.pos.x, d.pos.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${r},${g},80,${alpha})`; ctx.fill()
      ctx.beginPath(); ctx.arc(d.pos.x, d.pos.y, 12, 0, Math.PI * 2)
      const glow = ctx.createRadialGradient(d.pos.x, d.pos.y, 0, d.pos.x, d.pos.y, 12)
      glow.addColorStop(0, `rgba(${r},${g},80,${alpha * 0.2})`); glow.addColorStop(1, `rgba(${r},${g},80,0)`)
      ctx.fillStyle = glow; ctx.fill()

      if (Math.sin(t * 1.1 + i * 1.5) > 0.2) {
        ctx.font = "7px Inter, sans-serif"
        ctx.fillStyle = `rgba(255,120,120,0.6)`; ctx.fillText(d.label, d.pos.x + 10, d.pos.y - 2)
        ctx.fillStyle = `rgba(255,120,120,0.35)`; ctx.fillText(d.cost, d.pos.x + 10, d.pos.y + 8)
      }
    })

    // Measurement scan
    const scanProg = (t * 0.2) % 1
    const sy = baseY + (roofY - baseY) * scanProg
    const sL = project(-sz * 1.3, sy, 0), sR = project(sz * 1.3, sy, 0)
    ctx.beginPath(); ctx.moveTo(sL.x, sL.y); ctx.lineTo(sR.x, sR.y)
    ctx.strokeStyle = "rgba(0,228,255,0.1)"; ctx.lineWidth = 0.3; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([])
  }, [])
  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene 4: Neural Network Cube ───── */
function NeuralCube() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const cx = w / 2, cy = h / 2, rX = t * 0.2, rY = t * 0.3
    const p3d = (x: number, y: number, z: number) => {
      let rx = x * Math.cos(rY) - z * Math.sin(rY)
      let rz = x * Math.sin(rY) + z * Math.cos(rY)
      let ry = y * Math.cos(rX) - rz * Math.sin(rX)
      rz = y * Math.sin(rX) + rz * Math.cos(rX)
      const sc = 240 / (240 + rz)
      return { x: cx + rx * sc, y: cy + ry * sc, z: rz }
    }

    const nodes: { x: number; y: number; z: number }[] = []
    const sp = 35
    for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) for (let iz = -1; iz <= 1; iz++) nodes.push(p3d(ix * sp, iy * sp, iz * sp))

    // Connections
    nodes.forEach((a, i) => {
      nodes.forEach((b, j) => {
        if (i >= j) return
        const dx = a.x - b.x, dy = a.y - b.y, dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 85) {
          const firing = Math.sin(t * 3 + i * 0.5 + j * 0.3) > 0.6
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = firing ? "rgba(0,228,255,0.45)" : "rgba(0,228,255,0.04)"
          ctx.lineWidth = firing ? 1 : 0.3; ctx.stroke()
          if (firing) {
            const pr = (t * 2 + i * 0.3) % 1
            const px = a.x + (b.x - a.x) * pr, py = a.y + (b.y - a.y) * pr
            ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2)
            ctx.fillStyle = "rgba(0,228,255,0.7)"; ctx.fill()
          }
        }
      })
    })

    // Nodes
    nodes.forEach((n, i) => {
      const active = Math.sin(t * 2 + i * 0.6) > 0.15
      ctx.beginPath(); ctx.arc(n.x, n.y, active ? 3 : 1.8, 0, Math.PI * 2)
      ctx.fillStyle = active ? "rgba(0,228,255,0.8)" : "rgba(0,228,255,0.15)"; ctx.fill()
      if (active) {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 9)
        g.addColorStop(0, "rgba(0,228,255,0.12)"); g.addColorStop(1, "rgba(0,228,255,0)")
        ctx.beginPath(); ctx.arc(n.x, n.y, 9, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      }
    })

    // Metric labels
    const labels = ["ARV", "CAP", "ROI", "NOI", "GRM", "DSCR"]
    labels.forEach((label, i) => {
      const a = (i / labels.length) * Math.PI * 2 + t * 0.12
      const d = 105 + Math.sin(t + i) * 6
      const sx = cx + Math.cos(a) * d, sy = cy + Math.sin(a) * d
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cx, cy)
      ctx.strokeStyle = "rgba(0,228,255,0.04)"; ctx.lineWidth = 0.3; ctx.setLineDash([1, 4]); ctx.stroke(); ctx.setLineDash([])
      ctx.font = "bold 7px Inter, sans-serif"; ctx.fillStyle = "rgba(0,228,255,0.3)"; ctx.fillText(label, sx - 8, sy - 5)
    })
  }, [])
  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene 5: Lock-In ───── */
function LockInAnimation() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const cx = w / 2, cy = h / 2

    // Converging rings
    for (let i = 0; i < 6; i++) {
      const baseR = 130 - i * 18, targetR = 25
      const pr = Math.min(t / 3, 1), eased = 1 - Math.pow(1 - pr, 3)
      const r = baseR - (baseR - targetR) * eased
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(0,228,255,${0.06 + i * 0.03 + eased * 0.18})`
      ctx.lineWidth = 0.7 + eased * 0.5; ctx.stroke()
    }

    // Lock icon
    if (t > 1.5) {
      const la = Math.min((t - 1.5) / 1.5, 1)
      const lw = 22, lh = 18
      ctx.strokeStyle = `rgba(0,228,255,${la * 0.7})`; ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.roundRect(cx - lw / 2, cy - 2, lw, lh, 3); ctx.stroke()
      ctx.beginPath(); ctx.arc(cx, cy - 2, 9, Math.PI, 0); ctx.stroke()

      if (t > 2.5) {
        const da = Math.min((t - 2.5) / 0.5, 1)
        ctx.beginPath(); ctx.arc(cx, cy + 5, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0,228,255,${da})`; ctx.fill()
        const g = ctx.createRadialGradient(cx, cy + 5, 0, cx, cy + 5, 18)
        g.addColorStop(0, `rgba(0,228,255,${da * 0.2})`); g.addColorStop(1, "rgba(0,228,255,0)")
        ctx.beginPath(); ctx.arc(cx, cy + 5, 18, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      }
    }

    // Checkmark & text
    if (t > 3) {
      const a = Math.min((t - 3) / 0.8, 1)
      ctx.beginPath(); ctx.arc(cx, cy + 48, 14, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(20,255,161,${a * 0.4})`; ctx.lineWidth = 1; ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx - 5, cy + 48); ctx.lineTo(cx - 1, cy + 53); ctx.lineTo(cx + 6, cy + 42)
      ctx.strokeStyle = `rgba(20,255,161,${a * 0.9})`; ctx.lineWidth = 1.8; ctx.stroke()
      ctx.font = "bold 8px Inter, sans-serif"; ctx.fillStyle = `rgba(0,228,255,${a * 0.5})`
      ctx.textAlign = "center"; ctx.fillText("OFFER LOCKED", cx, cy + 75); ctx.textAlign = "start"
    }

    // Converging particles
    if (t < 3) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + t * 0.35
        const d = 130 * (1 - Math.min(t / 3, 1) * 0.85)
        const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d
        ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0,228,255,${0.2 + Math.sin(t * 2 + i) * 0.12})`; ctx.fill()
      }
    }
  }, [])
  const canvasRef = useCanvas(draw)
  return <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
}

/* ───── Scene Configs ───── */
const scenes = [
  { id: "parcel", title: "Parcel Verification", subtitle: "Retrieving county parcel data and lot boundaries...", microText: "Accessing public records API", progress: 20, Component: WireframeScan, duration: 3500 },
  { id: "comps", title: "Market Comparables", subtitle: "Analyzing similarity across 3-mile radius...", microText: "6 comparable sales identified", progress: 40, Component: RadarComps, duration: 3500 },
  { id: "repair", title: "Repair Estimation", subtitle: "Scanning structural integrity and repair costs...", microText: "Cross-referencing contractor databases", progress: 60, Component: WireframeHouse, duration: 3500 },
  { id: "neural", title: "Investor Math Engine", subtitle: "Applying investor-grade heuristics across 47 data points...", microText: "Neural network consensus forming", progress: 80, Component: NeuralCube, duration: 3500 },
  { id: "lockin", title: "Finalizing Cash Offer", subtitle: "Locking in your personalized offer amount...", microText: "Confidence threshold exceeded", progress: 100, Component: LockInAnimation, duration: 4000 },
]

/* ───── Main ───── */
export function AnalysisScenes({ address, onComplete }: AnalysisScenesProps) {
  const [currentScene, setCurrentScene] = useState(0)
  const [sceneTransition, setSceneTransition] = useState(true)

  useEffect(() => {
    if (currentScene >= scenes.length) { onComplete(); return }
    let nextTimer: ReturnType<typeof setTimeout>
    setSceneTransition(true)
    const fadeIn = setTimeout(() => setSceneTransition(false), 100)
    const sceneTimer = setTimeout(() => {
      setSceneTransition(true)
      nextTimer = setTimeout(() => setCurrentScene((p) => p + 1), 600)
    }, scenes[currentScene].duration)
    return () => { clearTimeout(fadeIn); clearTimeout(sceneTimer); clearTimeout(nextTimer) }
  }, [currentScene, onComplete])

  if (currentScene >= scenes.length) return null
  const scene = scenes[currentScene]
  const SceneComponent = scene.Component

  return (
    <div className="fixed inset-0 bg-[#04070A] flex flex-col items-center justify-center z-50">
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `linear-gradient(rgba(0,228,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(0,228,255,0.018) 1px, transparent 1px)`, backgroundSize: "40px 40px" }}
        aria-hidden="true" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(0,228,255,0.035) 0%, transparent 55%)" }} aria-hidden="true" />

      <div className="flex flex-col items-center w-full max-w-md px-4"
        style={{ opacity: sceneTransition ? 0 : 1, transform: sceneTransition ? "scale(0.97)" : "scale(1)", transition: "opacity 0.6s ease, transform 0.6s ease" }}>
        {/* Step dots */}
        <div className="flex items-center gap-2 mb-6">
          {scenes.map((_, i) => (
            <div key={i} className="h-1 rounded-full transition-all duration-500"
              style={{
                width: i === currentScene ? "28px" : "10px",
                background: i < currentScene ? "#00E4FF" : i === currentScene ? "linear-gradient(90deg, #00B8D4, #00E4FF)" : "rgba(0,228,255,0.1)",
                boxShadow: i === currentScene ? "0 0 10px rgba(0,228,255,0.35)" : "none",
              }} />
          ))}
        </div>

        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-neon/35 mb-1.5">
          Step {currentScene + 1} of {scenes.length}
        </p>
        <h2 className="font-display text-2xl md:text-3xl font-bold neon-text mb-1 text-center text-balance">{scene.title}</h2>

        <div className="w-full aspect-square max-w-[280px] my-5 rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(0,228,255,0.06)", background: "rgba(4,7,10,0.9)", boxShadow: "inset 0 0 40px rgba(0,228,255,0.015), 0 8px 32px rgba(0,0,0,0.5)" }}>
          <SceneComponent />
        </div>

        <div className="h-6 mb-1">
          <TypingText key={scene.id} text={scene.subtitle} speed={20} className="text-sm text-[#6C7A89] font-sans" />
        </div>
        <p className="text-[10px] text-[#6C7A89]/30 font-mono mb-5">{scene.microText}</p>

        <div className="w-full max-w-xs">
          <NeonProgress value={scene.progress} duration={scene.duration - 800} label="Analysis Progress" />
        </div>

        <p className="text-[10px] text-[#6C7A89]/20 mt-6 font-mono">{address}</p>
      </div>
    </div>
  )
}
