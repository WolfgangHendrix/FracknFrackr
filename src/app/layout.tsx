import type { Metadata, Viewport } from 'next'
import './globals.css'

// Fonts are loaded via a Google Fonts <link> below rather than next/font,
// because next/font is incompatible with the relative `assetPrefix: './'`
// required by the itch.io static-export bundle.
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&family=Rubik+Mono+One&display=swap'

export const metadata: Metadata = {
  title: "Frak'n Frak'r — Twin-Stick Mining Roguelike",
  description:
    "A neon twin-stick asteroid miner with a real-time-strategy fleet layer. Drill rocks, build mining drones, hold the line against the Arbiter — every hit is a one-shot kill.",
  applicationName: "Frak'n Frak'r",
  keywords: [
    'asteroids',
    'twin-stick',
    'mining',
    'shooter',
    'roguelike',
    'rts',
    'space',
    'arcade',
  ],
  authors: [{ name: 'Santiago Salvador' }],
  openGraph: {
    title: "Frak'n Frak'r",
    description:
      'Twin-stick neon asteroid miner with a real-time-strategy drone fleet. One hit is one death.',
    type: 'website',
    siteName: "Frak'n Frak'r",
  },
  twitter: {
    card: 'summary_large_image',
    title: "Frak'n Frak'r",
    description:
      'Twin-stick neon asteroid miner with a real-time-strategy drone fleet. One hit is one death.',
  },
  // Inline SVG favicon — keeps the public/ folder lean and renders crisp at
  // every browser scale. Hex matches the in-game hud-green so the tab icon
  // reads as the same brand color as the title screen.
  icons: {
    icon: [
      {
        url:
          'data:image/svg+xml,' +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
              <rect width="64" height="64" rx="12" fill="#06140e"/>
              <path d="M16 16h8v8h-8z M28 12h8v8h-8z M40 16h8v8h-8z
                       M16 28h8v8h-8z M28 28h8v8h-8z M40 28h8v8h-8z
                       M28 40h8v8h-8z M28 50h8v6h-8z" fill="#00ff88"/>
            </svg>`,
          ),
        type: 'image/svg+xml',
      },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      style={
        {
          ['--font-rubik' as string]: "'Rubik', ui-sans-serif, system-ui, sans-serif",
          ['--font-rubik-mono-one' as string]: "'Rubik Mono One', ui-monospace, monospace",
        } as React.CSSProperties
      }
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS_HREF} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  )
}
