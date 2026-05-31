'use client'

import type { Cargo, Upgrades } from '@/lib/schemas'
import type { MiningTool } from '@/game/types'
import { ledgerStatus } from '@/game/ledger-config'
import { romanNumeral } from '@/game/arbiter-comms'
import type { ArbiterHudInfo } from '@/game/arbiter-comms'

interface HUDProps {
  scrap: number
  cargo: Cargo
  upgrades: Upgrades
  paused: boolean
  activeTool: MiningTool
  hasLazer: boolean
  droneCount: number
  /** Endless-mode escalation meter. 0 hides the readout (prologue/tutorial). */
  ledger: number
  /** Active Arbiter boss, or null. Replaces the Ledger readout when present. */
  arbiter: ArbiterHudInfo | null
  isSaving: boolean
  onPause: () => void
  /** When the trade menu (store) is open the game is already effectively
   * paused, and the pause button would otherwise open the pause overlay
   * underneath the store. Hide the button while it's up. */
  tradeMenuOpen?: boolean
}

/**
 * Display config for the five mineral fragments — color + single-letter
 * monogram badge shown in the resource readout. Order is rarity-ascending so
 * the eye reads left-to-right from common to legendary.
 */
const MINERAL_DISPLAY = [
  { key: 'carbon', letter: 'C', color: '#9098a0' },
  { key: 'silicates', letter: 'S', color: '#c89c70' },
  { key: 'platinum', letter: 'P', color: '#e0e8f0' },
  { key: 'titanium', letter: 'T', color: '#e0a060' },
  { key: 'exotics', letter: 'X', color: '#ff66ff' },
] as const

function MineralBadge({
  letter,
  color,
  count,
}: {
  letter: string
  color: string
  count: number
}) {
  const dim = count === 0
  return (
    <span
      className="flex items-center gap-0.5 sm:gap-1 font-mono"
      style={{ color, opacity: dim ? 0.35 : 1 }}
      aria-label={`${letter} ${count}`}
    >
      <span
        className="inline-flex items-center justify-center font-bold rounded-sm"
        style={{
          width: '0.95em',
          height: '0.95em',
          fontSize: '0.65em',
          color: '#000',
          backgroundColor: color,
        }}
        aria-hidden="true"
      >
        {letter}
      </span>
      {count}
    </span>
  )
}

function MiningToolLabel({
  activeTool,
  hasAlternateTool,
}: {
  activeTool: MiningTool
  hasAlternateTool: boolean
}) {
  const toolLabel =
    activeTool === 'lazer' ? 'LAZER' : activeTool === 'ripple' ? 'RIPPLE' : 'BLASTER'
  const toolColor =
    activeTool === 'lazer' ? '#00ccff' : activeTool === 'ripple' ? '#77ffcc' : '#ffaa00'
  const isMobile = typeof window !== 'undefined' && 'ontouchstart' in window

  return (
    <div
      className="font-mono font-bold text-[clamp(0.75rem,2vw,0.875rem)]"
      style={{ color: toolColor }}
      data-testid="mining-tool-label"
    >
      {toolLabel}
      {!isMobile && hasAlternateTool && (
        <span className="ml-1 text-white/40 font-normal text-[clamp(0.625rem,1.6vw,0.75rem)]">
          [Q]
        </span>
      )}
    </div>
  )
}

