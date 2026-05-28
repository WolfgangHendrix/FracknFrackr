'use client'

import { useState, useCallback } from 'react'
import { defaultGameState } from '@/lib/schemas'
import type { Cargo, GameState, Upgrades } from '@/lib/schemas'
import type { MetalVariant } from '@/game/scene'
import { PLAYER_MAX_HP } from '@/game/scene'

/**
 * Scrap value per unit of each mineral fragment. Ratios track the real-world
 * rarity ladder of the source spectral classes (~1× / 3.5× / 12× / 25× / 50×)
 * scaled to a base that keeps a full asteroid field roughly economy-neutral
 * versus the old silver/gold drop balance.
 */
export const SCRAP_VALUE_BY_MINERAL: Record<MetalVariant, number> = {
  carbon: 3,
  silicates: 11,
  platinum: 36,
  titanium: 75,
  exotics: 150,
}

const MINERAL_KEYS = ['carbon', 'silicates', 'platinum', 'titanium', 'exotics'] as const

const UPGRADE_MAX: Record<keyof Upgrades, number> = {
  blaster: 5,
  collector: 5,
  storage: 5,
  missiles: 8,
  ripple: 1,
  options: 2,
  speed: 5,
  armor: 3,
  shield: 3,
  smartBomb: 1,
  lazer: 1,
  autoTool: 1,
  drone: 4,
  spread: 1,
  hull: 3,
  cooling: 3,
  magnet: 3,
  hullPlating: 3,
  bounty: 3,
  missileBias: 1,
  thrusters: 1,
  sensor: 3,
  droneRepair: 1,
}

export interface GameStateHook {
  paused: boolean
  scrap: number
  cargo: Cargo
  upgrades: Upgrades
  playerHp: number
  playerMaxHp: number
  togglePause: () => void
  onCollect: (variant: MetalVariant) => void
  onPlayerDamage: (hp: number) => void
  onScrapCollect: (amount: number) => void
  sellMaterials: () => number
  buyUpgrade: (type: keyof Upgrades, cost: number, onPurchased?: (ok: boolean) => void) => void
  setUpgradeLevel: (type: keyof Upgrades, value: number) => void
  spendScrap: (amount: number) => boolean
  resetRunCargo: () => void
  resetForRunStart: () => void
  hydrateFromSave: (state: GameState) => void
  achievements: string[]
  setAchievements: React.Dispatch<React.SetStateAction<string[]>>
  metrics: {
    totalScrapMined: number
    totalArbitersDefeated: number
    totalRuns: number
    maxLedgerReached: number
  }
  setMetrics: React.Dispatch<
    React.SetStateAction<{
      totalScrapMined: number
      totalArbitersDefeated: number
      totalRuns: number
      maxLedgerReached: number
    }>
  >
}

