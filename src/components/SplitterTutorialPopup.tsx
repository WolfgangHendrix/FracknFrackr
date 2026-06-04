'use client'

import { useEffect } from 'react'

const DISMISS_GRACE_MS = 400

interface SplitterTutorialPopupProps {
  visible: boolean
  onDismiss: () => void
}

/**
 * Shown the first time a splitter appears. Telegraphs the on-death surprise
 * so the player can choose to bait it into open space before killing it,
 * rather than learning the hard way that one big target turns into three.
 */
export function SplitterTutorialPopup({ visible, onDismiss }: SplitterTutorialPopupProps) {
  useEffect(() => {
    if (!visible) return
    const handleDismiss = (e: Event): void => {
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
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/65 p-4"
      data-testid="splitter-tutorial-popup"
    >
      <button
        data-menu-item
        data-menu-default
        data-menu-back
        onClick={onDismiss}
        aria-label="Dismiss"
        className="max-w-[90vw] sm:max-w-md px-6 py-5 bg-space-800/95 border-2 border-pink-500/60 rounded-xl font-sans text-left shadow-2xl focus:outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
      >
        <p className="text-pink-400 text-sm sm:text-base font-bold mb-2 text-center">
          SPLITTER DETECTED
        </p>
        <p className="text-white/75 text-sm leading-relaxed mb-2">
          That big purple bulk on your screen is a{' '}
          <span className="text-pink-400 font-bold">splitter</span>. It&apos;s slow
          and lobs a three-bolt fan — but when you finally kill it, it{' '}
          <span className="text-pink-400 font-bold">bursts into three grunts</span>{' '}
          spawning outward from the wreck.
        </p>
        <p className="text-white/60 text-xs sm:text-sm mt-2 leading-relaxed">
          Bait it away from other fights before you finish it off, or you&apos;ll
          find yourself surrounded the moment it dies.
        </p>
        <p className="text-white/40 text-sm mt-4 animate-pulse text-center">
          Tap anywhere to continue
        </p>
      </button>
    </div>
  )
}
