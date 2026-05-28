'use client'

import { useCallback, useEffect, useState } from 'react'
import type { TutorialStep } from '@/hooks/useTutorial'
import { useGamepadActive } from '@/hooks/useGamepadActive'

/** Grace period before dismiss listeners activate, so in-flight inputs don't instantly close. */
const DISMISS_GRACE_MS = 400

interface TutorialOverlayProps {
  step: TutorialStep
  frozen: boolean
  tradeMenuOpen: boolean
  onSkip: () => void
  onDismiss: () => void
}

const isTouchDevice = (): boolean => typeof window !== 'undefined' && 'ontouchstart' in window

const STEPS: {
  key:
    | 'move'
    | 'shoot'
    | 'collect'
    | 'destroy-enemy'
    | 'collect-scrap'
    | 'go-to-station'
    | 'approach-station'
    | 'trade-sell'
    | 'trade-buy'
    | 'drive-through'
  desktop: string
  mobile: string
  gamepad: string
}[] = [
  {
    key: 'move',
    desktop: 'Use WASD, Arrow Keys to move your ship',
    mobile: 'Touch and drag the left side of the screen to move',
    gamepad: 'Navigate with LS',
  },
  {
    key: 'shoot',
    desktop: 'Aim at a target to fire',
    mobile: 'Aim at a target to fire',
    gamepad: 'Aim at a target to fire',
  },
  {
    key: 'collect',
    desktop: 'Approach metal chunks to collect.',
    mobile: 'Approach metal chunks to collect.',
    gamepad: 'Approach metal chunks to collect.',
  },
  {
    key: 'destroy-enemy',
    desktop: 'An enemy ship approaches! Shoot it down!',
    mobile: 'An enemy ship approaches! Shoot it down!',
    gamepad: 'An enemy ship approaches! Shoot it down!',
  },
  {
    key: 'collect-scrap',
    desktop: 'Collect the scrap it dropped!',
    mobile: 'Collect the scrap it dropped!',
    gamepad: 'Collect the scrap it dropped!',
  },
  {
    key: 'go-to-station',
    desktop: 'Head to the Trade Station! Follow the arrow!',
    mobile: 'Head to the Trade Station! Follow the arrow!',
    gamepad: 'Head to the Trade Station! Follow the arrow!',
  },
  {
    key: 'approach-station',
    desktop: 'Click the shop icon when it appears!',
    mobile: 'Tap the shop icon when it appears!',
    gamepad: 'When the shop icon appears, press (A) to shop!',
  },
  {
    key: 'trade-sell',
    desktop: 'Sell your collected materials!',
    mobile: 'Sell your collected materials!',
    gamepad: 'Sell your collected materials!',
  },
  {
    key: 'trade-buy',
    desktop: 'Buy the Fire Rate upgrade!',
    mobile: 'Buy the Fire Rate upgrade!',
    gamepad: 'Buy the Fire Rate upgrade!',
  },
  // 'drive-through' is intentionally dropped — the underlying station-repair
  // mechanic is vestigial in endless mode (one-shot kills mean HP attrition
  // never matters), so we don't teach it as a step. The reducer still
  // accepts the step name for save-file backward compatibility.
]

function StepDots({ step }: { step: TutorialStep }) {
  // wait-for-metal is an intermediate state between shoot and collect —
  // show the collect dot as active (index 2) during that phase.
  const lookupKey = step === 'wait-for-metal' ? 'collect' : step
  const foundIndex = STEPS.findIndex((s) => s.key === lookupKey)
  const stepIndex = foundIndex === -1 ? STEPS.length : foundIndex

  return (
    <div className="flex gap-2 justify-center mb-3" aria-label="Tutorial progress">
      {STEPS.map((s, i) => (
        <div
          key={s.key}
          className={`w-2 h-2 rounded-full ${
            i < stepIndex
              ? 'bg-hud-green'
              : i === stepIndex
                ? 'bg-hud-green animate-pulse'
                : 'bg-white/20'
          }`}
        />
      ))}
    </div>
  )
}

