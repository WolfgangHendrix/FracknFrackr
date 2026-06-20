'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { GameCanvas } from '@/components/GameCanvas'
import type { GameCanvasHandle, ArbiterEvent } from '@/components/GameCanvas'
import { HUD } from '@/components/HUD'
import { ArbiterBanner } from '@/components/ArbiterBanner'
import type { ArbiterBannerData } from '@/components/ArbiterBanner'
import { RunSummary } from '@/components/RunSummary'
import type { ArbiterHudInfo } from '@/game/arbiter-comms'
import { arbiterArrivalLine, arbiterDefeatLine, arbiterWithdrawLine } from '@/game/arbiter-comms'
import type { RunStats } from '@/game/ledger-config'
import { TitleScreen } from '@/components/TitleScreen'
import { StartScreen } from '@/components/StartScreen'
import { ProfileSelectScreen } from '@/components/ProfileSelectScreen'
import { TutorialOverlay } from '@/components/TutorialOverlay'
import { PrologueOverlay } from '@/components/PrologueOverlay'
import { TradeMenu, LAZER_COST, MINING_DRONE_BUILD_COST } from '@/components/TradeMenu'
import { DroneTutorialPopup } from '@/components/DroneTutorialPopup'
import { BlackHoleTutorialPopup } from '@/components/BlackHoleTutorialPopup'
import { DefenseTutorialPopup } from '@/components/DefenseTutorialPopup'
import { FormationTutorialPopup } from '@/components/FormationTutorialPopup'
import { SplitterTutorialPopup } from '@/components/SplitterTutorialPopup'
import { PauseOverlay } from '@/components/PauseOverlay'
import { PhotoModeOverlay } from '@/components/PhotoModeOverlay'
import { AchievementToast } from '@/components/AchievementToast'
import { DebugPanel } from '@/components/DebugPanel'
import { useGameState } from '@/hooks/useGameState'
import { useGamePersistence, setActiveProfile, clearActiveProfile } from '@/hooks/useGamePersistence'
import { useTutorial } from '@/hooks/useTutorial'
import { playMenuLoop, enterGameplay } from '@/lib/menu-music'
import { useGamepadMenu } from '@/hooks/useGamepadMenu'
import { useGamepadButton } from '@/hooks/useGamepadButton'
import type { MiningTool, MetalVariant } from '@/game/types'
import { defaultProfile } from '@/lib/schemas'
import type { Upgrades, ProfileId } from '@/lib/schemas'
import { setPauseDampening } from '@/game/volume-control'
import { playVoice } from '@/lib/voice'
import type { PauseRunStats } from '@/components/PauseOverlay'
import { ACHIEVEMENTS, ACHIEVEMENT_COUNT, defaultAchievementRunState, findNewAchievementUnlocks, getAchievement, getAchievementProgress } from '@/lib/achievements'
import type { AchievementRunState } from '@/lib/achievements'
import type { EnemyKind } from '@/game/enemy-ship'
import { PROLOGUE_SHIP } from '@/game/prologue-config'
import { playBuyRegister, playCannotBuy } from '@/game/sfx'

type Screen = 'title' | 'profile-select' | 'start' | 'game'
/** Cheapest upgrade in the catalog (Fire Rate Boost). Auto-dock skips the
 *  modal when the player has no materials AND less scrap than this — there
 *  literally isn't anything to buy or sell, so a paused screen of dim rows
 *  would feel like the game broke. */
const CHEAPEST_UPGRADE_COST = 10
/** Grace window after the player closes the trade menu before contact can
 *  retrigger it. Long enough to fly clear of the structure cleanly, short
 *  enough that a deliberate "wait, one more thing" re-dock still works. */
const TRADE_REOPEN_COOLDOWN_MS = 1500
const FRACKER_SYSTEMS_OFFLINE = './audio/vo_fracker03.wav'
const FRACKER_REBOOTING = './audio/vo_fracker04.wav'