export function HUD({
  scrap,
  cargo,
  upgrades,
  paused,
  activeTool,
  hasLazer,
  droneCount,
  ledger,
  arbiter,
  isSaving,
  onPause,
  tradeMenuOpen = false,
}: HUDProps) {
  const cargoPercent = cargo.capacity > 0 ? Math.round((cargo.fragments / cargo.capacity) * 100) : 0
  const ledgerInfo = ledgerStatus(ledger)
  const arbiterHpFrac = arbiter ? Math.max(0, Math.min(1, arbiter.hp / arbiter.maxHp)) : 0
  const arbiterColor = arbiter && arbiter.phase >= 2 ? '#ff1a1a' : '#ff5555'

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar: flex row with resources left, upgrades+pause right */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-2 sm:p-3 md:p-4 gap-2 sm:gap-4">
        {/* Left: Resources */}
        <div className="flex flex-col gap-1 sm:gap-2 text-[clamp(0.8125rem,2.4vw,1rem)] min-w-0">
          <div className="text-hud-amber font-mono font-bold truncate">SCRAP: {scrap}</div>
          <div className="text-hud-blue font-mono truncate">
            CARGO: {cargo.fragments}/{cargo.capacity} ({cargoPercent}%)
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[clamp(0.75rem,2vw,0.9375rem)]">
            {MINERAL_DISPLAY.map((m) => (
              <MineralBadge key={m.key} letter={m.letter} color={m.color} count={cargo[m.key]} />
            ))}
          </div>
          <MiningToolLabel
            activeTool={activeTool}
            hasAlternateTool={hasLazer || upgrades.ripple > 0}
          />
        </div>

        {/* Right: Upgrades + Pause */}
        <div className="flex items-start gap-2 sm:gap-4 shrink-0">
          <div className="flex flex-col gap-0.5 sm:gap-1 text-[clamp(0.75rem,2.2vw,0.9375rem)] font-mono text-right">
            <div className="text-hud-red">BLASTER Mk{upgrades.blaster}</div>
            <div className="text-hud-green">COLLECTOR Mk{upgrades.collector}</div>
            <div className="text-hud-blue">STORAGE Mk{upgrades.storage}</div>
            {upgrades.missiles > 0 && (
              <div className="text-hud-amber">MISSILES x{upgrades.missiles}</div>
            )}
            {upgrades.options > 0 && (
              <div className="text-cyan-200">OPTION x{upgrades.options}</div>
            )}
            {upgrades.speed > 0 && <div className="text-lime-300">ENGINE Mk{upgrades.speed}</div>}
            {/* Defensive layers — top-down in damage-hierarchy order so the
                player can see at a glance which charge their next hit will
                consume: shield first, then hull modules, then armor. */}
            {upgrades.shield > 0 && <div className="text-sky-300">SHIELD {upgrades.shield}</div>}
            {upgrades.hull > 0 && <div className="text-amber-300">HULL {upgrades.hull}</div>}
            {upgrades.armor > 0 && <div className="text-orange-300">ARMOR {upgrades.armor}</div>}
            {upgrades.drone > 0 && (
              <div className="text-hud-amber">DRONES {droneCount}/{upgrades.drone}</div>
            )}
            {upgrades.smartBomb > 0 && (
              <div className="text-red-400 animate-pulse text-[clamp(0.6rem,1.5vw,0.75rem)]">
                \u2622 CORE ARMED \u2622
              </div>
            )}
          </div>
          {!tradeMenuOpen && (
            <button
              onClick={onPause}
              className="pointer-events-auto relative z-[60] px-2 py-1.5 sm:px-3 sm:py-2 bg-space-800/80 border border-hud-green/30 rounded text-hud-green text-xs sm:text-sm hover:bg-space-700/80 active:scale-95 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={paused ? 'Resume game' : 'Pause game'}
            >
              {paused ? '\u25B6' : 'II'}
            </button>
          )}
        </div>
      </div>

      {/* The Arbiter \u2014 endless-mode boss bar (top-centre, takes priority) */}
      {arbiter && (
        <div
          className="absolute top-2 sm:top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5"
          data-testid="arbiter-bar"
        >
          <div
            className="font-mono font-bold tracking-[0.18em] text-[clamp(0.6rem,1.7vw,0.85rem)]"
            style={{ color: arbiterColor }}
          >
            \u2b22 THE ARBITER \u00b7 MARK {romanNumeral(arbiter.mark)} \u2b22
          </div>
          <div
            className="w-44 sm:w-72 h-2 sm:h-3 rounded-sm overflow-hidden"
            style={{ backgroundColor: '#1a0a0e', border: '1px solid rgba(255,80,80,0.35)' }}
          >
            <div
              className="h-full transition-all duration-200"
              style={{ width: `${arbiterHpFrac * 100}%`, backgroundColor: arbiterColor }}
            />
          </div>
        </div>
      )}

      {/* The Ledger \u2014 endless-mode escalation meter (hidden during a boss fight) */}
      {ledger > 0 && !arbiter && (
        <div
          className="absolute top-2 sm:top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5"
          data-testid="ledger-meter"
        >
          <div className="font-mono tracking-[0.2em] text-white/45 text-[clamp(0.5rem,1.4vw,0.65rem)]">
            THE LEDGER
          </div>
          <div
            className="w-28 sm:w-40 h-1.5 sm:h-2 rounded-sm overflow-hidden"
            style={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${ledgerInfo.progress * 100}%`,
                backgroundColor: ledgerInfo.color,
              }}
            />
          </div>
          <div
            className="font-mono font-bold tracking-[0.15em] text-[clamp(0.6rem,1.7vw,0.8rem)]"
            style={{ color: ledgerInfo.color }}
          >
            {ledgerInfo.label}
          </div>
        </div>
      )}

      {/* Save indicator */}
      {isSaving && (
        <div className="absolute bottom-4 right-4 flex items-center gap-2 pointer-events-none">
          <div className="w-2 h-2 rounded-full bg-hud-blue animate-pulse" />
          <div className="font-mono text-[0.65rem] text-hud-blue/80 tracking-widest uppercase">
            Data Saved
          </div>
        </div>
      )}
    </div>
  )
}
