'use client'

import type { AchievementMetrics } from '@/lib/schemas'

interface StatsPanelProps {
  metrics: AchievementMetrics
  highScore: number
  onBack: () => void
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-white/8">
      <span className="font-sans text-xs tracking-[0.16em] text-white/55 uppercase">{label}</span>
      <span className="font-mono text-sm text-hud-green tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  )
}

export function StatsPanel({ metrics, highScore, onBack }: StatsPanelProps) {
  return (
    <div className="absolute inset-0 z-[40] bg-black/85 flex items-center justify-center p-4 overflow-auto">
      <div className="max-w-md w-full bg-space-800/95 border-2 border-hud-green/35 rounded-xl p-5 font-sans shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <p className="text-xl sm:text-2xl tracking-widest text-white/90">STATS</p>
          <button
            type="button"
            data-menu-item
            data-menu-back
            onClick={onBack}
            className="text-xs text-hud-green/80 hover:text-hud-green px-3 py-1.5 border border-hud-green/30 rounded focus:outline-none focus:ring-2 focus:ring-hud-green"
          >
            CLOSE
          </button>
        </div>

        <div className="flex flex-col">
          <p className="text-[10px] tracking-[0.28em] text-hud-amber/70 mb-2">SCORES</p>
          <StatRow label="Best Run Score" value={highScore} />

          <p className="text-[10px] tracking-[0.28em] text-hud-amber/70 mt-4 mb-2">RUNS</p>
          <StatRow label="Total Runs" value={metrics.totalRuns} />
          <StatRow label="Max Ledger Reached" value={metrics.maxLedgerReached} />

          <p className="text-[10px] tracking-[0.28em] text-hud-amber/70 mt-4 mb-2">COMBAT</p>
          <StatRow label="Enemies Destroyed" value={metrics.totalEnemyKills} />
          <StatRow label="Arbiters Defeated" value={metrics.totalArbitersDefeated} />
          <StatRow label="Arbiter Withdrawals" value={metrics.arbiterWithdrawals} />
          <StatRow label="Highest Arbiter Mark" value={metrics.maxArbiterMarkDefeated} />

          <p className="text-[10px] tracking-[0.28em] text-hud-amber/70 mt-4 mb-2">MINING</p>
          <StatRow label="Asteroids Destroyed" value={metrics.totalAsteroidsDestroyed} />
          <StatRow label="Total Scrap Mined" value={metrics.totalScrapMined} />
          <StatRow label="Best Single Sale" value={metrics.bestSaleValue} />
          <StatRow label="Total Sales" value={metrics.totalSales} />
          <StatRow label="Station Drive-Throughs" value={metrics.stationDriveThroughs} />
          <StatRow label="Drill-Nose Finishes" value={metrics.drillNoseAsteroidFinishes} />

          <p className="text-[10px] tracking-[0.28em] text-hud-amber/70 mt-4 mb-2">MINERALS SOLD</p>
          <StatRow label="Carbon" value={metrics.soldByMineral.carbon} />
          <StatRow label="Silicates" value={metrics.soldByMineral.silicates} />
          <StatRow label="Platinum" value={metrics.soldByMineral.platinum} />
          <StatRow label="Titanium" value={metrics.soldByMineral.titanium} />
          <StatRow label="Exotics" value={metrics.soldByMineral.exotics} />

          <p className="text-[10px] tracking-[0.28em] text-hud-amber/70 mt-4 mb-2">DRONES</p>
          <StatRow label="Drones Built" value={metrics.totalDronesBuilt} />
          <StatRow label="Drone Rebuilds" value={metrics.totalDroneRebuilds} />
          <StatRow label="Drone Scrap Delivered" value={metrics.totalDroneScrapDelivered} />
          <StatRow label="Best Dock Burst" value={metrics.bestDroneDockBurst} />

          <p className="text-[10px] tracking-[0.28em] text-hud-amber/70 mt-4 mb-2">OTHER</p>
          <StatRow label="Photos Taken" value={metrics.totalPhotosTaken} />
        </div>
      </div>
    </div>
  )
}
