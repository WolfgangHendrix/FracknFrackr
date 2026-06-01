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
import { DebugPanel } from '@/components/DebugPanel'
import { useGameState } from '@/hooks/useGameState'
import { useGamePersistence } from '@/hooks/useGamePersistence'
import { useTutorial } from '@/hooks/useTutorial'
import { playMenuLoop, enterGameplay } from '@/lib/menu-music'
import { useGamepadMenu } from '@/hooks/useGamepadMenu'
import { useGamepadButton } from '@/hooks/useGamepadButton'
import type { MiningTool, MetalVariant } from '@/game/types'
import type { Upgrades, SaveSlotId } from '@/lib/schemas'
import { setPauseDampening } from '@/game/volume-control'
import { playVoice } from '@/lib/voice'
import type { PauseRunStats } from '@/components/PauseOverlay'

type Screen = 'title' | 'start' | 'game'

const ACTIVE_SLOT_KEY = 'fracking-asteroids-active-slot'
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
  const [activeSlot, setActiveSlot] = useState<SaveSlotId | null>(null)
  const [isNewGame, setIsNewGame] = useState(false)
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
  const gameCanvasRef = useRef<GameCanvasHandle>(null)
  /** Timestamp of the last trade-menu close — used by handleStationContact
   *  to enforce the reopen cooldown above. Ref instead of state so updating
   *  it doesn't re-render or invalidate the contact callback's deps. */
  const lastTradeCloseAtRef = useRef(0)
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

    tutorial.onEnteredStation()
    setTradeMenuOpen(true)
  }, [tutorial, tradeMenuOpen, tutorialActive, tutorialStep, cargo, scrap])

  // Touched the station but hostiles are in range — flash a brief banner
  // so the player understands the dock is locked, then auto-clear it.
  const handleStationContactBlocked = useCallback(() => {
    setStationBlockedBanner(true)
  }, [])

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
        if (!ok) return
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
    lastTradeCloseAtRef.current = Date.now()
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

  // A hull module was torn off (or restocked at the station). Mirror the new
  // count into upgrades.hull — setCombatUpgrades in the scene re-applies the
  // visual modules on the next sync, keeping the bolt-on pieces in lockstep
  // with the charge count.
  const handleHullChanged = useCallback(
    (charges: number) => {
      setUpgradeLevel('hull', charges)
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

  // Pause-menu Restart Run: reuse the death-respawn path. Same effect as
  // dying and continuing — full ship reset at the station — but invoked
  // voluntarily from the pause menu, so the run-summary screen is skipped.
  const handlePauseRestart = useCallback(() => {
    gameCanvasRef.current?.respawnAfterDeath()
    resetRunCargo()
    setRunStats(null)
    setRunOver(false)
    if (paused) togglePause()
    requestSave()
  }, [resetRunCargo, paused, togglePause, requestSave])

  // Pause-menu Quit to Title: drop back to the title screen. The scene
  // unmounts naturally when `screen` changes; persistence already flushed
  // any in-progress upgrades.
  const handlePauseQuit = useCallback(() => {
    if (paused) togglePause()
    setScreen('title')
    playMenuLoop()
  }, [paused, togglePause])

  // Audio dampening: drop output to ~35% while the pause menu is up so the
  // ambience is present but the menu reads clearly. Restored on resume.
  useEffect(() => {
    setPauseDampening(paused)
  }, [paused])

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
    return (await gameCanvasRef.current?.takeScreenshot()) ?? null
  }, [])

  // First-time black-hole warning. Scene fires onBlackHoleNearby once per
  // session when the player closes inside the warn radius; we gate against
  // a per-slot localStorage flag so it only ever shows on the first run
  // where the player actually approaches the singularity.
  const handleBlackHoleNearby = useCallback(() => {
    if (!activeSlot) return
    if (typeof localStorage === 'undefined') return
    const key = `fracking-asteroids-black-hole-tutorial-${activeSlot}`
    if (localStorage.getItem(key)) return
    setBlackHolePopupVisible(true)
  }, [activeSlot])

  const handleDismissBlackHolePopup = useCallback(() => {
    setBlackHolePopupVisible(false)
    if (!activeSlot) return
    try {
      localStorage.setItem(`fracking-asteroids-black-hole-tutorial-${activeSlot}`, '1')
    } catch {
      // localStorage may be disabled; the per-session scene latch still
      // prevents repeat triggers within this run.
    }
  }, [activeSlot])

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
        if (!activeSlot || typeof localStorage === 'undefined') return
        const key = `fracking-asteroids-${storageSuffix}-${activeSlot}`
        if (localStorage.getItem(key)) return
        setVisible(true)
      },
      onDismiss: (): void => {
        setVisible(false)
        if (!activeSlot) return
        try {
          localStorage.setItem(`fracking-asteroids-${storageSuffix}-${activeSlot}`, '1')
        } catch {
          // localStorage disabled — fall back to per-session latching only.
        }
      },
    }
  }
  const defensePopup = useMemo(
    () => makeFirstEncounter('defense-tutorial', setDefensePopupVisible),
    // makeFirstEncounter closes over `activeSlot`; recreate when the slot
    // changes so per-slot persistence stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSlot],
  )
  const formationPopup = useMemo(
    () => makeFirstEncounter('formation-tutorial', setFormationPopupVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSlot],
  )
  const splitterPopup = useMemo(
    () => makeFirstEncounter('splitter-tutorial', setSplitterPopupVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSlot],
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
      : tradeMenuOpen
        ? 'trade'
        : tutorial.active
          ? `tut:${tutorial.step}`
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

  // The old approach-station freeze pinned the ship inside the FAB's NEAR
  // range so the player had to click the button. With auto-open via physical
  // contact the player needs to keep flying *into* the station, so freezing
  // them here would lock them just outside the trigger ring. Step now
  // advances naturally when handleStationContact fires onEnteredStation.
  const shopTutorialFreeze = false

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
        paused={
          paused ||
          tradeMenuOpen ||
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
        onMetalSpawned={tutorial.onMetalSpawned}
        onMetalCollected={tutorial.onMetalCollected}
        onPlayerDamage={onPlayerDamage}
        onScrapCollect={handleScrapCollect}
        onEnemyNearby={tutorial.onEnemyNearby}
        onEnemyDestroyed={tutorial.onEnemyDestroyed}
        onScrapCollected={tutorial.onScrapCollected}
        onNearStation={tutorial.onNearStation}
        onStationRange={handleStationRange}
        onStationContact={handleStationContact}
        onStationContactBlocked={handleStationContactBlocked}
        onStationDriveThrough={handleStationDriveThrough}
        onToolChange={handleToolChange}
        onLedgerChanged={setLedger}
        onArbiterChanged={setArbiterHud}
        onArbiterEvent={handleArbiterEvent}
        onRunEnded={handleRunEnded}
        onShieldChanged={handleShieldChanged}
        onMiningDroneCountChanged={setDroneCount}
        onArmorChanged={handleArmorChanged}
        onHullChanged={handleHullChanged}
        onSmartBomb={handleSmartBomb}
        onBlackHoleNearby={handleBlackHoleNearby}
        onFirstDefensiveHit={defensePopup.onFire}
        onFirstFormation={formationPopup.onFire}
        onFirstSplitter={splitterPopup.onFire}
        onPrologueReady={tutorial.onPrologueReady}
        onFieldCleared={tutorial.onFieldCleared}
        onArbiterArrived={tutorial.onArbiterArrived}
        onStripComplete={tutorial.onStripComplete}
      />
      {!photoMode && (
        <HUD
          scrap={scrap}
          cargo={cargo}
          upgrades={upgrades}
          paused={paused}
          activeTool={activeTool}
          hasLazer={hasLazer}
          droneCount={droneCount}
          ledger={ledger}
          arbiter={arbiterHud}
          isSaving={isSaving}
          onPause={togglePause}
          tradeMenuOpen={tradeMenuOpen}
        />
      )}
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
          hydrateFromSave,
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
