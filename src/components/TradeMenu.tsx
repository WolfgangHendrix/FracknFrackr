'use client'

import { useState } from 'react'
import type { Cargo, Upgrades } from '@/lib/schemas'
import type { TutorialStep } from '@/hooks/useTutorial'
import { SCRAP_VALUE_BY_MINERAL } from '@/hooks/useGameState'

/**
 * Display rows for the sell panel — one per mineral, ordered common→legendary
 * so the eye reads down a rarity ladder. Color mirrors the HUD badge palette
 * and the in-world fragment voxels in metal-chunk.ts (MINERAL_COLORS).
 */
const SELL_ROWS = [
  { key: 'carbon' as const, label: 'Carbon', color: '#9098a0' },
  { key: 'silicates' as const, label: 'Silicates', color: '#c89c70' },
  { key: 'platinum' as const, label: 'Platinum', color: '#e0e8f0' },
  { key: 'titanium' as const, label: 'Titanium', color: '#e0a060' },
  { key: 'exotics' as const, label: 'Exotics', color: '#ff66ff' },
]

/** Cost to purchase the Lazer mining tool. */
export const LAZER_COST = 200
export const AUTO_TOOL_COST = 600
/** Flat per-tier cost for Mining Drone Bay — each purchase raises the cap +1. */
export const DRONE_BAY_COST = 240
/** Scrap cost to construct a single mining drone at the station. */
export const MINING_DRONE_BUILD_COST = 60

/** Upgrade catalog available at the trade station. */
const UPGRADE_CATALOG = [
  {
    type: 'blaster' as const,
    label: 'Fire Rate Boost',
    cost: 10,
    description: 'Faster blaster cadence — single bolt, more shots/sec',
  },
  {
    type: 'spread' as const,
    label: 'Tri-Bolt Spread',
    cost: 220,
    description: 'Blaster fires a 3-bolt fan instead of a single shot',
  },
  {
    type: 'collector' as const,
    label: 'Collector Range',
    cost: 80,
    description: 'Wider pickup radius',
  },
  {
    type: 'storage' as const,
    label: 'Cargo Expansion',
    cost: 100,
    description: '+25 cargo capacity',
  },
  {
    type: 'missiles' as const,
    label: 'Heat Seeking Spread Missiles',
    cost: 140,
    description: '+1 side-launching homing missile',
  },
  {
    type: 'ripple' as const,
    label: 'Ripple Beam',
    cost: 260,
    description: 'Wide beam that expands with distance',
  },
  {
    type: 'options' as const,
    label: 'Option',
    cost: 220,
    description: 'Orbital duplicate primary weapon',
  },
  {
    type: 'speed' as const,
    label: 'Engine Tuning',
    cost: 160,
    description: '+10% base ship speed',
  },
  {
    type: 'armor' as const,
    label: 'Armor Plating',
    cost: 120,
    description: '+1 emergency hull hit',
  },
  {
    type: 'shield' as const,
    label: 'Life-Force Shield',
    cost: 180,
    description: 'Restores a 3-hit damage shield',
  },
  {
    type: 'smartBomb' as const,
    label: 'Emergency Core Detonator',
    cost: 250,
    description: 'Auto-bomb on fatal hit (one-use)',
  },
  {
    type: 'autoTool' as const,
    label: 'Auto Targeting Assist',
    cost: AUTO_TOOL_COST,
    description: 'Auto-picks the right tool when aiming at an asteroid',
  },
  {
    type: 'drone' as const,
    label: 'Mining Drone Bay',
    cost: DRONE_BAY_COST,
    description: 'Raises drone cap by +1 (max 4). Drones drill large rocks',
  },
  {
    type: 'hull' as const,
    label: 'Hull Reinforcement',
    cost: 180,
    description: 'Bolt on visible modules: scoop, cargo pods, swept wings',
  },
  {
    type: 'hullPlating' as const,
    label: 'Hull Plating Mk',
    cost: 200,
    description: '+25 max hull HP per tier (100 → 175)',
  },
  {
    type: 'cooling' as const,
    label: 'Cooling Vanes',
    cost: 150,
    description: 'Lazer runs longer + cools faster per tier',
  },
  {
    type: 'magnet' as const,
    label: 'Magnetic Hopper',
    cost: 140,
    description: '+30% pickup radius per tier (stacks with collector)',
  },
  {
    type: 'bounty' as const,
    label: 'Bounty Manifest',
    cost: 180,
    description: '+15% scrap from enemy kills per tier',
  },
  {
    type: 'sensor' as const,
    label: 'Sensor Array',
    cost: 130,
    description: 'Longer radar range; tier 3 paints off-screen contacts',
  },
  {
    type: 'thrusters' as const,
    label: 'Thruster Vectoring',
    cost: 240,
    description: 'Tap Shift / B to boost — 2× velocity, 3s cooldown',
  },
  {
    type: 'missileBias' as const,
    label: 'Heat-Seeker Bias',
    cost: 220,
    description: 'Missiles prioritize Arbiter + carriers over grunts',
  },
  {
    type: 'droneRepair' as const,
    label: 'Drone Repair Bay',
    cost: 360,
    description: 'Auto-rebuilds destroyed drones over time near station',
  },
  {
    type: 'drillNose' as const,
    label: 'Drill Nose',
    cost: 160,
    description: 'Ram asteroids with the ship nose to drill them (per tier)',
  },
]

