"use client"

import { useState, useEffect } from "react"

interface TypingTextProps {
  text: string
  delay?: number
  speed?: number
  className?: string
  onComplete?: () => void
}

export function TypingText({ text, delay = 0, speed = 30, className = "", onComplete }: TypingTextProps) {
  const [displayedText, setDisplayedText] = useState("")
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  useEffect(() => {
    if (!started) return

    let index = 0
    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1))
        index++
      } else {
        clearInterval(interval)
        onComplete?.()
      }
    }, speed)

    return () => clearInterval(interval)
  }, [started, text, speed, onComplete])

  return (
    <span className={className}>
      {displayedText}
      {started && displayedText.length < text.length && (
        <span className="typing-cursor" aria-hidden="true">&nbsp;</span>
      )}
    </span>
  )
}
