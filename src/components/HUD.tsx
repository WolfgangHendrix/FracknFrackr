'use client'

import type { ReactNode } from 'react'
import type { Cargo, Upgrades } from '@/lib/schemas'
import type { MiningTool } from '@/game/types'
import { capacityForStorage } from '@/hooks/useGameState'
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
  achievementCount: number
  achievementTotal: number
  onPause: () => void
  /** When the trade menu (store) is open the game is already effectively
   * paused, and the pause button would otherwise open the pause overlay
   * underneath the store. Hide the button while it's up. */
  tradeMenuOpen?: boolean
  /** When the run is over (HULL LOST / run summary) the run is finished and the
   * pause button must not open the pause overlay behind the summary. */
  runOver?: boolean
  showHarvestingWarning?: boolean
}

/**
 * Display config for the five mineral fragments — color + single-letter
 * monogram badge shown in the resource readout. Order is rarity-ascending so
 * the eye reads left-to-right from common to legendary. `name`/`desc` feed the
 * hover tooltip so a new player can decode each badge.
 */
const MINERAL_DISPLAY = [
  { key: 'carbon', letter: 'C', color: '#9098a0', name: 'Carbon', desc: 'Common carbonaceous ore — lowest value, but it is everywhere.' },
  { key: 'silicates', letter: 'S', color: '#c89c70', name: 'Silicates', desc: 'Uncommon rocky silicates — modest value.' },
  { key: 'platinum', letter: 'P', color: '#e0e8f0', name: 'Platinum', desc: 'Rare platinum-group metal — high value.' },
  { key: 'titanium', letter: 'T', color: '#e0a060', name: 'Titanium', desc: 'Very rare titanium alloy — very high value.' },
  { key: 'exotics', letter: 'X', color: '#ff66ff', name: 'Exotics', desc: 'Legendary exotic matter — the most valuable haul in the belt.' },
] as const

/**
 * Hover tooltip used throughout the HUD so players can read what each cryptic
 * badge/readout means. CSS-only (group-hover) — no JS state. The wrapper opts
 * back into pointer events (the HUD root is pointer-events-none) and is sized
 * to its content so the hover hit-area is just the label, not the whole bar.
 */
function InfoTip({
  label,
  align = 'left',
  children,
}: {
  label: string
  align?: 'left' | 'right' | 'center'
  children: ReactNode
}) {
  const selfAlign =
    align === 'right' ? 'self-end' : align === 'center' ? 'self-center' : 'self-start'
  const tipAnchor =
    align === 'right'
      ? 'right-0'
      : align === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'left-0'
  return (
    <span className={`group relative pointer-events-auto cursor-help w-max ${selfAlign}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full mt-1 z-[70] hidden w-max max-w-[240px] group-hover:block rounded border border-hud-green/40 bg-space-900/95 px-2 py-1 text-left font-sans text-[11px] font-normal normal-case leading-snug tracking-normal text-white/85 shadow-xl ${tipAnchor}`}
      >
        {label}
      </span>
    </span>
  )
}

