'use client'

import { useEffect, useState } from 'react'

/** Long enough to ensure in-flight mouse/key inputs can't instantly close the popup. */
const DISMISS_GRACE_MS = 2500

interface DefenseTutorialPopupProps {
  visible: boolean
  onDismiss: () => void
}

/**
 * Shown once after the player takes their first incoming hit (any defensive
 * layer absorbed it). The one-shot kill model means a stray hit zeros the
 * "HP" — so the first time something gets through, the player needs to
 * understand the defensive hierarchy, fast, before they assume it's a bug.
 */
export function DefenseTutorialPopup({ visible, onDismiss }: DefenseTutorialPopupProps) {
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
      data-testid="defense-tutorial-popup"
      onClick={ready ? onDismiss : undefined}
    >
      <button
        data-menu-item
        data-menu-default
        data-menu-back
        onClick={onDismiss}
        aria-label="Dismiss"
        className="max-w-[90vw] sm:max-w-md px-6 py-5 bg-space-800/95 border-2 border-hud-amber/60 rounded-xl font-sans text-left shadow-2xl focus:outline-none focus:ring-2 focus:ring-hud-amber cursor-pointer"
      >
        <p className="text-hud-amber text-sm sm:text-base font-bold mb-2 text-center">
          DEFENSIVE LAYERS
        </p>
        <p className="text-white/75 text-sm leading-relaxed mb-3 text-center">
          That hit didn&apos;t kill you because a charge absorbed it. In this
          ship, <span className="text-hud-amber font-bold">any unabsorbed hit is fatal</span>.
        </p>
        <ol className="ml-4 list-decimal text-sm text-white/80 space-y-1">
          <li>
            <span className="text-sky-300 font-bold">Shield</span> — energy bubble,
            flashes
          </li>
          <li>
            <span className="text-hud-amber font-bold">Hull module</span> — visible
            piece tears off
          </li>
          <li>
            <span className="text-orange-300 font-bold">Armor</span> — internal
            plating
          </li>
          <li>
            <span className="text-red-400 font-bold">Smart Bomb</span> — last
            resort: clears nearby threats
          </li>
        </ol>
        <p className="text-white/60 text-xs sm:text-sm mt-3 leading-relaxed">
          Spent charges stay spent. Buy them back at the trade station.
        </p>
        <p className={`text-white/40 text-sm mt-4 text-center transition-opacity duration-500 ${ready ? 'opacity-100 animate-pulse' : 'opacity-0'}`}>
          Tap anywhere to continue
        </p>
      </button>
    </div>
  )
}
