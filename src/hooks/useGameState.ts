'use client'

import { useState, useCallback, useEffect } from 'react'
import { defaultProfile, defaultUpgrades, defaultCargo } from '@/lib/schemas'
import type { AchievementMetrics, Cargo, Profile, Upgrades } from '@/lib/schemas'
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

/**
 * Cargo capacity for a given Storage tier. Tier 1 is the reduced new-player
 * hold (25); each Cargo Expansion past the first follows the original
 * 50-per-tier curve, so tiers 1-6 are 25 / 50 / 100 / 150 / 200 / 250. The
 * tutorial's free first expansion takes a new player from 25 up to the
 * "normal" 50.
 */
export function capacityForStorage(storage: number): number {
  return storage <= 1 ? 25 : 50 * (storage - 1)
}

const UPGRADE_MAX: Record<keyof Upgrades, number> = {
  blaster: 5,
  collector: 5,
  storage: 6,
  missiles: 8,
  ripple: 1,
  options: 3,
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
  bounty: 3,
  missileBias: 1,
  thrusters: 1,
  sensor: 3,
  droneRepair: 1,
  drillNose: 3,
  refinery: 1,
  exoticHull: 1,
  wormhole: 2,
}

export interface GameStateHook {
  paused: boolean
  scrap: number
  cargo: Cargo
  upgrades: Upgrades
  playerHp: number
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
  resetRunState: () => void
  hydrateFromProfile: (profile: Profile) => void
  achievements: string[]
  setAchievements: React.Dispatch<React.SetStateAction<string[]>>
  metrics: AchievementMetrics
  setMetrics: React.Dispatch<React.SetStateAction<AchievementMetrics>>
}

export function useGameState(prologueActive = false): GameStateHook {
  const [paused, setPaused] = useState(false)
  const [cargo, setCargo] = useState<Cargo>(defaultCargo)
  const [scrap, setScrap] = useState(0)
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP)
  const [upgrades, setUpgrades] = useState<Upgrades>(defaultUpgrades)
  const [achievements, setAchievements] = useState<string[]>([])
  const [metrics, setMetrics] = useState(() => defaultProfile().metrics)

  // Keep cargo capacity in sync with the storage upgrade tier. During the
  // prologue the ship is a maxed-out showcase, so the hold reads at the top
  // tier; the real storage tier (starting at the reduced 25 tutorial hold)
  // takes over the moment the prologue hands control back.
  // Runs on mount (covers saves loaded with storage > 1) and on every purchase.
  useEffect(() => {
    const storageTier = prologueActive ? UPGRADE_MAX.storage : upgrades.storage
    setCargo((prev) => ({ ...prev, capacity: capacityForStorage(storageTier) }))
  }, [upgrades.storage, prologueActive])

  const togglePause = useCallback(() => {
    setPaused((p) => !p)
  }, [])

  const onCollect = useCallback((variant: MetalVariant) => {
    setCargo((prev) => {
      if (prev.fragments >= prev.capacity) return prev
      return {
        ...prev,
        fragments: prev.fragments + 1,
        [variant]: prev[variant] + 1,
      }
    })
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
      if (prev.fragments >= prev.capacity) {
        earned = Math.round(earned * 1.20)
      }
      // Quantum Refinery (prestige): doubles every sale, stacking multiplicatively
      // with the full-cargo bonus above.
      if (upgrades.refinery > 0) {
        earned *= 2
      }
      const cleared = MINERAL_KEYS.reduce(
        (acc, k) => ({ ...acc, [k]: 0 }),
        {} as Record<(typeof MINERAL_KEYS)[number], number>,
      )
      return { ...prev, ...cleared, fragments: 0 }
    })
    setScrap((prev) => prev + earned)
    return earned
  }, [upgrades.refinery])

  /**
   * Buy an upgrade. Calls onPurchased(true) if successful, onPurchased(false) if not.
   *
   * setUpgrades MUST NOT be called inside the setScrap functional updater — React
   * Strict Mode double-invokes updaters to catch impure functions, which would fire
   * setUpgrades twice and incorrectly double-increment the tier. Instead we use a
   * local flag to capture the affordability result from the updater and apply the
   * upgrade in a separate setTimeout, matching how onPurchased is already scheduled.
   */
  const buyUpgrade = useCallback(
    (type: keyof Upgrades, cost: number, onPurchased?: (ok: boolean) => void): void => {
      let canBuy = false
      setScrap((prevScrap) => {
        if (prevScrap < cost) return prevScrap
        canBuy = true
        return prevScrap - cost
      })
      setTimeout(() => {
        if (!canBuy) {
          onPurchased?.(false)
          return
        }
        // One-shot UNLOCKS (binary unlocks like lazer, ripple, autoTool, etc.)
        // max out on purchase. Tiered upgrades increment by 1 per purchase.
        setUpgrades((prev) => ({
          ...prev,
          [type]:
            type === 'smartBomb' ||
            type === 'lazer' ||
            type === 'autoTool' ||
            type === 'ripple' ||
            type === 'spread' ||
            type === 'missileBias' ||
            type === 'thrusters' ||
            type === 'droneRepair' ||
            type === 'refinery' ||
            type === 'exoticHull'
              ? UPGRADE_MAX[type]
              : Math.min(prev[type] + 1, UPGRADE_MAX[type]),
        }))
        onPurchased?.(true)
      }, 0)
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

  /** Full reset of all in-run state — called when the player hits PLAY from the
   * main menu so each arcade run starts from tier-1 defaults regardless of
   * what the previous session left behind. */
  const resetRunState = useCallback(() => {
    setUpgrades(defaultUpgrades())
    setCargo(defaultCargo())
    setScrap(0)
    setPlayerHp(PLAYER_MAX_HP)
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

  const hydrateFromProfile = useCallback((p: Profile): void => {
    setAchievements(p.achievements)
    setMetrics(p.metrics)
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
    resetRunState,
    hydrateFromProfile,
    achievements,
    setAchievements,
    metrics,
    setMetrics,
  }
}
