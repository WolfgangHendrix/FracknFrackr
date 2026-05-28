'use client'

import { useMemo } from 'react'
import { loadLeaderboard } from '@/lib/leaderboard'

interface LeaderboardMenuProps {
  onBack: () => void
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  })
}

export function LeaderboardMenu({ onBack }: LeaderboardMenuProps) {
  // Read once on mount; the list isn't expected to change while open.
  const entries = useMemo(() => loadLeaderboard(), [])

  return (
    <div className="flex flex-col gap-3 items-center relative z-10 w-full max-w-md px-4">
      <p className="font-sans text-sm text-hud-amber/70 uppercase tracking-[0.22em]">
        Leaderboards
      </p>

      {entries.length === 0 ? (
        <p className="font-sans text-sm text-white/55 text-center py-6">
          No runs scored yet. Survive a wave to claim a spot.
        </p>
      ) : (
        <div className="w-full bg-space-900/60 border border-hud-amber/30 rounded font-mono text-sm">
          <div className="grid grid-cols-[2rem_3rem_1fr_5rem] gap-2 px-3 py-2 text-white/40 text-xs uppercase tracking-wider border-b border-white/10">
            <span>#</span>
            <span>Name</span>
            <span className="text-right">Score</span>
            <span className="text-right">Date</span>
          </div>
          <ol className="divide-y divide-white/5">
            {entries.map((e, i) => (
              <li
                key={`${e.timestamp}-${i}`}
                className={`grid grid-cols-[2rem_3rem_1fr_5rem] gap-2 px-3 py-1.5 ${
                  i === 0 ? 'text-hud-amber' : i < 3 ? 'text-hud-green' : 'text-white/85'
                }`}
              >
                <span>{i + 1}</span>
                <span>{e.initials}</span>
                <span className="text-right tabular-nums">{e.score.toLocaleString()}</span>
                <span className="text-right text-white/50 text-xs">
                  {formatTimestamp(e.timestamp)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <button
        data-menu-item
        data-menu-back
        onClick={onBack}
        className="mt-2 px-6 py-3 min-h-[44px] text-white/40 font-sans text-base hover:text-white/70 focus:text-white focus:outline-none focus:ring-2 focus:ring-white/40 rounded transition-colors"
      >
        BACK
      </button>
    </div>
  )
}