function MineralBadge({
  letter,
  color,
  count,
  name,
  desc,
}: {
  letter: string
  color: string
  count: number
  name: string
  desc: string
}) {
  const dim = count === 0
  return (
    <span className="group relative pointer-events-auto cursor-help">
      <span
        className="flex items-center gap-0.5 sm:gap-1 font-mono"
        style={{ color, opacity: dim ? 0.35 : 1 }}
        aria-label={`${name} ${count}`}
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
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-0 mt-1 z-[70] hidden w-max max-w-[240px] group-hover:block rounded border border-hud-green/40 bg-space-900/95 px-2 py-1 text-left font-sans text-[11px] font-normal normal-case leading-snug tracking-normal text-white/85 shadow-xl"
      >
        <span className="font-bold" style={{ color }}>
          {name}
        </span>{' '}
        — {desc}
      </span>
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

  const toolDesc =
    activeTool === 'lazer'
      ? 'Continuous mining beam (+50% damage) that cuts basaltic asteroids.'
      : activeTool === 'ripple'
        ? 'Wide beam that fans out with distance — clears clustered rock.'
        : 'Rapid-fire bolt cannon — mines softer rock and fights hostiles.'
  const switchHint = !isMobile && hasAlternateTool ? ' Press Q to switch tools.' : ''

  return (
    <InfoTip label={`Equipped tool — ${toolDesc}${switchHint}`}>
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
    </InfoTip>
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
  achievementCount,
  achievementTotal,
  onPause,
  tradeMenuOpen = false,
  runOver = false,
  showHarvestingWarning = false,
}: HUDProps) {
  // Derive the cargo readout from the displayed Storage tier so it always
  // matches the STORAGE Mk badge — during the maxed-out prologue that means the
  // hold reads at full capacity (Mk-max), not the reduced tutorial 25.
  const displayCapacity = capacityForStorage(upgrades.storage)
  const cargoPercent = displayCapacity > 0 ? Math.round((cargo.fragments / displayCapacity) * 100) : 0
  const ledgerInfo = ledgerStatus(ledger)
  const arbiterHpFrac = arbiter ? Math.max(0, Math.min(1, arbiter.hp / arbiter.maxHp)) : 0
  const arbiterColor = arbiter && arbiter.phase >= 2 ? '#ff1a1a' : '#ff5555'

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar: flex row with resources left, upgrades+pause right */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-2 sm:p-3 md:p-4 gap-2 sm:gap-4">
        {/* Left: Resources */}
        <div className="flex flex-col gap-1 sm:gap-2 text-[clamp(0.8125rem,2.4vw,1rem)] min-w-0">
          <InfoTip label="Scrap — your currency. Earned by selling minerals and destroying hostiles; spent on upgrades at the station.">
            <div className="text-hud-amber font-mono font-bold truncate">SCRAP: {scrap}</div>
          </InfoTip>
          <InfoTip label="Cargo hold — collected fragments / capacity. Sell at the station to empty it; raise capacity with Cargo Expansion.">
            <div className="text-hud-blue font-mono truncate">
              CARGO: {cargo.fragments}/{displayCapacity} ({cargoPercent}%)
            </div>
          </InfoTip>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[clamp(0.75rem,2vw,0.9375rem)]">
            {MINERAL_DISPLAY.map((m) => (
              <MineralBadge
                key={m.key}
                letter={m.letter}
                color={m.color}
                count={cargo[m.key]}
                name={m.name}
                desc={m.desc}
              />
            ))}
          </div>
          <MiningToolLabel
            activeTool={activeTool}
            hasAlternateTool={hasLazer || upgrades.ripple > 0}
          />
          <InfoTip label="Achievements unlocked / total across all your runs. Browse them from the main menu.">
            <div className="text-white/35 font-mono text-[clamp(0.65rem,1.8vw,0.75rem)]">
              ACH {achievementCount}/{achievementTotal}
            </div>
          </InfoTip>
        </div>

        {/* Right: Upgrades + Pause */}
        <div className="flex items-start gap-2 sm:gap-4 shrink-0">
          <div className="flex flex-col gap-0.5 sm:gap-1 text-[clamp(0.75rem,2.2vw,0.9375rem)] font-mono text-right">
            <InfoTip align="right" label="Blaster — your primary cannon. Higher marks fire faster.">
              <div className="text-hud-red">BLASTER Mk{upgrades.blaster}</div>
            </InfoTip>
            <InfoTip align="right" label="Collector — auto-vacuums nearby fragments. Higher marks widen the pickup radius.">
              <div className="text-hud-green">COLLECTOR Mk{upgrades.collector}</div>
            </InfoTip>
            <InfoTip align="right" label="Storage — your cargo capacity tier. Each mark adds more hold space.">
              <div className="text-hud-blue">STORAGE Mk{upgrades.storage}</div>
            </InfoTip>
            {upgrades.missiles > 0 && (
              <InfoTip align="right" label="Heat-seeking missiles — count of side-launching homing missiles per volley.">
                <div className="text-hud-amber">MISSILES x{upgrades.missiles}</div>
              </InfoTip>
            )}
            {upgrades.options > 0 && (
              <InfoTip align="right" label="Option orbs — drones that mirror your fire. The 3rd (figure-four) comes from the Exotic Matter Hull.">
                <div className="text-cyan-200">OPTION x{upgrades.options}</div>
              </InfoTip>
            )}
            {upgrades.speed > 0 && (
              <InfoTip align="right" label="Engine tuning — +10% base ship speed per mark.">
                <div className="text-lime-300">ENGINE Mk{upgrades.speed}</div>
              </InfoTip>
            )}
            {/* Defensive layers — top-down in damage-hierarchy order so the
                player can see at a glance which charge their next hit will
                consume: exotic plating first, then shield, hull, armor. */}
            {upgrades.exoticHull > 0 && (
              <InfoTip align="right" label="Exotic Matter Hull (prestige) — outermost charge buffer, absorbed before everything else. Also grants black-hole immunity.">
                <div style={{ color: '#ff66ff' }}>EXOTIC HULL</div>
              </InfoTip>
            )}
            {upgrades.shield > 0 && (
              <InfoTip align="right" label="Energy shield — charges that absorb a hit each. First normal layer to take damage.">
                <div className="text-sky-300">SHIELD {upgrades.shield}</div>
              </InfoTip>
            )}
            {upgrades.hull > 0 && (
              <InfoTip align="right" label="Hull modules — bolt-on pieces that tear off one per hit after the shield.">
                <div className="text-amber-300">HULL {upgrades.hull}</div>
              </InfoTip>
            )}
            {upgrades.armor > 0 && (
              <InfoTip align="right" label="Armor plating — internal charges, the last layer before the emergency core.">
                <div className="text-orange-300">ARMOR {upgrades.armor}</div>
              </InfoTip>
            )}
            {upgrades.drone > 0 && (
              <InfoTip align="right" label="Mining drones — active / cap. They drill large rocks and ferry scrap back.">
                <div className="text-hud-amber">DRONES {droneCount}/{upgrades.drone}</div>
              </InfoTip>
            )}
            {upgrades.smartBomb > 0 && (
              <InfoTip align="right" label="Emergency Core Detonator — auto-fires on a fatal hit, reviving you and clearing nearby threats once.">
                <div className="text-red-400 animate-pulse">CORE ARMED</div>
              </InfoTip>
            )}
            {upgrades.refinery > 0 && (
              <InfoTip align="right" label="Quantum Refinery (prestige) — doubles the scrap from every material sale.">
                <div style={{ color: '#ff66ff' }}>REFINERY x2</div>
              </InfoTip>
            )}
            {upgrades.wormhole > 0 && (
              <InfoTip align="right" label="Wormhole Generator (prestige) — entering a black hole teleports you out. Mk2 jumps to the far side of the map.">
                <div style={{ color: '#ff66ff' }}>WORMHOLE Mk{upgrades.wormhole}</div>
              </InfoTip>
            )}
          </div>
          {!tradeMenuOpen && !runOver && (
            <button
              onClick={onPause}
              className="pointer-events-auto relative z-[60] px-2 py-1.5 sm:px-3 sm:py-2 bg-space-800/80 border border-hud-green/30 rounded text-hud-green text-xs sm:text-sm hover:bg-space-700/80 active:scale-95 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={paused ? 'Resume game' : 'Pause game'}
              title={paused ? 'Resume game' : 'Pause game (also opens settings)'}
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
          <InfoTip
            align="center"
            label="The Arbiter — the enforcer boss. Survive until it withdraws or destroy it; each Mark it returns is tougher."
          >
            <div
              className="font-mono font-bold tracking-[0.18em] text-[clamp(0.6rem,1.7vw,0.85rem)]"
              style={{ color: arbiterColor }}
            >
              THE ARBITER - MARK {romanNumeral(arbiter.mark)}
            </div>
          </InfoTip>
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
          <InfoTip
            align="center"
            label="The Ledger — your escalation meter. As it climbs, the sector sends tougher, more frequent threats."
          >
            <div className="font-mono tracking-[0.2em] text-white/45 text-[clamp(0.5rem,1.4vw,0.65rem)]">
              THE LEDGER
            </div>
          </InfoTip>
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

      {/* Harvesting Area Warning */}
      {showHarvestingWarning && (
        <div className="absolute top-[72px] sm:top-[88px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 bg-red-950/80 border border-red-500/40 rounded px-4 py-2 shadow-lg animate-pulse z-40">
          <div className="font-mono font-bold tracking-widest text-[clamp(0.7rem,1.8vw,0.9rem)] text-red-400">
            ⚠️ OUT OF HARVESTING BOUNDS
          </div>
          <div className="font-mono text-[clamp(0.6rem,1.5vw,0.75rem)] text-red-300/80 tracking-wider">
            WARNING: RESOURCE DENSITY CRITICAL. RETURN TO SECTOR.
          </div>
        </div>
      )}
    </div>
  )
}