export default function Home() {
  const [screen, setScreen] = useState<Screen>('title')
  const [activeProfile, setActiveProfileState] = useState<ProfileId | null>(null)
  const [isNewGame, setIsNewGame] = useState(false)
  const [prologueSeen, setPrologueSeen] = useState(false)
  const [tradeMenuOpen, setTradeMenuOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<MiningTool>('blaster')
  const [dronePopupVisible, setDronePopupVisible] = useState(false)
  const [blackHolePopupVisible, setBlackHolePopupVisible] = useState(false)
  // First-encounter tutorial popups for the new combat systems.
  const [defensePopupVisible, setDefensePopupVisible] = useState(false)
  const [formationPopupVisible, setFormationPopupVisible] = useState(false)
  const [splitterPopupVisible, setSplitterPopupVisible] = useState(false)
  const [stationBlockedBanner, setStationBlockedBanner] = useState(false)
  const [ledger, setLedger] = useState(0)
  const [arbiterHud, setArbiterHud] = useState<ArbiterHudInfo | null>(null)
  const [arbiterBanner, setArbiterBanner] = useState<ArbiterBannerData | null>(null)
  const [runOver, setRunOver] = useState(false)
  const [runStats, setRunStats] = useState<RunStats | null>(null)
  const [highScore, setHighScore] = useState(0)
  const [isNewBest, setIsNewBest] = useState(false)
  const [showHarvestingWarning, setShowHarvestingWarning] = useState(false)
  const gameCanvasRef = useRef<GameCanvasHandle>(null)
  /** Timestamp of the last trade-menu close — used by handleStationContact
   *  to enforce the reopen cooldown above. Ref instead of state so updating
   *  it doesn't re-render or invalidate the contact callback's deps. */
  const lastTradeCloseAtRef = useRef(0)
  // The prologue is a maxed-out god-ship showcase, so the cargo hold should read
  // at full capacity there; the real (small) tutorial hold takes over once the
  // intro hands control back. Computed before useGameState so the capacity sync
  // can pick the showcase tier while the prologue is running.
  const tutorial = useTutorial(isNewGame && screen === 'game', isNewGame)
  const prologueActive = tutorial.step.startsWith('prologue-')
  const {
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
  } = useGameState(prologueActive)
  const hasLazer = upgrades.lazer > 0
  const { save, load, erase } = useGamePersistence(activeProfile)
  // Latest "is the player in the scripted prologue" flag, kept in a ref so the
  // metric/run-state mutators and the achievement evaluator can cheaply gate on
  // it without re-creating their callbacks. The prologue is a god-ship showcase
  // run, so nothing done there should count toward or unlock achievements.
  const inPrologueRef = useRef(false)
  inPrologueRef.current = prologueActive
  const [achievementRun, setAchievementRun] = useState<AchievementRunState>(() =>
    defaultAchievementRunState(),
  )
  const [achievementQueue, setAchievementQueue] = useState<string[]>([])
  const [liveRunTimeSec, setLiveRunTimeSec] = useState(0)

  // --- Auto-save on state changes triggered by game events ---
  const [saveSeq, setSaveSeq] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  /** Request a save after the current state updates have been applied. */
  const requestSave = useCallback(() => {
    setSaveSeq((n) => n + 1)
  }, [])

  const resetAchievementRun = useCallback((seed?: Partial<AchievementRunState>) => {
    setAchievementRun({ ...defaultAchievementRunState(), ...seed })
  }, [])

  const patchMetrics = useCallback(
    (update: (prev: typeof metrics) => typeof metrics) => {
      // Don't let prologue actions (scripted kills/mining) feed lifetime metrics.
      if (inPrologueRef.current) return
      setMetrics((prev) => update(prev))
      requestSave()
    },
    [setMetrics, requestSave],
  )

  const patchAchievementRun = useCallback(
    (update: (prev: AchievementRunState) => AchievementRunState) => {
      // Prologue actions must not seed run-state that achievements key off.
      if (inPrologueRef.current) return
      setAchievementRun((prev) => update(prev))
    },
    [],
  )

  const getCurrentRunTimeSec = useCallback(
    () => gameCanvasRef.current?.getRunStats()?.runTimeSec ?? liveRunTimeSec,
    [liveRunTimeSec],
  )

  // Persist the snapshot whenever saveSeq increments (driven by game events).
  // Skip the initial render (saveSeq === 0).
  useEffect(() => {
    if (saveSeq === 0) return
    setIsSaving(true)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

    void save({
      highScore,
      timestamp: Date.now(),
      achievements,
      metrics,
      prologueSeen,
    }).then(() => {
      saveTimeoutRef.current = setTimeout(() => {
        setIsSaving(false)
      }, 2000)
    })
  }, [saveSeq]) // eslint-disable-line react-hooks/exhaustive-deps -- save reads latest state at trigger time

  // Load profile records when a profile is selected.
  useEffect(() => {
    if (!activeProfile) return
    void load().then((p) => {
      if (!p) {
        setHighScore(0)
        hydrateFromProfile(defaultProfile())
        return
      }
      setHighScore(p.highScore)
      hydrateFromProfile(p)
    })
  }, [activeProfile, load, hydrateFromProfile])

  const handleTitleBegin = useCallback(() => {
    playMenuLoop()
    setScreen('profile-select')
  }, [])

  const handleProfileSelect = useCallback((profileId: ProfileId) => {
    setActiveProfile(profileId)
    setActiveProfileState(profileId)
    // Determine prologue state immediately from saved profile.
    // useGamePersistence.load() requires the hook to have the ID, so we read
    // directly from localStorage here (before the hook re-renders with the new ID).
    try {
      const raw = typeof localStorage !== 'undefined'
        ? localStorage.getItem(`fracking-asteroids-profile:${profileId}`)
        : null
      const parsed: unknown = raw ? JSON.parse(raw) : null
      const seen = parsed && typeof parsed === 'object' && 'prologueSeen' in parsed
        ? !!(parsed as Record<string, unknown>).prologueSeen
        : false
      setPrologueSeen(seen)
      setIsNewGame(!seen)
    } catch {
      setPrologueSeen(false)
      setIsNewGame(true)
    }
    setScreen('start')
  }, [])

  const handlePlay = useCallback(() => {
    resetRunState()
    setAchievementQueue([])
    resetAchievementRun()
    setLiveRunTimeSec(0)
    enterGameplay()
    setScreen('game')
  }, [resetAchievementRun, resetRunState])

  const handleEraseProfile = useCallback(() => {
    erase()
    clearActiveProfile()
    setActiveProfileState(null)
    setAchievements([])
    setMetrics(defaultProfile().metrics)
    setHighScore(0)
    setPrologueSeen(false)
    setIsNewGame(false)
    setScreen('profile-select')
  }, [erase, setAchievements, setMetrics])

  const handleCollect = useCallback(
    (variant: MetalVariant) => {
      onCollect(variant)
      requestSave()
    },
    [onCollect, requestSave],
  )

  const handleScrapCollect = useCallback(
    (amount: number) => {
      onScrapCollect(amount)
      requestSave()
    },
    [onScrapCollect, requestSave],
  )

  const handlePlayerDamage = useCallback(
    (hp: number) => {
      if (hp < playerHp) {
        patchAchievementRun((prev) => ({ ...prev, tookHitThisRun: true }))
      }
      onPlayerDamage(hp)
      requestSave()
    },
    [onPlayerDamage, patchAchievementRun, playerHp, requestSave],
  )

  // Extract tutorial state early so callbacks can reference them
  const tutorialActive = tutorial.active
  const tutorialStep = tutorial.step

  // During the prologue the ship is a scripted showcase flying the full loadout
  // in the sim (see prologueTick in game-tick.ts), but the real save's upgrades
  // are still minimal. Mirror the showcase tiers into the HUD panel so the intro
  // lists every power the player is actually flying with. Mirrors the grants in
  // prologueTick + PROLOGUE_SHIP; normal play uses the real save unchanged.
  const hudUpgrades = useMemo<Upgrades>(
    () =>
      tutorialStep.startsWith('prologue-')
        ? {
            ...upgrades,
            blaster: PROLOGUE_SHIP.blasterTier,
            collector: 5,
            storage: 6,
            missiles: PROLOGUE_SHIP.missileTier,
            options: PROLOGUE_SHIP.optionCount,
            speed: 5,
            shield: PROLOGUE_SHIP.shieldCharges,
            hull: 3,
            armor: 3,
            drone: 4,
            smartBomb: 1,
            refinery: 1,
            exoticHull: 1,
            wormhole: 2,
          }
        : upgrades,
    [tutorialStep, upgrades],
  )

  const handleStationRange = useCallback(
    (inRange: boolean) => {
      // Close the trade menu when the ship leaves station range — but keep
      // it open during tutorial trade steps so the player can finish the
      // scripted sell/buy beats even if their drift carries them out.
      if (
        !inRange &&
        !(tutorialActive && (tutorialStep === 'trade-sell' || tutorialStep === 'trade-buy'))
      ) {
        lastTradeCloseAtRef.current = Date.now()
        setTradeMenuOpen(false)
      }
    },
    [tutorialActive, tutorialStep],
  )

  // Auto-open the trade menu when the ship physically touches the station
  // and the sector is clear (no hostiles within radar range — the tick
  // does the proximity check and only fires this callback when allowed).
  //
  // Two additional gates layered on top of the contact event:
  //   1. "No business" suppression — if the player can't sell anything AND
  //      can't afford the cheapest upgrade, the modal would just be a
  //      paused screen with everything dimmed. Skip it; they'll dock for
  //      real once they have scrap or materials. Tutorial trade beats
  //      bypass this so the tutorial can't get stuck.
  //   2. Reopen cooldown — after the player closes the menu, give a short
  //      grace window before contact can re-trigger. Without it, drifting
  //      out the back of the structure and corner-clipping the ring on
  //      the way around pops the modal back open the moment you're gone.
  const handleStationContact = useCallback(() => {
    if (tradeMenuOpen) return

    const inTutorialDock =
      tutorialActive &&
      (tutorialStep === 'approach-station' ||
        tutorialStep === 'trade-sell' ||
        tutorialStep === 'trade-buy')

    if (!inTutorialDock) {
      if (Date.now() - lastTradeCloseAtRef.current < TRADE_REOPEN_COOLDOWN_MS) return
      const hasMaterials =
        cargo.carbon > 0 ||
        cargo.silicates > 0 ||
        cargo.platinum > 0 ||
        cargo.titanium > 0 ||
        cargo.exotics > 0
      const canAffordAnything = scrap >= CHEAPEST_UPGRADE_COST
      if (!hasMaterials && !canAffordAnything) return
    }

    const nowSec = getCurrentRunTimeSec()
    patchAchievementRun((prev) => ({
      ...prev,
      touchAndGoDockOpenedAtSec: nowSec,
      touchAndGoSold: false,
      touchAndGoBought: false,
      dockedWithinThirtySecondsOfFullCargo:
        prev.dockedWithinThirtySecondsOfFullCargo ||
        (prev.cargoFilledAtSec !== null && nowSec - prev.cargoFilledAtSec <= 30),
      driveThroughStreak: 0,
      lowHpDocked: playerHp <= 1,
      dockedSinceArbiterSpawn: prev.dockedSinceArbiterSpawn || prev.arbiterSpawnActive,
    }))
    tutorial.onEnteredStation()
    setTradeMenuOpen(true)
  }, [
    cargo,
    getCurrentRunTimeSec,
    patchAchievementRun,
    playerHp,
    scrap,
    tradeMenuOpen,
    tutorial,
    tutorialActive,
    tutorialStep,
  ])

  // Touched the station but hostiles are in range — flash a brief banner
  // so the player understands the dock is locked, then auto-clear it.
  const handleStationContactBlocked = useCallback(() => {
    setStationBlockedBanner(true)
  }, [])

  const handleSell = useCallback(() => {
    const soldCargo = {
      fragments: cargo.fragments,
      carbon: cargo.carbon,
      silicates: cargo.silicates,
      platinum: cargo.platinum,
      titanium: cargo.titanium,
      exotics: cargo.exotics,
    }
    const earned = sellMaterials()
    patchMetrics((prev) => ({
      ...prev,
      totalScrapMined: prev.totalScrapMined + earned,
      totalSales: prev.totalSales + 1,
      bestSaleValue: Math.max(prev.bestSaleValue, earned),
      soldByMineral: {
        carbon: prev.soldByMineral.carbon + soldCargo.carbon,
        silicates: prev.soldByMineral.silicates + soldCargo.silicates,
        platinum: prev.soldByMineral.platinum + soldCargo.platinum,
        titanium: prev.soldByMineral.titanium + soldCargo.titanium,
        exotics: prev.soldByMineral.exotics + soldCargo.exotics,
      },
    }))
    patchAchievementRun((prev) => ({
      ...prev,
      mixedPortfolioSale:
        prev.mixedPortfolioSale ||
        (soldCargo.carbon > 0 &&
          soldCargo.silicates > 0 &&
          soldCargo.platinum > 0 &&
          soldCargo.titanium > 0 &&
          soldCargo.exotics > 0),
      soldFullCargo: prev.soldFullCargo || soldCargo.fragments >= cargo.capacity,
      soldTenExotics: prev.soldTenExotics || soldCargo.exotics >= 10,
      touchAndGoSold: prev.touchAndGoDockOpenedAtSec !== null ? true : prev.touchAndGoSold,
      cargoFilledAtSec: null,
    }))
    tutorial.onSoldMaterials()
  }, [cargo, patchAchievementRun, patchMetrics, sellMaterials, tutorial])

  const handleBuy = useCallback(
    (type: keyof Upgrades, cost: number) => {
      const nextUpgrades: Upgrades = {
        ...upgrades,
        [type]:
          type === 'smartBomb' ||
          type === 'lazer' ||
          type === 'autoTool' ||
          type === 'ripple' ||
          type === 'spread' ||
          type === 'missileBias' ||
          type === 'thrusters' ||
          type === 'droneRepair'
            ? 1
            : Math.min(
                upgrades[type] + 1,
                type === 'missiles'
                  ? 8
                  : type === 'options'
                    ? 2
                    : type === 'armor' ||
                        type === 'shield' ||
                        type === 'hull' ||
                        type === 'cooling' ||
                        type === 'magnet' ||
                        type === 'bounty' ||
                        type === 'sensor' ||
                        type === 'drillNose'
                      ? 3
                      : type === 'drone'
                        ? 4
                        : 5,
              ),
      }
      buyUpgrade(type, cost, (ok) => {
        if (!ok) {
          playCannotBuy()
          return
        }
        playBuyRegister()
        const defensivePurchase = type === 'shield' || type === 'hull' || type === 'armor'
        if (type === 'collector') {
          // upgrades.collector hasn't applied yet (setState scheduled); pass +1
          gameCanvasRef.current?.setCollectorTier(upgrades.collector + 1)
        }
        gameCanvasRef.current?.setCombatUpgrades(nextUpgrades)
        patchAchievementRun((prev) => ({
          ...prev,
          touchAndGoBought: prev.touchAndGoDockOpenedAtSec !== null ? true : prev.touchAndGoBought,
          lowHpDefensivePurchase:
            prev.lowHpDefensivePurchase || (prev.lowHpDocked && defensivePurchase),
        }))
        // First-ever Drone Bay purchase pops a one-time explainer so the
        // player knows the radar is a command surface and that they still
        // need to *build* individual drones at the station.
        if (type === 'drone' && upgrades.drone === 0 && activeProfile) {
          const key = `fracking-asteroids-drone-tutorial-${activeProfile}`
          if (typeof localStorage !== 'undefined' && !localStorage.getItem(key)) {
            localStorage.setItem(key, '1')
            setDronePopupVisible(true)
          }
        }
        if (tutorial.active) {
          tutorial.onBoughtUpgrade()
        }
        requestSave()
      })
    },
    [activeProfile, buyUpgrade, patchAchievementRun, requestSave, tutorial, upgrades],
  )

  // React-side mirror of the scene's drone count so the trade menu can
  // disable the build button at cap. The scene owns the authoritative count;
  // we just bump this state after a successful build to trigger a re-render.
  const [droneCount, setDroneCount] = useState(0)

  const handleBuildDrone = useCallback(() => {
    if (droneCount >= upgrades.drone) return
    if (!spendScrap(MINING_DRONE_BUILD_COST)) return
    const ok = gameCanvasRef.current?.buildMiningDrone() ?? false
    if (!ok) return
    playBuyRegister()
    setDroneCount((n) => n + 1)
    patchMetrics((prev) => ({
      ...prev,
      totalDronesBuilt: prev.totalDronesBuilt + 1,
    }))
  }, [droneCount, patchMetrics, spendScrap, upgrades.drone])

  const handleBuyLazer = useCallback(() => {
    if (hasLazer) return
    buyUpgrade('lazer', LAZER_COST, (ok) => {
      if (!ok) {
        playCannotBuy()
        return
      }
      playBuyRegister()
      // Push the upgrade change into the scene before swapping tools, so the
      // scene's lazerUnlocked flag is true by the time setMiningTool runs.
      const next = { ...upgrades, lazer: 1 }
      gameCanvasRef.current?.setCombatUpgrades(next)
      setActiveTool('lazer')
      gameCanvasRef.current?.setMiningTool('lazer')
      patchAchievementRun((prev) => ({
        ...prev,
        touchAndGoBought: prev.touchAndGoDockOpenedAtSec !== null ? true : prev.touchAndGoBought,
      }))
      requestSave()
    })
  }, [buyUpgrade, hasLazer, patchAchievementRun, requestSave, upgrades])

  const handleCloseTradeMenu = useCallback(() => {
    // Prevent closing during tutorial trade steps — player must complete sell/buy
    if (tutorialActive && (tutorialStep === 'trade-sell' || tutorialStep === 'trade-buy')) return
    const nowSec = getCurrentRunTimeSec()
    patchAchievementRun((prev) => ({
      ...prev,
      touchAndGoComplete:
        prev.touchAndGoComplete ||
        (prev.touchAndGoDockOpenedAtSec !== null &&
          prev.touchAndGoSold &&
          prev.touchAndGoBought &&
          nowSec - prev.touchAndGoDockOpenedAtSec <= 20),
      touchAndGoDockOpenedAtSec: null,
      touchAndGoSold: false,
      touchAndGoBought: false,
      lowHpDocked: false,
    }))
    lastTradeCloseAtRef.current = Date.now()
    setTradeMenuOpen(false)
  }, [getCurrentRunTimeSec, patchAchievementRun, tutorialActive, tutorialStep])

  const handleStationDriveThrough = useCallback(() => {
    patchMetrics((prev) => ({
      ...prev,
      stationDriveThroughs: prev.stationDriveThroughs + 1,
    }))
    patchAchievementRun((prev) => {
      const nextStreak = prev.driveThroughStreak + 1
      return {
        ...prev,
        driveThroughStreak: nextStreak,
        bestDriveThroughStreak: Math.max(prev.bestDriveThroughStreak, nextStreak),
      }
    })
    tutorial.onDroveThroughStation()
  }, [patchAchievementRun, patchMetrics, tutorial])

  const handleToolChange = useCallback((tool: MiningTool) => {
    setActiveTool(tool)
  }, [])

  const handleEnemyDestroyed = useCallback(
    (kind?: EnemyKind) => {
      patchMetrics((prev) => ({
        ...prev,
        totalEnemyKills: prev.totalEnemyKills + 1,
      }))
      if (kind === 'splitter') {
        patchAchievementRun((prev) => ({ ...prev, splitterDestroyed: true }))
      }
    },
    [patchAchievementRun, patchMetrics],
  )

  const handleEnemyDestroyedEvent = useCallback(
    (kind?: EnemyKind) => {
      tutorial.onEnemyDestroyed()
      handleEnemyDestroyed(kind)
    },
    [handleEnemyDestroyed, tutorial],
  )

  const handleAsteroidsDestroyed = useCallback(
    (count: number) => {
      patchMetrics((prev) => ({
        ...prev,
        totalAsteroidsDestroyed: prev.totalAsteroidsDestroyed + count,
      }))
    },
    [patchMetrics],
  )

  const handleRallyPointSet = useCallback(() => {
    patchAchievementRun((prev) => ({ ...prev, rallySetThisRun: true }))
  }, [patchAchievementRun])

  const handleDroneScrapDelivered = useCallback(
    (amount: number, dockedCount: number) => {
      const nowSec = getCurrentRunTimeSec()
      patchMetrics((prev) => ({
        ...prev,
        totalScrapMined: prev.totalScrapMined + amount,
        totalDroneScrapDelivered: prev.totalDroneScrapDelivered + amount,
        bestDroneDockBurst: Math.max(prev.bestDroneDockBurst, dockedCount),
      }))
      patchAchievementRun((prev) => {
        const nextEvents = [...prev.droneDockEventsSec, ...Array.from({ length: dockedCount }, () => nowSec)].filter(
          (stamp) => nowSec - stamp <= 10,
        )
        return {
          ...prev,
          droneScrapThisRun: prev.droneScrapThisRun + amount,
          droneDockEventsSec: nextEvents,
          bestDroneDockBurst: Math.max(prev.bestDroneDockBurst, nextEvents.length),
        }
      })
    },
    [getCurrentRunTimeSec, patchAchievementRun, patchMetrics],
  )

  const handleDroneRebuilt = useCallback(() => {
    patchMetrics((prev) => ({
      ...prev,
      totalDroneRebuilds: prev.totalDroneRebuilds + 1,
    }))
  }, [patchMetrics])

  const handleDrillNoseAsteroidFinished = useCallback(
    (count: number) => {
      patchMetrics((prev) => ({
        ...prev,
        drillNoseAsteroidFinishes: prev.drillNoseAsteroidFinishes + count,
      }))
    },
    [patchMetrics],
  )

  const handleShieldChanged = useCallback(
    (charges: number) => {
      patchAchievementRun((prev) => ({
        ...prev,
        tookHitThisRun: true,
        shieldAbsorbedThisRun: true,
      }))
      setUpgradeLevel('shield', charges)
      requestSave()
    },
    [patchAchievementRun, requestSave, setUpgradeLevel],
  )

  const handleArmorChanged = useCallback(
    (charges: number) => {
      patchAchievementRun((prev) => ({
        ...prev,
        tookHitThisRun: true,
        armorAbsorbedThisRun: true,
      }))
      setUpgradeLevel('armor', charges)
      requestSave()
    },
    [patchAchievementRun, requestSave, setUpgradeLevel],
  )

  // A hull module was torn off (or restocked at the station). Mirror the new
  // count into upgrades.hull — setCombatUpgrades in the scene re-applies the
  // visual modules on the next sync, keeping the bolt-on pieces in lockstep
  // with the charge count.
  const handleHullChanged = useCallback(
    (charges: number) => {
      patchAchievementRun((prev) => ({
        ...prev,
        tookHitThisRun: true,
        hullAbsorbedThisRun: true,
      }))
      setUpgradeLevel('hull', charges)
      requestSave()
    },
    [patchAchievementRun, requestSave, setUpgradeLevel],
  )

  const handleSmartBomb = useCallback(() => {
    patchAchievementRun((prev) => ({
      ...prev,
      tookHitThisRun: true,
      smartBombRecoveredAtSec: getCurrentRunTimeSec(),
    }))
    setUpgradeLevel('smartBomb', 0)
    requestSave()
  }, [getCurrentRunTimeSec, patchAchievementRun, requestSave, setUpgradeLevel])

  const handleArbiterEvent = useCallback((event: ArbiterEvent) => {
    const text =
      event.type === 'arrives'
        ? arbiterArrivalLine(event.mark)
        : event.type === 'defeated'
          ? arbiterDefeatLine(event.mark)
          : arbiterWithdrawLine(event.mark)
    setArbiterBanner({ text, key: Date.now() })
    if (event.type === 'arrives') {
      patchAchievementRun((prev) => ({
        ...prev,
        arbiterSpawnActive: true,
        dockedSinceArbiterSpawn: false,
      }))
      return
    }
    if (event.type === 'defeated') {
      patchMetrics((prev) => ({
        ...prev,
        totalArbitersDefeated: prev.totalArbitersDefeated + 1,
        maxArbiterMarkDefeated: Math.max(prev.maxArbiterMarkDefeated, event.mark),
      }))
      patchAchievementRun((prev) => ({
        ...prev,
        arbiterSpawnActive: false,
        arbiterDefeatedWithoutDocking:
          prev.arbiterDefeatedWithoutDocking || !prev.dockedSinceArbiterSpawn,
        arbiterDefeatedWithActiveDrone:
          prev.arbiterDefeatedWithActiveDrone || droneCount > 0,
      }))
      return
    }
    patchMetrics((prev) => ({
      ...prev,
      arbiterWithdrawals: prev.arbiterWithdrawals + 1,
    }))
    patchAchievementRun((prev) => ({ ...prev, arbiterSpawnActive: false }))
  }, [droneCount, patchAchievementRun, patchMetrics])

  const handleRunEnded = useCallback(
    (stats: RunStats) => {
      setRunStats(stats)
      setLiveRunTimeSec(stats.runTime)
      setIsNewBest(stats.score > highScore)
      setHighScore((best) => Math.max(best, stats.score))
      setRunOver(true)
      patchMetrics((prev) => ({
        ...prev,
        totalRuns: prev.totalRuns + 1,
        maxLedgerReached: Math.max(prev.maxLedgerReached, Math.round(stats.peakLedger)),
      }))
    },
    [highScore, patchMetrics],
  )

  const handleContinue = useCallback(() => {
    gameCanvasRef.current?.respawnAfterDeath()
    resetRunCargo()
    setRunStats(null)
    setRunOver(false)
    setLiveRunTimeSec(0)
    resetAchievementRun({ continuedAfterDeath: true })
    requestSave()
  }, [requestSave, resetAchievementRun, resetRunCargo])

  // Pause-menu Restart Run: reuse the death-respawn path. Same effect as
  // dying and continuing — full ship reset at the station — but invoked
  // voluntarily from the pause menu, so the run-summary screen is skipped.
  const handlePauseRestart = useCallback(() => {
    gameCanvasRef.current?.respawnAfterDeath()
    resetRunCargo()
    setRunStats(null)
    setRunOver(false)
    setLiveRunTimeSec(0)
    resetAchievementRun()
    if (paused) togglePause()
    requestSave()
  }, [paused, requestSave, resetAchievementRun, resetRunCargo, togglePause])

  // Pause-menu Quit to Title: drop back to the title screen. The scene
  // unmounts naturally when `screen` changes; persistence already flushed
  // any in-progress upgrades.
  const handlePauseQuit = useCallback(() => {
    if (paused) togglePause()
    setScreen('start')
    playMenuLoop()
  }, [paused, togglePause])

  // Audio dampening: drop output to ~35% while the pause menu is up so the
  // ambience is present but the menu reads clearly. Restored on resume.
  useEffect(() => {
    setPauseDampening(paused)
  }, [paused])

  // Mirror "cargo hold full" into the scene so it can flash the station chevron
  // once the hold is full during normal play (the scene owns the arrow; React
  // owns the authoritative cargo count). Drives the player back to cash in.
  useEffect(() => {
    gameCanvasRef.current?.setCargoFull(cargo.fragments >= cargo.capacity)
  }, [cargo.fragments, cargo.capacity])

  // Snapshot in-progress run stats whenever the pause menu opens. We sample
  // once per open rather than streaming so the menu doesn't trigger a render
  // every tick — the numbers freeze at the pause moment, which is what the
  // player expects.
  const [pauseRunStats, setPauseRunStats] = useState<PauseRunStats | null>(null)
  useEffect(() => {
    if (!paused) {
      setPauseRunStats(null)
      return
    }
    const snap = gameCanvasRef.current?.getRunStats() ?? null
    setPauseRunStats(snap)
  }, [paused])

  // Photo mode — a special pause-style state where the simulation freezes
  // but the camera can free-pan with WASD/arrows for framing screenshots.
  // The HUD and pause menu both hide while photo mode is active so the
  // captured frame is clean.
  const [photoMode, setPhotoMode] = useState(false)
  const handleEnterPhotoMode = useCallback(() => {
    setPhotoMode(true)
    gameCanvasRef.current?.setPhotoMode(true)
    // Keep the simulation frozen — paused is already true (we're inside the
    // pause menu when this fires), but we also need to dismiss the menu so
    // the canvas is visible. Calling togglePause flips paused → false, so
    // instead we leave paused true and just hide the menu via photoMode.
  }, [])
  const handleExitPhotoMode = useCallback(() => {
    setPhotoMode(false)
    gameCanvasRef.current?.setPhotoMode(false)
    // Exit returns to live play. The user entered photo mode FROM the
    // pause menu (paused was already true), so we now flip pause off so
    // the game resumes instead of dropping them back into the pause menu.
    if (paused) togglePause()
  }, [paused, togglePause])
  const handleScreenshot = useCallback(async (): Promise<Blob | null> => {
    const blob = (await gameCanvasRef.current?.takeScreenshot()) ?? null
    if (!blob) return null
    patchMetrics((prev) => ({
      ...prev,
      totalPhotosTaken: prev.totalPhotosTaken + 1,
    }))
    const arbiterVisible =
      arbiterHud !== null ||
      tutorialStep === 'prologue-arbiter' ||
      tutorialStep === 'prologue-dialogue' ||
      tutorialStep === 'prologue-strip'
    if (arbiterVisible) {
      patchAchievementRun((prev) => ({ ...prev, photoWithArbiterTaken: true }))
    }
    return blob
  }, [arbiterHud, patchAchievementRun, patchMetrics, tutorialStep])

  // First-time black-hole warning. Scene fires onBlackHoleNearby once per
  // session when the player closes inside the warn radius; we gate against
  // a per-slot localStorage flag so it only ever shows on the first run
  // where the player actually approaches the singularity.
  const handleBlackHoleNearby = useCallback(() => {
    patchAchievementRun((prev) => ({ ...prev, blackHoleWarned: true }))
    if (!activeProfile) return
    if (typeof localStorage === 'undefined') return
    const key = `fracking-asteroids-black-hole-tutorial-${activeProfile}`
    if (localStorage.getItem(key)) return
    setBlackHolePopupVisible(true)
  }, [activeProfile, patchAchievementRun])

  const handleBlackHoleEscaped = useCallback(() => {
    patchAchievementRun((prev) =>
      prev.blackHoleWarned ? { ...prev, blackHoleEscapedThisRun: true, blackHoleWarned: false } : prev,
    )
  }, [patchAchievementRun])

  const handleBlackHoleSurvived = useCallback(() => {
    patchAchievementRun((prev) =>
      prev.blackHoleSurvivedThisRun ? prev : { ...prev, blackHoleSurvivedThisRun: true },
    )
  }, [patchAchievementRun])

  const handleWormholeTeleported = useCallback(() => {
    patchAchievementRun((prev) =>
      prev.wormholeUsedThisRun ? prev : { ...prev, wormholeUsedThisRun: true },
    )
  }, [patchAchievementRun])

  const handleDismissBlackHolePopup = useCallback(() => {
    setBlackHolePopupVisible(false)
    if (!activeProfile) return
    try {
      localStorage.setItem(`fracking-asteroids-black-hole-tutorial-${activeProfile}`, '1')
    } catch {
      // localStorage may be disabled; the per-session scene latch still
      // prevents repeat triggers within this run.
    }
  }, [activeProfile])

  // First-encounter tutorial popup helpers — same gate-on-localStorage pattern
  // as the black-hole and drone popups so each only ever shows once per slot.
  // The scene already latches per-session to avoid spamming within a run; the
  // localStorage flag persists that "already seen" across sessions.
  function makeFirstEncounter(
    storageSuffix: string,
    setVisible: (v: boolean) => void,
  ): {
    onFire: () => void
    onDismiss: () => void
  } {
    return {
      onFire: (): void => {
        if (!activeProfile || typeof localStorage === 'undefined') return
        const key = `fracking-asteroids-${storageSuffix}-${activeProfile}`
        if (localStorage.getItem(key)) return
        setVisible(true)
      },
      onDismiss: (): void => {
        setVisible(false)
        if (!activeProfile) return
        try {
          localStorage.setItem(`fracking-asteroids-${storageSuffix}-${activeProfile}`, '1')
        } catch {
          // localStorage disabled — fall back to per-session latching only.
        }
      },
    }
  }
  const defensePopup = useMemo(
    () => makeFirstEncounter('defense-tutorial', setDefensePopupVisible),
    // makeFirstEncounter closes over `activeProfile`; recreate when the slot
    // changes so per-slot persistence stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfile],
  )
  const formationPopup = useMemo(
    () => makeFirstEncounter('formation-tutorial', setFormationPopupVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfile],
  )
  const splitterPopup = useMemo(
    () => makeFirstEncounter('splitter-tutorial', setSplitterPopupVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfile],
  )

  // Self-clear the "sector hot, dock locked" banner ~1.6s after it fires.
  // Re-touching the station while hostiles are still in range will retrigger
  // it (the tick's wasInStationContact latch resets when the ship pulls
  // back out of the auto-trade ring).
  useEffect(() => {
    if (!stationBlockedBanner) return
    const id = setTimeout(() => setStationBlockedBanner(false), 1600)
    return () => clearTimeout(id)
  }, [stationBlockedBanner])

  const handleSkipTutorial = useCallback(() => {
    // Only reset the world when skipping during the prologue (to swap the prologue
    // ship for the normal one). Skipping mid-tutorial preserves progress.
    const wasInPrologue = tutorial.step.startsWith('prologue-')
    tutorial.skip()
    lastTradeCloseAtRef.current = Date.now()
    setTradeMenuOpen(false)
    setPrologueFade('none')
    if (wasInPrologue) {
      gameCanvasRef.current?.resetShipToStation()
      // resetShipToStation wipes scene unlocks back to defaults — push the
      // player's actual upgrades back in so a bought lazer/ripple survives.
      gameCanvasRef.current?.setCombatUpgrades(upgrades)
      // Drop any scrap/cargo from the maxed prologue ship so the real run
      // starts from zero (see prologue-fade respawn for the same reasoning).
      resetForRunStart()
      setPrologueSeen(true)
      requestSave()
    }
  }, [tutorial, upgrades, resetForRunStart, requestSave])

  // --- Prologue fade-to-black and respawn sequence ---
  const [prologueFade, setPrologueFade] = useState<
    'none' | 'fading-in' | 'black' | 'rebooting' | 'fading-out'
  >('none')

  const prologueRespawnRef = useRef(tutorial.onPrologueRespawnComplete)
  const prologueVoiceRefs = useRef<HTMLAudioElement[]>([])
  const playedPrologueFadeVoicesRef = useRef(new Set<string>())
  useEffect(() => {
    prologueRespawnRef.current = tutorial.onPrologueRespawnComplete
  }, [tutorial.onPrologueRespawnComplete])

  useEffect(() => {
    if (tutorialStep !== 'prologue-fade') return
    const timers: ReturnType<typeof setTimeout>[] = []
    setPrologueFade('fading-in')

    timers.push(
      setTimeout(() => {
        setPrologueFade('black')
        gameCanvasRef.current?.resetShipToStation()
        // Same as above — the scene reset clobbers unlocks; re-sync.
        gameCanvasRef.current?.setCombatUpgrades(upgrades)

        timers.push(
          setTimeout(() => {
            setPrologueFade('rebooting')

            timers.push(
              setTimeout(() => {
                setPrologueFade('fading-out')

                timers.push(
                  setTimeout(() => {
                    setPrologueFade('none')
                    // Wipe any scrap/cargo earned during the prologue — the
                    // intro ship is intentionally overpowered, so carrying
                    // its haul into the real run would let players buy the
                    // lazer immediately and skip the early-game economy.
                    resetForRunStart()
                    setPrologueSeen(true)
                    prologueRespawnRef.current()
                    requestSave()
                  }, 1500),
                )
              }, 2000),
            )
          }, 1500),
        )
      }, 1500),
    )

    return () => timers.forEach(clearTimeout)
  }, [tutorialStep, upgrades, resetForRunStart, requestSave])

  useEffect(() => {
    const voiceSrc =
      prologueFade === 'fading-in'
        ? FRACKER_SYSTEMS_OFFLINE
        : prologueFade === 'rebooting'
          ? FRACKER_REBOOTING
          : null
    if (!voiceSrc || playedPrologueFadeVoicesRef.current.has(prologueFade)) return

    playedPrologueFadeVoicesRef.current.add(prologueFade)
    const voice = playVoice(voiceSrc, 0.62)
    prologueVoiceRefs.current.push(voice)
    voice.addEventListener(
      'ended',
      () => {
        prologueVoiceRefs.current = prologueVoiceRefs.current.filter((item) => item !== voice)
      },
      { once: true },
    )
  }, [prologueFade])

  useEffect(() => {
    return () => {
      for (const voice of prologueVoiceRefs.current) {
        voice.pause()
      }
      prologueVoiceRefs.current = []
    }
  }, [])

  const inPrologue = tutorialStep.startsWith('prologue-')
  const previousTutorialStepRef = useRef(tutorialStep)

  useEffect(() => {
    const previous = previousTutorialStepRef.current
    previousTutorialStepRef.current = tutorialStep
    if (previous !== 'done' && tutorialStep === 'done') {
      resetAchievementRun()
      setLiveRunTimeSec(0)
      setIsNewGame(false)
    }
  }, [resetAchievementRun, tutorialStep])

  useEffect(() => {
    if (screen !== 'game') return
    const sync = (): void => {
      const snap = gameCanvasRef.current?.getRunStats()
      if (!snap) return
      setLiveRunTimeSec(snap.runTimeSec)
    }
    sync()
    const id = window.setInterval(sync, 250)
    return () => window.clearInterval(id)
  }, [screen])

  useEffect(() => {
    if (tutorialStep !== 'done') return
    if (cargo.fragments < cargo.capacity) return
    setAchievementRun((prev) =>
      prev.cargoFilledAtSec === null
        ? { ...prev, cargoFilledAtSec: getCurrentRunTimeSec() }
        : prev,
    )
  }, [cargo.capacity, cargo.fragments, getCurrentRunTimeSec, tutorialStep])


  // Tutorial catch-up: auto-advance trade steps when their conditions are already met.
  // This prevents the tutorial from getting stuck if the player performed actions
  // (opened trade, sold materials, bought upgrades) before the tutorial reached those steps.
  const onEnteredStation = tutorial.onEnteredStation
  const onSoldMaterials = tutorial.onSoldMaterials
  const onBoughtUpgrade = tutorial.onBoughtUpgrade
  const onCargoFilled = tutorial.onCargoFilled

  // Advance the 'collect' beat once the (small, 25) starting hold is full, which
  // is what now sends the player to dock. Replenishment during the tutorial
  // mining beat guarantees enough ore to reach this.
  useEffect(() => {
    if (!tutorialActive) return
    if (tutorialStep === 'collect' && cargo.fragments >= cargo.capacity) {
      onCargoFilled()
    }
  }, [tutorialActive, tutorialStep, cargo.fragments, cargo.capacity, onCargoFilled])

  useEffect(() => {
    if (!tutorialActive) return
    if (tutorialStep === 'approach-station' && tradeMenuOpen) {
      onEnteredStation()
    }
  }, [tutorialActive, tutorialStep, tradeMenuOpen, onEnteredStation])

  useEffect(() => {
    if (!tutorialActive) return
    if (
      tutorialStep === 'trade-sell' &&
      cargo.carbon === 0 &&
      cargo.silicates === 0 &&
      cargo.platinum === 0 &&
      cargo.titanium === 0 &&
      cargo.exotics === 0
    ) {
      onSoldMaterials()
    }
  }, [
    tutorialActive,
    tutorialStep,
    cargo.carbon,
    cargo.silicates,
    cargo.platinum,
    cargo.titanium,
    cargo.exotics,
    onSoldMaterials,
  ])

  useEffect(() => {
    if (!tutorialActive) return
    // The final tutorial beat now forces the (free) Cargo Expansion, taking the
    // new player from the starter 25 hold up to the normal 50.
    if (tutorialStep === 'trade-buy' && upgrades.storage > 1) {
      onBoughtUpgrade()
    }
  }, [tutorialActive, tutorialStep, upgrades.storage, onBoughtUpgrade])

  // --- In-game gamepad layer ---
  // Walks DOM focus across overlay buttons (Trade Menu, Tutorial, Prologue,
  // Lazer popup) when any of those are visible; A clicks focused item, B
  // closes via [data-menu-back]. When no overlay is visible there are no
  // [data-menu-item] elements in the DOM, so input is a silent no-op and
  // doesn't fight the in-canvas gamepad handler in scene.ts (which uses left
  // stick / right stick / RT only).
  const inGameOverlayKey = paused
    ? 'paused'
    : runOver
      ? 'run-over'
      : dronePopupVisible
        ? 'popup:drone'
        : blackHolePopupVisible
          ? 'popup:black-hole'
          : defensePopupVisible
            ? 'popup:defense'
            : formationPopupVisible
              ? 'popup:formation'
              : splitterPopupVisible
                ? 'popup:splitter'
                : tradeMenuOpen
                  ? 'trade'
                  : tutorial.active
                    ? `tut:${tutorial.step}:${tutorial.frozen ? 'frozen' : 'active'}`
                    : ''
  useGamepadMenu({
    enabled: screen === 'game',
    resetKey: inGameOverlayKey,
  })
  // Start button (Standard Gamepad button 9) toggles pause during gameplay.
  const gamepadPauseEnabled =
    screen === 'game' &&
    (paused ||
      (!tradeMenuOpen &&
        !dronePopupVisible &&
        !blackHolePopupVisible &&
        !defensePopupVisible &&
        !formationPopupVisible &&
        !splitterPopupVisible &&
        !runOver &&
        !photoMode))
  useGamepadButton(9, togglePause, gamepadPauseEnabled)

  // ESC toggles pause during gameplay. Skipped while the trade menu or run
  // summary owns the screen so it doesn't double-fire with their own close
  // handlers.
  useEffect(() => {
    if (screen !== 'game') return
    if (tradeMenuOpen || runOver) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape') return
      e.preventDefault()
      togglePause()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, tradeMenuOpen, runOver, togglePause])

  // The old approach-station freeze pinned the ship inside the FAB's NEAR
  // range so the player had to click the button. With auto-open via physical
  // contact the player needs to keep flying *into* the station, so freezing
  // them here would lock them just outside the trigger ring. Step now
  // advances naturally when handleStationContact fires onEnteredStation.
  const shopTutorialFreeze = false
  const currentRunTimeSec = runOver && runStats ? runStats.runTime : liveRunTimeSec
  const achievementContext = useMemo(
    () => ({
      achievements,
      metrics,
      cargo,
      upgrades,
      hasLazer,
      ledger,
      droneCount,
      tutorialStep,
      runTimeSec: currentRunTimeSec,
      run: achievementRun,
    }),
    [
      achievementRun,
      achievements,
      cargo,
      currentRunTimeSec,
      droneCount,
      hasLazer,
      ledger,
      metrics,
      tutorialStep,
      upgrades,
    ],
  )
  const achievementItems = useMemo(
    () =>
      ACHIEVEMENTS.map((achievement) => ({
        achievement,
        unlocked: achievements.includes(achievement.id),
        progress: getAchievementProgress(achievement.id, achievementContext),
      })),
    [achievementContext, achievements],
  )
  const currentToastAchievement = useMemo(
    () => (achievementQueue.length > 0 ? getAchievement(achievementQueue[0]) ?? null : null),
    [achievementQueue],
  )

  useEffect(() => {
    // No achievements unlock during the prologue showcase. 'done' (and every
    // real-play step) isn't a prologue step, so the completion achievement and
    // all normal unlocks still fire once onboarding ends.
    if (inPrologueRef.current) return
    const unlocked = findNewAchievementUnlocks(achievementContext)
    if (unlocked.length === 0) return

    setAchievements((prev) => {
      const known = new Set(prev)
      const next = [...prev]
      for (const achievement of unlocked) {
        if (known.has(achievement.id)) continue
        known.add(achievement.id)
        next.push(achievement.id)
      }
      return next
    })
    setAchievementQueue((prev) => {
      const known = new Set(prev)
      const next = [...prev]
      for (const achievement of unlocked) {
        if (known.has(achievement.id)) continue
        known.add(achievement.id)
        next.push(achievement.id)
      }
      return next
    })
    requestSave()
  }, [achievementContext, requestSave, setAchievements])

  if (screen === 'title' || screen === 'profile-select' || screen === 'start') {
    return (
      <main className="relative w-screen h-dvh overflow-hidden bg-space-900">
        {screen === 'title' && <TitleScreen onBegin={handleTitleBegin} />}
        {screen === 'profile-select' && (
          <ProfileSelectScreen onSelectProfile={handleProfileSelect} />
        )}
        {screen === 'start' && (
          <StartScreen
            onPlay={handlePlay}
            onEraseProfile={handleEraseProfile}
            onBackToProfiles={() => setScreen('profile-select')}
            profileMetrics={metrics}
            profileHighScore={highScore}
            achievementItems={achievementItems}
          />
        )}
      </main>
    )
  }

  return (
    <main className="relative w-screen h-dvh overflow-hidden bg-space-900">
      <GameCanvas
        ref={gameCanvasRef}
        paused={
          paused ||
          tradeMenuOpen ||
          dronePopupVisible ||
          blackHolePopupVisible ||
          defensePopupVisible ||
          formationPopupVisible ||
          splitterPopupVisible ||
          runOver ||
          photoMode
        }
        frozen={tutorial.frozen || shopTutorialFreeze}
        tutorialStep={tutorial.step}
        onCollect={handleCollect}
        onShipMoved={tutorial.onShipMoved}
        onAsteroidHit={tutorial.onAsteroidHit}
        onAsteroidsDestroyed={handleAsteroidsDestroyed}
        onMetalSpawned={tutorial.onMetalSpawned}
        onMetalCollected={tutorial.onMetalCollected}
        onPlayerDamage={handlePlayerDamage}
        onScrapCollect={handleScrapCollect}
        onEnemyNearby={tutorial.onEnemyNearby}
        onEnemyDestroyed={handleEnemyDestroyedEvent}
        onScrapCollected={tutorial.onScrapCollected}
        onNearStation={tutorial.onNearStation}
        onStationRange={handleStationRange}
        onStationContact={handleStationContact}
        onStationContactBlocked={handleStationContactBlocked}
        onStationDriveThrough={handleStationDriveThrough}
        onRallyPointSet={handleRallyPointSet}
        onToolChange={handleToolChange}
        onLedgerChanged={setLedger}
        onArbiterChanged={setArbiterHud}
        onArbiterEvent={handleArbiterEvent}
        onRunEnded={handleRunEnded}
        onShieldChanged={handleShieldChanged}
        onMiningDroneCountChanged={setDroneCount}
        onDroneScrapDelivered={handleDroneScrapDelivered}
        onDroneRebuilt={handleDroneRebuilt}
        onArmorChanged={handleArmorChanged}
        onHullChanged={handleHullChanged}
        onSmartBomb={handleSmartBomb}
        onBlackHoleNearby={handleBlackHoleNearby}
        onBlackHoleEscaped={handleBlackHoleEscaped}
        onBlackHoleSurvived={handleBlackHoleSurvived}
        onWormholeTeleported={handleWormholeTeleported}
        onDrillNoseAsteroidFinished={handleDrillNoseAsteroidFinished}
        onFirstDefensiveHit={defensePopup.onFire}
        onFirstFormation={formationPopup.onFire}
        onFirstSplitter={splitterPopup.onFire}
        onPrologueReady={tutorial.onPrologueReady}
        onFieldCleared={tutorial.onFieldCleared}
        onArbiterArrived={tutorial.onArbiterArrived}
        onStripComplete={tutorial.onStripComplete}
        onHarvestingAreaWarning={setShowHarvestingWarning}
      />
      {!photoMode && (
        <HUD
          scrap={scrap}
          cargo={cargo}
          upgrades={hudUpgrades}
          paused={paused}
          activeTool={activeTool}
          hasLazer={hasLazer}
          droneCount={droneCount}
          ledger={ledger}
          arbiter={arbiterHud}
          isSaving={isSaving}
          achievementCount={achievements.length}
          achievementTotal={ACHIEVEMENT_COUNT}
          onPause={togglePause}
          tradeMenuOpen={tradeMenuOpen}
          runOver={runOver}
          showHarvestingWarning={showHarvestingWarning}
        />
      )}
      <AchievementToast
        achievement={currentToastAchievement}
        onDone={() => setAchievementQueue((prev) => prev.slice(1))}
      />
      {!inPrologue && <ArbiterBanner banner={arbiterBanner} paused={paused} />}
      {tutorial.active && inPrologue && (
        <PrologueOverlay
          step={tutorial.step}
          onSkip={handleSkipTutorial}
          onDialogueComplete={tutorial.onDialogueComplete}
        />
      )}
      {tutorial.active && !inPrologue && (
        <TutorialOverlay
          step={tutorial.step}
          frozen={tutorial.frozen}
          tradeMenuOpen={tradeMenuOpen}
          onSkip={handleSkipTutorial}
          onDismiss={tutorial.unfreeze}
        />
      )}
      {stationBlockedBanner && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none"
          data-testid="station-locked-banner"
        >
          <div className="px-5 py-3 bg-space-800/90 border-2 border-hud-red/70 rounded-lg font-sans text-center shadow-xl animate-pulse">
            <p className="text-hud-red text-sm sm:text-base font-bold tracking-[0.2em]">
              HOSTILES IN AREA
            </p>
            <p className="text-white/60 text-xs sm:text-sm mt-1">CLEAR THE SECTOR TO DOCK</p>
          </div>
        </div>
      )}
      {tradeMenuOpen && (
        <TradeMenu
          cargo={cargo}
          scrap={scrap}
          upgrades={upgrades}
          tutorialStep={tutorial.step}
          hasLazer={hasLazer}
          droneCount={droneCount}
          onSell={handleSell}
          onBuy={handleBuy}
          onBuyLazer={handleBuyLazer}
          onBuildDrone={handleBuildDrone}
          onClose={handleCloseTradeMenu}
        />
      )}
      <DroneTutorialPopup
        visible={dronePopupVisible}
        onDismiss={() => setDronePopupVisible(false)}
      />
      <BlackHoleTutorialPopup
        visible={blackHolePopupVisible}
        onDismiss={handleDismissBlackHolePopup}
      />
      <DefenseTutorialPopup
        visible={defensePopupVisible}
        onDismiss={defensePopup.onDismiss}
      />
      <FormationTutorialPopup
        visible={formationPopupVisible}
        onDismiss={formationPopup.onDismiss}
      />
      <SplitterTutorialPopup
        visible={splitterPopupVisible}
        onDismiss={splitterPopup.onDismiss}
      />
      <PauseOverlay
        visible={paused && !photoMode}
        onResume={togglePause}
        onRestart={handlePauseRestart}
        onQuitToTitle={handlePauseQuit}
        onEnterPhotoMode={handleEnterPhotoMode}
        runStats={pauseRunStats}
        achievementItems={achievementItems}
      />
      <PhotoModeOverlay
        visible={photoMode}
        onScreenshot={handleScreenshot}
        onExit={handleExitPhotoMode}
      />
      <DebugPanel
        canvasRef={gameCanvasRef}
        onRequestSave={requestSave}
        state={{
          scrap,
          cargo,
          upgrades,
          playerHp,
          achievements,
          metrics,
          onScrapCollect,
          setUpgradeLevel,
          hydrateFromProfile: hydrateFromProfile,
        }}
      />
      {/* SoundFab used to surface while paused — replaced by the inline
          audio sliders inside PauseOverlay. The fab itself stays unmounted
          during gameplay to avoid two competing volume UIs. */}
      {runOver && runStats && (
        <RunSummary
          stats={runStats}
          highScore={highScore}
          isNewBest={isNewBest}
          onContinue={handleContinue}
        />
      )}
      {prologueFade !== 'none' && (
        <div
          className="absolute inset-0 bg-black z-50 flex items-center justify-center"
          style={
            prologueFade === 'fading-in'
              ? { animation: 'fadeIn 1.5s ease-in forwards' }
              : prologueFade === 'fading-out'
                ? { animation: 'fadeOut 1.5s ease-out forwards' }
                : undefined
          }
          data-testid="prologue-fade"
        >
          {(prologueFade === 'fading-in' || prologueFade === 'black') && (
            <p className="font-sans text-2xl sm:text-4xl tracking-widest text-hud-red/90 animate-pulse">
              Systems offline.
            </p>
          )}
          {(prologueFade === 'rebooting' || prologueFade === 'fading-out') && (
            <p className="font-sans text-lg sm:text-2xl tracking-widest text-hud-green/90 animate-pulse">
              Rebooting...
            </p>
          )}
        </div>
      )}
    </main>
  )
}
