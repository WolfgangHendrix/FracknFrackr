'use client'

import { useEffect } from 'react'

/** Grace period before dismiss listeners activate, so in-flight inputs don't instantly close. */
const DISMISS_GRACE_MS = 400

interface BlackHoleTutorialPopupProps {
  visible: boolean
  onDismiss: () => void
}

export function BlackHoleTutorialPopup({ visible, onDismiss }: BlackHoleTutorialPopupProps) {
  useEffect(() => {
    if (!visible) return

    const handleDismiss = (e: Event) => {
      // Mirrors the lazer popup — preventDefault stops touchstart from
      // synthesizing a mousedown that lands on the canvas as an aim input.
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
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60"
      data-testid="black-hole-tutorial-popup"
    >
      <button
        data-menu-item
        data-menu-default
        data-menu-back
        onClick={onDismiss}
        aria-label="Dismiss"
        className="max-w-[80vw] sm:max-w-sm px-6 py-5 bg-space-800/95 border-2 border-hud-red/60 rounded-xl font-sans text-center shadow-2xl focus:outline-none focus:ring-2 focus:ring-hud-red cursor-pointer"
      >
        <div className="text-3xl mb-3" aria-hidden="true">
          &#x26A0;
        </div>
        <p className="text-hud-red text-sm sm:text-base font-bold mb-2">BLACK HOLE DETECTED</p>
        <p className="text-white/70 text-sm sm:text-base leading-relaxed">
          A <span className="text-hud-red font-bold">singularity</span> warps spacetime ahead.
          Its gravity will drag your ship in — and crossing the event horizon is{' '}
          <span className="text-hud-red font-bold">instant death</span>.
        </p>
        <p className="text-white/70 text-xs sm:text-sm leading-relaxed mt-2">
          Keep your distance, or burn hard to escape its pull.
        </p>
        <p className="text-white/40 text-sm mt-4 animate-pulse">Tap anywhere to continue</p>
      </button>
    </div>
  )
}
