"use client"

/**
 * Ambient spatial backdrop for the seller journey.
 *
 * Three rules govern this component:
 *
 * 1. IT IS DECORATIVE AND MUST BE ABLE TO FAIL. It is `aria-hidden`, sits
 *    behind the form at a negative z-index, and never receives pointer events.
 *    If the canvas cannot initialise, the journey is unaffected — the core form
 *    does not depend on it in any way.
 * 2. IT RESPECTS `prefers-reduced-motion`. Under reduced motion the animation
 *    loop never starts; a single static frame is painted instead, so the depth
 *    remains without the movement.
 * 3. IT IS NOT A DATA VISUALISATION. The points are ambient geometry. Nothing
 *    here is derived from the seller's property, from market data, or from any
 *    live figure — showing invented "activity" as though it were real would be
 *    fabricating evidence to a seller who is making a financial decision.
 */

import { useEffect, useRef } from "react"

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  glow: number
  phase: number
}

export function JourneyAtmosphere({ intensity = 1 }: { intensity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    let frame = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    const nodes: Node[] = []

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    // Density scales with viewport area so a phone is not asked to composite a
    // desktop-sized particle field.
    const area = canvas.offsetWidth * canvas.offsetHeight
    const count = Math.max(14, Math.min(46, Math.round((area / 26000) * intensity)))

    for (let i = 0; i < count; i += 1) {
      nodes.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.09,
        vy: (Math.random() - 0.5) * 0.07,
        r: Math.random() * 1.5 + 0.5,
        glow: Math.random() * 0.3 + 0.08,
        phase: Math.random() * Math.PI * 2,
      })
    }

    const draw = (t: number) => {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)

      // Signal paths between near neighbours — the "spatial" read.
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.hypot(dx, dy)
          if (dist > 140) continue
          const alpha = (1 - dist / 140) * 0.14
          ctx.strokeStyle = `rgba(0, 228, 255, ${alpha})`
          ctx.lineWidth = 0.6
          ctx.beginPath()
          ctx.moveTo(nodes[i].x, nodes[i].y)
          ctx.lineTo(nodes[j].x, nodes[j].y)
          ctx.stroke()
        }
      }

      for (const n of nodes) {
        if (!reduced) {
          n.x += n.vx
          n.y += n.vy
          if (n.x < -20) n.x = w + 20
          if (n.x > w + 20) n.x = -20
          if (n.y < -20) n.y = h + 20
          if (n.y > h + 20) n.y = -20
        }
        const pulse = reduced ? 0.6 : 0.6 + Math.sin(t / 1400 + n.phase) * 0.4
        ctx.fillStyle = `rgba(0, 228, 255, ${n.glow * pulse})`
        ctx.shadowBlur = 10
        ctx.shadowColor = "rgba(0, 228, 255, 0.35)"
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    if (reduced) {
      // One static frame: depth without movement.
      draw(0)
    } else {
      const loop = (t: number) => {
        draw(t)
        frame = requestAnimationFrame(loop)
      }
      frame = requestAnimationFrame(loop)
    }

    window.addEventListener("resize", resize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", resize)
    }
  }, [intensity])

  return (
    // z-0 rather than a negative index: the journey root paints its own opaque
    // background, and a negative-z child of a non-stacking-context parent
    // renders BEHIND that background — i.e. invisible. Explicit 0/10 layering
    // keeps this unambiguous.
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Base gradient reads as depth even if the canvas never paints. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(0,228,255,0.10),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_110%,rgba(20,255,161,0.06),transparent_55%)]" />
      <canvas ref={canvasRef} className="h-full w-full opacity-80" />
      {/* Vignette keeps the centre interaction surface dominant. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(4,7,10,0.7)_100%)]" />
    </div>
  )
}