function getPromptText(step: TutorialStep, gamepadActive: boolean): string {
  if (step === 'wait-for-metal') return 'Keep shooting the asteroid...'

  const entry = STEPS.find((s) => s.key === step)
  if (!entry) return ''
  // A gamepad in active use wins over touch/desktop prompts.
  if (gamepadActive) return entry.gamepad
  return isTouchDevice() ? entry.mobile : entry.desktop
}

export function TutorialOverlay({
  step,
  frozen,
  tradeMenuOpen,
  onSkip,
  onDismiss,
}: TutorialOverlayProps) {
  const [confirming, setConfirming] = useState(false)
  const gamepadActive = useGamepadActive()

  // Reset confirmation state when the step changes
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

  // When frozen, any key or touch dismisses the overlay after a grace period
  // so in-flight input events don't instantly close it.
  useEffect(() => {
    if (!frozen) return

    const handleDismiss = (e: Event) => {
      // preventDefault stops the browser from synthesizing mousemove/mousedown
      // from touch events that would leak into the canvas aim/fire handlers.
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
  }, [frozen, onDismiss])

  if (step === 'done') return null

  // Hide overlay while waiting for enemy to approach; show again when frozen
  if (step === 'destroy-enemy' && !frozen) return null

  // Hide the tutorial overlay any time the trade menu is open. Sell/buy
  // steps have their own pulsing hint inside the shop, and the post-buy
  // "drive through the station" prompt only makes sense once the player
  // has dismissed the shop — otherwise it floats over a menu they can't
  // act on yet.
  if (tradeMenuOpen) return null

  // Hide overlay during prologue (PrologueOverlay handles this)
  if (step.startsWith('prologue-')) return null

  const text = getPromptText(step, gamepadActive)

  return (
    <div
      className="absolute inset-0 pointer-events-none z-[55]"
      data-testid="tutorial-overlay"
    >
      {/* Top-center prompt panel — sits below the HUD, clear of mobile controls at the bottom */}
      <div className="absolute top-24 sm:top-28 left-1/2 -translate-x-1/2 w-auto max-w-[80vw] sm:max-w-sm px-4 sm:px-6 py-3 sm:py-4 bg-space-800/90 border border-hud-green/40 rounded-lg font-sans text-center">
        <StepDots step={step} />
        <p className="text-hud-green text-sm sm:text-base">{text}</p>
        {frozen && (
          <>
            <p className="text-white/50 text-sm mt-2 animate-pulse">
              {gamepadActive ? 'Press (A) to continue' : 'Press any key to continue'}
            </p>
            {/* Invisible focusable target so gamepad A press fires onDismiss. */}
            <button
              data-menu-item
              onClick={onDismiss}
              aria-label="Continue"
              className="pointer-events-auto !absolute opacity-0 w-px h-px"
            />
          </>
        )}
        {!frozen && !confirming && (
          <button
            data-menu-item
            onClick={handleSkipClick}
            className="pointer-events-auto mt-3 px-4 py-3 min-h-[44px] inline-flex items-center justify-center text-white/40 hover:text-white/70 focus:text-white focus:outline-none focus:ring-2 focus:ring-white/40 rounded text-sm transition-colors"
            data-testid="tutorial-skip"
          >
            SKIP
          </button>
        )}
        {!frozen && confirming && (
          <div
            className="mt-3 flex flex-col items-center gap-2"
            data-testid="tutorial-skip-confirm"
          >
            <p className="text-white/60 text-sm">Skip the tutorial?</p>
            <div className="flex gap-3">
              <button
                data-menu-item
                onClick={handleSkipClick}
                className="pointer-events-auto px-5 py-3 min-h-[44px] text-hud-red text-sm border border-hud-red/40 rounded hover:bg-hud-red/20 focus:bg-hud-red/30 focus:outline-none focus:ring-2 focus:ring-hud-red transition-colors"
                data-testid="tutorial-skip-yes"
              >
                YES
              </button>
              <button
                data-menu-item
                data-menu-back
                onClick={handleCancelSkip}
                className="pointer-events-auto px-5 py-3 min-h-[44px] text-white/50 text-sm border border-white/20 rounded hover:bg-white/10 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors"
                data-testid="tutorial-skip-no"
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
