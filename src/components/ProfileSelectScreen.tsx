'use client'

import { useState, useEffect } from 'react'
import { PROFILE_IDS } from '@/lib/schemas'
import type { ProfileId, ProfileSummary } from '@/lib/schemas'
import { loadProfileSummaries } from '@/hooks/useGamePersistence'
import { useGamepadMenu } from '@/hooks/useGamepadMenu'

interface ProfileSelectScreenProps {
  onSelectProfile: (profileId: ProfileId) => void
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Orbiting drone-color dots */
const ORBIT_DOTS = [
  { color: '#ffaa00', radius: 220, duration: 24, delay: 0 },
  { color: '#00ccff', radius: 260, duration: 32, delay: 6 },
  { color: '#77ffcc', radius: 200, duration: 19, delay: 12 },
  { color: '#ffd866', radius: 290, duration: 40, delay: 3 },
]

export function ProfileSelectScreen({ onSelectProfile }: ProfileSelectScreenProps) {
  const [summaries, setSummaries] = useState<Map<ProfileId, ProfileSummary>>(new Map())

  useEffect(() => {
    setSummaries(loadProfileSummaries())
  }, [])

  useGamepadMenu({ enabled: true, resetKey: 'profile-select' })

  return (
    <div className="absolute inset-0 bg-space-900 flex flex-col items-center justify-center z-50">
      {/* Background stars */}
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

      <h1 className="menu-title font-display text-4xl md:text-6xl text-hud-green mb-2 tracking-widest text-center relative z-10">
        FRAK&apos;N<br />FRAK&apos;R
      </h1>
      <p className="font-sans text-sm md:text-base tracking-[0.2em] text-hud-amber/70 mb-8 relative z-10">
        SELECT PROFILE
      </p>

      <div className="flex flex-col gap-3 relative z-10 w-full max-w-sm px-4">
        {PROFILE_IDS.map((profileId, i) => {
          const summary = summaries.get(profileId)
          return (
            <button
              key={profileId}
              data-menu-item
              onClick={() => onSelectProfile(profileId)}
              className="px-6 py-4 min-h-[56px] bg-space-800/80 border border-hud-green/30 rounded font-sans text-base hover:bg-space-700/80 hover:border-hud-green/60 focus:bg-space-700/80 focus:border-hud-green focus:outline-none focus:ring-2 focus:ring-hud-green active:scale-[0.98] transition-all text-left flex items-center justify-between"
            >
              <span className="text-hud-green font-bold">PROFILE {i + 1}</span>
              {summary ? (
                <span className="text-white/50 text-sm">
                  {summary.highScore > 0 && (
                    <span className="text-hud-amber mr-3">{summary.highScore.toLocaleString()}</span>
                  )}
                  {formatDate(summary.timestamp)}
                </span>
              ) : (
                <span className="text-white/30 text-sm">New Profile</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="menu-vignette pointer-events-none absolute inset-0" aria-hidden="true" />
    </div>
  )
}
