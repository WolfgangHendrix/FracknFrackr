'use client'

import { useEffect } from 'react'

/** Grace period before dismiss listeners activate, so in-flight inputs don't instantly close. */
const DISMISS_GRACE_MS = 400

interface LazerTutorialPopupProps {
  visible: boolean
  onDismiss: () => void
}

export function LazerTutorialPopup({ visible, onDismiss }: LazerTutorialPopupProps) {
  useEffect(() => {
    if (!visible) return

    const handleDismiss = (e: Event) => {
      // preventDefault stops the browser from synthesizing mousemove/mousedown
      // from touch events. Without this, the synthesized mouse events fire
      // ~300ms after the popup unmounts and land on the canvas, setting aimState
      // to the tap position and locking the ship's rotation there.
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
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60"
      data-testid="lazer-tutorial-popup"
    >
      <button
        data-menu-item
        data-menu-back
        onClick={onDismiss}
        aria-label="Dismiss"
        className="max-w-[80vw] sm:max-w-sm px-6 py-5 bg-space-800/95 border-2 border-hud-blue/50 rounded-xl font-mono text-center shadow-2xl focus:outline-none focus:ring-2 focus:ring-hud-blue cursor-pointer"
      >
        <div className="text-3xl mb-3" aria-hidden="true">
          &#x26A0;
        </div>
        <p className="text-hud-blue text-sm sm:text-base font-bold mb-2">BASALTIC ASTEROID</p>
        <p className="text-white/70 text-sm sm:text-base leading-relaxed">
          This rock is too hard for your blaster! You need a{' '}
          <span className="text-hud-blue font-bold">Lazer</span> to mine it.
        </p>
        <p className="text-white/70 text-xs sm:text-sm leading-relaxed mt-1">
          Visit the <span className="text-hud-green font-bold">Trade Station</span> to purchase one.
        </p>
        <p className="text-white/40 text-sm mt-4 animate-pulse">Tap anywhere to continue</p>
      </button>
    </div>
  )
}
