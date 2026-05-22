'use client'

import { useState, useCallback } from 'react'
import { defaultGameState } from '@/lib/schemas'
import type { Cargo, Upgrades } from '@/lib/schemas'
import type { MetalVariant } from '@/game/scene'
import { PLAYER_MAX_HP } from '@/game/scene'

/** Scrap value per unit of silver ore. */
export const SILVER_SCRAP_VALUE = 5
/** Scrap value per unit of gold ore. */
export const GOLD_SCRAP_VALUE = 15

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
}

export function useGameState(): GameStateHook {
  const [paused, setPaused] = useState(false)
  const [cargo, setCargo] = useState(() => defaultGameState().cargo)
  const [scrap, setScrap] = useState(0)
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP)
  const [upgrades, setUpgrades] = useState(() => defaultGameState().upgrades)

  const togglePause = useCallback(() => {
    setPaused((p) => !p)
  }, [])

  const onCollect = useCallback((variant: MetalVariant) => {
    setCargo((prev) => ({
      ...prev,
      fragments: prev.fragments + 1,
      silver: prev.silver + (variant === 'silver' ? 1 : 0),
      gold: prev.gold + (variant === 'gold' ? 1 : 0),
    }))
  }, [])

  const onPlayerDamage = useCallback((hp: number) => {
    setPlayerHp(hp)
  }, [])

  const onScrapCollect = useCallback((amount: number) => {
    setScrap((prev) => prev + amount)
  }, [])

  /** Sell all silver and gold for scrap. Returns scrap earned. */
  const sellMaterials = useCallback((): number => {
    let earned = 0
    setCargo((prev) => {
      earned = prev.silver * SILVER_SCRAP_VALUE + prev.gold * GOLD_SCRAP_VALUE
      return { ...prev, silver: 0, gold: 0, fragments: 0 }
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
          [type]:
            type === 'shield' ? UPGRADE_MAX.shield : Math.min(prev[type] + 1, UPGRADE_MAX[type]),
        }))
        setTimeout(() => onPurchased?.(true), 0)
        return prevScrap - cost
      })
    },
    [],
  )

  /** Wipe uncashed cargo (silver/gold/fragments) — used by the death respawn. */
  const resetRunCargo = useCallback(() => {
    setCargo((prev) => ({ ...prev, fragments: 0, silver: 0, gold: 0 }))
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
    playerMaxHp: PLAYER_MAX_HP,
    togglePause,
    onCollect,
    onPlayerDamage,
    onScrapCollect,
    sellMaterials,
    buyUpgrade,
    setUpgradeLevel,
    spendScrap,
    resetRunCargo,
  }
}
