'use client'

import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import type { GameScene, MetalVariant } from '@/game/scene'
import type { TutorialStep } from '@/hooks/useTutorial'
import type { MiningTool } from '@/game/types'
import type { ArbiterHudInfo } from '@/game/arbiter-comms'
import type { RunStats } from '@/game/ledger-config'
import type { Upgrades } from '@/lib/schemas'

/** Arbiter encounter lifecycle event surfaced to React for comms banners. */
export type ArbiterEvent = { type: 'arrives' | 'defeated' | 'withdrawn'; mark: number }

export interface GameCanvasHandle {
  setFireRateBonus: (multiplier: number) => void
  resetShipToStation: () => void
  setMiningTool: (tool: MiningTool) => void
  setCollectorTier: (tier: number) => void
  setCombatUpgrades: (upgrades: Upgrades) => void
  respawnAfterDeath: () => void
}

interface GameCanvasProps {
  paused: boolean
  frozen: boolean
  tutorialStep: TutorialStep
  onCollect?: (variant: MetalVariant) => void
  onShipMoved?: () => void
  onAsteroidHit?: () => void
  onMetalSpawned?: () => void
  onMetalCollected?: () => void
  onPlayerDamage?: (hp: number) => void
  onScrapCollect?: (amount: number) => void
  onEnemyNearby?: () => void
  onEnemyDestroyed?: () => void
  onScrapCollected?: () => void
  onNearStation?: () => void
  onStationRange?: (inRange: boolean) => void
  onStationDriveThrough?: () => void
  onCrystallineDeflect?: () => void
  onToolChange?: (tool: MiningTool) => void
  onLedgerChanged?: (ledger: number) => void
  onArbiterChanged?: (info: ArbiterHudInfo | null) => void
  onArbiterEvent?: (event: ArbiterEvent) => void
  onRunEnded?: (stats: RunStats) => void
  onShieldChanged?: (charges: number) => void
  onArmorChanged?: (charges: number) => void
  // Prologue callbacks
  onPrologueReady?: () => void
  onFieldCleared?: () => void
  onArbiterArrived?: () => void
  onStripComplete?: () => void
}

