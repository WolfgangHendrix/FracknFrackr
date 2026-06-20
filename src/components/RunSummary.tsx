'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunStats } from '@/game/ledger-config'
import { recordScore, wouldMakeBoard } from '@/lib/leaderboard'
import { submitOnlineScore } from '@/lib/online-leaderboard'
import { isSupabaseConfigured } from '@/lib/supabase'
import { playVoice } from '@/lib/voice'

const GAME_OVER_VOICE = './audio/vo_gameover.wav'

interface RunSummaryProps {
  stats: RunStats
  highScore: number
  isNewBest: boolean
  onContinue: () => void
}

const INITIALS_STORAGE_KEY = 'fracking-asteroids-last-initials'
const INITIAL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const BUTTON_A = 0
const DPAD_UP = 12
const DPAD_DOWN = 13
const DPAD_LEFT = 14
const DPAD_RIGHT = 15
const AXIS_LEFT_X = 0
const AXIS_LEFT_Y = 1
const STICK_THRESHOLD = 0.6
const INITIAL_CHAR_STEP_MS = 180
const INITIAL_SLOT_STEP_MS = 220
const INITIAL_SUBMIT_STEP_MS = 350

/** Format seconds as M:SS. */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-white/60 tracking-wider">{label}</span>
      <span className="text-white font-bold">{value}</span>
    </div>
  )
}

/**
 * End-of-run summary shown when the player's hull is lost. If the final
 * score makes the local leaderboard, the player is prompted for three
 * initials before the Continue button is exposed. Otherwise the original
 * "hit Continue and respawn" flow runs unchanged.
 */
