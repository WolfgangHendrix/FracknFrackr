'use client'

import {
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useState,
} from 'react'
import type { GameScene, MetalVariant, DebugApi, RunStatsSnapshot } from '@/game/scene'
import type { TutorialStep } from '@/hooks/useTutorial'
import type { MiningTool } from '@/game/types'
import type { ArbiterHudInfo } from '@/game/arbiter-comms'
import type { RunStats } from '@/game/ledger-config'
import type { Upgrades } from '@/lib/schemas'
import type { EnemyKind } from '@/game/enemy-ship'

/** Arbiter encounter lifecycle event surfaced to React for comms banners. */
export type ArbiterEvent = { type: 'arrives' | 'defeated' | 'withdrawn'; mark: number }

export interface GameCanvasHandle {
  setFireRateBonus: (multiplier: number) => void
  resetShipToStation: () => void
  setMiningTool: (tool: MiningTool) => void
  setCollectorTier: (tier: number) => void
  setCargoFull: (full: boolean) => void
  setCombatUpgrades: (upgrades: Upgrades) => void
  buildMiningDrone: () => boolean
  getMiningDroneCount: () => number
  /** Snapshot of in-progress run stats for the pause menu. Null before scene init. */
  getRunStats: () => RunStatsSnapshot | null
  setPhotoMode: (on: boolean) => void
  takeScreenshot: () => Promise<Blob | null>
  respawnAfterDeath: () => void
  /** Scene-side debug API (only meaningful when DEBUG_ENABLED). */
  getDebugApi: () => DebugApi | null
}