interface TradeMenuProps {
  cargo: Cargo
  scrap: number
  upgrades: Upgrades
  tutorialStep: TutorialStep
  hasLazer: boolean
  droneCount: number
  onSell: () => void
  onBuy: (type: keyof Upgrades, cost: number) => void
  onBuyLazer: () => void
  onBuildDrone: () => void
  onClose: () => void
}

export function TradeMenu({
  cargo,
  scrap,
  upgrades,
  tutorialStep,
  hasLazer,
  droneCount,
  onSell,
  onBuy,
  onBuyLazer,
  onBuildDrone,
  onClose,
}: TradeMenuProps) {
  const isTutorialSell = tutorialStep === 'trade-sell'
  const isTutorialBuy = tutorialStep === 'trade-buy'
  const isTutorial = isTutorialSell || isTutorialBuy

  // During tutorial, force the active tab based on step
  const [manualTab, setManualTab] = useState<'sell' | 'buy'>('sell')
  const activeTab = isTutorialSell ? 'sell' : isTutorialBuy ? 'buy' : manualTab

  const totalSellValue = SELL_ROWS.reduce(
    (sum, r) => sum + cargo[r.key] * SCRAP_VALUE_BY_MINERAL[r.key],
    0,
  )
  const hasMaterials = SELL_ROWS.some((r) => cargo[r.key] > 0)

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none p-3 sm:p-4">
      <div className="pointer-events-auto bg-space-900/95 border-2 border-hud-green/60 rounded-xl shadow-2xl w-[360px] max-w-[90vw] max-h-[calc(100dvh-2rem)] font-sans flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-hud-green/30">
          <h2 className="text-hud-green text-lg font-bold tracking-wider">TRADE STATION</h2>
          <button
            data-menu-item
            data-menu-back
            onClick={onClose}
            className="-mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/40 hover:text-white/80 focus:text-white focus:outline-none focus:ring-2 focus:ring-white/40 rounded text-2xl transition-colors"
          >
            X
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-hud-green/30">
          <button
            data-menu-item
            onClick={() => !isTutorial && setManualTab('sell')}
            className={`flex-1 py-3 min-h-[44px] text-base font-bold tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-hud-amber ${
              activeTab === 'sell'
                ? 'text-hud-amber bg-hud-amber/10 border-b-2 border-hud-amber'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            SELL
          </button>
          <button
            data-menu-item
            onClick={() => !isTutorial && setManualTab('buy')}
            className={`flex-1 py-3 min-h-[44px] text-base font-bold tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-hud-blue ${
              activeTab === 'buy'
                ? 'text-hud-blue bg-hud-blue/10 border-b-2 border-hud-blue'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            BUY
          </button>
        </div>

        {/* Scrap balance */}
        <div className="px-5 py-2 text-hud-amber text-sm border-b border-white/10">
          SCRAP: {scrap}
        </div>

        {/* Content */}
        <div className="px-5 py-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {activeTab === 'sell' ? (
            <SellPanel
              cargo={cargo}
              totalSellValue={totalSellValue}
              hasMaterials={hasMaterials}
              isTutorial={isTutorialSell}
              onSell={onSell}
            />
          ) : (
            <BuyPanel
              scrap={scrap}
              upgrades={upgrades}
              hasLazer={hasLazer}
              droneCount={droneCount}
              isTutorial={isTutorialBuy}
              onBuy={onBuy}
              onBuyLazer={onBuyLazer}
              onBuildDrone={onBuildDrone}
            />
          )}
        </div>

        {/* Tutorial hint */}
        {isTutorialSell && (
          <div className="px-5 pb-4">
            <p className="text-hud-green text-sm animate-pulse text-center">
              Sell your collected materials!
            </p>
          </div>
        )}
        {isTutorialBuy && (
          <div className="px-5 pb-4">
            <p className="text-hud-green text-sm animate-pulse text-center">
              Buy the Fire Rate upgrade!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function SellPanel({
  cargo,
  totalSellValue,
  hasMaterials,
  isTutorial,
  onSell,
}: {
  cargo: Cargo
  totalSellValue: number
  hasMaterials: boolean
  isTutorial: boolean
  onSell: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-white/60 text-sm mb-1">YOUR MATERIALS</div>
      {SELL_ROWS.map((row) => {
        const count = cargo[row.key]
        const value = count * SCRAP_VALUE_BY_MINERAL[row.key]
        const dim = count === 0
        return (
          <div
            key={row.key}
            className="flex justify-between text-sm"
            style={{ opacity: dim ? 0.4 : 1 }}
          >
            <span style={{ color: row.color }}>
              {row.label} x{count}
            </span>
            <span className="text-hud-amber">+{value} scrap</span>
          </div>
        )
      })}
      <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold">
        <span className="text-white/80">Total</span>
        <span className="text-hud-amber">+{totalSellValue} scrap</span>
      </div>
      <button
        data-menu-item
        data-menu-sound="sell"
        onClick={onSell}
        disabled={!hasMaterials}
        className={`mt-2 w-full py-3 min-h-[48px] rounded font-bold text-base tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-hud-amber ${
          hasMaterials
            ? isTutorial
              ? 'bg-hud-amber/30 border-2 border-hud-amber text-hud-amber animate-pulse hover:bg-hud-amber/50'
              : 'bg-hud-amber/20 border border-hud-amber/60 text-hud-amber hover:bg-hud-amber/40'
            : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
        }`}
      >
        SELL ALL
      </button>
    </div>
  )
}

function BuyPanel({
  scrap,
  upgrades,
  hasLazer,
  droneCount,
  isTutorial,
  onBuy,
  onBuyLazer,
  onBuildDrone,
}: {
  scrap: number
  upgrades: Upgrades
  hasLazer: boolean
  droneCount: number
  isTutorial: boolean
  onBuy: (type: keyof Upgrades, cost: number) => void
  onBuyLazer: () => void
  onBuildDrone: () => void
}) {
  const canAffordLazer = scrap >= LAZER_COST && !hasLazer

  return (
    <div className="flex flex-col gap-3">
      <div className="text-white/60 text-sm mb-1">UPGRADES</div>
      {UPGRADE_CATALOG.map((item) => {
        const currentLevel = upgrades[item.type]
        const maxLevel =
          item.type === 'missiles'
            ? 8
            : item.type === 'options'
              ? 2
              : item.type === 'ripple'
                ? 1
                : item.type === 'speed'
                  ? 5
                  : item.type === 'armor' ||
                      item.type === 'shield' ||
                      item.type === 'hull' ||
                      item.type === 'cooling' ||
                      item.type === 'magnet' ||
                      item.type === 'hullPlating' ||
                      item.type === 'bounty' ||
                      item.type === 'sensor' ||
                      item.type === 'drillNose'
                    ? 3
                    : item.type === 'smartBomb' ||
                        item.type === 'autoTool' ||
                        item.type === 'spread' ||
                        item.type === 'missileBias' ||
                        item.type === 'thrusters' ||
                        item.type === 'droneRepair'
                      ? 1
                      : item.type === 'drone'
                        ? 4
                        : 5

        const maxed = currentLevel >= maxLevel
        // Auto Targeting Assist is the "capstone" — only buyable once the
        // player has actually used all the weapons it would be auto-selecting
        // between. Keeps the upgrade meaningful instead of a 0→100 shortcut.
        const lockedByPrereq =
          item.type === 'autoTool' &&
          !(hasLazer && upgrades.ripple > 0 && upgrades.spread > 0)
        const canAfford = scrap >= item.cost && !maxed && !lockedByPrereq
        const isFireRate = item.type === 'blaster'
        const highlight = isTutorial && isFireRate

        return (
          <div
            key={item.type}
            className={`flex items-center justify-between p-3 rounded border ${
              highlight
                ? 'border-hud-green bg-hud-green/10 animate-pulse'
                : 'border-white/10 bg-white/5'
            }`}
          >
            <div className="flex-1">
              <div
                className={`text-sm font-bold ${highlight ? 'text-hud-green' : 'text-white/80'}`}
              >
                {item.label}
              </div>
              <div className="text-sm text-white/40">
                {maxed
                  ? 'MAX LEVEL'
                  : lockedByPrereq
                    ? 'Requires Lazer + Ripple + Tri-Bolt'
                    : item.description}{' '}
                —{' '}
                {item.type === 'armor' ||
                item.type === 'shield' ||
                item.type === 'hull' ||
                item.type === 'cooling' ||
                item.type === 'magnet' ||
                item.type === 'hullPlating' ||
                item.type === 'bounty' ||
                item.type === 'sensor' ||
                item.type === 'drillNose'
                  ? `${currentLevel}/3`
                  : item.type === 'drone'
                    ? `${currentLevel}/4`
                    : item.type === 'autoTool' ||
                        item.type === 'spread' ||
                        item.type === 'missileBias' ||
                        item.type === 'thrusters' ||
                        item.type === 'droneRepair'
                      ? currentLevel > 0
                        ? 'OWNED'
                        : 'LOCKED'
                      : `Mk${currentLevel}`}
              </div>
            </div>
            <button
              data-menu-item
              data-menu-sound="buy"
              onClick={() => onBuy(item.type, item.cost)}
              disabled={!canAfford}
              className={`ml-3 px-5 py-3 min-h-[44px] rounded text-sm font-bold tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-hud-blue ${
                canAfford
                  ? highlight
                    ? 'bg-hud-green/30 border border-hud-green text-hud-green hover:bg-hud-green/50'
                    : 'bg-hud-blue/20 border border-hud-blue/60 text-hud-blue hover:bg-hud-blue/40'
                  : 'bg-white/5 border border-white/10 text-white/20 cursor-not-allowed'
              }`}
            >
              {maxed ? 'MAX' : lockedByPrereq ? 'LOCK' : `${item.cost}`}
            </button>
          </div>
        )
      })}

      {/* Lazer mining tool */}
      <div className="text-white/60 text-sm mb-1 mt-2">TOOLS</div>
      <div
        className={`flex items-center justify-between p-3 rounded border ${
          hasLazer ? 'border-white/10 bg-white/5' : 'border-hud-blue/30 bg-hud-blue/5'
        }`}
        data-testid="lazer-buy-item"
      >
        <div className="flex-1">
          <div className={`text-sm font-bold ${hasLazer ? 'text-white/40' : 'text-hud-blue'}`}>
            Lazer
          </div>
          <div className="text-sm text-white/40">
            {hasLazer ? 'OWNED' : 'Mines basaltic asteroids, +50% damage to all'}
          </div>
        </div>
        <button
          data-menu-item
          data-menu-sound="buy"
          onClick={onBuyLazer}
          disabled={!canAffordLazer}
          className={`ml-3 px-5 py-3 min-h-[44px] rounded text-sm font-bold tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-hud-blue ${
            hasLazer
              ? 'bg-white/5 border border-white/10 text-white/20 cursor-not-allowed'
              : canAffordLazer
                ? 'bg-hud-blue/20 border border-hud-blue/60 text-hud-blue hover:bg-hud-blue/40'
                : 'bg-white/5 border border-white/10 text-white/20 cursor-not-allowed'
          }`}
        >
          {hasLazer ? 'OWNED' : `${LAZER_COST}`}
        </button>
      </div>

      {/* Drone fleet — separate from the cap upgrade since it's a recurring
          spend. Disabled when at cap or can't afford. */}
      {upgrades.drone > 0 && (
        <div className="text-white/60 text-sm mb-1 mt-2">DRONE FLEET</div>
      )}
      {upgrades.drone > 0 && (
        <div
          className="flex items-center justify-between p-3 rounded border border-hud-amber/30 bg-hud-amber/5"
          data-testid="drone-build-item"
        >
          <div className="flex-1">
            <div className="text-sm font-bold text-hud-amber">Build Mining Drone</div>
            <div className="text-sm text-white/40">
              Active {droneCount}/{upgrades.drone} — drills large rocks, returns scrap fast
            </div>
          </div>
          <button
            data-menu-item
            data-menu-sound="buy"
            onClick={onBuildDrone}
            disabled={droneCount >= upgrades.drone || scrap < MINING_DRONE_BUILD_COST}
            className={`ml-3 px-5 py-3 min-h-[44px] rounded text-sm font-bold tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-hud-amber ${
              droneCount >= upgrades.drone
                ? 'bg-white/5 border border-white/10 text-white/20 cursor-not-allowed'
                : scrap >= MINING_DRONE_BUILD_COST
                  ? 'bg-hud-amber/20 border border-hud-amber/60 text-hud-amber hover:bg-hud-amber/40'
                  : 'bg-white/5 border border-white/10 text-white/20 cursor-not-allowed'
            }`}
          >
            {droneCount >= upgrades.drone ? 'CAP' : `${MINING_DRONE_BUILD_COST}`}
          </button>
        </div>
      )}
    </div>
  )
}
