'use client'

import { useCallback, useEffect, useState } from 'react'
import type { TutorialStep } from '@/hooks/useTutorial'
import { ARBITER_DIALOGUE } from '@/game/prologue-config'

interface PrologueOverlayProps {
  step: TutorialStep
  onSkip: () => void
  onDialogueComplete: () => void
}

/** Auto-fading text that appears then disappears. */
function FadingText({ text, color = 'text-hud-green' }: { text: string; color?: string }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2500)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <p
      className={`font-mono text-sm sm:text-base ${color} animate-pulse transition-opacity duration-500`}
    >
      {text}
    </p>
  )
}

/**
 * Arbiter dialogue — reveals one line at a time, each lingering long enough
 * to read at a normal pace before the next appears, then completes itself.
 */
function ArbiterDialogue({ onComplete }: { onComplete: () => void }) {
  const [lineIndex, setLineIndex] = useState(0)
  const allRevealed = lineIndex >= ARBITER_DIALOGUE.length

  // Auto-advance: hold each line on screen for a readable beat. The duration
  // scales with line length so longer lines get more time.
  useEffect(() => {
    if (lineIndex >= ARBITER_DIALOGUE.length) {
      const done = setTimeout(onComplete, 500)
      return () => clearTimeout(done)
    }
    const readMs = 1900 + ARBITER_DIALOGUE[lineIndex].length * 55
    const next = setTimeout(() => setLineIndex((i) => i + 1), readMs)
    return () => clearTimeout(next)
  }, [lineIndex, onComplete])

  return (
    <div className="flex flex-col items-center gap-3">
      {ARBITER_DIALOGUE.slice(0, lineIndex + 1).map((line, i) => (
        <p
          key={i}
          className={`font-mono text-sm sm:text-lg tracking-wide ${
            i === lineIndex && !allRevealed ? 'text-hud-red animate-pulse' : 'text-hud-red/60'
          }`}
        >
          &quot;{line}&quot;
        </p>
      ))}
    </div>
  )
}

export function PrologueOverlay({ step, onSkip, onDialogueComplete }: PrologueOverlayProps) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setConfirming(false)
  }, [step])

  const handleSkipClick = useCallback(() => {
    if (confirming) {
      onSkip()
    } else {
      setConfirming(true)
    }
  }, [confirming, onSkip])

  const handleCancelSkip = useCallback(() => {
    setConfirming(false)
  }, [])

  // Only show during prologue steps
  if (!step.startsWith('prologue-')) return null

  // Steps that show persistent text in a panel
  const showPanel =
    step === 'prologue-start' ||
    step === 'prologue-arbiter' ||
    step === 'prologue-dialogue' ||
    step === 'prologue-strip'

  return (
    <div className="absolute inset-0 pointer-events-none" data-testid="prologue-overlay">
      {/* Persistent content panel (start, arbiter dialogue, strip) */}
      {showPanel && (
        <div className="absolute top-24 sm:top-28 left-1/2 -translate-x-1/2 w-auto max-w-[80vw] sm:max-w-md px-4 sm:px-6 py-3 sm:py-4 bg-space-800/80 border border-hud-green/30 rounded-lg font-mono text-center">
          {step === 'prologue-start' && (
            <p className="text-hud-green text-sm sm:text-base animate-pulse">
              Systems online. Full power.
            </p>
          )}

          {step === 'prologue-arbiter' && (
            <p className="text-white/60 text-xs uppercase tracking-widest animate-pulse">
              Signal detected
            </p>
          )}

          {step === 'prologue-dialogue' && (
            <div className="space-y-4">
              <ArbiterDialogue onComplete={onDialogueComplete} />
            </div>
          )}

          {step === 'prologue-strip' && (
            <p className="text-hud-red text-sm sm:text-base animate-pulse">Systems failing...</p>
          )}
        </div>
      )}

      {/* Fading text during free-play mining phase */}
      {step === 'prologue-mining' && (
        <div className="absolute top-24 sm:top-28 left-1/2 -translate-x-1/2 font-mono text-center">
          <FadingText text="Clear the field." />
        </div>
      )}

      {/* Tractor beam indicator when the Arbiter takes control */}
      {(step === 'prologue-arbiter' ||
        step === 'prologue-dialogue' ||
        step === 'prologue-strip') && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 font-mono">
          <p className="text-hud-red/50 text-xs uppercase tracking-[0.3em]">
            Stuck in Tractor Beam
          </p>
        </div>
      )}

      {/* Skip button — always visible during prologue */}
      <div className="absolute bottom-8 sm:bottom-12 left-1/2 -translate-x-1/2">
        {!confirming && (
          <button
            data-menu-item
            onClick={handleSkipClick}
            className="pointer-events-auto px-4 py-3 min-h-[44px] inline-flex items-center justify-center text-white/30 hover:text-white/60 focus:text-white/90 focus:outline-none focus:ring-2 focus:ring-white/40 rounded text-sm font-mono transition-colors"
            data-testid="prologue-skip"
          >
            SKIP INTRO
          </button>
        )}
        {confirming && (
          <div
            className="flex flex-col items-center gap-2 pointer-events-auto"
            data-testid="prologue-skip-confirm"
          >
            <p className="text-white/50 text-sm font-mono">Skip the intro?</p>
            <div className="flex gap-3">
              <button
                data-menu-item
                onClick={handleSkipClick}
                className="px-5 py-3 min-h-[44px] text-hud-red text-sm font-mono border border-hud-red/40 rounded hover:bg-hud-red/20 focus:bg-hud-red/30 focus:outline-none focus:ring-2 focus:ring-hud-red transition-colors"
                data-testid="prologue-skip-yes"
              >
                YES
              </button>
              <button
                data-menu-item
                data-menu-back
                onClick={handleCancelSkip}
                className="px-5 py-3 min-h-[44px] text-white/50 text-sm font-mono border border-white/20 rounded hover:bg-white/10 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors"
                data-testid="prologue-skip-no"
              >
                NO
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
