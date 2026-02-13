"use client"

import { useState, useCallback } from "react"
import { ParticleField } from "@/components/offerr/particle-field"
import { HeroSection } from "@/components/offerr/hero-section"
import { AnalysisScenes } from "@/components/offerr/analysis-scenes"
import { OfferPage } from "@/components/offerr/offer-page"
import { ContractPage } from "@/components/offerr/contract-page"
import { DashboardPage } from "@/components/offerr/dashboard-page"

type AppState = "hero" | "analyzing" | "offer" | "contract" | "dashboard"

export default function Home() {
  const [state, setState] = useState<AppState>("hero")
  const [address, setAddress] = useState("")

  const handleSearch = useCallback((addr: string) => {
    setAddress(addr)
    setState("analyzing")
  }, [])

  const handleAnalysisComplete = useCallback(() => {
    setState("offer")
  }, [])

  const handleGenerateContract = useCallback(() => {
    setState("contract")
  }, [])

  const handleContractComplete = useCallback(() => {
    setState("dashboard")
  }, [])

  return (
    <main className="relative min-h-screen">
      <ParticleField />

      {state === "hero" && <HeroSection onSearch={handleSearch} />}

      {state === "analyzing" && (
        <AnalysisScenes address={address} onComplete={handleAnalysisComplete} />
      )}

      {state === "offer" && (
        <OfferPage address={address} onGenerateContract={handleGenerateContract} />
      )}

      {state === "contract" && (
        <ContractPage address={address} onComplete={handleContractComplete} />
      )}

      {state === "dashboard" && <DashboardPage address={address} />}
    </main>
  )
}
