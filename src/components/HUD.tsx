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
  playerHp: number
  playerMaxHp: number
  paused: boolean
  activeTool: MiningTool
  hasLazer: boolean
  /** Endless-mode escalation meter. 0 hides the readout (prologue/tutorial). */
  ledger: number
  /** Active Arbiter boss, or null. Replaces the Ledger readout when present. */
  arbiter: ArbiterHudInfo | null
  onPause: () => void
}

function SilverIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="5" height="5" rx="1" fill="#c0c0c0" />
      <rect x="7" y="4" width="5" height="5" rx="1" fill="#e8e8e8" />
      <rect x="4" y="7" width="5" height="5" rx="1" fill="#c0c0c0" />
      <rect x="5" y="2" width="4" height="4" rx="1" fill="#e8e8e8" opacity="0.7" />
    </svg>
  )
}

function GoldIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="5" height="5" rx="1" fill="#ffd700" />
      <rect x="7" y="4" width="5" height="5" rx="1" fill="#daa520" />
      <rect x="4" y="7" width="5" height="5" rx="1" fill="#ffd700" />
      <rect x="5" y="2" width="4" height="4" rx="1" fill="#ffd700" opacity="0.7" />
    </svg>
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
  playerHp,
  playerMaxHp,
  paused,
  activeTool,
  hasLazer,
  ledger,
  arbiter,
  onPause,
}: HUDProps) {
  const cargoPercent = cargo.capacity > 0 ? Math.round((cargo.fragments / cargo.capacity) * 100) : 0
  const hpPercent = playerMaxHp > 0 ? Math.round((playerHp / playerMaxHp) * 100) : 100
  const hpColor = hpPercent > 50 ? '#00ff88' : hpPercent > 25 ? '#ffaa00' : '#ff4444'
  const showHealth = playerHp < playerMaxHp
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
          <div className="flex items-center gap-2 sm:gap-3 font-mono text-[clamp(0.75rem,2vw,0.9375rem)]">
            <span className="flex items-center gap-1" style={{ color: '#c0c0c0' }}>
              <SilverIcon size={14} />
              {cargo.silver}
            </span>
            <span className="flex items-center gap-1" style={{ color: '#ffd700' }}>
              <GoldIcon size={14} />
              {cargo.gold}
            </span>
          </div>
          {showHealth && (
            <div className="flex flex-col gap-1">
              <div
                className="font-mono text-[clamp(0.75rem,2vw,0.875rem)]"
                style={{ color: hpColor }}
              >
                HULL: {hpPercent}%
              </div>
              <div
                className="w-20 sm:w-32 h-1.5 sm:h-2 rounded-sm overflow-hidden"
                style={{ backgroundColor: '#333344' }}
              >
                <div
                  className="h-full transition-all duration-200"
                  style={{ width: `${hpPercent}%`, backgroundColor: hpColor }}
                />
              </div>
            </div>
          )}
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
            {upgrades.armor > 0 && <div className="text-orange-300">ARMOR {upgrades.armor}</div>}
            {upgrades.shield > 0 && <div className="text-sky-300">SHIELD {upgrades.shield}</div>}
          </div>
          <button
            onClick={onPause}
            className="pointer-events-auto relative z-[60] px-2 py-1.5 sm:px-3 sm:py-2 bg-space-800/80 border border-hud-green/30 rounded text-hud-green text-xs sm:text-sm hover:bg-space-700/80 active:scale-95 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label={paused ? 'Resume game' : 'Pause game'}
          >
            {paused ? '\u25B6' : 'II'}
          </button>
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
    </div>
  )
}
