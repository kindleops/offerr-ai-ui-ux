"use client"

import { useEffect, useRef } from "react"

interface Particle {
  x: number; y: number; vx: number; vy: number
  size: number; opacity: number; life: number; maxLife: number
  hue: number
}

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let frame: number
    const particles: Particle[] = []
    const count = 55

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.12 - 0.05,
        size: Math.random() * 1.4 + 0.4,
        opacity: Math.random() * 0.35 + 0.04,
        life: Math.random() * 1000,
        maxLife: 900 + Math.random() * 500,
        hue: 187 + Math.random() * 20 - 10,
      })
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        p.life++
        if (p.life > p.maxLife) {
          p.x = Math.random() * canvas.width
          p.y = canvas.height + 10
          p.life = 0
        }
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < -10) { p.y = canvas.height + 10; p.life = 0 }

        const lf = p.life / p.maxLife
        const alpha = lf < 0.1 ? lf * 10 * p.opacity : lf > 0.9 ? (1 - lf) * 10 * p.opacity : p.opacity

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 100%, 50%, ${alpha})`
        ctx.fill()

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5)
        g.addColorStop(0, `hsla(${p.hue}, 100%, 50%, ${alpha * 0.15})`)
        g.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()
      })

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 140) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(0, 228, 255, ${(1 - dist / 140) * 0.04})`
            ctx.lineWidth = 0.3
            ctx.stroke()
          }
        }
      }

      frame = requestAnimationFrame(animate)
    }
    animate()
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} aria-hidden="true" />
}
