'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { SAVE_SLOT_IDS } from '@/lib/schemas'
import type { AchievementMetrics, ProfileId, ProfileSave } from '@/lib/schemas'
import {
  createProfile,
  loadProfiles,
  setActiveProfile,
} from '@/hooks/useGamePersistence'
import { useGamepadMenu } from '@/hooks/useGamepadMenu'
import { LeaderboardMenu } from './LeaderboardMenu'
import { AchievementsMenu } from './AchievementsMenu'
import type { AchievementListItem } from './AchievementsMenu'
import { wipeAllGameData } from '@/lib/wipe-data'
import { BUILD_VERSION } from '@/lib/build-version'

const ROCK_PALETTE = ['#8b7355', '#6b5340', '#a08868'] as const

function generateAsteroidCells(seed: number): [number, number, number][] {
  let s = seed >>> 0
  const rand = (): number => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
  const cells: [number, number, number][] = []
  for (let gx = 0; gx < 10; gx++) {
    for (let gy = 0; gy < 10; gy++) {
      const dx = gx - 4.5
      const dy = gy - 4.5
      const dist = Math.abs(dx) + Math.abs(dy)
      const filled = dist <= 3 || (dist <= 4.5 && rand() < 0.7) || (dist <= 5.5 && rand() < 0.25)
      if (!filled) continue
      const r = rand()
      const colorIdx = dist > 3.5 ? (r < 0.55 ? 1 : 0) : r < 0.18 ? 2 : r < 0.3 ? 1 : 0
      cells.push([gx, gy, colorIdx])
    }
  }
  return cells
}

function MenuAsteroidVoxels({ seed, sizePx }: { seed: number; sizePx: number }) {
  const cells = useMemo(() => generateAsteroidCells(seed), [seed])
  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox="0 0 40 40"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 0 6px rgba(0,0,0,0.5))' }}
    >
      {cells.map(([cx, cy, colorIdx], i) => (
        <rect
          key={i}
          x={cx * 4}
          y={cy * 4}
          width={4}
          height={4}
          fill={ROCK_PALETTE[colorIdx]}
        />
      ))}
    </svg>
  )
}

const ORBIT_DOTS = [
  { color: '#ffaa00', radius: 220, duration: 24, delay: 0 },
  { color: '#00ccff', radius: 260, duration: 32, delay: 6 },
  { color: '#77ffcc', radius: 200, duration: 19, delay: 12 },
  { color: '#ffd866', radius: 290, duration: 40, delay: 3 },
]

type ScreenMode = 'profiles' | 'main' | 'stats' | 'achievements' | 'leaderboards' | 'credits' | 'erase'

interface StartScreenProps {
  activeProfile: ProfileSave | null
  achievementItems: AchievementListItem[]
  onProfileSelected: (profile: ProfileSave) => void
  onStartRun: () => void
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 py-2 last:border-b-0">
      <span className="font-sans text-xs tracking-[0.16em] text-white/45 uppercase">{label}</span>
      <span className="font-mono text-sm text-white/85 tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  )
}

