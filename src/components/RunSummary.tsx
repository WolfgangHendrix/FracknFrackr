'use client'

import { useEffect, useRef, useState } from 'react'
import type { RunStats } from '@/game/ledger-config'
import { recordScore, wouldMakeBoard } from '@/lib/leaderboard'

interface RunSummaryProps {
  stats: RunStats
  highScore: number
  isNewBest: boolean
  onContinue: () => void
}

const INITIALS_STORAGE_KEY = 'fracking-asteroids-last-initials'

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
  const inputRef = useRef<HTMLInputElement | null>(null)

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

  const handleSubmit = (): void => {
    const trimmed = (initials || '---').toUpperCase()
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(INITIALS_STORAGE_KEY, trimmed)
    }
    const { rank: newRank } = recordScore(trimmed, stats.score)
    setRank(newRank)
    setSubmitted(true)
  }

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
            <button
              onClick={handleSubmit}
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
              LEADERBOARD RANK #{rank}
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
        >
          CONTINUE
        </button>
      </div>
    </div>
  )
}
