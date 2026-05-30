'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TutorialStep } from '@/hooks/useTutorial'
import { ARBITER_DIALOGUE } from '@/game/prologue-config'
import { getSfxVolume } from '@/game/volume-control'

const ARBITER_VOICE_LINES = [
  './audio/vo_arbeter01.wav',
  './audio/vo_arbeter02.wav',
  './audio/vo_arbeter03.wav',
] as const
const FRACKER_SIGNAL_DETECTED = './audio/vo_fracker01.wav'
const FRACKER_SYSTEMS_FAILING = './audio/vo_fracker02.wav'

// Text-based duration estimate, used ONLY when the audio element hasn't
// reported its real duration yet (metadata not loaded / play() rejected
// before decode). When the real duration is available we prefer it.
const ARBITER_DIALOGUE_FALLBACK_BASE_MS = 1200
const ARBITER_DIALOGUE_FALLBACK_MS_PER_CHAR = 40
// Tail gap added on top of the line's expected playback duration before the
// next line fires. Padding the audio's *full* duration (not just 'ended')
// is what fixes the "...power [cut] limits" complaint — the old code armed
// a 2614 ms fallback timer in play()'s .catch(), shorter than the 3190 ms
// vo_arbeter01.wav, so if play() rejected the timer guillotined "limits"
// off the end. The new schedule waits max(duration, fallback) + this gap,
// and the 'ended' path uses the same scheduler so a single timer wins.
const ARBITER_DIALOGUE_AFTER_VOICE_MS = 900
const ARBITER_DIALOGUE_DONE_MS = 500

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
      className={`font-sans text-sm sm:text-base ${color} animate-pulse transition-opacity duration-500`}
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
  const voiceRef = useRef<HTMLAudioElement | null>(null)
  const allRevealed = lineIndex >= ARBITER_DIALOGUE.length

  useEffect(() => {
    if (lineIndex >= ARBITER_DIALOGUE.length) {
      const done = setTimeout(onComplete, ARBITER_DIALOGUE_DONE_MS)
      return () => clearTimeout(done)
    }

    voiceRef.current?.pause()
    const voice = new Audio(ARBITER_VOICE_LINES[lineIndex] ?? '')
    voice.preload = 'auto'
    voice.volume = 0.9 * getSfxVolume()
    voiceRef.current = voice

    const startedAt = performance.now()
    let advanceTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    // Single scheduler used by both the natural-end path and the
    // play()-rejected fallback. Waits until max(actual audio duration,
    // text-based estimate) has elapsed *plus* the tail gap before firing
    // — this is what prevents the next line from clipping the tail of
    // this one when `ended` fires a few frames early or play() rejects.
    const scheduleAdvance = (): void => {
      if (cancelled) return
      if (advanceTimer) clearTimeout(advanceTimer)
      const elapsed = performance.now() - startedAt
      const textEstimateMs =
        ARBITER_DIALOGUE_FALLBACK_BASE_MS +
        ARBITER_DIALOGUE[lineIndex].length * ARBITER_DIALOGUE_FALLBACK_MS_PER_CHAR
      const realDurationMs =
        voice.duration > 0 && Number.isFinite(voice.duration) ? voice.duration * 1000 : 0
      const expectedMs = Math.max(textEstimateMs, realDurationMs)
      const minRemaining = Math.max(0, expectedMs - elapsed)
      const delay = minRemaining + ARBITER_DIALOGUE_AFTER_VOICE_MS
      advanceTimer = setTimeout(() => {
        if (cancelled) return
        setLineIndex((i) => i + 1)
      }, delay)
    }

    const onEnded = (): void => scheduleAdvance()
    voice.addEventListener('ended', onEnded, { once: true })

    void voice.play().catch(() => {
      // Autoplay blocked or load failed — schedule the same way. At this
      // point voice.duration may be 0, so the schedule falls back to the
      // text estimate and the line still advances on its own.
      scheduleAdvance()
    })

    return () => {
      cancelled = true
      if (advanceTimer) clearTimeout(advanceTimer)
      voice.removeEventListener('ended', onEnded)
      // Only pause if the clip didn't finish on its own — pausing an
      // already-ended audio is a no-op in spec, but on some browsers it
      // can clip tail samples still in the output buffer.
      if (!voice.ended) voice.pause()
      if (voiceRef.current === voice) voiceRef.current = null
    }
  }, [lineIndex, onComplete])

  return (
    <div className="flex flex-col items-center gap-3">
      {ARBITER_DIALOGUE.slice(0, lineIndex + 1).map((line, i) => (
        <p
          key={i}
          className={`font-sans text-sm sm:text-lg tracking-wide ${
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
  const frackerVoicesRef = useRef<HTMLAudioElement[]>([])
  const playedFrackerStepsRef = useRef(new Set<TutorialStep>())

  useEffect(() => {
    setConfirming(false)
  }, [step])

  useEffect(() => {
    const voiceSrc =
      step === 'prologue-arbiter'
        ? FRACKER_SIGNAL_DETECTED
        : step === 'prologue-strip'
          ? FRACKER_SYSTEMS_FAILING
          : null
    if (!voiceSrc || playedFrackerStepsRef.current.has(step)) return

    playedFrackerStepsRef.current.add(step)
    const voice = new Audio(voiceSrc)
    voice.preload = 'auto'
    voice.volume = 0.62 * getSfxVolume()
    frackerVoicesRef.current.push(voice)
    voice.addEventListener(
      'ended',
      () => {
        frackerVoicesRef.current = frackerVoicesRef.current.filter((item) => item !== voice)
      },
      { once: true },
    )
    void voice.play().catch(() => {})
  }, [step])

  useEffect(() => {
    return () => {
      for (const voice of frackerVoicesRef.current) {
        voice.pause()
      }
      frackerVoicesRef.current = []
    }
  }, [])

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
        <div className="absolute top-24 sm:top-28 left-1/2 -translate-x-1/2 w-auto max-w-[80vw] sm:max-w-md px-4 sm:px-6 py-3 sm:py-4 bg-space-800/80 border border-hud-green/30 rounded-lg font-sans text-center">
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
        <div className="absolute top-24 sm:top-28 left-1/2 -translate-x-1/2 font-sans text-center">
          <FadingText text="Clear the field." />
        </div>
      )}

      {/* Tractor beam indicator when the Arbiter takes control */}
      {(step === 'prologue-arbiter' ||
        step === 'prologue-dialogue' ||
        step === 'prologue-strip') && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 font-sans">
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
            className="pointer-events-auto px-4 py-3 min-h-[44px] inline-flex items-center justify-center text-white/30 hover:text-white/60 focus:text-white/90 focus:outline-none focus:ring-2 focus:ring-white/40 rounded text-sm font-sans transition-colors"
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
            <p className="text-white/50 text-sm font-sans">Skip the intro?</p>
            {/* NO is placed first in the DOM so the gamepad's focusFirst()
                lands on the non-destructive action — a reflex A press on the
                confirm dialog won't accidentally skip the cutscene the player
                may not have meant to dismiss. */}
            <div className="flex gap-3">
              <button
                data-menu-item
                data-menu-back
                onClick={handleCancelSkip}
                className="px-5 py-3 min-h-[44px] text-white/50 text-sm font-sans border border-white/20 rounded hover:bg-white/10 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors"
                data-testid="prologue-skip-no"
              >
                NO
              </button>
              <button
                data-menu-item
                onClick={handleSkipClick}
                className="px-5 py-3 min-h-[44px] text-hud-red text-sm font-sans border border-hud-red/40 rounded hover:bg-hud-red/20 focus:bg-hud-red/30 focus:outline-none focus:ring-2 focus:ring-hud-red transition-colors"
                data-testid="prologue-skip-yes"
              >
                YES
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
