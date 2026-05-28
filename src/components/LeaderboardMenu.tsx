'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadLeaderboard, type LeaderboardEntry } from '@/lib/leaderboard'
import { fetchTopOnline, type OnlineEntry } from '@/lib/online-leaderboard'
import { isSupabaseConfigured } from '@/lib/supabase'

interface LeaderboardMenuProps {
  onBack: () => void
}

type Tab = 'global' | 'local'

interface DisplayEntry {
  initials: string
  score: number
  timestamp: number
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  })
}

function toLocalDisplay(entry: LeaderboardEntry): DisplayEntry {
  return { initials: entry.initials, score: entry.score, timestamp: entry.timestamp }
}

function toOnlineDisplay(entry: OnlineEntry): DisplayEntry {
  return {
    initials: entry.initials,
    score: entry.score,
    timestamp: new Date(entry.created_at).getTime(),
  }
}

export function LeaderboardMenu({ onBack }: LeaderboardMenuProps) {
  const onlineAvailable = isSupabaseConfigured()
  // Default to GLOBAL when the backend is configured; otherwise hide the
  // tab bar entirely and just show LOCAL — there's no point teasing a
  // remote board the build can't talk to.
  const [tab, setTab] = useState<Tab>(onlineAvailable ? 'global' : 'local')

  const localEntries = useMemo<DisplayEntry[]>(
    () => loadLeaderboard().map(toLocalDisplay),
    [],
  )
  const [onlineEntries, setOnlineEntries] = useState<DisplayEntry[] | null>(null)
  const [onlineError, setOnlineError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Lazy-load the global board the first time the GLOBAL tab is opened, then
  // cache it for the lifetime of this component instance.
  useEffect(() => {
    if (tab !== 'global') return
    if (!onlineAvailable) return
    if (onlineEntries !== null) return
    let cancelled = false
    setLoading(true)
    setOnlineError(null)
    void fetchTopOnline().then((result) => {
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        setOnlineError(result.message ?? 'Could not reach the global board.')
        setOnlineEntries([])
        return
      }
      setOnlineEntries(result.entries.map(toOnlineDisplay))
    })
    return () => {
      cancelled = true
    }
  }, [tab, onlineAvailable, onlineEntries])

  const entries: DisplayEntry[] =
    tab === 'global' ? (onlineEntries ?? []) : localEntries
  const showLoading = tab === 'global' && loading
  const showError = tab === 'global' && !!onlineError && !loading

  return (
    <div className="flex flex-col gap-3 items-center relative z-10 w-full max-w-md px-4">
      <p className="font-sans text-sm text-hud-amber/70 uppercase tracking-[0.22em]">
        Leaderboards
      </p>

      {onlineAvailable && (
        <div className="flex w-full max-w-xs border border-white/15 rounded overflow-hidden">
          <button
            data-menu-item
            type="button"
            onClick={() => setTab('global')}
            className={`flex-1 py-2 text-xs font-bold tracking-[0.22em] uppercase transition-colors ${
              tab === 'global'
                ? 'bg-hud-amber/20 text-hud-amber'
                : 'text-white/55 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            Global
          </button>
          <button
            data-menu-item
            type="button"
            onClick={() => setTab('local')}
            className={`flex-1 py-2 text-xs font-bold tracking-[0.22em] uppercase transition-colors ${
              tab === 'local'
                ? 'bg-hud-amber/20 text-hud-amber'
                : 'text-white/55 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            Local
          </button>
        </div>
      )}

      {showLoading ? (
        <p className="font-sans text-sm text-white/55 text-center py-6">
          Pinging the network…
        </p>
      ) : showError ? (
        <p className="font-sans text-sm text-hud-red/85 text-center py-6 leading-relaxed">
          {onlineError}
          <br />
          <span className="text-white/45 text-xs">Showing nothing for now.</span>
        </p>
      ) : entries.length === 0 ? (
        <p className="font-sans text-sm text-white/55 text-center py-6">
          {tab === 'global'
            ? 'No global scores yet. Be the first to plant a flag.'
            : 'No local runs scored yet. Survive a wave to claim a spot.'}
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
                  {formatDate(e.timestamp)}
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
