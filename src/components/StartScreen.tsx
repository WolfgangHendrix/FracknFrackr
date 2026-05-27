'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { SAVE_SLOT_IDS, SaveSlotSummarySchema } from '@/lib/schemas'
import type { SaveSlotId, SaveSlotSummary } from '@/lib/schemas'
import { useGamepadMenu } from '@/hooks/useGamepadMenu'

// In-game asteroid voxel palette (mirrors ASTEROID_COLORS in asteroid-model.ts)
const ROCK_PALETTE = ['#8b7355', '#6b5340', '#a08868'] as const

/**
 * Voxel asteroid silhouette that matches the in-game style: a grid of small
 * rectangles in the same rock palette as `createAsteroidModel`. Shape is
 * deterministic per `seed` so SSR/client agree.
 */
function MenuAsteroidVoxels({ seed, sizePx }: { seed: number; sizePx: number }) {
  const cells = useMemo(() => generateAsteroidCells(seed), [seed])
  const grid = 10 // 10×10 voxel field
  const voxel = 4 // SVG units per voxel
  const viewBox = `0 0 ${grid * voxel} ${grid * voxel}`
  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox={viewBox}
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 0 6px rgba(0,0,0,0.5))' }}
    >
      {cells.map(([cx, cy, colorIdx], i) => (
        <rect
          key={i}
          x={cx * voxel}
          y={cy * voxel}
          width={voxel}
          height={voxel}
          fill={ROCK_PALETTE[colorIdx]}
        />
      ))}
    </svg>
  )
}

function generateAsteroidCells(seed: number): [number, number, number][] {
  // Tiny LCG seeded by `seed` so the shape is reproducible.
  let s = seed >>> 0
  const rand = (): number => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
  const cells: [number, number, number][] = []
  // Use Manhattan distance from center to get a chunky rock silhouette.
  // Center the 10×10 grid around (4.5, 4.5).
  for (let gx = 0; gx < 10; gx++) {
    for (let gy = 0; gy < 10; gy++) {
      const dx = gx - 4.5
      const dy = gy - 4.5
      const dist = Math.abs(dx) + Math.abs(dy)
      // Core (always filled), edge band (probabilistic).
      let filled = false
      if (dist <= 3) filled = true
      else if (dist <= 4.5) filled = rand() < 0.7
      else if (dist <= 5.5) filled = rand() < 0.25
      if (!filled) continue
      // Color picking: tend dark on edges, light on highlights.
      let colorIdx = 0 // rock (mid)
      const r = rand()
      if (dist > 3.5)
        colorIdx = r < 0.55 ? 1 : 0 // rockDark on edges
      else if (r < 0.18)
        colorIdx = 2 // rockLight highlights
      else if (r < 0.3) colorIdx = 1
      cells.push([gx, gy, colorIdx])
    }
  }
  return cells
}

const SLOTS_STORAGE_KEY = 'fracking-asteroids-slot-summaries'

interface StartScreenProps {
  onNewGame: (slotId: SaveSlotId) => void
  onLoadGame: (slotId: SaveSlotId) => void
}

function loadSlotSummaries(): Map<SaveSlotId, SaveSlotSummary> {
  if (typeof window === 'undefined') return new Map()
  try {
    const raw = localStorage.getItem(SLOTS_STORAGE_KEY)
    if (!raw) return new Map()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Map()
    const map = new Map<SaveSlotId, SaveSlotSummary>()
    for (const item of parsed) {
      const result = SaveSlotSummarySchema.safeParse(item)
      if (result.success) {
        map.set(result.data.slotId, result.data)
      }
    }
    return map
  } catch {
    return new Map()
  }
}

export function saveSlotSummary(summary: SaveSlotSummary): void {
  const map = loadSlotSummaries()
  map.set(summary.slotId, summary)
  localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify([...map.values()]))
}

export function clearSlotSummary(slotId: SaveSlotId): void {
  const map = loadSlotSummaries()
  map.delete(slotId)
  localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify([...map.values()]))
}