export function RunSummary({ stats, highScore, isNewBest, onContinue }: RunSummaryProps) {
  const qualifies = wouldMakeBoard(stats.score)
  const [submitted, setSubmitted] = useState(!qualifies)
  const [rank, setRank] = useState<number | null>(null)
  const [initials, setInitials] = useState('')
  const [selectedInitialSlot, setSelectedInitialSlot] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const submittedOnceRef = useRef(!qualifies)
  const initialsRef = useRef(initials)
  const selectedInitialSlotRef = useRef(selectedInitialSlot)
  // Online-submit status, fire-and-forget. 'idle' until the player submits;
  // 'sending' while the POST is in flight; 'ok' or 'err' when it resolves.
  // Shown as a small line of microcopy below the rank so the player gets
  // confirmation the score actually left their machine.
  const [onlineStatus, setOnlineStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>(
    'idle',
  )

  // Play the game-over voice line once when the results screen appears.
  // Routed through the SFX channel so the master/SFX sliders apply.
  useEffect(() => {
    const audio = playVoice(GAME_OVER_VOICE, 0.85)
    return () => audio.pause()
  }, [])

  // Prefill with the player's last-used initials so repeat-runners don't
  // have to retype every time.
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    const saved = localStorage.getItem(INITIALS_STORAGE_KEY)
    if (saved) setInitials(saved.toUpperCase().slice(0, 3))
  }, [])

  // Focus the input on first paint so a touch keyboard pops immediately and
  // the user doesn't have to hunt for the field. The scrollIntoView call is
  // the key part on mobile — once the keyboard is up, the visualViewport
  // shrinks, and centering the input in the visible area keeps it visible
  // above the keyboard regardless of device height.
  useEffect(() => {
    if (submitted || !inputRef.current) return
    const el = inputRef.current
    el.focus()
    const id = window.setTimeout(() => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 250)
    return () => window.clearTimeout(id)
  }, [submitted])

  // When the on-screen keyboard opens, visualViewport.height shrinks.
  // Re-scroll the input into view each time the viewport changes so the
  // user can always see what they're typing.
  useEffect(() => {
    if (submitted) return
    const vv = window.visualViewport
    if (!vv) return
    const onChange = (): void => {
      inputRef.current?.scrollIntoView({ block: 'center' })
    }
    vv.addEventListener('resize', onChange)
    vv.addEventListener('scroll', onChange)
    return () => {
      vv.removeEventListener('resize', onChange)
      vv.removeEventListener('scroll', onChange)
    }
  }, [submitted])

  useEffect(() => {
    initialsRef.current = initials
  }, [initials])

  useEffect(() => {
    selectedInitialSlotRef.current = selectedInitialSlot
  }, [selectedInitialSlot])

  const handleSubmit = useCallback((overrideInitials?: string): void => {
    if (submittedOnceRef.current) return
    submittedOnceRef.current = true
    const trimmed = ((overrideInitials ?? initials) || '---').toUpperCase()
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(INITIALS_STORAGE_KEY, trimmed)
    }
    const { rank: newRank } = recordScore(trimmed, stats.score)
    setRank(newRank)
    setSubmitted(true)
    // Best-effort online post. We don't block Continue on this — if the
    // network is down or the build has no Supabase config, the local
    // submission still completed successfully.
    if (isSupabaseConfigured()) {
      setOnlineStatus('sending')
      void submitOnlineScore(trimmed, stats.score).then((res) => {
        setOnlineStatus(res.ok ? 'ok' : 'err')
      })
    }
  }, [initials, stats.score])

  const handleSubmitRef = useRef(handleSubmit)
  useEffect(() => {
    handleSubmitRef.current = handleSubmit
  }, [handleSubmit])

  useEffect(() => {
    if (submitted || !qualifies) return
    if (typeof window === 'undefined') return
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return

    const prev = { a: false, up: false, down: false, left: false, right: false }
    const lastAction = { char: 0, slot: 0, submit: 0 }
    let raf = 0
    const currentChars = (): string[] => {
      const padded = (initialsRef.current || 'AAA')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .padEnd(3, 'A')
      return padded.slice(0, 3).split('')
    }
    const setCharAtSlot = (delta: 1 | -1): void => {
      const chars = currentChars()
      const slot = selectedInitialSlotRef.current
      const cur = chars[slot]
      const idx = Math.max(0, INITIAL_CHARS.indexOf(cur))
      const next = (idx + delta + INITIAL_CHARS.length) % INITIAL_CHARS.length
      chars[slot] = INITIAL_CHARS[next]
      const nextInitials = chars.join('')
      initialsRef.current = nextInitials
      setInitials(nextInitials)
    }
    const moveSelectedSlot = (delta: 1 | -1): void => {
      const next = (selectedInitialSlotRef.current + delta + 3) % 3
      selectedInitialSlotRef.current = next
      setSelectedInitialSlot(next)
    }
    const submitControllerInitials = (): void => {
      handleSubmitRef.current(currentChars().join(''))
    }
    const tick = (): void => {
      raf = requestAnimationFrame(tick)
      const pad = Array.from(navigator.getGamepads()).find((p) => p && p.connected) ?? null
      if (!pad) {
        prev.a = false
        prev.up = false
        prev.down = false
        prev.left = false
        prev.right = false
        return
      }

      const stickX = pad.axes[AXIS_LEFT_X] ?? 0
      const stickY = pad.axes[AXIS_LEFT_Y] ?? 0
      const a = pad.buttons[BUTTON_A]?.pressed ?? false
      const up = (pad.buttons[DPAD_UP]?.pressed ?? false) || stickY < -STICK_THRESHOLD
      const down = (pad.buttons[DPAD_DOWN]?.pressed ?? false) || stickY > STICK_THRESHOLD
      const left = (pad.buttons[DPAD_LEFT]?.pressed ?? false) || stickX < -STICK_THRESHOLD
      const right = (pad.buttons[DPAD_RIGHT]?.pressed ?? false) || stickX > STICK_THRESHOLD
      const now = performance.now()

      if (up && !prev.up && now - lastAction.char >= INITIAL_CHAR_STEP_MS) {
        lastAction.char = now
        setCharAtSlot(1)
      }
      if (down && !prev.down && now - lastAction.char >= INITIAL_CHAR_STEP_MS) {
        lastAction.char = now
        setCharAtSlot(-1)
      }
      if (left && !prev.left && now - lastAction.slot >= INITIAL_SLOT_STEP_MS) {
        lastAction.slot = now
        moveSelectedSlot(-1)
      }
      if (right && !prev.right && now - lastAction.slot >= INITIAL_SLOT_STEP_MS) {
        lastAction.slot = now
        moveSelectedSlot(1)
      }
      if (a && !prev.a && now - lastAction.submit >= INITIAL_SUBMIT_STEP_MS) {
        lastAction.submit = now
        submitControllerInitials()
      }

      prev.a = a
      prev.up = up
      prev.down = down
      prev.left = left
      prev.right = right
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [qualifies, submitted])

  useEffect(() => {
    if (!submitted) return
    const id = window.setTimeout(() => {
      document.querySelector<HTMLElement>('[data-run-summary-continue]')?.focus()
    }, 0)
    return () => window.clearTimeout(id)
  }, [submitted])

  return (
    <div
      className="absolute inset-0 z-[55] bg-black/85 overflow-y-auto p-4 flex items-start justify-center"
      style={{ minHeight: '100dvh' }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-5 font-sans text-center py-6">
        <div>
          <h2 className="text-hud-red text-2xl sm:text-3xl font-bold tracking-[0.2em]">HULL LOST</h2>
          <p className="text-white/50 text-xs sm:text-sm mt-1 tracking-wider">
            Emergency tow to station — upgrades intact.
          </p>
        </div>

        {/* Initials prompt — only when the score makes the board AND the
            player hasn't already submitted. Placed near the top so an
            opened virtual keyboard never covers it on mobile. */}
        {!submitted && (
          <div className="w-full flex flex-col items-center gap-3 border border-hud-amber/40 bg-hud-amber/5 rounded p-4">
            <p className="text-hud-amber text-sm font-bold tracking-[0.2em]">
              NEW LEADERBOARD ENTRY
            </p>
            <label htmlFor="initials-input" className="text-white/60 text-xs tracking-wider">
              ENTER INITIALS
            </label>
            <input
              id="initials-input"
              ref={inputRef}
              value={initials}
              onChange={(e) => setInitials(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
              }}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={3}
              placeholder="AAA"
              className="w-32 text-center text-3xl font-mono tracking-[0.4em] bg-space-900/70 border-2 border-hud-amber/60 rounded text-hud-amber py-2 focus:outline-none focus:border-hud-amber"
              aria-label="Initials"
            />
            <div className="flex gap-2" aria-label="Controller initials entry">
              {((initials || 'AAA').toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(3, 'A').slice(0, 3).split('')).map(
                (char, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedInitialSlot(idx)}
                    className={`w-12 h-12 border-2 rounded font-mono text-2xl text-center ${
                      idx === selectedInitialSlot
                        ? 'border-hud-amber bg-hud-amber/20 text-hud-amber'
                        : 'border-white/20 bg-white/5 text-white/70'
                    }`}
                    aria-label={`Initial ${idx + 1}: ${char}`}
                  >
                    {char}
                  </button>
                ),
              )}
            </div>
            <button
              onClick={() => handleSubmit()}
              className="pointer-events-auto mt-1 px-6 py-2 bg-hud-amber/20 border border-hud-amber/60 rounded text-hud-amber tracking-[0.2em] hover:bg-hud-amber/30 active:scale-95 transition-all text-sm"
              data-menu-item
            >
              SUBMIT
            </button>
          </div>
        )}

        <div className="w-full flex flex-col gap-2 text-sm sm:text-base">
          <Row label="ARBITERS DESTROYED" value={stats.marksDefeated} />
          <Row label="PEAK LEDGER" value={stats.peakLedger} />
          <Row label="TIME SURVIVED" value={formatTime(stats.runTime)} />
        </div>

        <div className="w-full border-t border-white/15 pt-4 flex flex-col gap-2">
          <div className="flex justify-between items-baseline">
            <span className="text-white/60 text-sm tracking-wider">SCORE</span>
            <span className="text-hud-amber text-2xl font-bold">{stats.score}</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-white/60 text-sm tracking-wider">BEST</span>
            <span className="text-white/80 text-lg">{highScore}</span>
          </div>
          {isNewBest && (
            <p className="text-hud-green text-sm font-bold tracking-[0.25em] animate-pulse">
              ★ NEW RECORD ★
            </p>
          )}
          {submitted && rank !== null && (
            <p className="text-hud-amber text-xs tracking-[0.2em] mt-1">
              LOCAL RANK #{rank}
            </p>
          )}
          {submitted && onlineStatus !== 'idle' && (
            <p
              className={`text-xs tracking-[0.18em] mt-0.5 ${
                onlineStatus === 'sending'
                  ? 'text-white/45'
                  : onlineStatus === 'ok'
                    ? 'text-hud-green/85'
                    : 'text-hud-red/85'
              }`}
            >
              {onlineStatus === 'sending'
                ? 'POSTING TO GLOBAL…'
                : onlineStatus === 'ok'
                  ? 'POSTED TO GLOBAL BOARD'
                  : 'GLOBAL POST FAILED'}
            </p>
          )}
        </div>

        <p className="text-white/40 text-xs sm:text-sm italic leading-relaxed">
          &ldquo;Asset disabled. Recovery deferred.&rdquo;
          <br />
          <span className="not-italic tracking-widest">— THE ARBITER</span>
        </p>

        <button
          onClick={onContinue}
          disabled={!submitted}
          className="pointer-events-auto mt-1 px-8 py-3 bg-hud-green/15 border border-hud-green/50 rounded text-hud-green tracking-[0.2em] hover:bg-hud-green/25 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          data-menu-item
          data-menu-default={submitted || undefined}
          data-run-summary-continue
        >
          CONTINUE
        </button>
      </div>
    </div>
  )
}