function ProfileCard({
  profileId,
  index,
  profile,
  onSelect,
}: {
  profileId: ProfileId
  index: number
  profile: ProfileSave | null
  onSelect: (profileId: ProfileId) => void
}) {
  const unlocked = profile?.achievements.length ?? 0
  return (
    <button
      data-menu-item
      onClick={() => onSelect(profileId)}
      className="w-full min-h-[92px] rounded border border-hud-green/30 bg-space-800/80 px-4 py-3 text-left font-sans transition-all hover:border-hud-green/70 hover:bg-space-700/80 focus:border-hud-green focus:bg-space-700/80 focus:outline-none focus:ring-2 focus:ring-hud-green active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-hud-green font-bold tracking-[0.18em]">
          {profile?.name ?? `PROFILE ${index + 1}`}
        </span>
        <span className={profile ? 'text-hud-amber text-xs' : 'text-white/30 text-xs'}>
          {profile ? 'READY' : 'NEW'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
        <div>
          <p className="text-white/35">BEST</p>
          <p className="text-white/80">{(profile?.highScore ?? 0).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-white/35">RUNS</p>
          <p className="text-white/80">{(profile?.metrics.totalRuns ?? 0).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-white/35">ACH</p>
          <p className="text-white/80">{unlocked.toLocaleString()}</p>
        </div>
      </div>
      {profile && (
        <p className="mt-2 font-mono text-[10px] tracking-[0.14em] text-white/35">
          LAST PLAYED {formatDate(profile.updatedAt)}
        </p>
      )}
    </button>
  )
}

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
      {rest.map((line) => (
        <p key={line} className="font-sans text-xs sm:text-sm text-white/55 text-center leading-snug">
          {line}
        </p>
      ))}
    </div>
  )
}

function MainButton({
  children,
  onClick,
  tone = 'green',
}: {
  children: ReactNode
  onClick: () => void
  tone?: 'green' | 'blue' | 'amber' | 'red' | 'white'
}) {
  const colors = {
    green: 'border-hud-green/50 text-hud-green hover:border-hud-green focus:border-hud-green focus:ring-hud-green',
    blue: 'border-hud-blue/50 text-hud-blue hover:border-hud-blue focus:border-hud-blue focus:ring-hud-blue',
    amber: 'border-hud-amber/50 text-hud-amber hover:border-hud-amber focus:border-hud-amber focus:ring-hud-amber',
    red: 'border-hud-red/50 text-hud-red hover:border-hud-red focus:border-hud-red focus:ring-hud-red',
    white: 'border-white/30 text-white/65 hover:border-white/60 hover:text-white/85 focus:border-white/70 focus:ring-white/40',
  }[tone]
  return (
    <button
      data-menu-item
      onClick={onClick}
      className={`min-w-[220px] rounded border bg-space-800/80 px-8 py-4 font-sans text-lg transition-all hover:bg-space-700/80 focus:bg-space-700/80 focus:outline-none focus:ring-2 focus:scale-[1.02] active:scale-95 ${colors}`}
    >
      {children}
    </button>
  )
}

function statsRows(profile: ProfileSave | null): Array<[string, number]> {
  const metrics: Partial<AchievementMetrics> = profile?.metrics ?? {}
  return [
    ['High Score', profile?.highScore ?? 0],
    ['Runs Played', metrics.totalRuns ?? 0],
    ['Total Scrap Mined', metrics.totalScrapMined ?? 0],
    ['Arbiters Defeated', metrics.totalArbitersDefeated ?? 0],
    ['Max Ledger', metrics.maxLedgerReached ?? 0],
    ['Enemy Kills', metrics.totalEnemyKills ?? 0],
    ['Asteroids Destroyed', metrics.totalAsteroidsDestroyed ?? 0],
    ['Drones Built', metrics.totalDronesBuilt ?? 0],
    ['Photos Taken', metrics.totalPhotosTaken ?? 0],
    ['Best Sale', metrics.bestSaleValue ?? 0],
  ]
}

export function StartScreen({
  activeProfile,
  achievementItems,
  onProfileSelected,
  onStartRun,
}: StartScreenProps) {
  const [mode, setMode] = useState<ScreenMode>(activeProfile ? 'main' : 'profiles')
  const [profiles, setProfiles] = useState<Map<ProfileId, ProfileSave>>(new Map())
  const [eraseArmed, setEraseArmed] = useState(false)

  useEffect(() => {
    setProfiles(loadProfiles())
  }, [])

  useEffect(() => {
    if (activeProfile && mode === 'profiles') setMode('main')
  }, [activeProfile, mode])

  useGamepadMenu({
    enabled: true,
    resetKey: `${mode}:${activeProfile?.profileId ?? ''}:${eraseArmed ? 'armed' : ''}`,
  })

  const handleSelectProfile = useCallback(
    (profileId: ProfileId) => {
      const profile = profiles.get(profileId) ?? createProfile(profileId)
      setActiveProfile(profile.profileId)
      setProfiles(loadProfiles())
      onProfileSelected(profile)
      setMode('main')
    },
    [onProfileSelected, profiles],
  )

  const handleBack = useCallback(() => {
    setEraseArmed(false)
    setMode(activeProfile ? 'main' : 'profiles')
  }, [activeProfile])

  return (
    <div className="absolute inset-0 bg-space-900 flex flex-col items-center justify-center z-50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="menu-starfield-far absolute" style={{ inset: '0 -30% 0 0' }} aria-hidden="true">
          {Array.from({ length: 60 }, (_, i) => (
            <div
              key={`far-${i}`}
              className="absolute rounded-full bg-white"
              style={{
                width: '1px',
                height: '1px',
                top: `${(i * 37) % 100}%`,
                left: `${(i * 53) % 130}%`,
                opacity: 0.25 + (i % 4) * 0.1,
              }}
            />
          ))}
        </div>
        <div className="menu-starfield-mid absolute" style={{ inset: '0 -40% 0 0' }} aria-hidden="true">
          {Array.from({ length: 28 }, (_, i) => (
            <div
              key={`mid-${i}`}
              className="absolute rounded-full bg-white"
              style={{
                width: '2px',
                height: '2px',
                top: `${(i * 41) % 100}%`,
                left: `${(i * 59) % 130}%`,
                opacity: 0.45 + (i % 3) * 0.15,
              }}
            />
          ))}
        </div>
        {Array.from({ length: 6 }, (_, i) => {
          const size = 56 + ((i * 17) % 48)
          const duration = 55 + ((i * 13) % 35)
          return (
            <div
              key={`asteroid-${i}`}
              className="menu-asteroid-track"
              aria-hidden="true"
              style={{
                top: `${(i * 23 + 5) % 85}%`,
                left: 0,
                animationDuration: `${duration}s`,
                animationDelay: `${-((i * 11) % duration)}s`,
              }}
            >
              <MenuAsteroidVoxels seed={17 + i * 101} sizePx={size} />
            </div>
          )
        })}
        <div className="menu-shooting-star" style={{ animationDelay: '2s', top: '15%' }} aria-hidden="true" />
        <div className="menu-shooting-star" style={{ animationDelay: '6.5s', top: '40%' }} aria-hidden="true" />
      </div>

      <div className="menu-bloom-halo pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="menu-orbit-ring pointer-events-none absolute" aria-hidden="true" />
      <div className="menu-orbit-ring-2 pointer-events-none absolute" aria-hidden="true" />
      <div className="menu-orbit-stage pointer-events-none absolute" aria-hidden="true">
        {ORBIT_DOTS.map((dot, i) => (
          <span
            key={`orbit-${i}`}
            className="menu-orbit-dot"
            style={{
              animationDuration: `${dot.duration}s`,
              animationDelay: `${-dot.delay}s`,
              ['--orbit-radius' as string]: `${dot.radius}px`,
              ['--orbit-color' as string]: dot.color,
            }}
          />
        ))}
      </div>
      <div className="menu-sweep pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="menu-scanlines" aria-hidden="true" />

      {mode !== 'credits' && (
        <>
          <h1 className="menu-title font-display text-4xl md:text-6xl text-hud-green mb-2 tracking-widest text-center relative z-10">
            FRAK&apos;N
            <br />
            FRAK&apos;R
          </h1>
          <p className="font-sans text-sm md:text-base tracking-[0.2em] text-hud-amber/70 mb-6 relative z-10">
            FRAK, SCRAP &amp; UPGRADE
          </p>
        </>
      )}

      {mode === 'profiles' && (
        <div className="relative z-10 flex w-full max-w-md flex-col gap-3 px-4">
          <p className="mb-1 text-center font-sans text-sm tracking-[0.2em] text-white/60 uppercase">
            Select Profile
          </p>
          {SAVE_SLOT_IDS.map((profileId, i) => (
            <ProfileCard
              key={profileId}
              profileId={profileId}
              index={i}
              profile={profiles.get(profileId) ?? null}
              onSelect={handleSelectProfile}
            />
          ))}
        </div>
      )}

      {mode === 'main' && activeProfile && (
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="mb-2 text-center font-mono text-xs tracking-[0.16em] text-white/45">
            <span className="text-hud-green">{activeProfile.name}</span>
            <span className="mx-2 text-white/20">|</span>
            BEST <span className="text-hud-amber">{activeProfile.highScore.toLocaleString()}</span>
            <span className="mx-2 text-white/20">|</span>
            RUNS <span className="text-white/75">{activeProfile.metrics.totalRuns.toLocaleString()}</span>
          </div>
          <MainButton onClick={onStartRun}>START RUN</MainButton>
          <MainButton onClick={() => setMode('stats')} tone="blue">STATS</MainButton>
          <MainButton onClick={() => setMode('achievements')} tone="amber">ACHIEVEMENTS</MainButton>
          <MainButton onClick={() => setMode('leaderboards')} tone="red">LEADERBOARDS</MainButton>
          <MainButton onClick={() => setMode('credits')} tone="amber">CREDITS</MainButton>
          <MainButton onClick={() => setMode('profiles')} tone="white">CHANGE PROFILE</MainButton>
          <button
            data-menu-item
            onClick={() => {
              setEraseArmed(false)
              setMode('erase')
            }}
            className="mt-1 rounded px-3 py-2 font-sans text-xs uppercase tracking-[0.18em] text-white/35 transition-colors hover:text-hud-red focus:text-hud-red focus:outline-none focus:ring-1 focus:ring-hud-red/40"
          >
            Erase All Data
          </button>
        </div>
      )}

      {mode === 'stats' && (
        <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-4 px-4">
          <div className="w-full rounded border border-hud-blue/30 bg-space-900/70 px-5 py-4">
            <p className="mb-3 text-center font-sans text-sm uppercase tracking-[0.24em] text-hud-blue/80">
              Profile Stats
            </p>
            {statsRows(activeProfile).map(([label, value]) => (
              <StatRow key={label} label={label} value={value} />
            ))}
          </div>
          <button
            data-menu-item
            data-menu-back
            onClick={handleBack}
            className="min-h-[44px] rounded px-6 py-3 font-sans text-base text-white/50 transition-colors hover:text-white/80 focus:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            BACK
          </button>
        </div>
      )}

      {mode === 'achievements' && (
        <AchievementsMenu items={achievementItems} onBack={handleBack} />
      )}

      {mode === 'leaderboards' && <LeaderboardMenu onBack={handleBack} />}

      {mode === 'credits' && (
        <div
          className="relative z-10 flex w-full max-w-sm flex-col items-center px-4 md:max-w-md"
          style={{ maxHeight: 'calc(100dvh - 3rem)' }}
        >
          <div className="flex w-full flex-col items-center gap-5 overflow-y-auto overscroll-contain rounded-lg border border-hud-amber/25 bg-space-900/55 px-5 py-5">
            <p className="text-center font-sans text-xl tracking-[0.24em] text-hud-amber/90 sm:text-2xl">
              CREDITS
            </p>
            <div className="h-px w-12 bg-white/10" aria-hidden="true" />
            <CreditSection role="Developer" lines={['Santiago Salvador']} />
            <div className="h-px w-12 bg-white/10" aria-hidden="true" />
            <CreditSection role="Original Concept & Base Code" lines={['Randy Lutcavich', 'Randroid.dev']} />
            <div className="h-px w-12 bg-white/10" aria-hidden="true" />
            <CreditSection
              role="Music & Audio"
              lines={['Thinking Overture by DSTechnician (via Pixabay)', 'Arranged & implemented by Santiago Salvador']}
            />
            <div className="h-px w-12 bg-white/10" aria-hidden="true" />
            <CreditSection role="Voiceovers" lines={['RObo-Voice Generator', 'directed by Santiago Salvador']} />
            <div className="h-px w-12 bg-white/10" aria-hidden="true" />
            <CreditSection role="Playtesters" lines={['Zoe Luna & Shakti Sol']} />
            <p className="mt-2 font-mono text-[10px] tracking-[0.18em] text-white/35">
              v{BUILD_VERSION}
            </p>
          </div>
          <button
            data-menu-item
            data-menu-back
            onClick={handleBack}
            className="mt-3 min-h-[44px] rounded px-6 py-3 font-sans text-base text-white/40 transition-colors hover:text-white/70 focus:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            BACK
          </button>
        </div>
      )}

      {mode === 'erase' && (
        <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-4 px-4">
          <div className={`text-3xl text-hud-red ${eraseArmed ? 'animate-pulse' : ''}`} aria-hidden="true">
            !
          </div>
          <p className="text-center font-sans text-base font-bold tracking-wider text-hud-red">
            {eraseArmed ? 'ARE YOU ABSOLUTELY SURE?' : 'ERASE ALL DATA'}
          </p>
          <p className="text-center font-sans text-sm leading-relaxed text-white/75">
            This permanently deletes every profile, the leaderboard, settings, and tutorial progress.
          </p>
          <div className="mt-2 flex gap-3">
            <button
              data-menu-item
              data-menu-back
              onClick={handleBack}
              className="min-h-[44px] rounded border border-white/20 bg-space-800/80 px-5 py-3 font-sans text-sm text-white/70 transition-colors hover:bg-space-700/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              {eraseArmed ? 'KEEP DATA' : 'CANCEL'}
            </button>
            <button
              data-menu-item
              onClick={() => {
                if (!eraseArmed) {
                  setEraseArmed(true)
                  return
                }
                wipeAllGameData()
                if (typeof window !== 'undefined') window.location.reload()
              }}
              className="min-h-[44px] rounded border border-hud-red bg-hud-red/25 px-5 py-3 font-sans text-sm font-bold text-hud-red transition-colors hover:bg-hud-red/40 focus:bg-hud-red/40 focus:outline-none focus:ring-2 focus:ring-hud-red"
            >
              {eraseArmed ? 'YES, ERASE EVERYTHING' : 'ERASE EVERYTHING'}
            </button>
          </div>
        </div>
      )}

      <div className="menu-vignette pointer-events-none absolute inset-0" aria-hidden="true" />
    </div>
  )
}
