'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { GameCanvas } from '@/components/GameCanvas'
import type { GameCanvasHandle, ArbiterEvent } from '@/components/GameCanvas'
import { HUD } from '@/components/HUD'
import { ArbiterBanner } from '@/components/ArbiterBanner'
import type { ArbiterBannerData } from '@/components/ArbiterBanner'
import { RunSummary } from '@/components/RunSummary'
import type { ArbiterHudInfo } from '@/game/arbiter-comms'
import { arbiterArrivalLine, arbiterDefeatLine, arbiterWithdrawLine } from '@/game/arbiter-comms'
import type { RunStats } from '@/game/ledger-config'
import { SoundFab } from '@/components/SoundFab'
import { TitleScreen } from '@/components/TitleScreen'
import { StartScreen } from '@/components/StartScreen'
import { TutorialOverlay } from '@/components/TutorialOverlay'
import { PrologueOverlay } from '@/components/PrologueOverlay'
import { TradeMenu, LAZER_COST, MINING_DRONE_BUILD_COST } from '@/components/TradeMenu'
import { LazerTutorialPopup } from '@/components/LazerTutorialPopup'
import { DroneTutorialPopup } from '@/components/DroneTutorialPopup'
import { PauseOverlay } from '@/components/PauseOverlay'
import { DebugPanel } from '@/components/DebugPanel'
import { ShopFab } from '@/components/ShopFab'
import { useGameState } from '@/hooks/useGameState'
import { useGamePersistence } from '@/hooks/useGamePersistence'
import { useTutorial } from '@/hooks/useTutorial'
import { playMenuLoop, enterGameplay } from '@/lib/menu-music'
import { useGamepadMenu } from '@/hooks/useGamepadMenu'
import { useGamepadButton } from '@/hooks/useGamepadButton'
import type { MiningTool, MetalVariant } from '@/game/types'
import type { Upgrades, SaveSlotId } from '@/lib/schemas'
import { getSfxVolume } from '@/game/volume-control'

type Screen = 'title' | 'start' | 'game'

const ACTIVE_SLOT_KEY = 'fracking-asteroids-active-slot'
const CRYSTALLINE_PROMPT_INTERVALS = [3, 5, 10] as const
const FRACKER_SYSTEMS_OFFLINE = './audio/vo_fracker03.wav'
const FRACKER_REBOOTING = './audio/vo_fracker04.wav'