export function useGameState(): GameStateHook {
  const [paused, setPaused] = useState(false)
  const [cargo, setCargo] = useState(() => defaultGameState().cargo)
  const [scrap, setScrap] = useState(0)
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP)
  const [upgrades, setUpgrades] = useState(() => defaultGameState().upgrades)
  const [achievements, setAchievements] = useState<string[]>([])
  const [metrics, setMetrics] = useState(() => defaultGameState().metrics)

  const togglePause = useCallback(() => {
    setPaused((p) => !p)
  }, [])

  const onCollect = useCallback((variant: MetalVariant) => {
    setCargo((prev) => ({
      ...prev,
      fragments: prev.fragments + 1,
      [variant]: prev[variant] + 1,
    }))
  }, [])

  const onPlayerDamage = useCallback((hp: number) => {
    setPlayerHp(hp)
  }, [])

  const onScrapCollect = useCallback((amount: number) => {
    setScrap((prev) => prev + amount)
  }, [])

  /** Sell all mineral fragments for scrap. Returns scrap earned. */
  const sellMaterials = useCallback((): number => {
    let earned = 0
    setCargo((prev) => {
      earned = MINERAL_KEYS.reduce((sum, k) => sum + prev[k] * SCRAP_VALUE_BY_MINERAL[k], 0)
      const cleared = MINERAL_KEYS.reduce(
        (acc, k) => ({ ...acc, [k]: 0 }),
        {} as Record<(typeof MINERAL_KEYS)[number], number>,
      )
      return { ...prev, ...cleared, fragments: 0 }
    })
    setScrap((prev) => prev + earned)
    return earned
  }, [])

  /**
   * Buy an upgrade. Calls onPurchased(true) if successful, onPurchased(false) if not.
   * Uses callback to avoid synchronous-return-from-setState issues.
   */
  const buyUpgrade = useCallback(
    (type: keyof Upgrades, cost: number, onPurchased?: (ok: boolean) => void): void => {
      setScrap((prevScrap) => {
        if (prevScrap < cost) {
          // Can't afford — schedule callback outside setState
          setTimeout(() => onPurchased?.(false), 0)
          return prevScrap
        }
        // Can afford — also bump the upgrade level
        setUpgrades((prev) => ({
          ...prev,
          // One-shot unlocks max out on purchase; everything else increments.
          [type]:
            type === 'shield' ||
            type === 'smartBomb' ||
            type === 'lazer' ||
            type === 'autoTool' ||
            type === 'ripple' ||
            type === 'spread' ||
            type === 'missileBias' ||
            type === 'thrusters' ||
            type === 'droneRepair'
              ? UPGRADE_MAX[type]
              : Math.min(prev[type] + 1, UPGRADE_MAX[type]),
        }))
        setTimeout(() => onPurchased?.(true), 0)
        return prevScrap - cost
      })
    },
    [],
  )

  /** Wipe uncashed cargo (all minerals + fragments) — used by the death respawn. */
  const resetRunCargo = useCallback(() => {
    setCargo((prev) => {
      const cleared = MINERAL_KEYS.reduce(
        (acc, k) => ({ ...acc, [k]: 0 }),
        {} as Record<(typeof MINERAL_KEYS)[number], number>,
      )
      return { ...prev, ...cleared, fragments: 0 }
    })
  }, [])

  /** Wipe scrap AND cargo — used when the prologue ends so the player can't
   * front-load scrap mined during the maxed-out intro ship. */
  const resetForRunStart = useCallback(() => {
    setScrap(0)
    setCargo((prev) => {
      const cleared = MINERAL_KEYS.reduce(
        (acc, k) => ({ ...acc, [k]: 0 }),
        {} as Record<(typeof MINERAL_KEYS)[number], number>,
      )
      return { ...prev, ...cleared, fragments: 0 }
    })
  }, [])

  /** Deduct scrap if affordable. Returns true on success. */
  const spendScrap = useCallback((amount: number): boolean => {
    let success = false
    setScrap((prev) => {
      if (prev >= amount) {
        success = true
        return prev - amount
      }
      return prev
    })
    return success
  }, [])

  const hydrateFromSave = useCallback((s: GameState): void => {
    setCargo(s.cargo)
    setScrap(s.cargo.scrap)
    setUpgrades(s.upgrades)
    setPlayerHp(s.hp)
    setAchievements(s.achievements)
    setMetrics(s.metrics)
  }, [])

  const setUpgradeLevel = useCallback((type: keyof Upgrades, value: number): void => {
    setUpgrades((prev) => ({
      ...prev,
      [type]: Math.max(0, Math.min(UPGRADE_MAX[type], Math.round(value))),
    }))
  }, [])

  return {
    paused,
    scrap,
    cargo,
    upgrades,
    playerHp,
    playerMaxHp: PLAYER_MAX_HP + 25 * upgrades.hullPlating,
    togglePause,
    onCollect,
    onPlayerDamage,
    onScrapCollect,
    sellMaterials,
    buyUpgrade,
    setUpgradeLevel,
    spendScrap,
    resetRunCargo,
    resetForRunStart,
    hydrateFromSave,
    achievements,
    setAchievements,
    metrics,
    setMetrics,
  }
}
