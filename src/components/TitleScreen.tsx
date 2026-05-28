'use client'

import { useCallback, useEffect, useRef } from 'react'
import { BUILD_VERSION } from '@/lib/build-version'

interface TitleScreenProps {
  onBegin: () => void
}

// Orbiting drone-like glow dots. Hex colors pulled from the in-game palette
// (blaster orange, lazer cyan, ripple mint, hud-amber) so the menu reads as
// "this is the same game" before the first frame of gameplay loads.
const ORBIT_DOTS = [
  { color: '#ffaa00', radius: 220, duration: 24, delay: 0 },
  { color: '#00ccff', radius: 260, duration: 32, delay: 6 },
  { color: '#77ffcc', radius: 200, duration: 19, delay: 12 },
  { color: '#ffd866', radius: 290, duration: 40, delay: 3 },
]

export function TitleScreen({ onBegin }: TitleScreenProps) {
  const beganRef = useRef(false)

  const begin = useCallback(() => {
    if (beganRef.current) return
    beganRef.current = true
    onBegin()
  }, [onBegin])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Enter') begin()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [begin])

  return (
    <button
      type="button"
      onClick={begin}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-space-900 text-center focus:outline-none"
      aria-label="Begin"
    >
      {/* Parallax starfield — three depth layers drift at different speeds. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="menu-starfield-far absolute" style={{ inset: '0 -30% 0 0' }}>
          {Array.from({ length: 70 }, (_, i) => (
            <span
              key={`title-far-${i}`}
              className="absolute rounded-full bg-white"
              style={{
                width: '1px',
                height: '1px',
                top: `${(i * 37) % 100}%`,
                left: `${(i * 53) % 130}%`,
                opacity: 0.2 + (i % 4) * 0.12,
              }}
            />
          ))}
        </div>
        <div className="menu-starfield-mid absolute" style={{ inset: '0 -40% 0 0' }}>
          {Array.from({ length: 30 }, (_, i) => (
            <span
              key={`title-mid-${i}`}
              className="absolute rounded-full bg-white"
              style={{
                width: '2px',
                height: '2px',
                top: `${(i * 41) % 100}%`,
                left: `${(i * 59) % 130}%`,
                opacity: 0.4 + (i % 3) * 0.15,
              }}
            />
          ))}
        </div>
        <div className="menu-starfield-near absolute" style={{ inset: '0 -60% 0 0' }}>
          {Array.from({ length: 14 }, (_, i) => (
            <span
              key={`title-near-${i}`}
              className="menu-star-twinkle absolute rounded-full bg-white"
              style={{
                width: '3px',
                height: '3px',
                top: `${(i * 43) % 100}%`,
                left: `${(i * 71) % 130}%`,
                animationDelay: `${(i * 0.7) % 4}s`,
                boxShadow: '0 0 4px rgba(255,255,255,0.6)',
              }}
            />
          ))}
        </div>
        <div className="menu-shooting-star" style={{ animationDelay: '1.2s', top: '18%' }} />
        <div className="menu-shooting-star" style={{ animationDelay: '5.8s', top: '48%' }} />
      </div>

      {/* Bloom halo + concentric rings — sits between the starfield and the
          title and gives the wordmark something to glow against. Matches the
          in-game UnrealBloomPass / dynamic-light palette. */}
      <div
        className="menu-bloom-halo pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <div
        className="menu-orbit-ring pointer-events-none absolute"
        aria-hidden="true"
      />
      <div
        className="menu-orbit-ring-2 pointer-events-none absolute"
        aria-hidden="true"
      />

      {/* Orbiting drone-like indicators around the title. */}
      <div
        className="menu-orbit-stage pointer-events-none absolute"
        aria-hidden="true"
      >
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

      {/* Occasional cyan sweep — evokes the lazer beam sweeping across. */}
      <div className="menu-sweep pointer-events-none absolute inset-0" aria-hidden="true" />

      {/* Vignette + scanlines (post-process echo). Vignette mounts last so it
          sits above the bloom halo for the same depth feel as in-game. */}
      <div className="menu-scanlines" aria-hidden="true" />
      <div className="menu-vignette pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="absolute bottom-3 left-3 z-10 font-mono text-[10px] sm:text-xs tracking-[0.18em] text-white/35">
        v{BUILD_VERSION}
      </div>

      <div className="relative z-10 flex flex-col items-center px-6">
        <h1 className="menu-title font-display text-4xl sm:text-5xl md:text-7xl text-hud-green tracking-widest">
          FRAK&apos;N
          <br />
          FRAK&apos;R
        </h1>
        <div className="menu-divider" aria-hidden="true" />
        <p className="mt-6 font-sans text-sm sm:text-base md:text-lg tracking-[0.28em] text-hud-amber/85 menu-cta">
          PRESS ENTER · CLICK · TAP
        </p>
        <p className="mt-3 font-sans text-[10px] sm:text-xs tracking-[0.32em] text-white/40">
          TO BEGIN
        </p>
      </div>
    </button>
  )
}
