'use client'

import { useEffect, useState } from 'react'

/** Long enough to ensure in-flight mouse/key inputs can't instantly close the popup. */
const DISMISS_GRACE_MS = 2500

interface FormationTutorialPopupProps {
  visible: boolean
  onDismiss: () => void
}

/**
 * Shown the first time a formation spawns. Calls out the bearing-based threat
 * geometry so the player understands a tight cluster on the radar is a
 * protected coordinated attack that breaks apart once it engages.
 */
export function FormationTutorialPopup({ visible, onDismiss }: FormationTutorialPopupProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!visible) {
      setReady(false)
      return
    }
    const handleDismiss = (e: Event): void => {
      e.preventDefault()
      onDismiss()
    }
    const timerId = setTimeout(() => {
      setReady(true)
      window.addEventListener('keydown', handleDismiss, { once: true })
      window.addEventListener('touchstart', handleDismiss, { once: true })
    }, DISMISS_GRACE_MS)
    return () => {
      clearTimeout(timerId)
      window.removeEventListener('keydown', handleDismiss)
      window.removeEventListener('touchstart', handleDismiss)
      setReady(false)
    }
  }, [visible, onDismiss])

  if (!visible) return null

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/65 p-4"
      data-testid="formation-tutorial-popup"
      onClick={ready ? onDismiss : undefined}
    >
      <button
        data-menu-item
        data-menu-default
        data-menu-back
        onClick={onDismiss}
        aria-label="Dismiss"
        className="max-w-[90vw] sm:max-w-md px-6 py-5 bg-space-800/95 border-2 border-red-500/60 rounded-xl font-sans text-left shadow-2xl focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
      >
        <p className="text-red-400 text-sm sm:text-base font-bold mb-2 text-center">
          FORMATION INBOUND
        </p>
        <p className="text-white/75 text-sm leading-relaxed mb-2">
          That cluster of blips on your radar is a{' '}
          <span className="text-red-400 font-bold">wing of fighters</span> flying
          a V-formation along one bearing toward you.
        </p>
        <ul className="ml-4 list-disc text-sm text-white/70 space-y-1">
          <li>The entry forcefield absorbs fire while the group is locked together.</li>
          <li>They break formation once they engage — dogfight from then on.</li>
          <li>When the shield drops, the ships become normal targets.</li>
        </ul>
        <p className="text-white/60 text-xs sm:text-sm mt-3 leading-relaxed">
          Strafe perpendicular to their approach to break their lead.
        </p>
        <p className={`text-white/40 text-sm mt-4 text-center transition-opacity duration-500 ${ready ? 'opacity-100 animate-pulse' : 'opacity-0'}`}>
          Tap anywhere to continue
        </p>
      </button>
    </div>
  )
}
