import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0A0A0A',
}

export const metadata: Metadata = {
  title: 'Offerr.ai - Instant AI Cash Offers for Real Estate',
  description: 'Get instant AI-powered cash offers for any property. Advanced machine learning analyzes market data, comparables, and property conditions in seconds.',
  icons: {
    icon: '/favicon.ico',
  },
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} bg-[#0A0A0A]`}>
      <body className="font-sans antialiased min-h-screen bg-[#0A0A0A] text-[#E0FFFE] overflow-x-hidden">
        {children}
      </body>
    </html>
  )
}
