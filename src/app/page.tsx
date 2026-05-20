'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { GameCanvas } from '@/components/GameCanvas'
import type { GameCanvasHandle } from '@/components/GameCanvas'
import { HUD } from '@/components/HUD'
import { SoundFab } from '@/components/SoundFab'
import { StartScreen } from '@/components/StartScreen'
import { TutorialOverlay } from '@/components/TutorialOverlay'
import { PrologueOverlay } from '@/components/PrologueOverlay'
import { TradeMenu, LAZER_COST } from '@/components/TradeMenu'
import { LazerTutorialPopup } from '@/components/LazerTutorialPopup'
import { ShopFab } from '@/components/ShopFab'
import { useGameState } from '@/hooks/useGameState'
import { useGamePersistence } from '@/hooks/useGamePersistence'
import { useTutorial } from '@/hooks/useTutorial'
import { playMenuLoop, enterGameplay, primeOnFirstGesture } from '@/lib/menu-music'
import { useGamepadMenu } from '@/hooks/useGamepadMenu'
import { useGamepadButton } from '@/hooks/useGamepadButton'
import type { MiningTool } from '@/game/types'
import type { Upgrades, SaveSlotId } from '@/lib/schemas'

type Screen = 'start' | 'game'

const ACTIVE_SLOT_KEY = 'fracking-asteroids-active-slot'

export default function Home() {
  const [screen, setScreen] = useState<Screen>('start')
  const [activeSlot, setActiveSlot] = useState<SaveSlotId | null>(null)
  const [isNewGame, setIsNewGame] = useState(false)
  const [tradeMenuOpen, setTradeMenuOpen] = useState(false)
  const [inStationRange, setInStationRange] = useState(false)
  const [activeTool, setActiveTool] = useState<MiningTool>('blaster')
  const [hasLazer, setHasLazer] = useState(false)
  const [lazerPopupVisible, setLazerPopupVisible] = useState(false)
  const gameCanvasRef = useRef<GameCanvasHandle>(null)
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
    spendScrap,
  } = useGameState()
  const { save } = useGamePersistence(activeSlot)
  const tutorial = useTutorial(isNewGame && screen === 'game')

  // --- Auto-save on state changes triggered by game events ---
  const [saveSeq, setSaveSeq] = useState(0)

  /** Request a save after the current state updates have been applied. */
  const requestSave = useCallback(() => {
    setSaveSeq((n) => n + 1)
  }, [])

  // Persist the snapshot whenever saveSeq increments (driven by game events).
  // Skip the initial render (saveSeq === 0).
  useEffect(() => {
    if (saveSeq === 0) return
    void save({
      ship: { x: 0, y: 0, rotation: 0, velocityX: 0, velocityY: 0 },
      upgrades,
      cargo: { ...cargo, scrap },
      hp: playerHp,
      timestamp: Date.now(),
    })
  }, [saveSeq]) // eslint-disable-line react-hooks/exhaustive-deps -- save reads latest state at trigger time

  // --- Music ---
  // Start the menu loop whenever the start screen is showing; arm a one-shot
  // gesture listener so autoplay-blocked browsers still kick it off on the
  // first click. The same audio element survives into gameplay.
  useEffect(() => {
    if (screen === 'start') {
      playMenuLoop()
      primeOnFirstGesture()
    }
  }, [screen])

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
    (variant: 'silver' | 'gold') => {
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
      buyUpgrade(type, cost, (ok) => {
        if (!ok) return
        if (type === 'blaster') {
          gameCanvasRef.current?.setFireRateBonus(1.1)
        }
        if (type === 'collector') {
          // upgrades.collector hasn't applied yet (setState scheduled); pass +1
          gameCanvasRef.current?.setCollectorTier(upgrades.collector + 1)
        }
        if (tutorial.active) {
          tutorial.onBoughtUpgrade()
        }
        requestSave()
      })
    },
    [buyUpgrade, tutorial, requestSave, upgrades.collector],
  )

  const handleBuyLazer = useCallback(() => {
    if (hasLazer) return
    const ok = spendScrap(LAZER_COST)
    if (ok) {
      setHasLazer(true)
      setActiveTool('lazer')
      gameCanvasRef.current?.setMiningTool('lazer')
      requestSave()
    }
  }, [hasLazer, spendScrap, requestSave])

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

  const handleCrystallineDeflect = useCallback(() => {
    // Don't show lazer tutorial popup during prologue — ship already has lazer
    if (tutorialStep.startsWith('prologue-')) return
    setLazerPopupVisible(true)
  }, [tutorialStep])

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
    }
  }, [tutorial])

  // --- Prologue fade-to-black and respawn sequence ---
  const [prologueFade, setPrologueFade] = useState<
    'none' | 'fading-in' | 'black' | 'rebooting' | 'fading-out'
  >('none')

  const prologueRespawnRef = useRef(tutorial.onPrologueRespawnComplete)
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

        timers.push(
          setTimeout(() => {
            setPrologueFade('rebooting')

            timers.push(
              setTimeout(() => {
                setPrologueFade('fading-out')

                timers.push(
                  setTimeout(() => {
                    setPrologueFade('none')
                    prologueRespawnRef.current()
                  }, 1500),
                )
              }, 2000),
            )
          }, 1500),
        )
      }, 1500),
    )

    return () => timers.forEach(clearTimeout)
  }, [tutorialStep])

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
    if (tutorialStep === 'trade-sell' && cargo.silver === 0 && cargo.gold === 0) {
      onSoldMaterials()
    }
  }, [tutorialActive, tutorialStep, cargo.silver, cargo.gold, onSoldMaterials])

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

  // Freeze ship when the shop FAB is visible during the tutorial approach-station step.
  // Unfreezes when the player clicks the FAB (advancing to trade-sell, which hides the overlay).
  const shopTutorialFreeze =
    inStationRange && !tradeMenuOpen && tutorial.active && tutorial.step === 'approach-station'

  if (screen === 'start') {
    return (
      <main className="relative w-screen h-dvh overflow-hidden bg-space-900">
        <StartScreen onNewGame={handleNewGame} onLoadGame={handleLoadGame} />
      </main>
    )
  }

  return (
    <main className="relative w-screen h-dvh overflow-hidden bg-space-900">
      <GameCanvas
        ref={gameCanvasRef}
        paused={paused || tradeMenuOpen || lazerPopupVisible}
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
        onPause={togglePause}
      />
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
          onSell={handleSell}
          onBuy={handleBuy}
          onBuyLazer={handleBuyLazer}
          onClose={handleCloseTradeMenu}
        />
      )}
      <LazerTutorialPopup visible={lazerPopupVisible} onDismiss={handleDismissLazerPopup} />
      {paused && (
        <div className="absolute inset-0 z-[40] bg-black/60 pointer-events-none flex items-center justify-center">
          <p className="font-mono text-2xl sm:text-4xl tracking-widest text-white/80">PAUSED</p>
        </div>
      )}
      {paused && <SoundFab />}
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
            <p className="font-mono text-2xl sm:text-4xl tracking-widest text-hud-red/90 animate-pulse">
              Systems offline.
            </p>
          )}
          {(prologueFade === 'rebooting' || prologueFade === 'fading-out') && (
            <p className="font-mono text-lg sm:text-2xl tracking-widest text-hud-green/90 animate-pulse">
              Rebooting...
            </p>
          )}
        </div>
      )}
    </main>
  )
}