interface GameCanvasProps {
  paused: boolean
  frozen: boolean
  tutorialStep: TutorialStep
  onCollect?: (variant: MetalVariant) => void
  onShipMoved?: () => void
  onAsteroidHit?: () => void
  onAsteroidsDestroyed?: (count: number) => void
  onMetalSpawned?: () => void
  onMetalCollected?: () => void
  onPlayerDamage?: (hp: number) => void
  onScrapCollect?: (amount: number) => void
  onEnemyNearby?: () => void
  onEnemyDestroyed?: (kind?: EnemyKind) => void
  onScrapCollected?: () => void
  onNearStation?: () => void
  onStationRange?: (inRange: boolean) => void
  onStationContact?: () => void
  onStationContactBlocked?: () => void
  onStationDriveThrough?: () => void
  onRallyPointSet?: () => void
  onToolChange?: (tool: MiningTool) => void
  onLedgerChanged?: (ledger: number) => void
  onArbiterChanged?: (info: ArbiterHudInfo | null) => void
  onArbiterEvent?: (event: ArbiterEvent) => void
  onRunEnded?: (stats: RunStats) => void
  onShieldChanged?: (charges: number) => void
  onMiningDroneCountChanged?: (count: number) => void
  onDroneScrapDelivered?: (amount: number, dockedCount: number) => void
  onDroneRebuilt?: () => void
  onArmorChanged?: (charges: number) => void
  onHullChanged?: (charges: number) => void
  onSmartBomb?: () => void
  onBlackHoleNearby?: () => void
  onBlackHoleEscaped?: () => void
  onBlackHoleSurvived?: () => void
  onWormholeTeleported?: () => void
  onDrillNoseAsteroidFinished?: (count: number) => void
  onFirstDefensiveHit?: () => void
  onFirstFormation?: () => void
  onFirstSplitter?: () => void
  onHarvestingAreaWarning?: (outside: boolean) => void
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
    onAsteroidsDestroyed,
    onMetalSpawned,
    onMetalCollected,
    onPlayerDamage,
    onScrapCollect,
    onEnemyNearby,
    onEnemyDestroyed,
    onScrapCollected,
    onNearStation,
    onStationRange,
    onStationContact,
    onStationContactBlocked,
    onStationDriveThrough,
    onRallyPointSet,
    onToolChange,
    onLedgerChanged,
    onArbiterChanged,
    onArbiterEvent,
    onRunEnded,
    onShieldChanged,
    onMiningDroneCountChanged,
    onDroneScrapDelivered,
    onDroneRebuilt,
    onArmorChanged,
    onHullChanged,
    onSmartBomb,
    onBlackHoleNearby,
    onBlackHoleEscaped,
    onBlackHoleSurvived,
    onWormholeTeleported,
    onDrillNoseAsteroidFinished,
    onFirstDefensiveHit,
    onFirstFormation,
    onFirstSplitter,
    onPrologueReady,
    onFieldCleared,
    onArbiterArrived,
    onStripComplete,
    onHarvestingAreaWarning,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<GameScene | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const pausedRef = useRef(paused)
  const frozenRef = useRef(frozen)
  const tutorialStepRef = useRef(tutorialStep)
  const onCollectRef = useRef(onCollect)
  const onShipMovedRef = useRef(onShipMoved)
  const onAsteroidHitRef = useRef(onAsteroidHit)
  const onAsteroidsDestroyedRef = useRef(onAsteroidsDestroyed)
  const onMetalSpawnedRef = useRef(onMetalSpawned)
  const onMetalCollectedRef = useRef(onMetalCollected)
  const onPlayerDamageRef = useRef(onPlayerDamage)
  const onScrapCollectRef = useRef(onScrapCollect)
  const onEnemyNearbyRef = useRef(onEnemyNearby)
  const onEnemyDestroyedRef = useRef(onEnemyDestroyed)
  const onScrapCollectedRef = useRef(onScrapCollected)
  const onNearStationRef = useRef(onNearStation)
  const onStationRangeRef = useRef(onStationRange)
  const onStationContactRef = useRef(onStationContact)
  const onStationContactBlockedRef = useRef(onStationContactBlocked)
  const onStationDriveThroughRef = useRef(onStationDriveThrough)
  const onRallyPointSetRef = useRef(onRallyPointSet)
  const onToolChangeRef = useRef(onToolChange)
  const onLedgerChangedRef = useRef(onLedgerChanged)
  const onArbiterChangedRef = useRef(onArbiterChanged)
  const onArbiterEventRef = useRef(onArbiterEvent)
  const onRunEndedRef = useRef(onRunEnded)
  const onShieldChangedRef = useRef(onShieldChanged)
  const onMiningDroneCountChangedRef = useRef(onMiningDroneCountChanged)
  const onDroneScrapDeliveredRef = useRef(onDroneScrapDelivered)
  const onDroneRebuiltRef = useRef(onDroneRebuilt)
  const onArmorChangedRef = useRef(onArmorChanged)
  const onHullChangedRef = useRef(onHullChanged)
  const onSmartBombRef = useRef(onSmartBomb)
  const onBlackHoleNearbyRef = useRef(onBlackHoleNearby)
  const onBlackHoleEscapedRef = useRef(onBlackHoleEscaped)
  const onBlackHoleSurvivedRef = useRef(onBlackHoleSurvived)
  const onWormholeTeleportedRef = useRef(onWormholeTeleported)
  const onDrillNoseAsteroidFinishedRef = useRef(onDrillNoseAsteroidFinished)
  const onFirstDefensiveHitRef = useRef(onFirstDefensiveHit)
  const onFirstFormationRef = useRef(onFirstFormation)
  const onFirstSplitterRef = useRef(onFirstSplitter)
  const onPrologueReadyRef = useRef(onPrologueReady)
  const onFieldClearedRef = useRef(onFieldCleared)
  const onArbiterArrivedRef = useRef(onArbiterArrived)
  const onStripCompleteRef = useRef(onStripComplete)
  const onHarvestingAreaWarningRef = useRef(onHarvestingAreaWarning)

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
    setCargoFull: (full: boolean) => {
      sceneRef.current?.setCargoFull(full)
    },
    setCombatUpgrades: (upgrades: Upgrades) => {
      sceneRef.current?.setCombatUpgrades(upgrades)
    },
    buildMiningDrone: () => sceneRef.current?.buildMiningDrone() ?? false,
    getMiningDroneCount: () => sceneRef.current?.getMiningDroneCount() ?? 0,
    getRunStats: () => sceneRef.current?.getRunStats() ?? null,
    setPhotoMode: (on: boolean) => {
      sceneRef.current?.setPhotoMode(on)
    },
    takeScreenshot: async () => (await sceneRef.current?.takeScreenshot()) ?? null,
    getDebugApi: () => sceneRef.current?.debugApi ?? null,
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
    onAsteroidsDestroyedRef.current = onAsteroidsDestroyed
  }, [onAsteroidsDestroyed])

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
    onStationContactRef.current = onStationContact
  }, [onStationContact])

  useEffect(() => {
    onStationContactBlockedRef.current = onStationContactBlocked
  }, [onStationContactBlocked])

  useEffect(() => {
    onStationDriveThroughRef.current = onStationDriveThrough
  }, [onStationDriveThrough])

  useEffect(() => {
    onRallyPointSetRef.current = onRallyPointSet
  }, [onRallyPointSet])

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
    onMiningDroneCountChangedRef.current = onMiningDroneCountChanged
  }, [onMiningDroneCountChanged])

  useEffect(() => {
    onDroneScrapDeliveredRef.current = onDroneScrapDelivered
  }, [onDroneScrapDelivered])

  useEffect(() => {
    onDroneRebuiltRef.current = onDroneRebuilt
  }, [onDroneRebuilt])

  useEffect(() => {
    onArmorChangedRef.current = onArmorChanged
  }, [onArmorChanged])

  useEffect(() => {
    onHullChangedRef.current = onHullChanged
  }, [onHullChanged])

  useEffect(() => {
    onSmartBombRef.current = onSmartBomb
  }, [onSmartBomb])

  useEffect(() => {
    onBlackHoleNearbyRef.current = onBlackHoleNearby
  }, [onBlackHoleNearby])

  useEffect(() => {
    onBlackHoleEscapedRef.current = onBlackHoleEscaped
  }, [onBlackHoleEscaped])

  useEffect(() => {
    onBlackHoleSurvivedRef.current = onBlackHoleSurvived
  }, [onBlackHoleSurvived])

  useEffect(() => {
    onWormholeTeleportedRef.current = onWormholeTeleported
  }, [onWormholeTeleported])

  useEffect(() => {
    onDrillNoseAsteroidFinishedRef.current = onDrillNoseAsteroidFinished
  }, [onDrillNoseAsteroidFinished])

  useEffect(() => {
    onFirstDefensiveHitRef.current = onFirstDefensiveHit
  }, [onFirstDefensiveHit])

  useEffect(() => {
    onFirstFormationRef.current = onFirstFormation
  }, [onFirstFormation])

  useEffect(() => {
    onFirstSplitterRef.current = onFirstSplitter
  }, [onFirstSplitter])

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

  useEffect(() => {
    onHarvestingAreaWarningRef.current = onHarvestingAreaWarning
  }, [onHarvestingAreaWarning])

  const getPaused = useCallback(() => pausedRef.current || frozenRef.current, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Dynamic import to avoid SSR issues with Three.js. Wrapped in a retry
    // path because the chunk fetch can fail after a long sleep (network not
    // reconnected yet) and the spinner would otherwise hang forever.
    setIsLoading(true)
    setLoadError(null)
    let disposed = false
    import('@/game/scene')
      .then(({ createGameScene }) => {
        if (disposed) return
        sceneRef.current = createGameScene(el, getPaused, () => tutorialStepRef.current, {
          onCollect: (variant) => onCollectRef.current?.(variant),
          onShipMoved: () => onShipMovedRef.current?.(),
          onAsteroidHit: () => onAsteroidHitRef.current?.(),
          onAsteroidsDestroyed: (count: number) => onAsteroidsDestroyedRef.current?.(count),
          onMetalSpawned: () => onMetalSpawnedRef.current?.(),
          onMetalCollected: () => onMetalCollectedRef.current?.(),
          onPlayerDamage: (hp) => onPlayerDamageRef.current?.(hp),
          onScrapCollect: (amount) => onScrapCollectRef.current?.(amount),
          onEnemyNearby: () => onEnemyNearbyRef.current?.(),
          onEnemyDestroyed: (kind?: EnemyKind) => onEnemyDestroyedRef.current?.(kind),
          onScrapCollected: () => onScrapCollectedRef.current?.(),
          onNearStation: () => onNearStationRef.current?.(),
          onStationRange: (inRange: boolean) => onStationRangeRef.current?.(inRange),
          onStationContact: () => onStationContactRef.current?.(),
          onStationContactBlocked: () => onStationContactBlockedRef.current?.(),
          onStationDriveThrough: () => onStationDriveThroughRef.current?.(),
          onRallyPointSet: () => onRallyPointSetRef.current?.(),
          onToolChange: (tool: MiningTool) => onToolChangeRef.current?.(tool),
          onLedgerChanged: (ledger: number) => onLedgerChangedRef.current?.(ledger),
          onArbiterChanged: (info: ArbiterHudInfo | null) => onArbiterChangedRef.current?.(info),
          onArbiterEvent: (event: ArbiterEvent) => onArbiterEventRef.current?.(event),
          onRunEnded: (stats: RunStats) => onRunEndedRef.current?.(stats),
          onShieldChanged: (charges: number) => onShieldChangedRef.current?.(charges),
          onMiningDroneCountChanged: (count: number) =>
            onMiningDroneCountChangedRef.current?.(count),
          onDroneScrapDelivered: (amount: number, dockedCount: number) =>
            onDroneScrapDeliveredRef.current?.(amount, dockedCount),
          onDroneRebuilt: () => onDroneRebuiltRef.current?.(),
          onArmorChanged: (charges: number) => onArmorChangedRef.current?.(charges),
          onHullChanged: (charges: number) => onHullChangedRef.current?.(charges),
          onSmartBomb: () => onSmartBombRef.current?.(),
          onBlackHoleNearby: () => onBlackHoleNearbyRef.current?.(),
          onBlackHoleEscaped: () => onBlackHoleEscapedRef.current?.(),
          onBlackHoleSurvived: () => onBlackHoleSurvivedRef.current?.(),
          onWormholeTeleported: () => onWormholeTeleportedRef.current?.(),
          onDrillNoseAsteroidFinished: (count: number) =>
            onDrillNoseAsteroidFinishedRef.current?.(count),
          onFirstDefensiveHit: () => onFirstDefensiveHitRef.current?.(),
          onFirstFormation: () => onFirstFormationRef.current?.(),
          onFirstSplitter: () => onFirstSplitterRef.current?.(),
          onPrologueReady: () => onPrologueReadyRef.current?.(),
          onFieldCleared: () => onFieldClearedRef.current?.(),
          onArbiterArrived: () => onArbiterArrivedRef.current?.(),
          onStripComplete: () => onStripCompleteRef.current?.(),
          onHarvestingAreaWarning: (outside) => onHarvestingAreaWarningRef.current?.(outside),
        })
        // Allow a few frames for the first render
        setTimeout(() => setIsLoading(false), 200)
      })
      .catch((err: unknown) => {
        if (disposed) return
        console.error('Failed to load game scene:', err)
        const message =
          err instanceof Error ? err.message : 'Unknown error loading the game scene.'
        setLoadError(message)
        setIsLoading(false)
      })

    return () => {
      disposed = true
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [getPaused, loadAttempt])

  return (
    <div className="absolute inset-0 bg-space-950">
      <div
        ref={containerRef}
        id="game-canvas"
        className="absolute inset-0"
        data-paused={paused}
      />
      {isLoading && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-space-950 z-[100] transition-opacity duration-700 pointer-events-none">
          <div className="flex flex-col items-center gap-4">
            <div className="font-sans text-hud-green text-sm tracking-[0.3em] animate-pulse">
              SYSTEMS INITIALIZING...
            </div>
            <div className="w-48 h-1 bg-space-800 rounded-full overflow-hidden">
              <div className="h-full bg-hud-green animate-[loading-bar_2s_infinite]" />
            </div>
          </div>
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-space-950 z-[100]">
          <div className="flex flex-col items-center gap-5 max-w-md px-6 text-center">
            <div className="font-sans text-hud-red text-sm tracking-[0.3em]">
              SYSTEMS OFFLINE
            </div>
            <p className="font-sans text-white/70 text-sm">
              Failed to load the game scene. This usually happens after the
              browser was asleep — the network may not be reconnected yet.
            </p>
            <p className="font-mono text-white/40 text-xs break-all">{loadError}</p>
            <button
              type="button"
              onClick={() => setLoadAttempt((n) => n + 1)}
              className="pointer-events-auto px-6 py-3 min-h-[44px] bg-hud-green/20 hover:bg-hud-green/30 focus:bg-hud-green/40 focus:outline-none focus:ring-2 focus:ring-hud-green border border-hud-green/50 rounded text-hud-green font-sans tracking-[0.2em] text-sm transition-colors"
            >
              RETRY
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