export default function Home() {
  const [screen, setScreen] = useState<Screen>('title')
  const [activeSlot, setActiveSlot] = useState<SaveSlotId | null>(null)
  const [isNewGame, setIsNewGame] = useState(false)
  const [tradeMenuOpen, setTradeMenuOpen] = useState(false)
  const [inStationRange, setInStationRange] = useState(false)
  const [activeTool, setActiveTool] = useState<MiningTool>('blaster')
  const [lazerPopupVisible, setLazerPopupVisible] = useState(false)
  const [dronePopupVisible, setDronePopupVisible] = useState(false)
  const [ledger, setLedger] = useState(0)
  const [arbiterHud, setArbiterHud] = useState<ArbiterHudInfo | null>(null)
  const [arbiterBanner, setArbiterBanner] = useState<ArbiterBannerData | null>(null)
  const [runOver, setRunOver] = useState(false)
  const [runStats, setRunStats] = useState<RunStats | null>(null)
  const [highScore, setHighScore] = useState(0)
  const [isNewBest, setIsNewBest] = useState(false)
  const gameCanvasRef = useRef<GameCanvasHandle>(null)
  const crystallineDeflectCountRef = useRef(0)
  const nextCrystallinePromptAtRef = useRef(1)
  const crystallinePromptIntervalIndexRef = useRef(0)
  const {
    paused,
    scrap,
    cargo,
    upgrades,
    playerHp,
    playerMaxHp,
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
    metrics,
  } = useGameState()
  const hasLazer = upgrades.lazer > 0
  const { save, load } = useGamePersistence(activeSlot)
  const tutorial = useTutorial(isNewGame && screen === 'game')

  // --- Auto-save on state changes triggered by game events ---
  const [saveSeq, setSaveSeq] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  /** Request a save after the current state updates have been applied. */
  const requestSave = useCallback(() => {
    setSaveSeq((n) => n + 1)
  }, [])

  // Persist the snapshot whenever saveSeq increments (driven by game events).
  // Skip the initial render (saveSeq === 0).
  useEffect(() => {
    if (saveSeq === 0) return
    setIsSaving(true)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

    void save({
      ship: { x: 0, y: 0, rotation: 0, velocityX: 0, velocityY: 0 },
      upgrades,
      cargo: { ...cargo, scrap },
      hp: playerHp,
      highScore,
      timestamp: Date.now(),
      achievements,
      metrics,
    }).then(() => {
      saveTimeoutRef.current = setTimeout(() => {
        setIsSaving(false)
      }, 2000)
    })
  }, [saveSeq]) // eslint-disable-line react-hooks/exhaustive-deps -- save reads latest state at trigger time

  // Hydrate the slot's saved state when a game begins. Pushes upgrades and
  // collector tier into the scene so toggleable tools (lazer/ripple) stay
  // unlocked across reloads — without this, `lazerUnlocked` in the scene
  // resets to false and Q cycles only blaster.
  useEffect(() => {
    if (!activeSlot) return
    void load().then((s) => {
      if (!s) return
      setHighScore(s.highScore)
      if (isNewGame) return
      hydrateFromSave(s)
      // Defer to next tick so the scene's imperative handle is mounted.
      const id = window.setTimeout(() => {
        gameCanvasRef.current?.setCombatUpgrades(s.upgrades)
        gameCanvasRef.current?.setCollectorTier(s.upgrades.collector)
        if (s.upgrades.lazer > 0) setActiveTool('lazer')
      }, 0)
      return () => window.clearTimeout(id)
    })
  }, [activeSlot, load, isNewGame, hydrateFromSave])

  const handleTitleBegin = useCallback(() => {
    playMenuLoop()
    setScreen('start')
  }, [])

  const handleNewGame = useCallback((slotId: SaveSlotId) => {
    localStorage.setItem(ACTIVE_SLOT_KEY, slotId)
    setActiveSlot(slotId)
    setIsNewGame(true)
    enterGameplay()
    setScreen('game')
  }, [])

  const handleLoadGame = useCallback((slotId: SaveSlotId) => {
    localStorage.setItem(ACTIVE_SLOT_KEY, slotId)
    setActiveSlot(slotId)
    setIsNewGame(false)
    enterGameplay()
    setScreen('game')
  }, [])

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

  // Extract tutorial state early so callbacks can reference them
  const tutorialActive = tutorial.active
  const tutorialStep = tutorial.step

  const handleStationRange = useCallback(
    (inRange: boolean) => {
      setInStationRange(inRange)
      // Don't close trade menu if the player exits range during tutorial trade steps
      if (
        !inRange &&
        !(tutorialActive && (tutorialStep === 'trade-sell' || tutorialStep === 'trade-buy'))
      )
        setTradeMenuOpen(false)
    },
    [tutorialActive, tutorialStep],
  )

  const handleShopFabClick = useCallback(() => {
    tutorial.onEnteredStation()
    setTradeMenuOpen(true)
  }, [tutorial])

  const handleSell = useCallback(() => {
    sellMaterials()
    tutorial.onSoldMaterials()
    requestSave()
  }, [sellMaterials, tutorial, requestSave])

  const handleBuy = useCallback(
    (type: keyof Upgrades, cost: number) => {
      const nextUpgrades: Upgrades = {
        ...upgrades,
        [type]:
          type === 'shield'
            ? 3
            : type === 'smartBomb' ||
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
                          type === 'hull' ||
                          type === 'cooling' ||
                          type === 'magnet' ||
                          type === 'hullPlating' ||
                          type === 'bounty' ||
                          type === 'sensor'
                        ? 3
                        : type === 'drone'
                          ? 4
                          : 5,
                ),
      }
      buyUpgrade(type, cost, (ok) => {
        if (!ok) return
        if (type === 'blaster') {
          gameCanvasRef.current?.setFireRateBonus(1.1)
        }
        if (type === 'collector') {
          // upgrades.collector hasn't applied yet (setState scheduled); pass +1
          gameCanvasRef.current?.setCollectorTier(upgrades.collector + 1)
        }
        gameCanvasRef.current?.setCombatUpgrades(nextUpgrades)
        // First-ever Drone Bay purchase pops a one-time explainer so the
        // player knows the radar is a command surface and that they still
        // need to *build* individual drones at the station.
        if (type === 'drone' && upgrades.drone === 0 && activeSlot) {
          const key = `fracking-asteroids-drone-tutorial-${activeSlot}`
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
    [buyUpgrade, tutorial, requestSave, upgrades, activeSlot],
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
    setDroneCount((n) => n + 1)
    requestSave()
  }, [droneCount, upgrades.drone, spendScrap, requestSave])

  const handleBuyLazer = useCallback(() => {
    if (hasLazer) return
    buyUpgrade('lazer', LAZER_COST, (ok) => {
      if (!ok) return
      // Push the upgrade change into the scene before swapping tools, so the
      // scene's lazerUnlocked flag is true by the time setMiningTool runs.
      const next = { ...upgrades, lazer: 1 }
      gameCanvasRef.current?.setCombatUpgrades(next)
      setActiveTool('lazer')
      gameCanvasRef.current?.setMiningTool('lazer')
      requestSave()
    })
  }, [hasLazer, buyUpgrade, upgrades, requestSave])

  const handleCloseTradeMenu = useCallback(() => {
    // Prevent closing during tutorial trade steps — player must complete sell/buy
    if (tutorialActive && (tutorialStep === 'trade-sell' || tutorialStep === 'trade-buy')) return
    setTradeMenuOpen(false)
  }, [tutorialActive, tutorialStep])

  const handleStationDriveThrough = useCallback(() => {
    tutorial.onDroveThroughStation()
    requestSave()
  }, [tutorial, requestSave])

  const handleToolChange = useCallback((tool: MiningTool) => {
    setActiveTool(tool)
  }, [])

  const handleShieldChanged = useCallback(
    (charges: number) => {
      setUpgradeLevel('shield', charges)
      requestSave()
    },
    [setUpgradeLevel, requestSave],
  )

  const handleArmorChanged = useCallback(
    (charges: number) => {
      setUpgradeLevel('armor', charges)
      requestSave()
    },
    [setUpgradeLevel, requestSave],
  )

  const handleSmartBomb = useCallback(() => {
    setUpgradeLevel('smartBomb', 0)
    requestSave()
  }, [setUpgradeLevel, requestSave])

  const handleArbiterEvent = useCallback((event: ArbiterEvent) => {
    const text =
      event.type === 'arrives'
        ? arbiterArrivalLine(event.mark)
        : event.type === 'defeated'
          ? arbiterDefeatLine(event.mark)
          : arbiterWithdrawLine(event.mark)
    setArbiterBanner({ text, key: Date.now() })
  }, [])

  const handleRunEnded = useCallback(
    (stats: RunStats) => {
      setRunStats(stats)
      setIsNewBest(stats.score > highScore)
      setHighScore((best) => Math.max(best, stats.score))
      setRunOver(true)
      requestSave()
    },
    [highScore, requestSave],
  )

  const handleContinue = useCallback(() => {
    gameCanvasRef.current?.respawnAfterDeath()
    resetRunCargo()
    setRunStats(null)
    setRunOver(false)
    requestSave()
  }, [resetRunCargo, requestSave])

  const handleCrystallineDeflect = useCallback(() => {
    // Don't show lazer tutorial popup during prologue — ship already has lazer
    if (tutorialStep.startsWith('prologue-')) return
    if (hasLazer) return

    crystallineDeflectCountRef.current += 1
    if (crystallineDeflectCountRef.current < nextCrystallinePromptAtRef.current) return

    const interval =
      CRYSTALLINE_PROMPT_INTERVALS[
        Math.min(crystallinePromptIntervalIndexRef.current, CRYSTALLINE_PROMPT_INTERVALS.length - 1)
      ]
    nextCrystallinePromptAtRef.current += interval
    if (crystallinePromptIntervalIndexRef.current < CRYSTALLINE_PROMPT_INTERVALS.length - 1) {
      crystallinePromptIntervalIndexRef.current += 1
    }

    setLazerPopupVisible(true)
  }, [hasLazer, tutorialStep])

  const handleDismissLazerPopup = useCallback(() => {
    setLazerPopupVisible(false)
  }, [])

  const handleSkipTutorial = useCallback(() => {
    // Only reset the world when skipping during the prologue (to swap the prologue
    // ship for the normal one). Skipping mid-tutorial preserves progress.
    const wasInPrologue = tutorial.step.startsWith('prologue-')
    tutorial.skip()
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
    const voice = new Audio(voiceSrc)
    voice.preload = 'auto'
    voice.volume = 0.62 * getSfxVolume()
    prologueVoiceRefs.current.push(voice)
    voice.addEventListener(
      'ended',
      () => {
        prologueVoiceRefs.current = prologueVoiceRefs.current.filter((item) => item !== voice)
      },
      { once: true },
    )
    void voice.play().catch(() => {})
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

  // Trade-station shop FAB visibility. Hidden during the scripted prologue —
  // the shop has no role in the intro, and the FAB would overlap the SKIP
  // INTRO prompt (both sit bottom-centre).
  const shopFabVisible = inStationRange && !tradeMenuOpen && !inPrologue

  // Tutorial catch-up: auto-advance trade steps when their conditions are already met.
  // This prevents the tutorial from getting stuck if the player performed actions
  // (opened trade, sold materials, bought upgrades) before the tutorial reached those steps.
  const onEnteredStation = tutorial.onEnteredStation
  const onSoldMaterials = tutorial.onSoldMaterials
  const onBoughtUpgrade = tutorial.onBoughtUpgrade

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
    if (tutorialStep === 'trade-buy' && upgrades.blaster > 1) {
      onBoughtUpgrade()
    }
  }, [tutorialActive, tutorialStep, upgrades.blaster, onBoughtUpgrade])

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
      : lazerPopupVisible
        ? 'lazer-popup'
        : tradeMenuOpen
          ? 'trade'
          : tutorial.active
            ? `tut:${tutorial.step}`
            : shopFabVisible
              ? 'shop'
              : ''
  useGamepadMenu({
    enabled: screen === 'game',
    resetKey: inGameOverlayKey,
  })
  // Start button (Standard Gamepad button 9) toggles pause during gameplay.
  useGamepadButton(9, togglePause, screen === 'game')

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

  // Freeze ship when the shop FAB is visible during the tutorial approach-station step.
  // Unfreezes when the player clicks the FAB (advancing to trade-sell, which hides the overlay).
  const shopTutorialFreeze =
    inStationRange && !tradeMenuOpen && tutorial.active && tutorial.step === 'approach-station'

  if (screen === 'title' || screen === 'start') {
    return (
      <main className="relative w-screen h-dvh overflow-hidden bg-space-900">
        {screen === 'title' ? (
          <TitleScreen onBegin={handleTitleBegin} />
        ) : (
          <StartScreen onNewGame={handleNewGame} onLoadGame={handleLoadGame} />
        )}
      </main>
    )
  }

  return (
    <main className="relative w-screen h-dvh overflow-hidden bg-space-900">
      <GameCanvas
        ref={gameCanvasRef}
        paused={paused || tradeMenuOpen || lazerPopupVisible || runOver}
        frozen={tutorial.frozen || shopTutorialFreeze}
        tutorialStep={tutorial.step}
        onCollect={handleCollect}
        onShipMoved={tutorial.onShipMoved}
        onAsteroidHit={tutorial.onAsteroidHit}
        onMetalSpawned={tutorial.onMetalSpawned}
        onMetalCollected={tutorial.onMetalCollected}
        onPlayerDamage={onPlayerDamage}
        onScrapCollect={handleScrapCollect}
        onEnemyNearby={tutorial.onEnemyNearby}
        onEnemyDestroyed={tutorial.onEnemyDestroyed}
        onScrapCollected={tutorial.onScrapCollected}
        onNearStation={tutorial.onNearStation}
        onStationRange={handleStationRange}
        onStationDriveThrough={handleStationDriveThrough}
        onCrystallineDeflect={handleCrystallineDeflect}
        onToolChange={handleToolChange}
        onLedgerChanged={setLedger}
        onArbiterChanged={setArbiterHud}
        onArbiterEvent={handleArbiterEvent}
        onRunEnded={handleRunEnded}
        onShieldChanged={handleShieldChanged}
        onMiningDroneCountChanged={setDroneCount}
        onArmorChanged={handleArmorChanged}
        onSmartBomb={handleSmartBomb}
        onPrologueReady={tutorial.onPrologueReady}
        onFieldCleared={tutorial.onFieldCleared}
        onArbiterArrived={tutorial.onArbiterArrived}
        onStripComplete={tutorial.onStripComplete}
      />
      <HUD
        scrap={scrap}
        cargo={cargo}
        upgrades={upgrades}
        playerHp={playerHp}
        playerMaxHp={playerMaxHp}
        paused={paused}
        activeTool={activeTool}
        hasLazer={hasLazer}
        droneCount={droneCount}
        ledger={ledger}
        arbiter={arbiterHud}
        isSaving={isSaving}
        onPause={togglePause}
      />
      {!inPrologue && <ArbiterBanner banner={arbiterBanner} />}
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
      {shopFabVisible && (
        <ShopFab
          highlight={tutorial.active && tutorial.step === 'approach-station'}
          onClick={handleShopFabClick}
        />
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
      <LazerTutorialPopup visible={lazerPopupVisible} onDismiss={handleDismissLazerPopup} />
      <DroneTutorialPopup
        visible={dronePopupVisible}
        onDismiss={() => setDronePopupVisible(false)}
      />
      <PauseOverlay visible={paused} onResume={togglePause} />
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
          hydrateFromSave,
        }}
      />
      {paused && <SoundFab />}
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
