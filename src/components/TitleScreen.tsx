'use client'

import { useCallback, useEffect, useRef } from 'react'
import { BUILD_VERSION } from '@/lib/build-version'

interface TitleScreenProps {
  onBegin: () => void
}

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

      <div className="menu-scanlines" aria-hidden="true" />
      <div className="absolute bottom-3 left-3 z-10 font-mono text-[10px] sm:text-xs tracking-[0.18em] text-white/35">
        v{BUILD_VERSION}
      </div>

      <div className="relative z-10 flex flex-col items-center px-6">
        <h1 className="menu-title font-mono text-4xl sm:text-5xl md:text-7xl font-bold text-hud-green tracking-widest">
          FRACKING
          <br />
          ASTEROIDS
        </h1>
        <p className="mt-8 font-mono text-sm sm:text-base md:text-lg tracking-[0.28em] text-hud-amber/80">
          CLICK, TAP, OR PRESS ENTER
        </p>
        <p className="mt-3 font-mono text-xs sm:text-sm tracking-[0.2em] text-white/45">TO BEGIN</p>
      </div>
    </button>
  )
}
