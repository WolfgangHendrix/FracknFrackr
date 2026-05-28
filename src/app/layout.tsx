import type { Metadata, Viewport } from 'next'
import { Rubik, Rubik_Mono_One } from 'next/font/google'
import './globals.css'

// Primary UI face. It pairs with Rubik Mono One without making normal text
// feel as heavy as the title.
const rubik = Rubik({
  subsets: ['latin'],
  variable: '--font-rubik',
  display: 'swap',
})

// Display-only face used by the game title. Loaded via next/font so the file
// is self-hosted at build time (no runtime request to fonts.googleapis.com).
const rubikMonoOne = Rubik_Mono_One({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-rubik-mono-one',
  display: 'swap',
})

export const metadata: Metadata = {
  title: "Frak'n Frak'r",
  description: 'Blast asteroids, collect fragments, scrap resources, upgrade your ship.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${rubik.variable} ${rubikMonoOne.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
