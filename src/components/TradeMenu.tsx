'use client'

import { useState } from 'react'
import type { Cargo, Upgrades } from '@/lib/schemas'
import type { TutorialStep } from '@/hooks/useTutorial'
import { SILVER_SCRAP_VALUE, GOLD_SCRAP_VALUE } from '@/hooks/useGameState'

/** Cost to purchase the Lazer mining tool. */
export const LAZER_COST = 200

/** Upgrade catalog available at the trade station. */
const UPGRADE_CATALOG = [
  { type: 'blaster' as const, label: 'Fire Rate Boost', cost: 10, description: '+10% fire rate' },
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
]

interface TradeMenuProps {
  cargo: Cargo
  scrap: number
  upgrades: Upgrades
  tutorialStep: TutorialStep
  hasLazer: boolean
  onSell: () => void
  onBuy: (type: keyof Upgrades, cost: number) => void
  onBuyLazer: () => void
  onClose: () => void
}

export function TradeMenu({
  cargo,
  scrap,
  upgrades,
  tutorialStep,
  hasLazer,
  onSell,
  onBuy,
  onBuyLazer,
  onClose,
}: TradeMenuProps) {
  const isTutorialSell = tutorialStep === 'trade-sell'
  const isTutorialBuy = tutorialStep === 'trade-buy'
  const isTutorial = isTutorialSell || isTutorialBuy

  // During tutorial, force the active tab based on step
  const [manualTab, setManualTab] = useState<'sell' | 'buy'>('sell')
  const activeTab = isTutorialSell ? 'sell' : isTutorialBuy ? 'buy' : manualTab

  const silverValue = cargo.silver * SILVER_SCRAP_VALUE
  const goldValue = cargo.gold * GOLD_SCRAP_VALUE
  const totalSellValue = silverValue + goldValue
  const hasMaterials = cargo.silver > 0 || cargo.gold > 0

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="pointer-events-auto bg-space-900/95 border-2 border-hud-green/60 rounded-xl shadow-2xl w-[360px] max-w-[90vw] font-mono">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-hud-green/30">
          <h2 className="text-hud-green text-lg font-bold tracking-wider">TRADE STATION</h2>
          <button
            data-menu-item
            data-menu-back
            onClick={onClose}
            className="text-white/40 hover:text-white/80 focus:text-white focus:outline-none focus:ring-2 focus:ring-white/40 rounded text-xl transition-colors"
          >
            X
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-hud-green/30">
          <button
            data-menu-item
            onClick={() => !isTutorial && setManualTab('sell')}
            className={`flex-1 py-2 text-sm font-bold tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-hud-amber ${
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
            className={`flex-1 py-2 text-sm font-bold tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-hud-blue ${
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
        <div className="px-5 py-4 min-h-[200px]">
          {activeTab === 'sell' ? (
            <SellPanel
              cargo={cargo}
              silverValue={silverValue}
              goldValue={goldValue}
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
              isTutorial={isTutorialBuy}
              onBuy={onBuy}
              onBuyLazer={onBuyLazer}
            />
          )}
        </div>

        {/* Tutorial hint */}
        {isTutorialSell && (
          <div className="px-5 pb-4">
            <p className="text-hud-green text-xs animate-pulse text-center">
              Sell your collected materials!
            </p>
          </div>
        )}
        {isTutorialBuy && (
          <div className="px-5 pb-4">
            <p className="text-hud-green text-xs animate-pulse text-center">
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
  silverValue,
  goldValue,
  totalSellValue,
  hasMaterials,
  isTutorial,
  onSell,
}: {
  cargo: Cargo
  silverValue: number
  goldValue: number
  totalSellValue: number
  hasMaterials: boolean
  isTutorial: boolean
  onSell: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-white/60 text-xs mb-1">YOUR MATERIALS</div>
      <div className="flex justify-between text-sm">
        <span style={{ color: '#c0c0c0' }}>Silver x{cargo.silver}</span>
        <span className="text-hud-amber">+{silverValue} scrap</span>
      </div>
      <div className="flex justify-between text-sm">
        <span style={{ color: '#ffd700' }}>Gold x{cargo.gold}</span>
        <span className="text-hud-amber">+{goldValue} scrap</span>
      </div>
      <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold">
        <span className="text-white/80">Total</span>
        <span className="text-hud-amber">+{totalSellValue} scrap</span>
      </div>
      <button
        data-menu-item
        data-menu-sound="sell"
        onClick={onSell}
        disabled={!hasMaterials}
        className={`mt-2 w-full py-3 rounded font-bold text-sm tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-hud-amber ${
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
  isTutorial,
  onBuy,
  onBuyLazer,
}: {
  scrap: number
  upgrades: Upgrades
  hasLazer: boolean
  isTutorial: boolean
  onBuy: (type: keyof Upgrades, cost: number) => void
  onBuyLazer: () => void
}) {
  const canAffordLazer = scrap >= LAZER_COST && !hasLazer

  return (
    <div className="flex flex-col gap-3">
      <div className="text-white/60 text-xs mb-1">UPGRADES</div>
      {UPGRADE_CATALOG.map((item) => {
        const currentLevel = upgrades[item.type]
        const maxed = currentLevel >= 5
        const canAfford = scrap >= item.cost && !maxed
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
              <div className="text-xs text-white/40">
                {maxed ? 'MAX LEVEL' : item.description} — Mk{currentLevel}
              </div>
            </div>
            <button
              data-menu-item
              data-menu-sound="buy"
              onClick={() => onBuy(item.type, item.cost)}
              disabled={!canAfford}
              className={`ml-3 px-4 py-2 rounded text-xs font-bold tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-hud-blue ${
                canAfford
                  ? highlight
                    ? 'bg-hud-green/30 border border-hud-green text-hud-green hover:bg-hud-green/50'
                    : 'bg-hud-blue/20 border border-hud-blue/60 text-hud-blue hover:bg-hud-blue/40'
                  : 'bg-white/5 border border-white/10 text-white/20 cursor-not-allowed'
              }`}
            >
              {maxed ? 'MAX' : `${item.cost}`}
            </button>
          </div>
        )
      })}

      {/* Lazer mining tool */}
      <div className="text-white/60 text-xs mb-1 mt-2">TOOLS</div>
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
          <div className="text-xs text-white/40">
            {hasLazer ? 'OWNED' : 'Mines crystalline asteroids, +50% damage to all'}
          </div>
        </div>
        <button
          data-menu-item
          data-menu-sound="buy"
          onClick={onBuyLazer}
          disabled={!canAffordLazer}
          className={`ml-3 px-4 py-2 rounded text-xs font-bold tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-hud-blue ${
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
    </div>
  )
}
