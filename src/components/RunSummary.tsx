'use client'

import type { RunStats } from '@/game/ledger-config'

interface RunSummaryProps {
  stats: RunStats
  highScore: number
  isNewBest: boolean
  onContinue: () => void
}

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
 * End-of-run summary shown when the player's hull is lost. Soft-fail: the
 * "Continue" button tows the player back to the station for a fresh run.
 */
export function RunSummary({ stats, highScore, isNewBest, onContinue }: RunSummaryProps) {
  return (
    <div className="absolute inset-0 z-[55] bg-black/85 flex items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-5 font-sans text-center">
        <div>
          <h2 className="text-hud-red text-2xl sm:text-3xl font-bold tracking-[0.2em]">HULL LOST</h2>
          <p className="text-white/50 text-xs sm:text-sm mt-1 tracking-wider">
            Emergency tow to station — upgrades intact.
          </p>
        </div>

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
        </div>

        <p className="text-white/40 text-xs sm:text-sm italic leading-relaxed">
          &ldquo;Asset disabled. Recovery deferred.&rdquo;
          <br />
          <span className="not-italic tracking-widest">— THE ARBITER</span>
        </p>

        <button
          onClick={onContinue}
          className="pointer-events-auto mt-1 px-8 py-3 bg-hud-green/15 border border-hud-green/50 rounded text-hud-green tracking-[0.2em] hover:bg-hud-green/25 active:scale-95 transition-all"
          data-menu-item
        >
          CONTINUE
        </button>
      </div>
    </div>
  )
}
