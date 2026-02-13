import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" })

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#04070A",
}

export const metadata: Metadata = {
  title: "Offerr.ai - Instant AI Cash Offers for Real Estate",
  description:
    "Institutional-grade AI valuation engine. Get instant cash offers for any property using advanced machine learning.",
  manifest: "/manifest.json",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} bg-[#04070A]`}>
      <body className="font-sans antialiased min-h-screen bg-[#04070A] text-[#F8F9FA] overflow-x-hidden">
        {children}
      </body>
    </html>
  )
}