type ScreenMode = 'main' | 'new-game' | 'load-game' | 'credits'

/** A single credit block: a role heading and one or more attribution lines. */
function CreditSection({ role, lines }: { role: string; lines: string[] }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="font-mono text-xs tracking-[0.22em] text-hud-amber/70 uppercase">{role}</p>
      {lines.map((line) => (
        <p key={line} className="font-mono text-sm md:text-base text-white/85 text-center">
          {line}
        </p>
      ))}
    </div>
  )
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function SlotLabel({ index }: { index: number }) {
  return <span className="text-hud-green font-bold">SLOT {index + 1}</span>
}

export function StartScreen({ onNewGame, onLoadGame }: StartScreenProps) {
  const [mode, setMode] = useState<ScreenMode>('main')
  const [summaries, setSummaries] = useState<Map<SaveSlotId, SaveSlotSummary>>(new Map())
  const [confirmSlot, setConfirmSlot] = useState<SaveSlotId | null>(null)

  useEffect(() => {
    setSummaries(loadSlotSummaries())
  }, [])

  // Gamepad navigation: D-pad/left stick moves focus, A clicks focused button,
  // B clicks the back/cancel button. resetKey re-anchors focus on view changes.
  useGamepadMenu({
    enabled: true,
    resetKey: `${mode}:${confirmSlot ?? ''}`,
  })

  const handleBack = useCallback(() => {
    setMode('main')
    setConfirmSlot(null)
  }, [])

  const handleNewGameSlot = useCallback(
    (slotId: SaveSlotId) => {
      if (summaries.has(slotId)) {
        setConfirmSlot(slotId)
      } else {
        onNewGame(slotId)
      }
    },
    [summaries, onNewGame],
  )

  const handleConfirmOverwrite = useCallback(() => {
    if (confirmSlot) {
      clearSlotSummary(confirmSlot)
      onNewGame(confirmSlot)
    }
  }, [confirmSlot, onNewGame])

  const populatedSlots = SAVE_SLOT_IDS.filter((id) => summaries.has(id))

  return (
    <div className="absolute inset-0 bg-space-900 flex flex-col items-center justify-center z-50">
      {/* Background atmosphere — three drifting star layers, asteroid silhouettes,
          shooting stars, scanline overlay. Stays behind everything else. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Far stars — many, small, dim, slowest drift */}
        <div
          className="menu-starfield-far absolute"
          style={{ inset: '0 -30% 0 0' }}
          aria-hidden="true"
        >
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

        {/* Mid stars — fewer, slightly larger */}
        <div
          className="menu-starfield-mid absolute"
          style={{ inset: '0 -40% 0 0' }}
          aria-hidden="true"
        >
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

        {/* Near stars — fewest, brightest, with twinkle */}
        <div
          className="menu-starfield-near absolute"
          style={{ inset: '0 -60% 0 0' }}
          aria-hidden="true"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={`near-${i}`}
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

        {/* Drifting voxel-asteroid silhouettes — sparse, behind everything.
            Matches the in-game asteroid voxel style (palette + chunky grid). */}
        {Array.from({ length: 6 }, (_, i) => {
          // Deterministic per index so SSR matches client render.
          const size = 56 + ((i * 17) % 48) // 56–104px
          const top = `${(i * 23 + 5) % 85}%`
          const duration = 55 + ((i * 13) % 35) // 55–90s
          const delay = -((i * 11) % duration) // stagger so they're already on-screen
          const seed = 17 + i * 101
          return (
            <div
              key={`asteroid-${i}`}
              className="menu-asteroid-track"
              aria-hidden="true"
              style={{
                top,
                left: 0,
                animationDuration: `${duration}s`,
                animationDelay: `${delay}s`,
              }}
            >
              <MenuAsteroidVoxels seed={seed} sizePx={size} />
            </div>
          )
        })}

        {/* Shooting stars — two staggered streaks */}
        <div
          className="menu-shooting-star"
          style={{ animationDelay: '2s', top: '15%' }}
          aria-hidden="true"
        />
        <div
          className="menu-shooting-star"
          style={{ animationDelay: '6.5s', top: '40%' }}
          aria-hidden="true"
        />
      </div>

      {/* Scanline overlay — above background, below menu chrome */}
      <div className="menu-scanlines" aria-hidden="true" />

      {/* Title */}
      <h1 className="menu-title font-mono text-4xl md:text-6xl font-bold text-hud-green mb-2 tracking-widest text-center relative">
        FRAK&apos;N
        <br />
        FRAK&apos;R
      </h1>
      <p className="font-mono text-sm md:text-base text-hud-amber/70 mb-12 relative">
        Blast. Collect. Scrap. Upgrade.
      </p>

      {/* Main Menu */}
      {mode === 'main' && (
        <div className="flex flex-col gap-4 relative">
          <button
            data-menu-item
            onClick={() => setMode('new-game')}
            className="px-8 py-4 bg-space-800/80 border border-hud-green/50 rounded text-hud-green font-mono text-lg hover:bg-space-700/80 hover:border-hud-green focus:bg-space-700/80 focus:border-hud-green focus:outline-none focus:ring-2 focus:ring-hud-green focus:scale-[1.02] active:scale-95 transition-all min-w-[220px]"
          >
            NEW GAME
          </button>
          <button
            data-menu-item
            onClick={() => setMode('load-game')}
            disabled={populatedSlots.length === 0}
            className="px-8 py-4 bg-space-800/80 border border-hud-blue/50 rounded text-hud-blue font-mono text-lg hover:bg-space-700/80 hover:border-hud-blue focus:bg-space-700/80 focus:border-hud-blue focus:outline-none focus:ring-2 focus:ring-hud-blue focus:scale-[1.02] active:scale-95 transition-all min-w-[220px] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-space-800/80 disabled:hover:border-hud-blue/50"
          >
            LOAD GAME
          </button>
          <button
            data-menu-item
            onClick={() => setMode('credits')}
            className="px-8 py-4 bg-space-800/80 border border-hud-amber/50 rounded text-hud-amber font-mono text-lg hover:bg-space-700/80 hover:border-hud-amber focus:bg-space-700/80 focus:border-hud-amber focus:outline-none focus:ring-2 focus:ring-hud-amber focus:scale-[1.02] active:scale-95 transition-all min-w-[220px]"
          >
            CREDITS
          </button>
        </div>
      )}

      {/* Credits */}
      {mode === 'credits' && (
        <div className="flex flex-col gap-5 items-center relative w-full max-w-sm px-4">
          <CreditSection role="Developer" lines={['Santiago Salvador']} />
          <CreditSection
            role="Original Concept & Base Code"
            lines={['Randy Lutcavich (Randroid.dev)']}
          />
          <CreditSection
            role="Music & Audio"
            lines={[
              'Thinking Overture by DSTechnician',
              '(via Pixabay)',
              'Arranged & Implemented by Santiago Salvador',
            ]}
          />
          <CreditSection
            role="Voiceovers"
            lines={['Generated via RObo-Voice Generator', 'by Santiago Salvador']}
          />
          <button
            data-menu-item
            data-menu-back
            onClick={handleBack}
            className="mt-2 px-6 py-3 min-h-[44px] text-white/40 font-mono text-base hover:text-white/70 focus:text-white focus:outline-none focus:ring-2 focus:ring-white/40 rounded transition-colors"
          >
            BACK
          </button>
        </div>
      )}

      {/* New Game Slot Picker */}
      {mode === 'new-game' && !confirmSlot && (
        <div className="flex flex-col gap-3 relative w-full max-w-sm px-4">
          <p className="font-mono text-sm text-white/60 text-center mb-2">Select a save slot</p>
          {SAVE_SLOT_IDS.map((slotId, i) => {
            const summary = summaries.get(slotId)
            return (
              <button
                key={slotId}
                data-menu-item
                onClick={() => handleNewGameSlot(slotId)}
                className="px-6 py-3.5 min-h-[52px] bg-space-800/80 border border-hud-green/30 rounded font-mono text-base hover:bg-space-700/80 hover:border-hud-green/60 focus:bg-space-700/80 focus:border-hud-green focus:outline-none focus:ring-2 focus:ring-hud-green active:scale-[0.98] transition-all text-left"
              >
                <SlotLabel index={i} />
                {summary ? (
                  <span className="text-white/50 ml-3">{formatDate(summary.timestamp)}</span>
                ) : (
                  <span className="text-white/30 ml-3">Empty</span>
                )}
              </button>
            )
          })}
          <button
            data-menu-item
            data-menu-back
            onClick={handleBack}
            className="mt-2 px-6 py-3 min-h-[44px] text-white/40 font-mono text-base hover:text-white/70 focus:text-white focus:outline-none focus:ring-2 focus:ring-white/40 rounded transition-colors"
          >
            BACK
          </button>
        </div>
      )}

      {/* Confirm Overwrite */}
      {mode === 'new-game' && confirmSlot && (
        <div className="flex flex-col gap-4 items-center relative">
          <p className="font-mono text-sm text-hud-red text-center">
            This slot has saved data.
            <br />
            Start a new game and overwrite it?
          </p>
          <div className="flex gap-4">
            <button
              data-menu-item
              onClick={handleConfirmOverwrite}
              className="px-6 py-3.5 min-h-[48px] bg-space-800/80 border border-hud-red/50 rounded text-hud-red font-mono text-base hover:bg-space-700/80 hover:border-hud-red focus:bg-space-700/80 focus:border-hud-red focus:outline-none focus:ring-2 focus:ring-hud-red active:scale-95 transition-all"
            >
              OVERWRITE
            </button>
            <button
              data-menu-item
              data-menu-back
              onClick={() => setConfirmSlot(null)}
              className="px-6 py-3.5 min-h-[48px] bg-space-800/80 border border-white/20 rounded text-white/60 font-mono text-base hover:bg-space-700/80 hover:text-white/80 focus:bg-space-700/80 focus:text-white focus:outline-none focus:ring-2 focus:ring-white/40 active:scale-95 transition-all"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Load Game Slot Picker */}
      {mode === 'load-game' && (
        <div className="flex flex-col gap-3 relative w-full max-w-sm px-4">
          <p className="font-mono text-sm text-white/60 text-center mb-2">Select a save to load</p>
          {SAVE_SLOT_IDS.map((slotId, i) => {
            const summary = summaries.get(slotId)
            const isEmpty = !summary
            return (
              <button
                key={slotId}
                data-menu-item
                onClick={() => !isEmpty && onLoadGame(slotId)}
                disabled={isEmpty}
                className="px-6 py-3.5 min-h-[52px] bg-space-800/80 border border-hud-blue/30 rounded font-mono text-base hover:bg-space-700/80 hover:border-hud-blue/60 focus:bg-space-700/80 focus:border-hud-blue focus:outline-none focus:ring-2 focus:ring-hud-blue active:scale-[0.98] transition-all text-left disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-space-800/80 disabled:hover:border-hud-blue/30"
              >
                <SlotLabel index={i} />
                {summary ? (
                  <span className="text-white/50 ml-3">{formatDate(summary.timestamp)}</span>
                ) : (
                  <span className="text-white/30 ml-3">Empty</span>
                )}
              </button>
            )
          })}
          <button
            data-menu-item
            data-menu-back
            onClick={handleBack}
            className="mt-2 px-6 py-3 min-h-[44px] text-white/40 font-mono text-base hover:text-white/70 focus:text-white focus:outline-none focus:ring-2 focus:ring-white/40 rounded transition-colors"
          >
            BACK
          </button>
        </div>
      )}
    </div>
  )
}
