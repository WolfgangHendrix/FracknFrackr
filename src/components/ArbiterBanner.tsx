'use client'

import { useEffect, useState } from 'react'

export interface ArbiterBannerData {
  /** The comms line to display. */
  text: string
  /** Bumped every time a new line fires, so repeats re-trigger the banner. */
  key: number
}

interface ArbiterBannerProps {
  banner: ArbiterBannerData | null
  /** Hide the comms banner while the pause overlay is up — it sits above the
   *  pause screen (higher z-index) and would otherwise overlap it. Kept mounted
   *  so its auto-dismiss timer keeps running and it doesn't re-trigger on resume. */
  paused?: boolean
}

/** How long an Arbiter comms line stays on screen (ms). */
const BANNER_DURATION = 5500

/**
 * Transient comms banner for Arbiter encounter events — arrival taunts,
 * defeat lines, withdrawal lines. Auto-dismisses; re-firing resets the timer.
 */
export function ArbiterBanner({ banner, paused = false }: ArbiterBannerProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!banner) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), BANNER_DURATION)
    return () => clearTimeout(t)
  }, [banner])

  if (!banner) return null
  // Suppressed while paused so the comms line never paints over the pause menu.
  if (paused) return null

  return (
    <div
      className="absolute left-1/2 top-[17%] -translate-x-1/2 z-[45] pointer-events-none w-full max-w-md px-4"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease' }}
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="font-sans tracking-[0.3em] text-[clamp(0.55rem,1.5vw,0.7rem)] text-hud-red/80">
          ◢ ARBITER COMMS ◣
        </div>
        <p className="font-sans text-[clamp(0.8rem,2.4vw,1.05rem)] text-white/90 leading-snug">
          {banner.text}
        </p>
      </div>
    </div>
  )
}
