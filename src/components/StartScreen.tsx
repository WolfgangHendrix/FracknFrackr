'use client'

import { useState, useCallback } from 'react'
import type { AchievementMetrics } from '@/lib/schemas'
import { useGamepadMenu } from '@/hooks/useGamepadMenu'
import { LeaderboardMenu } from './LeaderboardMenu'
import { StatsPanel } from './StatsPanel'
import { AchievementsMenu } from './AchievementsMenu'
import type { AchievementListItem } from './AchievementsMenu'
import { BUILD_VERSION } from '@/lib/build-version'

type ScreenMode =
  | 'main'
  | 'records'
  | 'records-leaderboards'
  | 'records-stats'
  | 'records-achievements'
  | 'credits'
  | 'erase'

function CreditSection({ role, lines }: { role: string; lines: string[] }) {
  const [primary, ...rest] = lines
  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className="font-sans text-[0.7rem] sm:text-xs tracking-[0.24em] text-hud-amber/85 uppercase">
        {role}
      </p>
      <p className="font-sans text-sm md:text-base text-white/90 text-center leading-snug">
        {primary}
      </p>
      {rest.length > 0 && (
        <div className="flex flex-col items-center gap-0.5">
          {rest.map((line) => (
            <p
              key={line}
              className="font-sans text-xs sm:text-sm text-white/55 text-center leading-snug"
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

interface MainMenuScreenProps {
  onPlay: () => void
  onEraseProfile: () => void
  onBackToProfiles: () => void
  profileMetrics: AchievementMetrics
  profileHighScore: number
  achievementItems: AchievementListItem[]
}

export function StartScreen({
  onPlay,
  onEraseProfile,
  onBackToProfiles,
  profileMetrics,
  profileHighScore,
  achievementItems,
}: MainMenuScreenProps) {
  const [mode, setMode] = useState<ScreenMode>('main')
  const [eraseArmed, setEraseArmed] = useState(false)

  useGamepadMenu({
    enabled: true,
    resetKey: `${mode}:${eraseArmed ? 'armed' : ''}`,
  })

  const handleBack = useCallback(() => {
    setMode('main')
    setEraseArmed(false)
  }, [])

  const handleRecordsBack = useCallback(() => {
    setMode('records')
  }, [])

  return (
    <div className="absolute inset-0 bg-space-900 flex flex-col items-center justify-center z-50">
      {/* Background — stars, asteroids, etc. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="menu-starfield-far absolute" style={{ inset: '0 -30% 0 0' }} aria-hidden="true">
          {Array.from({ length: 60 }, (_, i) => (
            <div key={`far-${i}`} className="absolute rounded-full bg-white" style={{ width: '1px', height: '1px', top: `${(i * 37) % 100}%`, left: `${(i * 53) % 130}%`, opacity: 0.25 + (i % 4) * 0.1 }} />
          ))}
        </div>
        <div className="menu-starfield-mid absolute" style={{ inset: '0 -40% 0 0' }} aria-hidden="true">
          {Array.from({ length: 28 }, (_, i) => (
            <div key={`mid-${i}`} className="absolute rounded-full bg-white" style={{ width: '2px', height: '2px', top: `${(i * 41) % 100}%`, left: `${(i * 59) % 130}%`, opacity: 0.45 + (i % 3) * 0.15 }} />
          ))}
        </div>
        <div className="menu-starfield-near absolute" style={{ inset: '0 -60% 0 0' }} aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={`near-${i}`} className="menu-star-twinkle absolute rounded-full bg-white" style={{ width: '3px', height: '3px', top: `${(i * 43) % 100}%`, left: `${(i * 71) % 130}%`, animationDelay: `${(i * 0.7) % 4}s`, boxShadow: '0 0 4px rgba(255,255,255,0.6)' }} />
          ))}
        </div>
        <div className="menu-shooting-star" style={{ animationDelay: '2s', top: '15%' }} aria-hidden="true" />
        <div className="menu-shooting-star" style={{ animationDelay: '6.5s', top: '40%' }} aria-hidden="true" />
      </div>

      <div className="menu-bloom-halo pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="menu-orbit-ring pointer-events-none absolute" aria-hidden="true" />
      <div className="menu-orbit-ring-2 pointer-events-none absolute" aria-hidden="true" />
      <div className="menu-sweep pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="menu-scanlines" aria-hidden="true" />

      {mode !== 'credits' && mode !== 'records-leaderboards' && mode !== 'records-stats' && mode !== 'records-achievements' && (
        <>
          <h1 className="menu-title font-display text-4xl md:text-6xl text-hud-green mb-2 tracking-widest text-center relative z-10">
            FRAK&apos;N<br />FRAK&apos;R
          </h1>
          <p className="font-sans text-sm md:text-base tracking-[0.2em] text-hud-amber/70 mb-6 relative z-10">
            FRAK, SCRAP &amp; UPGRADE
          </p>
        </>
      )}

      {/* Main Menu */}
      {mode === 'main' && (
        <div className="flex flex-col gap-4 relative z-10">
          <button
            data-menu-item
            onClick={onPlay}
            className="px-8 py-4 bg-space-800/80 border border-hud-green/50 rounded text-hud-green font-sans text-lg hover:bg-space-700/80 hover:border-hud-green focus:bg-space-700/80 focus:border-hud-green focus:outline-none focus:ring-2 focus:ring-hud-green focus:scale-[1.02] active:scale-95 transition-all min-w-[220px]"
          >
            PLAY
          </button>
          <button
            data-menu-item
            onClick={() => setMode('records')}
            className="px-8 py-4 bg-space-800/80 border border-hud-amber/50 rounded text-hud-amber font-sans text-lg hover:bg-space-700/80 hover:border-hud-amber focus:bg-space-700/80 focus:border-hud-amber focus:outline-none focus:ring-2 focus:ring-hud-amber focus:scale-[1.02] active:scale-95 transition-all min-w-[220px]"
          >
            RECORDS
          </button>
          <button
            data-menu-item
            onClick={() => setMode('credits')}
            className="px-8 py-4 bg-space-800/80 border border-hud-blue/50 rounded text-hud-blue font-sans text-lg hover:bg-space-700/80 hover:border-hud-blue focus:bg-space-700/80 focus:border-hud-blue focus:outline-none focus:ring-2 focus:ring-hud-blue focus:scale-[1.02] active:scale-95 transition-all min-w-[220px]"
          >
            CREDITS
          </button>
          <button
            data-menu-item
            onClick={onBackToProfiles}
            className="mt-1 px-3 py-2 text-white/35 font-sans text-xs tracking-[0.18em] uppercase hover:text-white/65 focus:text-white/80 focus:outline-none focus:ring-1 focus:ring-white/30 rounded transition-colors"
          >
            ← Switch Profile
          </button>
          <button
            data-menu-item
            onClick={() => { setEraseArmed(false); setMode('erase') }}
            className="px-3 py-2 text-white/35 font-sans text-xs tracking-[0.18em] uppercase hover:text-hud-red focus:text-hud-red focus:outline-none focus:ring-1 focus:ring-hud-red/40 rounded transition-colors"
          >
            Erase Profile
          </button>
        </div>
      )}

      {/* Records sub-nav */}
      {mode === 'records' && (
        <div className="flex flex-col gap-4 relative z-10 w-full max-w-sm px-4">
          <p className="font-sans text-sm text-white/60 text-center mb-1 tracking-[0.18em]">RECORDS</p>
          <button
            data-menu-item
            onClick={() => setMode('records-leaderboards')}
            className="px-8 py-4 bg-space-800/80 border border-hud-red/50 rounded text-hud-red font-sans text-lg hover:bg-space-700/80 hover:border-hud-red focus:bg-space-700/80 focus:border-hud-red focus:outline-none focus:ring-2 focus:ring-hud-red focus:scale-[1.02] active:scale-95 transition-all"
          >
            LEADERBOARDS
          </button>
          <button
            data-menu-item
            onClick={() => setMode('records-stats')}
            className="px-8 py-4 bg-space-800/80 border border-hud-green/50 rounded text-hud-green font-sans text-lg hover:bg-space-700/80 hover:border-hud-green focus:bg-space-700/80 focus:border-hud-green focus:outline-none focus:ring-2 focus:ring-hud-green focus:scale-[1.02] active:scale-95 transition-all"
          >
            STATS
          </button>
          <button
            data-menu-item
            onClick={() => setMode('records-achievements')}
            className="px-8 py-4 bg-space-800/80 border border-hud-amber/50 rounded text-hud-amber font-sans text-lg hover:bg-space-700/80 hover:border-hud-amber focus:bg-space-700/80 focus:border-hud-amber focus:outline-none focus:ring-2 focus:ring-hud-amber focus:scale-[1.02] active:scale-95 transition-all"
          >
            ACHIEVEMENTS
          </button>
          <button
            data-menu-item
            data-menu-back
            onClick={handleBack}
            className="mt-2 px-6 py-3 min-h-[44px] text-white/40 font-sans text-base hover:text-white/70 focus:text-white focus:outline-none focus:ring-2 focus:ring-white/40 rounded transition-colors"
          >
            BACK
          </button>
        </div>
      )}

      {mode === 'records-leaderboards' && (
        <LeaderboardMenu onBack={handleRecordsBack} />
      )}

      {mode === 'records-stats' && (
        <StatsPanel
          metrics={profileMetrics}
          highScore={profileHighScore}
          onBack={handleRecordsBack}
        />
      )}

      {mode === 'records-achievements' && (
        <AchievementsMenu items={achievementItems} onBack={handleRecordsBack} />
      )}

      {/* Erase Profile — two-step confirm */}
      {mode === 'erase' && !eraseArmed && (
        <div className="flex flex-col gap-4 items-center relative z-10 w-full max-w-sm px-4">
          <div className="text-3xl text-hud-red" aria-hidden="true">⚠</div>
          <p className="font-sans text-base text-hud-red text-center tracking-wider font-bold">
            ERASE PROFILE DATA
          </p>
          <p className="font-sans text-sm text-white/75 text-center leading-relaxed">
            This permanently deletes all records for this profile — achievements, stats, and scores. It cannot be undone.
          </p>
          <div className="flex gap-3 mt-2">
            <button data-menu-item data-menu-back onClick={handleBack} className="px-5 py-3 min-h-[44px] bg-space-800/80 border border-white/20 rounded text-white/60 font-sans text-sm hover:bg-space-700/80 hover:text-white/85 focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors">
              CANCEL
            </button>
            <button data-menu-item onClick={() => setEraseArmed(true)} className="px-5 py-3 min-h-[44px] bg-hud-red/20 border border-hud-red rounded text-hud-red font-sans text-sm font-bold hover:bg-hud-red/35 focus:bg-hud-red/35 focus:outline-none focus:ring-2 focus:ring-hud-red transition-colors">
              ERASE PROFILE
            </button>
          </div>
        </div>
      )}

      {mode === 'erase' && eraseArmed && (
        <div className="flex flex-col gap-4 items-center relative z-10 w-full max-w-sm px-4">
          <div className="text-3xl text-hud-red animate-pulse" aria-hidden="true">⚠</div>
          <p className="font-sans text-base text-hud-red text-center tracking-wider font-bold">
            ARE YOU ABSOLUTELY SURE?
          </p>
          <p className="font-sans text-sm text-white/75 text-center leading-relaxed">
            Last chance. This wipes <span className="text-hud-red font-bold">all records</span> for this profile with no way back.
          </p>
          <div className="flex gap-3 mt-2">
            <button data-menu-item data-menu-back onClick={handleBack} className="px-5 py-3 min-h-[44px] bg-space-800/80 border border-white/20 rounded text-white/70 font-sans text-sm font-bold hover:bg-space-700/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors">
              KEEP MY DATA
            </button>
            <button data-menu-item onClick={onEraseProfile} className="px-5 py-3 min-h-[44px] bg-hud-red/30 border border-hud-red rounded text-hud-red font-sans text-sm font-bold hover:bg-hud-red/45 focus:bg-hud-red/45 focus:outline-none focus:ring-2 focus:ring-hud-red transition-colors">
              YES, ERASE
            </button>
          </div>
        </div>
      )}

      {/* Credits */}
      {mode === 'credits' && (
        <div className="flex flex-col items-center relative z-10 w-full max-w-sm md:max-w-md px-4" style={{ maxHeight: 'calc(100dvh - 3rem)' }}>
          <div className="w-full overflow-y-auto overscroll-contain bg-space-900/55 border border-hud-amber/25 rounded-lg px-5 py-5 flex flex-col gap-5 items-center">
            <p className="font-sans text-xl sm:text-2xl tracking-[0.24em] text-hud-amber/90 text-center">CREDITS</p>
            <div className="w-12 h-px bg-white/10" aria-hidden="true" />
            <CreditSection role="Developer" lines={['Santiago Salvador']} />
            <div className="w-12 h-px bg-white/10" aria-hidden="true" />
            <CreditSection role="Original Concept & Base Code" lines={['Randy Lutcavich', 'Randroid.dev']} />
            <div className="w-12 h-px bg-white/10" aria-hidden="true" />
            <CreditSection role="Music & Audio" lines={['Thinking Overture by DSTechnician (via Pixabay)', 'Arranged & implemented by Santiago Salvador']} />
            <div className="w-12 h-px bg-white/10" aria-hidden="true" />
            <CreditSection role="Voiceovers" lines={['RObo-Voice Generator', 'directed by Santiago Salvador']} />
            <div className="w-12 h-px bg-white/10" aria-hidden="true" />
            <CreditSection role="Playtesters" lines={['Zoe Luna & Shakti Sol']} />
            <p className="font-mono text-[10px] tracking-[0.18em] text-white/35 mt-2">v{BUILD_VERSION}</p>
          </div>
          <button data-menu-item data-menu-back onClick={handleBack} className="mt-3 px-6 py-3 min-h-[44px] text-white/40 font-sans text-base hover:text-white/70 focus:text-white focus:outline-none focus:ring-2 focus:ring-white/40 rounded transition-colors">
            BACK
          </button>
        </div>
      )}

      <div className="menu-vignette pointer-events-none absolute inset-0" aria-hidden="true" />
    </div>
  )
}