export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(function GameCanvas(
  {
    paused,
    frozen,
    tutorialStep,
    onCollect,
    onShipMoved,
    onAsteroidHit,
    onMetalSpawned,
    onMetalCollected,
    onPlayerDamage,
    onScrapCollect,
    onEnemyNearby,
    onEnemyDestroyed,
    onScrapCollected,
    onNearStation,
    onStationRange,
    onStationDriveThrough,
    onCrystallineDeflect,
    onToolChange,
    onLedgerChanged,
    onArbiterChanged,
    onArbiterEvent,
    onRunEnded,
    onShieldChanged,
    onArmorChanged,
    onPrologueReady,
    onFieldCleared,
    onArbiterArrived,
    onStripComplete,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<GameScene | null>(null)
  const pausedRef = useRef(paused)
  const frozenRef = useRef(frozen)
  const tutorialStepRef = useRef(tutorialStep)
  const onCollectRef = useRef(onCollect)
  const onShipMovedRef = useRef(onShipMoved)
  const onAsteroidHitRef = useRef(onAsteroidHit)
  const onMetalSpawnedRef = useRef(onMetalSpawned)
  const onMetalCollectedRef = useRef(onMetalCollected)
  const onPlayerDamageRef = useRef(onPlayerDamage)
  const onScrapCollectRef = useRef(onScrapCollect)
  const onEnemyNearbyRef = useRef(onEnemyNearby)
  const onEnemyDestroyedRef = useRef(onEnemyDestroyed)
  const onScrapCollectedRef = useRef(onScrapCollected)
  const onNearStationRef = useRef(onNearStation)
  const onStationRangeRef = useRef(onStationRange)
  const onStationDriveThroughRef = useRef(onStationDriveThrough)
  const onCrystallineDeflectRef = useRef(onCrystallineDeflect)
  const onToolChangeRef = useRef(onToolChange)
  const onLedgerChangedRef = useRef(onLedgerChanged)
  const onArbiterChangedRef = useRef(onArbiterChanged)
  const onArbiterEventRef = useRef(onArbiterEvent)
  const onRunEndedRef = useRef(onRunEnded)
  const onShieldChangedRef = useRef(onShieldChanged)
  const onArmorChangedRef = useRef(onArmorChanged)
  const onPrologueReadyRef = useRef(onPrologueReady)
  const onFieldClearedRef = useRef(onFieldCleared)
  const onArbiterArrivedRef = useRef(onArbiterArrived)
  const onStripCompleteRef = useRef(onStripComplete)

  useImperativeHandle(ref, () => ({
    setFireRateBonus: (multiplier: number) => {
      sceneRef.current?.setFireRateBonus(multiplier)
    },
    resetShipToStation: () => {
      sceneRef.current?.resetShipToStation()
    },
    setMiningTool: (tool: MiningTool) => {
      sceneRef.current?.setMiningTool(tool)
    },
    setCollectorTier: (tier: number) => {
      sceneRef.current?.setCollectorTier(tier)
    },
    setCombatUpgrades: (upgrades: Upgrades) => {
      sceneRef.current?.setCombatUpgrades(upgrades)
    },
    respawnAfterDeath: () => {
      sceneRef.current?.respawnAfterDeath()
    },
  }))

  // Keep refs in sync so the game loop can read them without re-renders
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    frozenRef.current = frozen
  }, [frozen])

  useEffect(() => {
    tutorialStepRef.current = tutorialStep
  }, [tutorialStep])

  useEffect(() => {
    onCollectRef.current = onCollect
  }, [onCollect])

  useEffect(() => {
    onShipMovedRef.current = onShipMoved
  }, [onShipMoved])

  useEffect(() => {
    onAsteroidHitRef.current = onAsteroidHit
  }, [onAsteroidHit])

  useEffect(() => {
    onMetalSpawnedRef.current = onMetalSpawned
  }, [onMetalSpawned])

  useEffect(() => {
    onMetalCollectedRef.current = onMetalCollected
  }, [onMetalCollected])

  useEffect(() => {
    onPlayerDamageRef.current = onPlayerDamage
  }, [onPlayerDamage])

  useEffect(() => {
    onScrapCollectRef.current = onScrapCollect
  }, [onScrapCollect])

  useEffect(() => {
    onEnemyNearbyRef.current = onEnemyNearby
  }, [onEnemyNearby])

  useEffect(() => {
    onEnemyDestroyedRef.current = onEnemyDestroyed
  }, [onEnemyDestroyed])

  useEffect(() => {
    onScrapCollectedRef.current = onScrapCollected
  }, [onScrapCollected])

  useEffect(() => {
    onNearStationRef.current = onNearStation
  }, [onNearStation])

  useEffect(() => {
    onStationRangeRef.current = onStationRange
  }, [onStationRange])

  useEffect(() => {
    onStationDriveThroughRef.current = onStationDriveThrough
  }, [onStationDriveThrough])

  useEffect(() => {
    onCrystallineDeflectRef.current = onCrystallineDeflect
  }, [onCrystallineDeflect])

  useEffect(() => {
    onToolChangeRef.current = onToolChange
  }, [onToolChange])

  useEffect(() => {
    onLedgerChangedRef.current = onLedgerChanged
  }, [onLedgerChanged])

  useEffect(() => {
    onArbiterChangedRef.current = onArbiterChanged
  }, [onArbiterChanged])

  useEffect(() => {
    onArbiterEventRef.current = onArbiterEvent
  }, [onArbiterEvent])

  useEffect(() => {
    onRunEndedRef.current = onRunEnded
  }, [onRunEnded])

  useEffect(() => {
    onShieldChangedRef.current = onShieldChanged
  }, [onShieldChanged])

  useEffect(() => {
    onArmorChangedRef.current = onArmorChanged
  }, [onArmorChanged])

  useEffect(() => {
    onPrologueReadyRef.current = onPrologueReady
  }, [onPrologueReady])

  useEffect(() => {
    onFieldClearedRef.current = onFieldCleared
  }, [onFieldCleared])

  useEffect(() => {
    onArbiterArrivedRef.current = onArbiterArrived
  }, [onArbiterArrived])

  useEffect(() => {
    onStripCompleteRef.current = onStripComplete
  }, [onStripComplete])

  const getPaused = useCallback(() => pausedRef.current || frozenRef.current, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Dynamic import to avoid SSR issues with Three.js
    let disposed = false
    import('@/game/scene')
      .then(({ createGameScene }) => {
        if (disposed) return
        sceneRef.current = createGameScene(el, getPaused, () => tutorialStepRef.current, {
          onCollect: (variant) => onCollectRef.current?.(variant),
          onShipMoved: () => onShipMovedRef.current?.(),
          onAsteroidHit: () => onAsteroidHitRef.current?.(),
          onMetalSpawned: () => onMetalSpawnedRef.current?.(),
          onMetalCollected: () => onMetalCollectedRef.current?.(),
          onPlayerDamage: (hp) => onPlayerDamageRef.current?.(hp),
          onScrapCollect: (amount) => onScrapCollectRef.current?.(amount),
          onEnemyNearby: () => onEnemyNearbyRef.current?.(),
          onEnemyDestroyed: () => onEnemyDestroyedRef.current?.(),
          onScrapCollected: () => onScrapCollectedRef.current?.(),
          onNearStation: () => onNearStationRef.current?.(),
          onStationRange: (inRange: boolean) => onStationRangeRef.current?.(inRange),
          onStationDriveThrough: () => onStationDriveThroughRef.current?.(),
          onCrystallineDeflect: () => onCrystallineDeflectRef.current?.(),
          onToolChange: (tool: MiningTool) => onToolChangeRef.current?.(tool),
          onLedgerChanged: (ledger: number) => onLedgerChangedRef.current?.(ledger),
          onArbiterChanged: (info: ArbiterHudInfo | null) => onArbiterChangedRef.current?.(info),
          onArbiterEvent: (event: ArbiterEvent) => onArbiterEventRef.current?.(event),
          onRunEnded: (stats: RunStats) => onRunEndedRef.current?.(stats),
          onShieldChanged: (charges: number) => onShieldChangedRef.current?.(charges),
          onArmorChanged: (charges: number) => onArmorChangedRef.current?.(charges),
          onPrologueReady: () => onPrologueReadyRef.current?.(),
          onFieldCleared: () => onFieldClearedRef.current?.(),
          onArbiterArrived: () => onArbiterArrivedRef.current?.(),
          onStripComplete: () => onStripCompleteRef.current?.(),
        })
      })
      .catch((err: unknown) => {
        console.error('Failed to load game scene:', err)
      })

    return () => {
      disposed = true
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [getPaused])

  return (
    <div ref={containerRef} id="game-canvas" className="absolute inset-0" data-paused={paused} />
  )
})
