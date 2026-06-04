'use client'

import { useEffect } from 'react'

/** Grace period before dismiss listeners activate, so in-flight inputs don't instantly close. */
const DISMISS_GRACE_MS = 400

interface DroneTutorialPopupProps {
  visible: boolean
  onDismiss: () => void
}

/**
 * Shown once after the player first buys the Mining Drone Bay upgrade.
 * Explains: drones auto-mine large rocks; the radar is a command surface;
 * each drone is built individually at the station.
 */
export function DroneTutorialPopup({ visible, onDismiss }: DroneTutorialPopupProps) {
  useEffect(() => {
    if (!visible) return

    const handleDismiss = (e: Event) => {
      e.preventDefault()
      onDismiss()
    }

    const timerId = setTimeout(() => {
      window.addEventListener('keydown', handleDismiss, { once: true })
      window.addEventListener('touchstart', handleDismiss, { once: true })
      window.addEventListener('mousedown', handleDismiss, { once: true })
    }, DISMISS_GRACE_MS)

    return () => {
      clearTimeout(timerId)
      window.removeEventListener('keydown', handleDismiss)
      window.removeEventListener('touchstart', handleDismiss)
      window.removeEventListener('mousedown', handleDismiss)
    }
  }, [visible, onDismiss])

  if (!visible) return null

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70"
      data-testid="drone-tutorial-popup"
    >
      <button
        data-menu-item
        data-menu-default
        data-menu-back
        onClick={onDismiss}
        aria-label="Dismiss"
        className="max-w-[88vw] sm:max-w-md px-6 py-5 bg-space-800/95 border-2 border-hud-amber/60 rounded-xl font-sans text-left shadow-2xl focus:outline-none focus:ring-2 focus:ring-hud-amber cursor-pointer"
      >
        <p className="text-hud-amber text-base sm:text-lg font-bold mb-3 tracking-wider text-center">
          MINING DRONE BAY ONLINE
        </p>
        <ul className="text-white/85 text-sm sm:text-base leading-relaxed space-y-2 mb-3">
          <li>
            <span className="text-hud-amber font-bold">Build at the station</span> — each drone
            costs scrap. Bay tier sets the maximum you can field.
          </li>
          <li>
            <span className="text-hud-green font-bold">Auto-mining</span> — drones seek out large
            asteroids on their own and bring scrap back to the ship.
          </li>
          <li>
            <span className="text-hud-blue font-bold">Rally on the radar</span> — click or tap the
            radar (bottom-left) to send the fleet to a specific spot. Click the ship icon at
            center to clear the order.
          </li>
          <li className="text-white/65 text-xs sm:text-sm">
            ⚠ Enemy frackers will steal a drone&apos;s scrap if they hit it mid-haul. They&apos;ll
            also draw fire off you when exposed.
          </li>
        </ul>
        <p className="text-white/40 text-xs sm:text-sm text-center mt-3 animate-pulse">
          Tap anywhere to continue
        </p>
      </button>
    </div>
  )
}
