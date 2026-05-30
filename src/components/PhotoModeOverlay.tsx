'use client'

import { useCallback, useState } from 'react'

interface PhotoModeOverlayProps {
  visible: boolean
  /** Capture a PNG of the current frame. Resolves to null on failure. */
  onScreenshot: () => Promise<Blob | null>
  /** Exit photo mode — page layer flips paused + photoMode back off. */
  onExit: () => void
}

/**
 * Minimal photo-mode UI: a top hint strip with pan controls + the two
 * action buttons (Screenshot, Exit). Mounted over the canvas while the
 * simulation is frozen so the player can frame a shot, then capture.
 *
 * The actual screenshot blob is downloaded as a timestamped PNG. Browsers
 * with no Blob support or a tainted canvas will see a brief error toast
 * and stay in photo mode so they can try again.
 */
export function PhotoModeOverlay({ visible, onScreenshot, onExit }: PhotoModeOverlayProps) {
  const [status, setStatus] = useState<'idle' | 'capturing' | 'error'>('idle')

  const handleShoot = useCallback(async () => {
    setStatus('capturing')
    const blob = await onScreenshot()
    if (!blob) {
      setStatus('error')
      window.setTimeout(() => setStatus('idle'), 1500)
      return
    }
    // Trigger a browser download. Filename uses an ISO-like timestamp so
    // multiple captures don't collide and sort chronologically in the
    // user's downloads folder.
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    a.href = url
    a.download = `fracking-asteroids-${stamp}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setStatus('idle')
  }, [onScreenshot])

  if (!visible) return null

  return (
    <>
      {/* Top hint strip — what the controls do. */}
      <div className="absolute top-0 left-0 right-0 z-[35] pointer-events-none flex justify-center pt-3">
        <div className="bg-space-900/80 border border-hud-blue/30 rounded-full px-4 py-1.5 font-mono text-[11px] text-white/70">
          <span className="text-hud-blue/80">PHOTO MODE</span>
          <span className="mx-3 text-white/30">|</span>
          <span>WASD / Arrows pan</span>
          <span className="mx-3 text-white/30">|</span>
          <span>HUD hidden</span>
        </div>
      </div>

      {/* Bottom action bar. */}
      <div className="absolute bottom-0 left-0 right-0 z-[35] flex justify-center pb-6 pointer-events-none">
        <div className="flex gap-3 pointer-events-auto">
          <button
            type="button"
            onClick={handleShoot}
            disabled={status === 'capturing'}
            className="px-5 py-2 text-sm font-bold tracking-wider rounded border border-hud-green/60 bg-hud-green/15 text-hud-green hover:bg-hud-green/25 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-hud-green"
          >
            {status === 'capturing' ? 'CAPTURING…' : status === 'error' ? 'TRY AGAIN' : 'SCREENSHOT'}
          </button>
          <button
            type="button"
            onClick={onExit}
            className="px-5 py-2 text-sm font-bold tracking-wider rounded border border-hud-blue/40 bg-hud-blue/10 text-hud-blue hover:bg-hud-blue/20 focus:outline-none focus:ring-2 focus:ring-hud-blue"
          >
            EXIT
          </button>
        </div>
      </div>
    </>
  )
}
