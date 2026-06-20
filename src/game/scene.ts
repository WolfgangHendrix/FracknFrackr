import * as THREE from 'three'
import { createShipModel, applyHullModules, applyArmorModules, applyExoticHullVisual } from './ship-model'
import { createAsteroidModel, ASTEROID_SIZE_RADIUS } from './asteroid-model'
import { spawnAsteroidField, spawnPrologueField } from './asteroid-spawner'
import { createArbiterModel } from './arbiter-model'
import {
  PROLOGUE_ASTEROID_COUNT,
  PROLOGUE_MOON_COUNT,
  PROLOGUE_SHIP,
  ARBITER_SPAWN_DISTANCE,
} from './prologue-config'
import {
  createGasStationModel,
  initGasStationNeon,
  updateGasStationNeon,
} from './gas-station-model'
import { createProjectileModel } from './projectile-model'
import { createLazerBeam, updateLazerBeam, disposeLazerBeam } from './lazer-beam'
import { createRippleBeam, updateRippleBeam, disposeRippleBeam } from './ripple-beam'
import { createTractorBeam, updateTractorBeam, disposeTractorBeam } from './tractor-beam'
import type { TractorBeam } from './tractor-beam'
import {
  createInputState,
  createInputHandler,
  createAimState,
  createAimHandler,
  isEditableTarget,
} from './input'
import { createVirtualJoystick, createAimJoystick } from './virtual-joystick'
import { createGamepadHandler } from './gamepad'
import { createToolToggleButton } from './fire-button'
import type { ToolToggleButton } from './fire-button'
import { createRechargeMeter, updateRechargeMeter } from './recharge-meter'
import { createExplosion, updateExplosion, disposeExplosion } from './explosion'
import type { Explosion } from './explosion'
import {
  createHealthMeter,
  updateHealthMeter,
  attachAsteroidHealthMeter,
  HEALTH_BAR_OFFSET_Y,
} from './asteroid-health-meter'
import {
  breakChunks,
  shatterAsteroid,
  updateDebrisChunk,
  disposeDebrisChunk,
  HITS_PER_BREAK,
} from './asteroid-debris'
import type { DebrisChunk } from './asteroid-debris'
import { disposeMetalChunk } from './metal-chunk'
import type { MiningTool } from './types'
import { PREFERRED_TOOL } from './types'
import { createMiningDrone } from './mining-drone'
import { updateCollisionDebugRings, hideCollisionDebugRings } from './debug-overlay'
import {
  tick,
  createTickState,
  PLAYER_MAX_HP,
  COMET_FIRST_DELAY,
  effectivePlayerMaxHp,
  collectorRangeForTier,
  optionOrbPositions,
  EXOTIC_HULL_CHARGES,
} from './game-tick'
import type { TickState, TickInput, TickResult } from './game-tick'
import { FIRST_PATROL_DELAY, ASTEROID_REPLENISH_INTERVAL, computeScore } from './ledger-config'
import type { RunStats } from './ledger-config'
import type { ArbiterHudInfo } from './arbiter-comms'
import { createCollectorVfx, updateCollectorVfx, disposeCollectorVfx } from './collector-vfx'
import {
  resumeAudio,
  startCollectorHum,
  stopCollectorHum,
  playCollectPling,
  disposeAudio,
} from './audio'
import {
  startMusic,
  setMusicIntensity,
  updateMusic,
  suspendMusic,
  resumeMusic,
  disposeMusic,
  setMusicFilter,
} from './music'
import {
  playLaserFire,
  playExplosion,
  playPlayerHit,
  playKlaxon,
  playBoostWhoosh,
  startEngineSound,
  updateEngineSound,
  suspendEngineSound,
  setDrillSoundIntensity,
  setDrillSoundType,
  playAsteroidShatter,
  suspendDrillSound,
  startArbiterSiren,
  updateArbiterSiren,
  stopArbiterSiren,
  disposeSfx,
} from './sfx'
import { createRadar, updateRadar, disposeRadar, radarClickToWorld, radarCrosshairToWorld } from './radar'
import type { Radar, RadarBlip } from './radar'
import { createCometModel, updateCometModel, disposeCometModel } from './comet-model'
import type { CometModel } from './comet-model'
import { createScreenShake, addTrauma, updateScreenShake } from './screen-shake'
import type { ScreenShake } from './screen-shake'
import {
  createShockwave,
  updateShockwave,
  disposeShockwave,
} from './shockwave'
import type { Shockwave } from './shockwave'
import {
  createTwinkleStars,
  updateTwinkleStars,
  disposeTwinkleStars,
  createNebulaSystem,
  updateNebulaSystem,
  disposeNebulaSystem,
  createBlackHole,
  updateBlackHole,
  disposeBlackHole,
} from './background-effects'
import type { TwinkleStars, NebulaSystem, BlackHole } from './background-effects'
import { BLACK_HOLE_EVENT_HORIZON_RADIUS } from './black-hole-constants'
import { createEngineTrail, updateEngineTrail, disposeEngineTrail } from './engine-trail'
import type { EngineTrail } from './engine-trail'
import { createWarpStreaks, updateWarpStreaks, disposeWarpStreaks } from './warp-streaks'
import { createSpeedLines, updateSpeedLines, disposeSpeedLines } from './speed-lines'
import {
  createEnemyShip,
  disposeEnemyProjectile,
  disposeEnemyShip,
  createShipwreckDebris,
  updateShipwreckDebris,
  disposeShipwreckDebris,
  CARRIER_SHIELD_HP,
} from './enemy-ship'
import type { EnemyShip, ShipwreckDebris } from './enemy-ship'
import { patrolEnemyDamage } from './ledger-config'
import { createArbiterState } from './arbiter'
import type { Asteroid } from './types'
import {
  createEnemyDamageSparks,
  updateEnemyDamageSparks,
  disposeEnemyDamageSparks,
} from './enemy-damage-vfx'
import type { EnemyDamageSparks } from './enemy-damage-vfx'
import { disposeScrapBox } from './scrap-box'
import { createBloom } from './post-processing'
import { createCinematicCamera } from './cinematic-camera'
import { createParticleSystem } from './particle-system'
import { createDynamicLights } from './dynamic-lights'
import { createDustMotes, createGalaxySpiral } from './environment'
import { createProjectileTrails } from './projectile-trail'
import { createShipDamageVfx } from './ship-damage-vfx'
import { subscribePauseSettings } from './pause-settings'
import { createRetroRenderer } from './retro-mode'

import type { TutorialStep } from '@/hooks/useTutorial'
import type { Upgrades } from '@/lib/schemas'

interface FormationShieldVisual {
  group: THREE.Group
  ring: THREE.Mesh
  fill: THREE.Mesh
  pulse: number
}

function disposeMesh(obj: THREE.Object3D): void {
  if (obj instanceof THREE.Mesh) {
    obj.geometry.dispose()
    if (Array.isArray(obj.material)) {
      obj.material.forEach((m) => m.dispose())
    } else {
      obj.material.dispose()
    }
  }
  if (obj instanceof THREE.Points) {
    obj.geometry.dispose()
    if (obj.material instanceof THREE.Material) {
      obj.material.dispose()
    }
  }
}

function createFormationShieldVisual(): FormationShieldVisual {
  const group = new THREE.Group()
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0x45f3ff,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x8ff8ff,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), fillMat)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 72), ringMat)
  fill.renderOrder = 10
  ring.renderOrder = 11
  group.add(fill, ring)
  return { group, ring, fill, pulse: Math.random() * Math.PI * 2 }
}

function disposeFormationShieldVisual(visual: FormationShieldVisual): void {
  visual.group.traverse(disposeMesh)
}

const CAMERA_HEIGHT = 150
const STAR_COUNT = 400
const BLACK_HOLE_ALERT_RADIUS = 200
// Must reach the outer danger ring (radius 48) to earn the edge achievement.
const BLACK_HOLE_WARN_RADIUS = 58

// Station is at (30, 200). Rings are defined in background-parallax space.
// Angles spread evenly so black holes surround every direction of escape.
// Each ring activates when the player first reaches that distance from station.
const BLACK_HOLE_SPAWN_RINGS: {
  threshold: number
  scale: number
  positions: { x: number; y: number }[]
}[] = [
  {
    threshold: 120,
    scale: 1,
    positions: [
      { x: 330, y: 200 },   // right
      { x: -120, y: 460 },  // upper-left
      { x: -120, y: -60 },  // lower-left
    ],
  },
  {
    threshold: 300,
    scale: 1.25,
    positions: [
      { x: 280, y: 633 },   // upper-right
      { x: -470, y: 200 },  // left
      { x: 280, y: -233 },  // lower-right
    ],
  },
  {
    threshold: 500,
    scale: 1.55,
    positions: [
      { x: 636, y: 550 },   // far upper-right
      { x: -576, y: 550 },  // far upper-left
      { x: -576, y: -150 }, // far lower-left
      { x: 636, y: -150 },  // far lower-right
    ],
  },
  {
    threshold: 700,
    scale: 1.9,
    positions: [
      { x: 930, y: 200 },
      { x: 30, y: 1100 },
      { x: -900, y: 200 },
      { x: 30, y: -700 },
    ],
  },
]

export { PLAYER_MAX_HP } from './game-tick'

import type { MetalVariant } from './types'
export type { MetalVariant }

export interface GameSceneOptions {
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
  /** Fires the tick the ship physically touches the station with no
   *  hostiles in the lockout radius — page layer auto-opens the trade
   *  menu in response. */
  onStationContact?: () => void
  /** Fires the tick the ship touches the station but hostiles are in the
   *  lockout radius — page layer shows a brief warning banner instead of
   *  opening the trade menu. */
  onStationContactBlocked?: () => void
  onStationDriveThrough?: () => void
  onRallyPointSet?: () => void
  onToolChange?: (tool: MiningTool) => void
  /** Endless mode — fired when the integer Ledger value changes. */
  onLedgerChanged?: (ledger: number) => void
  /** Endless mode — Arbiter boss HP/Mark for the HUD; null when none active. */
  onArbiterChanged?: (info: ArbiterHudInfo | null) => void
  /** Endless mode — Arbiter encounter lifecycle events for comms banners. */
  onArbiterEvent?: (event: { type: 'arrives' | 'defeated' | 'withdrawn'; mark: number }) => void
  /** Endless mode — fired once when the player's hull is lost. */
  onRunEnded?: (stats: RunStats) => void
  onShieldChanged?: (charges: number) => void
  /** Fires whenever the active mining drone count changes (build/destroy). */
  onMiningDroneCountChanged?: (count: number) => void
  /** Fires when drones deposit scrap back at the ship. */
  onDroneScrapDelivered?: (amount: number, dockedCount: number) => void
  /** Fires when Drone Repair Bay rebuilds a drone. */
  onDroneRebuilt?: () => void
  onArmorChanged?: (charges: number) => void
  /** Fires when a hull module is torn off by a hit (or restocked at the trade
   *  station). Page mirrors the value into upgrades.hull. */
  onHullChanged?: (charges: number) => void
  onSmartBomb?: () => void
  /** Fires the first time the player closes to within the warning radius
   *  of the black hole during free play. One-shot per scene lifetime —
   *  the page layer is responsible for any cross-session "already seen"
   *  persistence. */
  onBlackHoleNearby?: () => void
  /** Fires when the player backs out of the black-hole warning radius after entering it. */
  onBlackHoleEscaped?: () => void
  /** Fires when the ship survives inside an event horizon via void immunity
   *  (Exotic Matter Hull). Drives the "Event Horizon Tourist" achievement. */
  onBlackHoleSurvived?: () => void
  /** Fires when the Wormhole Generator teleports the ship. Drives the
   *  "Expedited Routing" achievement. */
  onWormholeTeleported?: () => void
  /** Fires when Drill Nose finishes one or more asteroids this tick. */
  onDrillNoseAsteroidFinished?: (count: number) => void
  /** Fires once per scene the first time any defensive layer absorbs a hit
   *  (shield / hull module / armor). Used to surface the defense-system
   *  explainer popup the moment the mechanic first matters. */
  onFirstDefensiveHit?: () => void
  /** Fires once per scene the first time a wedge formation spawns. */
  onFirstFormation?: () => void
  /** Fires once per scene the first time a splitter enemy spawns. */
  onFirstSplitter?: () => void
  // Prologue callbacks
  onPrologueReady?: () => void
  onFieldCleared?: () => void
  onArbiterArrived?: () => void
  onStripComplete?: () => void
  onHarvestingAreaWarning?: (outside: boolean) => void
}

/** Mid-run statistics snapshot returned by {@link GameScene.getRunStats}. */
export interface RunStatsSnapshot {
  /** Seconds the player has been in endless play this run. */
  runTimeSec: number
  /** Current Ledger value (escalation meter). */
  ledger: number
  /** Highest Ledger this run reached. */
  peakLedger: number
  /** Arbiters destroyed this run. */
  marksDefeated: number
  /** Composite score = peakLedger + marksDefeated × 500. */
  score: number
}

export interface GameScene {
  dispose: () => void
  setFireRateBonus: (multiplier: number) => void
  resetShipToStation: () => void
  setMiningTool: (tool: MiningTool) => void
  setCollectorTier: (tier: number) => void
  setCargoFull: (full: boolean) => void
  setCombatUpgrades: (upgrades: Upgrades) => void
  /**
   * Build a new player mining drone at the ship. Returns true if a drone
   * was created (i.e. current count < cap), false if the cap is already
   * met. The page layer is responsible for charging scrap before calling.
   */
  buildMiningDrone: () => boolean
  /** Current count of active mining drones (for the trade menu UI). */
  getMiningDroneCount: () => number
  /** Snapshot of in-progress run stats — used by the pause menu panel. */
  getRunStats: () => RunStatsSnapshot
  /**
   * Toggle photo mode. While on, the camera detaches from the ship and pans
   * with movement input; the page layer is responsible for also pausing the
   * simulation so the world freezes for framing.
   */
  setPhotoMode: (on: boolean) => void
  /**
   * Capture the current rendered frame as a PNG blob. Returns null if the
   * browser refused the conversion (e.g. tainted canvas, OOM). The caller
   * is responsible for triggering the download or sharing the blob.
   */
  takeScreenshot: () => Promise<Blob | null>
  respawnAfterDeath: () => void
  /** Debug-only API. Stays in the build; webpack tree-shakes use-sites that
   *  guard with DEBUG_ENABLED, but the methods themselves are always available
   *  to keep scene.ts simple. Calling them in a production UI is a no-op
   *  because the calling code (DebugPanel) is itself stripped out. */
  debugApi: DebugApi
}

import type { EnemyKind } from './enemy-ship'
import type { AsteroidType } from './types'
import type { MiningDroneState } from './mining-drone'

export interface DebugApi {
  // Player state
  setGodMode: (on: boolean) => void
  getGodMode: () => boolean
  setPlayerHp: (hp: number) => void
  killPlayer: () => void
  forceDeathSequence: () => void
  refillShieldArmor: () => void

  // Economy / progression
  setUpgradesMaxed: () => void
  unlockAllTools: () => void

  // Enemies
  spawnEnemyAtCursor: (kind: EnemyKind, worldX: number, worldY: number) => void
  spawnArbiter: () => void
  despawnAllEnemies: () => void

  // Asteroids
  spawnAsteroidAtCursor: (type: AsteroidType, worldX: number, worldY: number) => void
  clearAsteroids: () => void

  // Roaming comet — force the next tick to spawn one (endless mode only)
  spawnComet: () => void

  // Drones
  buildDronesUpToCap: () => number
  forceDroneState: (state: MiningDroneState) => void

  // Camera / nav
  teleportShip: (x: number, y: number) => void
  teleportToStation: () => void
  teleportToArbiter: () => void
  teleportToNearestEnemy: () => void

  // Time
  setDtMultiplier: (mult: number) => void
  getDtMultiplier: () => number

  // Spawn director
  setEnemySpawnsDisabled: (off: boolean) => void
  getEnemySpawnsDisabled: () => boolean

  // Post-process toggles
  setBloomEnabled: (on: boolean) => void
  setVignetteEnabled: (on: boolean) => void
  setChromaticAberrationEnabled: (on: boolean) => void
  setScreenShakeEnabled: (on: boolean) => void

  // Collision debug overlay
  setCollisionDebugEnabled: (on: boolean) => void
  getCollisionDebugEnabled: () => boolean

  // Perf overlay
  setPerfOverlayEnabled: (on: boolean) => void
  getPerfOverlayEnabled: () => boolean

  // Ledger
  addLedger: (amount: number) => void
  setLedger: (amount: number) => void

  // Snapshot
  snapshotTickState: () => string
  getCursorWorld: () => { x: number; y: number } | null
}

/**
 * Initialize the Three.js scene, renderer, camera, ship, starfield,
 * and game loop inside the given container element.
 */
export function createGameScene(
  container: HTMLElement,
  getPaused: () => boolean,
  getTutorialStep: () => TutorialStep,
  options?: GameSceneOptions,
): GameScene {
  const onCollect = options?.onCollect
  const onShipMoved = options?.onShipMoved
  const onAsteroidHit = options?.onAsteroidHit
  const onAsteroidsDestroyed = options?.onAsteroidsDestroyed
  const onMetalSpawned = options?.onMetalSpawned
  const onMetalCollected = options?.onMetalCollected
  const onPlayerDamage = options?.onPlayerDamage
  const onScrapCollect = options?.onScrapCollect
  const onEnemyNearby = options?.onEnemyNearby
  const onEnemyDestroyed = options?.onEnemyDestroyed
  const onScrapCollected = options?.onScrapCollected
  const onNearStation = options?.onNearStation
  const onStationRange = options?.onStationRange
  const onStationContact = options?.onStationContact
  const onStationContactBlocked = options?.onStationContactBlocked
  const onStationDriveThrough = options?.onStationDriveThrough
  const onRallyPointSet = options?.onRallyPointSet
  const onToolChange = options?.onToolChange
  const onLedgerChanged = options?.onLedgerChanged
  const onArbiterChanged = options?.onArbiterChanged
  const onArbiterEvent = options?.onArbiterEvent
  const onRunEnded = options?.onRunEnded
  const onShieldChanged = options?.onShieldChanged
  const onMiningDroneCountChanged = options?.onMiningDroneCountChanged
  const onDroneScrapDelivered = options?.onDroneScrapDelivered
  const onDroneRebuilt = options?.onDroneRebuilt
  const onArmorChanged = options?.onArmorChanged
  const onHullChanged = options?.onHullChanged
  const onSmartBomb = options?.onSmartBomb
  const onBlackHoleNearby = options?.onBlackHoleNearby
  const onBlackHoleEscaped = options?.onBlackHoleEscaped
  const onBlackHoleSurvived = options?.onBlackHoleSurvived
  const onWormholeTeleported = options?.onWormholeTeleported
  const onDrillNoseAsteroidFinished = options?.onDrillNoseAsteroidFinished
  const onFirstDefensiveHit = options?.onFirstDefensiveHit
  const onFirstFormation = options?.onFirstFormation
  const onFirstSplitter = options?.onFirstSplitter
  const onPrologueReady = options?.onPrologueReady
  const onFieldCleared = options?.onFieldCleared
  const onArbiterArrived = options?.onArbiterArrived
  const onStripComplete = options?.onStripComplete
  const onHarvestingAreaWarning = options?.onHarvestingAreaWarning

  // --- Renderer ---
  // `preserveDrawingBuffer: true` keeps the canvas readable after each
  // composite so the photo-mode screenshot can call `toBlob` without the
  // contents getting wiped by the browser. Minor GPU cost; acceptable for
  // the sharing feature it enables.
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setClearColor(0x0a0a1a)
  container.appendChild(renderer.domElement)

  startMusic()

  // --- Radar mini-map (lower-left overlay canvas) ---
  const radar: Radar | null = createRadar(container)

  // Radar click → rally point. Clicks near the radar center (the ship icon)
  // clear an existing rally; clicks elsewhere set a new one in world coords.
  function onRadarPointerDown(e: PointerEvent): void {
    if (!radar) return
    if (getPaused()) return
    // Drone upgrade not yet purchased → ignore so the radar stays decorative.
    if (tickState.miningDroneCap <= 0) return
    e.preventDefault()
    const world = radarClickToWorld(radar, e.clientX, e.clientY, ship.x, ship.y)
    if (!world) return
    const dxShip = world.x - ship.x
    const dyShip = world.y - ship.y
    // Click on / near the ship icon (within ~20 world units) clears the rally.
    if (dxShip * dxShip + dyShip * dyShip < 20 * 20) {
      tickState.rallyPoint = null
    } else {
      tickState.rallyPoint = world
      onRallyPointSet?.()
    }
  }
  if (radar) {
    radar.canvas.addEventListener('pointerdown', onRadarPointerDown)
  }

  // --- Scene ---
  const scene = new THREE.Scene()

  // --- Camera (top-down with slight perspective) ---
  const aspect = container.clientWidth / container.clientHeight
  const camera = new THREE.PerspectiveCamera(50, aspect, 1, 1000)
  camera.position.set(0, 0, CAMERA_HEIGHT)
  camera.lookAt(0, 0, 0)

  // --- Bloom Post-Processing ---
  const bloom = createBloom(
    renderer, scene, camera,
    container.clientWidth, container.clientHeight,
  )

  // --- Retro render path (cosmetic) ---
  // Renders to a low-res target with NEAREST upscale, replacing the bloom
  // composer when the pause-settings toggle is on. Cheap to keep around
  // even when disabled — the offscreen target only holds ~320×180 pixels.
  const retroRenderer = createRetroRenderer(renderer)

  // --- Cinematic Camera ---
  const cineCam = createCinematicCamera(camera)

  // --- Lighting ---
  const ambient = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambient)
  const directional = new THREE.DirectionalLight(0xffffff, 0.8)
  directional.position.set(20, 40, 60)
  scene.add(directional)

  // --- Dynamic Point Lights ---
  const dynamicLights = createDynamicLights()
  scene.add(dynamicLights.engineLight)
  scene.add(dynamicLights.shipLight)
  for (const el of dynamicLights.explosionLights) scene.add(el.light)

  // --- GPU Particle Systems ---
  const explosionGlowParticles = createParticleSystem({ maxParticles: 300 })
  scene.add(explosionGlowParticles.points)
  const engineGlowParticles = createParticleSystem({ maxParticles: 150 })
  scene.add(engineGlowParticles.points)
  const projectileTrails = createProjectileTrails()
  scene.add(projectileTrails.system.points)
  const shipDamageVfx = createShipDamageVfx()
  scene.add(shipDamageVfx.sparkSystem.points)

  // --- Environment Upgrades ---
  const dustMotes = createDustMotes()
  scene.add(dustMotes.points)
  const galaxySpiral = createGalaxySpiral()
  scene.add(galaxySpiral.points)

  // --- Starfield ---
  const starGeo = new THREE.BufferGeometry()
  const starPositions = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 800
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 800
    starPositions[i * 3 + 2] = -20 + Math.random() * -30
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true })
  const stars = new THREE.Points(starGeo, starMat)
  scene.add(stars)

  // --- Ship ---
  // Only the scripted prologue flies the maxed showcase hull (bulked modules +
  // Exotic Matter Hull's dark/cosmic-pink look). Anyone entering past the intro
  // — returning players, or a fresh run after the prologue is rebuilt — starts
  // on the clean stock ship so that showcase styling never leaks into live play.
  let shipModel = createShipModel(
    getTutorialStep().startsWith('prologue-') ? 'prologue' : 'normal',
  )
  scene.add(shipModel)

  const optionOrbs = new THREE.Group()
  scene.add(optionOrbs)
  // Forcefield bubble — rendered BackSide with additive blending so the
  // brightness concentrates at the silhouette rim instead of filling the
  // interior and drowning the ship within the effect.
  const shieldVisual = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 24),
    new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.08,
      emissive: 0x0088ff,
      emissiveIntensity: 0.8,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )

  shieldVisual.visible = false
  scene.add(shieldVisual)

  // Aim guide — thin line from the ship to the player's aim point, plus a
  // small ring at the endpoint. Amber so it never collides with enemy red,
  // blaster orange (more saturated), or lazer/shield cyans.
  const AIM_COLOR = 0xffd866
  const aimLineGeom = new THREE.BufferGeometry()
  aimLineGeom.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0.5, 0, 0, 0.5]), 3),
  )
  const aimLine = new THREE.Line(
    aimLineGeom,
    new THREE.LineBasicMaterial({
      color: AIM_COLOR,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  aimLine.visible = false
  aimLine.renderOrder = 10
  scene.add(aimLine)

  const aimReticle = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 2.8, 24),
    new THREE.MeshBasicMaterial({
      color: AIM_COLOR,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  aimReticle.visible = false
  aimReticle.renderOrder = 10
  scene.add(aimReticle)

  // --- Mining drones (player-built) ---
  const miningDroneGroup = new THREE.Group()
  scene.add(miningDroneGroup)
  const miningDroneMeshes = new Map<string, THREE.Group>()

  // Per-state status-light colors so the player can read at a glance what
  // each drone is doing.
  const DRONE_STATE_COLOR: Record<MiningDroneState, number> = {
    seeking: 0x88ccff,
    drilling: 0xff8833,
    returning: 0x77ffcc,
    retreating: 0xff4466,
  }

  function createDroneMesh(): THREE.Group {
    // Voxel-bot silhouette: short blocky chassis with side struts, a tiny
    // forward drill, and rear thrusters. Built from the same flat-shaded
    // material the ship uses so it reads as part of the player faction —
    // not as one of the round glowing Option orbs.
    const g = new THREE.Group()
    const HULL = 0x556677
    const DARK = 0x2a3340
    const STRUT = 0x778899
    const DRILL = 0xcdd2db
    const THRUST = 0xff7a1a
    const hullMat = new THREE.MeshStandardMaterial({
      color: HULL,
      flatShading: true,
      metalness: 0.4,
      roughness: 0.55,
    })
    const darkMat = new THREE.MeshStandardMaterial({
      color: DARK,
      flatShading: true,
      metalness: 0.3,
      roughness: 0.7,
    })
    const strutMat = new THREE.MeshStandardMaterial({
      color: STRUT,
      flatShading: true,
      metalness: 0.5,
      roughness: 0.4,
    })
    const drillMat = new THREE.MeshStandardMaterial({
      color: DRILL,
      flatShading: true,
      metalness: 0.7,
      roughness: 0.25,
    })
    const thrustMat = new THREE.MeshBasicMaterial({ color: THRUST })

    const addBox = (
      mat: THREE.Material,
      sx: number,
      sy: number,
      sz: number,
      px: number,
      py: number,
      pz: number,
    ): void => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat)
      box.position.set(px, py, pz)
      g.add(box)
    }

    // Main chassis — flat rectangular box, slightly longer than wide.
    addBox(hullMat, 1.8, 2.6, 0.8, 0, 0, 0)
    // Side strut wings on each flank.
    addBox(strutMat, 0.7, 1.4, 0.5, -1.4, 0.1, 0)
    addBox(strutMat, 0.7, 1.4, 0.5, 1.4, 0.1, 0)
    // Dark armored "shoulders" — visual breakup.
    addBox(darkMat, 0.5, 0.6, 0.6, -1.05, 0.9, 0)
    addBox(darkMat, 0.5, 0.6, 0.6, 1.05, 0.9, 0)
    // Forward drill spike — short cylinder pointing along local +Y.
    const drill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.32, 0.9, 6),
      drillMat,
    )
    drill.position.set(0, 1.7, 0)
    drill.rotation.x = Math.PI / 2
    drill.rotation.z = Math.PI / 2
    drill.name = 'drill'
    g.add(drill)
    // Rear thruster blips.
    addBox(thrustMat, 0.35, 0.35, 0.35, -0.5, -1.55, 0)
    addBox(thrustMat, 0.35, 0.35, 0.35, 0.5, -1.55, 0)

    // Glowing status-light core, recolored each frame based on drone state.
    // Smaller and centered on the chassis top so it reads as a beacon, not
    // the whole drone.
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.95,
      }),
    )
    core.position.set(0, 0.1, 0.55)
    core.name = 'core'
    g.add(core)

    // Soft halo around the beacon for visibility against bright backdrops.
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    halo.position.set(0, 0.1, 0.55)
    halo.name = 'halo'
    g.add(halo)
    return g
  }

  function disposeDroneMesh(mesh: THREE.Group): void {
    mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (obj.material instanceof THREE.Material) obj.material.dispose()
      }
    })
    miningDroneGroup.remove(mesh)
  }

  // --- Arbiter (added to scene during prologue-arbiter step) ---
  let arbiterModel: THREE.Group | null = null
  // Twin-encounter escort — a second Arbiter mesh shown only while
  // tickState.arbiterEscort is live (endless twin Marks). Never used in the
  // prologue, so it has no scripted-approach fallback.
  let arbiterEscortModel: THREE.Group | null = null

  // --- Recharge Meter (positioned at ship, but not parented to avoid rotation) ---
  const rechargeMeter = createRechargeMeter()
  scene.add(rechargeMeter)

  // --- Lazer Beam (persistent mesh, hidden when not firing) ---
  const lazerBeam = createLazerBeam()
  scene.add(lazerBeam)
  const optionLazerBeams = [createLazerBeam(), createLazerBeam()]
  for (const beam of optionLazerBeams) scene.add(beam)
  const rippleBeam = createRippleBeam()
  scene.add(rippleBeam)

  // --- Arbiter Tractor Beam (persistent mesh, hidden when not active) ---
  const tractorBeam: TractorBeam = createTractorBeam()
  scene.add(tractorBeam.group)

  // --- Asteroids ---
  // Map of asteroid id → { model, healthMeter } for all asteroids in the world
  const asteroidModels = new Map<string, { model: THREE.Group; healthMeter: THREE.Group }>()

  // Roaming-comet visuals, keyed by comet id. Spawned/disposed from the tick
  // result's newComets / expiredCometIds; positions synced each frame.
  const cometModels = new Map<string, CometModel>()

  // --- Debug flags. These default to "production" values and are only ever
  //     mutated by the debug panel (which is itself excluded from production
  //     builds via DEBUG_ENABLED). Reading them in hot paths is one branch
  //     each, well below per-frame budget. ---
  // Drill Nose spin intensity, smoothly tweened toward 0/1 based on the
  // tick's drillNoseActive flag. Kept here so the spin doesn't jitter as
  // the per-frame collision check toggles on/off between hits.
  let drillNoseSpinIntensity = 0

  let debugBloomEnabled = true
  let debugVignetteEnabled = true
  let debugChromaticEnabled = true
  let debugCollisionOverlay = false
  let debugPerfOverlay = false
  const collisionDebugGroup = new THREE.Group()
  collisionDebugGroup.visible = false
  scene.add(collisionDebugGroup)

  // --- Space Gas Station (north of the tutorial asteroid) ---
  const GAS_STATION_X = 30
  const GAS_STATION_Y = 200
  const STATION_ENTER_DISTANCE = 60
  const gasStation = createGasStationModel()
  gasStation.group.position.set(GAS_STATION_X, GAS_STATION_Y, 0)
  initGasStationNeon(gasStation.neonMeshes)
  scene.add(gasStation.group)

  // Mirror of React's "is the cargo hold full?" state, pushed in via
  // setCargoFull. Drives the station chevron during normal play.
  let cargoFull = false

  // --- Directional Arrow (hidden until go-to-station tutorial step) ---
  const arrowGroup = new THREE.Group()
  arrowGroup.visible = false
  arrowGroup.scale.setScalar(0.35)
  scene.add(arrowGroup)
  // Chevron shape: 2 angled bars forming a ">" pointing right (rotated later)
  const arrowMat = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x39ff14,
    emissiveIntensity: 1.2,
    flatShading: true,
  })
  // Top bar of chevron
  const barGeo = new THREE.BoxGeometry(12, 2.5, 2)
  const topBar = new THREE.Mesh(barGeo, arrowMat)
  topBar.position.set(3, 2.5, 0)
  topBar.rotation.z = -0.5 // angle downward
  arrowGroup.add(topBar)
  // Bottom bar of chevron
  const botBar = new THREE.Mesh(barGeo.clone(), arrowMat)
  botBar.position.set(3, -2.5, 0)
  botBar.rotation.z = 0.5 // angle upward
  arrowGroup.add(botBar)
  // Second chevron (trailing, slightly transparent)
  const arrowMat2 = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x39ff14,
    emissiveIntensity: 0.7,
    flatShading: true,
    transparent: true,
    opacity: 0.6,
  })
  const topBar2 = new THREE.Mesh(barGeo.clone(), arrowMat2)
  topBar2.position.set(-5, 2.5, 0)
  topBar2.rotation.z = -0.5
  arrowGroup.add(topBar2)
  const botBar2 = new THREE.Mesh(barGeo.clone(), arrowMat2)
  botBar2.position.set(-5, -2.5, 0)
  botBar2.rotation.z = 0.5
  arrowGroup.add(botBar2)
  // Station proximity flags are now in tickState

  // --- Arbiter Pointer Arrows (red triangles pointing at off-screen Arbiters) ---
  const arbiterArrowGeo = new THREE.ConeGeometry(3, 8, 3)
  arbiterArrowGeo.rotateZ(-Math.PI / 2) // Orient cone to point in +X by default
  const arbiterArrowMat = new THREE.MeshStandardMaterial({
    color: 0xff3333,
    emissive: 0xff3333,
    emissiveIntensity: 1.5,
    flatShading: true,
  })
  const arbiterArrow = new THREE.Mesh(arbiterArrowGeo, arbiterArrowMat)
  arbiterArrow.visible = false
  scene.add(arbiterArrow)

  const arbiterEscortArrow = new THREE.Mesh(arbiterArrowGeo.clone(), arbiterArrowMat)
  arbiterEscortArrow.visible = false
  scene.add(arbiterEscortArrow)

  let isPlayerOutsideHarvestingArea = false

  // --- Game State (shared with game-tick.ts) ---
  // Start with prologue asteroid field; resetShipToStation replaces it with the real field.
  // Use default (tier-1) ship values here — the prologue tick (prologueTick → 'prologue-start')
  // overrides these with PROLOGUE_SHIP values when the intro sequence runs. Initialising with
  // prologue values would give returning players (no prologue) a fully-maxed ship until their
  // first store visit syncs the scene via setCombatUpgrades.
  const prologueAsteroids = spawnPrologueField(0, 0, PROLOGUE_ASTEROID_COUNT, PROLOGUE_MOON_COUNT)
  const tickState: TickState = createTickState({
    asteroids: prologueAsteroids,
    stationPosition: { x: GAS_STATION_X, y: GAS_STATION_Y },
  })

  // Create 3D models for prologue asteroids
  for (const a of prologueAsteroids) {
    const model = createAsteroidModel(a.type, a.size, hashString(a.id))
    model.position.set(a.x, a.y, 0)
    scene.add(model)
    const hm = attachAsteroidHealthMeter(model, a.size)
    asteroidModels.set(a.id, { model, healthMeter: hm })
  }

  // Convenience aliases for rendering code
  const ship = tickState.ship
  const asteroids = tickState.asteroids

  // Rendering-only state (not part of game tick)
  const projectileModels = new Map<string, THREE.Group>()
  const explosions: Explosion[] = []
  const debrisChunks: DebrisChunk[] = []
  const shipwreckDebrisList: ShipwreckDebris[] = []
  const enemyDamageSparks: EnemyDamageSparks[] = []
  const enemySparkCooldown = new WeakMap<EnemyShip, number>()

  // --- Collector VFX ---
  const collectorVfx = createCollectorVfx()
  scene.add(collectorVfx.group)

  // --- Screen Shake ---
  const screenShake: ScreenShake = createScreenShake()

  // --- Accessibility: prefers-reduced-motion ---
  // When the user has the OS-level "reduce motion" pref on, we mute the
  // bloom-stacked / vignetted / chromatic-aberrated post-process and turn
  // off screen shake. The game still plays normally; just stops moving the
  // camera and stops flashing the screen. Re-evaluated live on media-query
  // changes so toggling the OS setting takes effect without a reload.
  const reducedMotionMQ =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null

  // Two independent signals decide whether motion + post-FX run at full
  // strength:
  //   1. OS-level prefers-reduced-motion (forces both off when active)
  //   2. User pause-menu toggles (`screenShake` and `flashIntensity`)
  // We track both and AND them together so either source can silence an
  // effect. The pause settings are stored in localStorage by the user;
  // subscribePauseSettings fires once on subscribe with the current values.
  let osReducedMotion = reducedMotionMQ?.matches ?? false
  let userScreenShake = true
  let userFlashIntensity = true
  let userRetroMode = false

  // Photo mode flag. Independent of pause: while on, the simulation freezes
  // (page sets paused=true alongside) AND the camera detaches from the ship
  // so WASD / arrows pan it freely for framing screenshots.
  let photoModeActive = false
  const PHOTO_PAN_SPEED = 80 // world units per second

  function applyMotionState(): void {
    const flashOn = !osReducedMotion && userFlashIntensity
    const shakeOn = !osReducedMotion && userScreenShake
    debugBloomEnabled = flashOn
    debugVignetteEnabled = flashOn
    debugChromaticEnabled = flashOn
    if (!flashOn) {
      bloom.setBloom(0, true)
      bloom.setVignette(0)
      bloom.setChromaticAberration(0)
    }
    screenShake.enabled = shakeOn
  }

  const unsubscribePauseSettings = subscribePauseSettings((s) => {
    userScreenShake = s.screenShake
    userFlashIntensity = s.flashIntensity
    userRetroMode = s.retroMode
    applyMotionState()
  })

  // Detach handle for the reduced-motion listener, invoked in dispose(). Held
  // at scene scope so it survives out of the `if` block below — without it the
  // listener (and its closure over applyMotionState) leaks one entry on the
  // MediaQueryList per scene recreation (quit-to-title → new-game).
  let detachReducedMotion: (() => void) | null = null
  if (reducedMotionMQ) {
    const mq = reducedMotionMQ
    const onReducedMotionChange = (e: MediaQueryListEvent): void => {
      osReducedMotion = e.matches
      applyMotionState()
    }
    // Older Safari only supports addListener; modern is addEventListener.
    if (mq.addEventListener) {
      mq.addEventListener('change', onReducedMotionChange)
      detachReducedMotion = () => mq.removeEventListener('change', onReducedMotionChange)
    } else {
      ;(mq as MediaQueryList).addListener(onReducedMotionChange)
      detachReducedMotion = () => (mq as MediaQueryList).removeListener(onReducedMotionChange)
    }
  }

  // --- Background Effects ---
  const twinkleStars: TwinkleStars = createTwinkleStars()
  scene.add(twinkleStars.points)

  const nebulaSystem: NebulaSystem = createNebulaSystem()
  scene.add(nebulaSystem.group)

  // The starter black hole near the spawn area. Suppressed during the tutorial
  // so the player can't die to a hazard the game hasn't taught yet — it spawns
  // once the tutorial reaches 'done' (see the loop below). Returning players
  // (who start at step 'done') get it immediately.
  const INITIAL_BLACK_HOLE = { x: -200, y: 200 }
  const blackHoles: BlackHole[] = []
  function spawnInitialBlackHole(): void {
    const hole = createBlackHole(INITIAL_BLACK_HOLE.x, INITIAL_BLACK_HOLE.y)
    scene.add(hole.group)
    blackHoles.push(hole)
  }
  let initialBlackHoleSpawned = false
  if (getTutorialStep() === 'done') {
    spawnInitialBlackHole()
    initialBlackHoleSpawned = true
  }

  // Prologue-only demo holes. The intro flies the full prestige loadout, so we
  // drop a pair of reachable black holes during the free-mining beat to let the
  // player pilot in and feel the Wormhole Generator yank them across the field.
  // Cleared the instant the mining beat ends (see the per-frame block) so they
  // never bleed into the scripted Arbiter sequence or live play.
  let prologueBlackHolesSpawned = false
  function spawnPrologueBlackHoles(): void {
    for (const pos of [{ x: 170, y: 0 }, { x: -170, y: 0 }]) {
      const hole = createBlackHole(pos.x, pos.y)
      scene.add(hole.group)
      blackHoles.push(hole)
    }
    prologueBlackHolesSpawned = true
  }
  function clearPrologueBlackHoles(): void {
    for (const h of blackHoles) disposeBlackHole(h)
    blackHoles.length = 0
    prologueBlackHolesSpawned = false
  }

  // --- Engine Trail ---
  const engineTrail: EngineTrail = createEngineTrail()
  scene.add(engineTrail.group)

  // --- Warp Streaks (Arbiter approach effect) ---
  const warpStreaks = createWarpStreaks()
  scene.add(warpStreaks.group)

  // --- Speed Lines (directional boost-dash effect) ---
  const speedLines = createSpeedLines()
  scene.add(speedLines.group)

  // Hit counts are tracked in tickState.asteroidHitCounts

  // --- Input ---
  const inputState = createInputState()
  const inputHandler = createInputHandler(inputState)
  inputHandler.attach()

  // --- Aim (mouse/touch tracking) ---
  const aimState = createAimState()
  const aimHandler = createAimHandler(aimState, container)
  aimHandler.attach()

  // --- Virtual Joystick (mobile touch movement — left side) ---
  const joystick = createVirtualJoystick(inputState, container)
  joystick.attach()

  // --- Aim Joystick (mobile twin-stick aim + fire — right side) ---
  const aimJoystick = createAimJoystick(aimState, container)
  aimJoystick.attach()

  // --- Gamepad (XInput / Xbox 360 mapping) ---
  // Left stick → movement, right stick → aim + fire, LT / RT → boost.
  const gamepad = createGamepadHandler(inputState, aimState, container)
  gamepad.attach()
  let lazerUnlocked = true

  // --- Screen-to-world coordinate conversion ---
  const raycaster = new THREE.Raycaster()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const ndcVec = new THREE.Vector2()
  const worldIntersect = new THREE.Vector3()

  function screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const w = renderer.domElement.clientWidth
    const h = renderer.domElement.clientHeight
    // Convert screen pixels to NDC (-1 to 1)
    ndcVec.x = (screenX / w) * 2 - 1
    ndcVec.y = -(screenY / h) * 2 + 1
    raycaster.setFromCamera(ndcVec, camera)
    const hit = raycaster.ray.intersectPlane(groundPlane, worldIntersect)
    if (!hit) return { x: camera.position.x, y: camera.position.y }
    return { x: worldIntersect.x, y: worldIntersect.y }
  }

  // --- Fire handlers ---
  let fireTarget: { x: number; y: number } | null = null
  let mouseHoldingFire = false

  // Death sequence: once the hull is lost we want a beat of "the ship just
  // blew up" before the HUD-level Game Over UI appears. While this timer is
  // counting down, gameplay input is suppressed and the ship is hidden — the
  // wreckage debris and explosion handle the spectacle.
  const DEATH_SEQUENCE_DURATION = 2.5
  let deathSequenceTimer: number | null = null
  let pendingRunStats: RunStats | null = null

  // Detect touch support to decide between mobile buttons and mouse controls
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  function onMouseDown(e: MouseEvent): void {
    resumeAudio()
    startEngineSound()
    if (getPaused()) return
    if (e.button === 0) {
      // Left-click: fire weapon (and track hold for auto-fire)
      mouseHoldingFire = true
      const rect = renderer.domElement.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      fireTarget = screenToWorld(sx, sy)
    } else if (e.button === 2) {
      // Right-click: trigger thruster boost
      inputState.boost = true
    }
  }

  function onMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      mouseHoldingFire = false
    } else if (e.button === 2) {
      inputState.boost = false
    }
  }

  function onContextMenu(e: Event): void {
    e.preventDefault()
  }

  renderer.domElement.addEventListener('mousedown', onMouseDown)
  renderer.domElement.addEventListener('mouseup', onMouseUp)
  renderer.domElement.addEventListener('contextmenu', onContextMenu)

  // --- Tool Toggle (keyboard Q + mobile button) ---
  let toolToggleButton: ToolToggleButton | null = null

  function toggleMiningTool(): void {
    const tools: MiningTool[] = ['blaster']
    if (lazerUnlocked) tools.push('lazer')
    if (tickState.rippleUnlocked) tools.push('ripple')
    const currentIndex = Math.max(0, tools.indexOf(tickState.activeMiningTool))
    const newTool = tools[(currentIndex + 1) % tools.length]
    tickState.activeMiningTool = newTool
    toolToggleButton?.setTool(newTool)
    onToolChange?.(newTool)
  }

  function selectMiningTool(tool: MiningTool): void {
    if (tool === 'lazer' && !lazerUnlocked) return
    if (tool === 'ripple' && !tickState.rippleUnlocked) return
    tickState.activeMiningTool = tool
    toolToggleButton?.setTool(tool)
    onToolChange?.(tool)
  }

  if (hasTouch) {
    toolToggleButton = createToolToggleButton(container, () => {
      if (getPaused()) return
      toggleMiningTool()
    })
    toolToggleButton.attach()
  }

  function onToolToggleKeyDown(e: KeyboardEvent): void {
    // Ignore OS key-repeat — without this, even a brief hold cycles past
    // the tool the player meant to land on.
    if (e.repeat) return
    // Don't steal Q / 1-3 while the player is typing in an input (e.g. the
    // run-summary initials box). Otherwise picking the letter Q for their
    // initials would silently flip the active mining tool.
    if (isEditableTarget(e.target)) return
    if (e.code === 'KeyQ') {
      toggleMiningTool()
    }
    if (e.code === 'Digit1' || e.code === 'Numpad1') selectMiningTool('blaster')
    if (e.code === 'Digit2' || e.code === 'Numpad2') selectMiningTool('lazer')
    if (e.code === 'Digit3' || e.code === 'Numpad3') selectMiningTool('ripple')
  }
  window.addEventListener('keydown', onToolToggleKeyDown)

  // --- Audio priming via the legacy collect keys ---
  // Collection is automatic now (the magnet always runs), so E / Space no
  // longer toggle a pickup state. We keep a keydown listener purely so those
  // keys still count as the user gesture that unlocks the WebAudio context
  // for keyboard-only players who never click.
  function onCollectKeyDown(e: KeyboardEvent): void {
    // Don't intercept E / Space while the player is typing (e.g. the
    // run-summary initials box).
    if (isEditableTarget(e.target)) return
    if (e.code === 'KeyE' || e.code === 'Space') {
      resumeAudio()
    }
  }
  window.addEventListener('keydown', onCollectKeyDown)

  // Swallow right-half touches that miss the fire button so the browser
  // doesn't synthesize mouse events that rotate the ship or break the joystick.
  function onTouchStartSwallow(e: TouchEvent): void {
    resumeAudio()
    startEngineSound()
    const rect = container.getBoundingClientRect()
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      if (touch.clientX - rect.left >= rect.width / 2) {
        e.preventDefault()
        return
      }
    }
  }
  container.addEventListener('touchstart', onTouchStartSwallow, { passive: false })

  // --- Resize ---
  function onResize(): void {
    const w = container.clientWidth
    const h = container.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    bloom.resize(w, h)
    retroRenderer.resize(w, h)
  }
  window.addEventListener('resize', onResize)

  // Helper to remove a projectile model from the scene
  function removeProjectileModel(id: string): void {
    const model = projectileModels.get(id)
    if (model) {
      scene.remove(model)
      model.traverse(disposeMesh)
      projectileModels.delete(id)
    }
  }

  // --- Game Loop ---
  let prevTime = performance.now()
  let animId = 0
  let wasPaused = false
  // One-shot latch for the black-hole warning popup. Reset only by a fresh
  // scene mount — cross-session "already seen" persistence lives in the
  // page layer (per-slot localStorage flag).
  let blackHoleWarnFired = false
  let blackHoleWarningActive = false
  let blackHoleMaxDistFromStation = 0
  let blackHoleNextRing = 0

  // One-shot tutorial-popup latches. Each fires the first time the matching
  // condition is true after a scene mount; cross-session "already seen"
  // persistence is handled in the page layer via per-slot localStorage flags.
  let firstDefensiveHitFired = false
  let firstFormationFired = false
  let firstSplitterFired = false
  const formationShieldVisuals = new Map<string, FormationShieldVisual>()

  // --- Tab visibility ---
  // Browsers throttle requestAnimationFrame to ~1 Hz while a tab is hidden,
  // but the WebAudio thread keeps running at full speed. Without explicit
  // handling, sirens / drill / engine loops keep wailing in the background
  // and time-gated prologue beats (Arbiter approach, dialogue) drip-feed
  // forward at 1 fps. Treat hidden as a transparent pause: mute loops the
  // moment we lose visibility (the next rAF is too slow to do it for us)
  // and reset prevTime on return so the first re-tick doesn't carry a
  // spurious elapsed-while-hidden delta.
  let tabHidden = typeof document !== 'undefined' && document.hidden
  const onVisibilityChange = (): void => {
    if (document.hidden) {
      tabHidden = true
      suspendEngineSound()
      stopCollectorHum()
      suspendDrillSound()
      stopArbiterSiren()
      suspendMusic()
      wasPaused = true
    } else {
      tabHidden = false
      prevTime = performance.now()
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  let prevLedgerInt = -1
  let prevArbiterKey = ''
  let prevTractorActive = false
  let prevBoostActive = false
  let lastContinuousWeaponSfxAt = 0

  function triggerEnemyDamageFeedback(
    enemy: EnemyShip,
    x: number,
    y: number,
    damage: number,
  ): void {
    const nowSeconds = performance.now() / 1000
    const carrierScale = enemy.kind === 'carrier' ? 1.8 : 1
    enemy.mesh.userData.damageFlash = Math.max(
      Number(enemy.mesh.userData.damageFlash ?? 0),
      enemy.kind === 'carrier' ? 1 : 0.75,
    )
    enemy.mesh.userData.damageShakeUntil = nowSeconds + (enemy.kind === 'carrier' ? 0.16 : 0.1)
    enemy.mesh.userData.damageShakePower = Math.max(
      Number(enemy.mesh.userData.damageShakePower ?? 0),
      carrierScale * (0.45 + Math.min(0.8, damage * 0.45)),
    )

    const nextSpark = enemySparkCooldown.get(enemy) ?? 0
    if (nowSeconds < nextSpark) return
    enemySparkCooldown.set(enemy, nowSeconds + (enemy.kind === 'carrier' ? 0.08 : 0.14))
    const count = enemy.kind === 'carrier' ? 5 : 3
    const sparks = createEnemyDamageSparks(x, y, enemy.collisionRadius, count)
    scene.add(sparks.group)
    enemyDamageSparks.push(sparks)
  }

  function applyEnemyDamageFeedback(enemy: EnemyShip, dt: number): void {
    const nowSeconds = performance.now() / 1000
    const flash = Number(enemy.mesh.userData.damageFlash ?? 0)
    if (flash > 0) {
      enemy.mesh.userData.damageFlash = Math.max(0, flash - dt * 7)
    }
    const nextFlash = Number(enemy.mesh.userData.damageFlash ?? 0)
    enemy.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const mat = obj.material
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.emissive.setHex(0xff5522)
        mat.emissiveIntensity = nextFlash * 1.25
      }
    })

    const shakeUntil = Number(enemy.mesh.userData.damageShakeUntil ?? 0)
    if (nowSeconds > shakeUntil) return
    const power = Number(enemy.mesh.userData.damageShakePower ?? 0)
    const falloff = Math.max(0, (shakeUntil - nowSeconds) / 0.16)
    enemy.mesh.position.x += (Math.random() - 0.5) * power * falloff
    enemy.mesh.position.y += (Math.random() - 0.5) * power * falloff
  }

  function createCarrierShieldMesh(radius: number): THREE.Mesh {
    const geo = new THREE.TorusGeometry(radius + 12, 3.5, 8, 48)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x39ff14,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
    return new THREE.Mesh(geo, mat)
  }

  function updateCarrierShield(enemy: EnemyShip, dt: number): void {
    if (enemy.kind !== 'carrier') return
    const shieldMesh = enemy.mesh.userData.carrierShieldMesh as THREE.Mesh | undefined
    if (!shieldMesh) return

    const nowS = performance.now() / 1000
    const frac = CARRIER_SHIELD_HP > 0 ? enemy.carrierShieldHp / CARRIER_SHIELD_HP : 0
    const depleted = enemy.carrierShieldHp <= 0
    const prevDepleted = Boolean(enemy.mesh.userData.carrierShieldDepleted)

    // Detect the moment the shield breaks → trigger a bright cyan flash
    if (depleted && !prevDepleted) {
      enemy.mesh.userData.shieldBreakUntil = nowS + 0.35
    }
    enemy.mesh.userData.carrierShieldDepleted = depleted

    if (depleted) {
      shieldMesh.visible = false
      const breakUntil = Number(enemy.mesh.userData.shieldBreakUntil ?? 0)
      if (breakUntil > nowS) {
        const t = (breakUntil - nowS) / 0.35
        enemy.mesh.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return
          const mat = obj.material
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.emissive.setHex(0x44ccff)
            mat.emissiveIntensity = Math.max(mat.emissiveIntensity, t * 3.0)
          }
        })
      }
      return
    }

    shieldMesh.visible = true
    const mat = shieldMesh.material as THREE.MeshBasicMaterial
    const pulse = 0.35 + 0.2 * Math.sin(performance.now() * 0.004)
    mat.opacity = frac * pulse
    shieldMesh.rotation.z += dt * 0.6

    // Dynamically interpolate color: green (frac = 1) -> red (frac = 0)
    const startColor = new THREE.Color(0x39ff14) // green
    const endColor = new THREE.Color(0xff3333) // red
    mat.color.copy(endColor).lerp(startColor, frac)
  }

  function syncFormationShieldVisuals(dt: number): void {
    const groups = new Map<string, EnemyShip[]>()
    for (const enemy of tickState.ambushEnemies) {
      if (!enemy.alive || !enemy.formationShieldActive || !enemy.formationShieldId) continue
      const members = groups.get(enemy.formationShieldId)
      if (members) {
        members.push(enemy)
      } else {
        groups.set(enemy.formationShieldId, [enemy])
      }
    }

    for (const [id, members] of groups) {
      let visual = formationShieldVisuals.get(id)
      if (!visual) {
        visual = createFormationShieldVisual()
        formationShieldVisuals.set(id, visual)
        scene.add(visual.group)
      }

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const enemy of members) {
        minX = Math.min(minX, enemy.x - enemy.collisionRadius)
        minY = Math.min(minY, enemy.y - enemy.collisionRadius)
        maxX = Math.max(maxX, enemy.x + enemy.collisionRadius)
        maxY = Math.max(maxY, enemy.y + enemy.collisionRadius)
      }

      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2
      const radiusX = Math.max(10, (maxX - minX) / 2 + 8)
      const radiusY = Math.max(10, (maxY - minY) / 2 + 8)
      visual.pulse += dt * 5.5
      const pulse = 1 + Math.sin(visual.pulse) * 0.05
      visual.group.position.set(centerX, centerY, 0.18)
      visual.group.scale.set(radiusX * pulse, radiusY * pulse, 1)

      const fillMat = visual.fill.material
      if (fillMat instanceof THREE.MeshBasicMaterial) {
        fillMat.opacity = 0.09 + (Math.sin(visual.pulse * 0.9) + 1) * 0.025
      }
      const ringMat = visual.ring.material
      if (ringMat instanceof THREE.MeshBasicMaterial) {
        ringMat.opacity = 0.48 + (Math.sin(visual.pulse) + 1) * 0.12
      }
    }

    for (const [id, visual] of formationShieldVisuals) {
      if (groups.has(id)) continue
      scene.remove(visual.group)
      disposeFormationShieldVisual(visual)
      formationShieldVisuals.delete(id)
    }
  }

  function clearFormationShieldVisuals(): void {
    for (const visual of formationShieldVisuals.values()) {
      scene.remove(visual.group)
      disposeFormationShieldVisual(visual)
    }
    formationShieldVisuals.clear()
  }

  function syncOptionOrbs(): void {
    const count = Math.max(0, Math.min(3, tickState.optionCount))
    while (optionOrbs.children.length < count) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(1.7, 12, 8),
        new THREE.MeshBasicMaterial({
          color: 0x88eeff,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthTest: false,
        }),
      )
      orb.renderOrder = 10
      optionOrbs.add(orb)
    }
    while (optionOrbs.children.length > count) {
      const orb = optionOrbs.children.pop()
      if (orb) orb.traverse(disposeMesh)
    }
    // Shared placement with the firing code so shots leave the visible orbs.
    // At 3 orbs this is the figure-four formation; otherwise the trailing line.
    const positions = optionOrbPositions(ship, tickState.positionHistory, tickState.optionCount)
    for (let i = 0; i < optionOrbs.children.length; i++) {
      const p = positions[i] ?? { x: ship.x, y: ship.y }
      optionOrbs.children[i].position.set(p.x, p.y, 2.5)
    }
  }

  let impactFlashTimer = 0
  const shockwaves: Shockwave[] = []
  let lastKlaxonTime = 0

  /** Toggle a muffled low-pass filter effect on the music. */
  function updateMusicMuffle(result: TickResult): void {
    const isStationRange = result.nearStation
    const isPaused = getPaused()
    setMusicFilter(isPaused || isStationRange)
  }

  function loop(): void {
    animId = requestAnimationFrame(loop)
    const now = performance.now()
    const rawDt = Math.min((now - prevTime) / 1000, 0.05) // cap at 50ms
    prevTime = now

    // Cinematic slow-mo during the death sequence — eases the whole world
    // (debris, VFX, simulation) into a 0.35x time scale over the first
    // 30% of the timer, holds, then snaps back when the sequence ends.
    let slowMo = 1
    if (deathSequenceTimer !== null) {
      const elapsed = DEATH_SEQUENCE_DURATION - deathSequenceTimer
      const rampIn = Math.min(1, elapsed / (DEATH_SEQUENCE_DURATION * 0.3))
      slowMo = 1 - 0.65 * rampIn
    }
    tickState.slowMoFactor = slowMo
    const dt = rawDt * slowMo

    // --- Build per-frame input for the shared tick function ---
    const paused = getPaused() || tabHidden

    // --- Gamepad poll: writes to inputState/aimState, returns firing intent and radar crosshair ---
    const gamepadResult = gamepad.poll(tickState.miningDroneCap > 0)
    if (!paused && gamepadResult.toolToggle) toggleMiningTool()

    // Gamepad radar crosshair → rally point (if drones are available)
    if (!paused && radar && gamepadResult.radarCrosshair && tickState.miningDroneCap > 0) {
      const { nx, ny } = gamepadResult.radarCrosshair
      tickState.rallyPoint = radarCrosshairToWorld(radar, nx, ny, ship.x, ship.y)
    }

    // --- Aim joystick poll: writes to aimState, returns firing intent ---
    const aimJoystickResult = aimJoystick.poll()

    // Compute world-space aim from screen-space aimState
    let aimWorldPosition: { x: number; y: number } | null = null
    if (aimState.active) {
      const w = screenToWorld(aimState.screenX, aimState.screenY)
      aimWorldPosition = { x: w.x, y: w.y }
    }

    // During the death sequence, suppress all fire input — the ship is
    // already exploded so any stray clicks shouldn't conjure new shots.
    const inputLocked = deathSequenceTimer !== null

    // Sync fire state from DOM event handlers into tickState
    if (fireTarget && !inputLocked) {
      tickState.fireTarget = fireTarget
      fireTarget = null
    }

    // Gamepad fire (right stick past deadzone)
    if (!paused && !inputLocked && gamepadResult.firing && aimState.active) {
      const w = screenToWorld(aimState.screenX, aimState.screenY)
      tickState.fireTarget = { x: w.x, y: w.y }
    }

    // Touch twin-stick fire (right-side aim joystick)
    if (!paused && !inputLocked && aimJoystickResult.firing && aimState.active) {
      const w = screenToWorld(aimState.screenX, aimState.screenY)
      tickState.fireTarget = { x: w.x, y: w.y }
    }

    // Always sync from DOM — tick's input cooldown handles stale events
    tickState.mouseHoldingFire = inputLocked ? false : mouseHoldingFire
    tickState.aimActive = aimState.active

    // Auto-toggle: when the upgrade is owned and the player is aiming, pick
    // the preferred tool for whatever asteroid is nearest the aim line from
    // the ship. Holds the chosen tool until the aim moves off any rock.
    if (tickState.autoToolUnlocked && aimWorldPosition) {
      const sx = ship.x
      const sy = ship.y
      const ax = aimWorldPosition.x
      const ay = aimWorldPosition.y
      let dx = ax - sx
      let dy = ay - sy
      const len = Math.hypot(dx, dy)
      if (len > 0.001) {
        dx /= len
        dy /= len
        const AUTO_RANGE = 320
        const AUTO_TOLERANCE_SQ = 60 * 60
        let bestT = Infinity
        let bestAsteroid: (typeof tickState.asteroids)[number] | null = null
        for (const a of tickState.asteroids) {
          if (a.hp <= 0) continue
          const ox = a.x - sx
          const oy = a.y - sy
          const t = ox * dx + oy * dy
          if (t < 0 || t > AUTO_RANGE) continue
          const perpX = ox - t * dx
          const perpY = oy - t * dy
          const dSq = perpX * perpX + perpY * perpY
          if (dSq > AUTO_TOLERANCE_SQ) continue
          if (t < bestT) {
            bestT = t
            bestAsteroid = a
          }
        }
        if (bestAsteroid) {
          const want = PREFERRED_TOOL[bestAsteroid.type]
          const available =
            want === 'blaster' ||
            (want === 'lazer' && lazerUnlocked) ||
            (want === 'ripple' && tickState.rippleUnlocked)
          if (available && want !== tickState.activeMiningTool) {
            tickState.activeMiningTool = want
            toolToggleButton?.setTool(want)
            onToolChange?.(want)
          }
        }
      }
    }

    // Camera-visible world rectangle (camera looks straight down at the z=0
    // play plane). Used by tick() to gate fire to on-screen targets only.
    const camHalfH = camera.position.z * Math.tan((camera.fov * Math.PI) / 360)
    const camHalfW = camHalfH * camera.aspect

    const tickInput: TickInput = {
      dt,
      paused,
      inputState,
      aimWorldPosition,
      tutorialStep: getTutorialStep(),
      viewBounds: {
        centerX: camera.position.x,
        centerY: camera.position.y,
        halfW: camHalfW,
        halfH: camHalfH,
      },
      radarRange: radar ? radar.range : 540,
      blackHoles: blackHoles.map((h) => ({
        x: h.x + camera.position.x * 0.1,
        y: h.y + camera.position.y * 0.1,
        scale: h.scale,
      })),
    }

    // Snapshot mesh-bearing objects before tick (tick may splice them out)
    const metalMeshMap = new Map(tickState.metalChunks.map((m) => [m.id, m.mesh]))
    const scrapMeshMap = new Map(tickState.scrapBoxes.map((s) => [s.id, s.mesh]))
    const enemyProjMeshMap = new Map(tickState.enemyProjectiles.map((p) => [p.id, p.mesh]))
    const enemyBeforeTick = tickState.enemy

    const result = tick(tickState, tickInput)
    updateMusicMuffle(result)

    // --- Update Music Intensity ---
    let musicIntensity = 0
    if (tickState.enemy && tickState.enemy.alive) musicIntensity = 0.6
    if (tickState.ambushEnemies.some((e) => e.alive)) musicIntensity = 0.8
    if (
      (tickState.arbiter && tickState.arbiter.mode === 'hunting') ||
      (tickState.arbiterEscort && tickState.arbiterEscort.mode === 'hunting')
    )
      musicIntensity = 1.0
    // Subtle build-up based on asteroid proximity
    if (musicIntensity === 0) {
      const nearest = asteroids.find((a) => a.hp > 0)
      if (nearest) {
        const d = Math.hypot(nearest.x - ship.x, nearest.y - ship.y)
        musicIntensity = Math.max(0, 0.4 * (1 - d / 150))
      }
    }
    setMusicIntensity(musicIntensity)
    updateMusic(dt)

    // Sync cleared aim/fire state back to scene-level variables
    aimState.active = tickState.aimActive
    mouseHoldingFire = tickState.mouseHoldingFire

    let speedNorm = 0
    if (!paused) {
      if (impactFlashTimer > 0) {
        impactFlashTimer -= dt
        bloom.setBloom(0.6 + impactFlashTimer * 4, true)
        if (impactFlashTimer <= 0) {
          bloom.setBloom(0.3)
        }
      }

      const hpRatio = tickState.playerHp / effectivePlayerMaxHp()
      bloom.setVignette(Math.max(0, (1 - hpRatio) * 0.6))
      if (hpRatio < 0.3) {
        bloom.setChromaticAberration((0.3 - hpRatio) * 0.8)
      } else {
        bloom.setChromaticAberration(0)
      }

      if (hpRatio < 0.25 && now - lastKlaxonTime > 2000) {
        playKlaxon('low')
        lastKlaxonTime = now
      }

      // Update shockwaves
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i]
        if (!updateShockwave(sw, dt)) {
          scene.remove(sw.mesh)
          disposeShockwave(sw)
          shockwaves.splice(i, 1)
        }
      }

      // --- Process tick result for rendering ---

      // Recharge meter (rendering-only)
      updateRechargeMeter(
        rechargeMeter,
        tickState.blasterState,
        tickState.blasterTier,
        tickState.activeMiningTool,
        tickState.lazerState,
      )

      // Lazer beam visual
      const beamElapsed = tickState.elapsedTime
      updateLazerBeam(
        lazerBeam,
        result.beamActive,
        result.beamStartX,
        result.beamStartY,
        result.beamEndX,
        result.beamEndY,
        beamElapsed,
      )
      for (let i = 0; i < optionLazerBeams.length; i++) {
        const optionBeam = result.optionBeams[i]
        updateLazerBeam(
          optionLazerBeams[i],
          !!optionBeam,
          optionBeam?.startX ?? 0,
          optionBeam?.startY ?? 0,
          optionBeam?.endX ?? 0,
          optionBeam?.endY ?? 0,
          beamElapsed,
        )
      }
      updateRippleBeam(
        rippleBeam,
        result.rippleActive,
        result.rippleStartX,
        result.rippleStartY,
        result.rippleEndX,
        result.rippleEndY,
        tickState.elapsedTime,
      )
      if (result.beamActive || result.optionBeams.length > 0 || result.rippleActive) {
        if (now - lastContinuousWeaponSfxAt > 90) {
          lastContinuousWeaponSfxAt = now
          playLaserFire()
        }
      } else if (result.newProjectiles.length > 0) {
        playLaserFire()
      }

      for (const hit of result.enemyDamaged) {
        triggerEnemyDamageFeedback(hit.enemy, hit.x, hit.y, hit.damage)
      }

      // Rocks destroyed this tick get a dedicated shatter (sound + burst) in the
      // destruction loop below. Suppress the generic per-hit explosion on that
      // same frame so the kill reads as one shatter, not a doubled-up boom.
      const destroyedThisTick = new Set([
        ...result.destroyedAsteroidIds.map((d) => d.id),
        ...result.destroyedComets.map((d) => d.id),
      ])

      // Beam hit VFX (explosions on hit asteroids)
      for (const hit of result.beamHits) {
        if (hit.deflected) continue
        if (destroyedThisTick.has(hit.asteroidId)) continue
        // Only show explosion VFX periodically (not every frame)
        const hitCount = tickState.asteroidHitCounts.get(hit.asteroidId) ?? 0
        if (hitCount > 0 && hitCount % HITS_PER_BREAK === 0) {
          const explosion = createExplosion(hit.x, hit.y)
          scene.add(explosion.group)
          explosions.push(explosion)
          playExplosion()
          dynamicLights.flashExplosion(hit.x, hit.y)
          explosionGlowParticles.emit(hit.x, hit.y, 6, {
            lifetime: 0.4, speed: 25, size: 1.5,
            colors: [0xffaa00, 0xff6600, 0xffdd44], spread: Math.PI * 2,
          })

          const hitModel = asteroidModels.get(hit.asteroidId)?.model
          if (hitModel) {
            const chunks = breakChunks(hitModel, hit.x, hit.y, 2 + Math.floor(Math.random() * 2))
            for (const chunk of chunks) {
              scene.add(chunk.mesh)
              debrisChunks.push(chunk)
            }
          }
        }
      }

      // Sync asteroid model positions; add tactile jitter to the drilled rock
      const drillJitterAmp = result.drillNoseActive
        ? [0, 0.7, 1.3, 2.0][tickState.drillNoseTier] ?? 0
        : 0
      for (const a of asteroids) {
        const entry = asteroidModels.get(a.id)
        if (entry) {
          const jitter = drillJitterAmp > 0 && a.id === result.drillNoseAsteroidId
          entry.model.position.set(
            a.x + (jitter ? (Math.random() - 0.5) * 2 * drillJitterAmp : 0),
            a.y + (jitter ? (Math.random() - 0.5) * 2 * drillJitterAmp : 0),
            0,
          )
        }
      }

      // Sync roaming-comet positions + tail orientation.
      for (const c of tickState.comets) {
        const model = cometModels.get(c.id)
        if (model) {
          model.group.position.set(c.x, c.y, 0)
          updateCometModel(model, c.velocityX, c.velocityY, now / 1000)
        }
      }

      // New projectile models
      for (const p of result.newProjectiles) {
        const model = createProjectileModel(p.tool)
        model.position.set(p.x, p.y, 0)
        const angle = Math.atan2(p.velocityY, p.velocityX)
        model.rotation.z = angle - Math.PI / 2
        scene.add(model)
        projectileModels.set(p.id, model)
      }

      // Remove expired/hit projectile models
      for (const id of result.expiredProjectileIds) {
        removeProjectileModel(id)
      }

      // Asteroid hit VFX
      for (const hit of result.asteroidHits) {
        removeProjectileModel(hit.projectileId)
        if (hit.deflected) continue
        // Killing blow — let the shatter loop own the destruction FX.
        if (destroyedThisTick.has(hit.asteroidId)) continue

        const explosion = createExplosion(hit.x, hit.y)
        scene.add(explosion.group)
        explosions.push(explosion)
        playExplosion()
        dynamicLights.flashExplosion(hit.x, hit.y)
        explosionGlowParticles.emit(hit.x, hit.y, 8, {
          lifetime: 0.4, speed: 30, size: 1.8,
          colors: [0xffaa00, 0xff6600, 0xffdd44], spread: Math.PI * 2,
        })

        // Break off visual debris chunks
        const hitCount = tickState.asteroidHitCounts.get(hit.asteroidId) ?? 0
        if (hitCount > 0 && hitCount % HITS_PER_BREAK === 0) {
          const hitModel = asteroidModels.get(hit.asteroidId)?.model
          if (hitModel) {
            const chunks = breakChunks(hitModel, hit.x, hit.y, 2 + Math.floor(Math.random() * 2))
            for (const chunk of chunks) {
              scene.add(chunk.mesh)
              debrisChunks.push(chunk)
            }
          }
        }
      }

      // Endless mode: replenished asteroid models
      for (const a of result.newAsteroids) {
        const model = createAsteroidModel(a.type, a.size, hashString(a.id))
        model.position.set(a.x, a.y, 0)
        scene.add(model)
        const hm = attachAsteroidHealthMeter(model, a.size)
        asteroidModels.set(a.id, { model, healthMeter: hm })
      }

      // Asteroid destruction VFX + sound — only for actually destroyed rocks,
      // not culled ones. Play shatter before the model is disposed so we
      // can still reference its position.
      for (const dest of result.destroyedAsteroidIds) {
        const { x, y } = dest
        playAsteroidShatter(dest.type)
        const explosion = createExplosion(x, y)
        scene.add(explosion.group)
        explosions.push(explosion)
        dynamicLights.flashExplosion(x, y)
        explosionGlowParticles.emit(x, y, 12, {
          lifetime: 0.5, speed: 35, size: 2.2,
          colors: [0xffaa00, 0xff6600, 0xffdd44, 0xffffff], spread: Math.PI * 2,
        })
        // Type-specific shatter: eject the model's voxels as flying debris.
        // Runs before the disposal loop below tears the (now-cored) model down.
        const entry = asteroidModels.get(dest.id)
        if (entry) {
          for (const chunk of shatterAsteroid(entry.model, dest.type)) {
            scene.add(chunk.mesh)
            debrisChunks.push(chunk)
          }
        }
      }

      // Endless mode: dispose destroyed/culled asteroid models
      for (const id of result.expiredAsteroidIds) {
        const entry = asteroidModels.get(id)
        if (entry) {
          scene.remove(entry.model)
          entry.model.traverse(disposeMesh)
          asteroidModels.delete(id)
        }
      }

      // --- Roaming comets: spawn meshes for new ones ---
      for (const c of result.newComets) {
        const model = createCometModel()
        model.group.position.set(c.x, c.y, 0)
        scene.add(model.group)
        cometModels.set(c.id, model)
      }

      // Comet destruction VFX — a bright icy burst + shatter sound.
      for (const dest of result.destroyedComets) {
        playAsteroidShatter('comet')
        const explosion = createExplosion(dest.x, dest.y)
        scene.add(explosion.group)
        explosions.push(explosion)
        dynamicLights.flashExplosion(dest.x, dest.y)
        explosionGlowParticles.emit(dest.x, dest.y, 20, {
          lifetime: 0.6, speed: 45, size: 2.4,
          colors: [0x66ffcc, 0x9fe8ff, 0xffffff, 0x44ddff], spread: Math.PI * 2,
        })
      }

      // Dispose destroyed/culled comet models.
      for (const id of result.expiredCometIds) {
        const model = cometModels.get(id)
        if (model) {
          scene.remove(model.group)
          disposeCometModel(model)
          cometModels.delete(id)
        }
      }

      // New metal chunk models
      for (const metal of result.newMetalChunks) {
        scene.add(metal.mesh)
      }

      // Metal collected — remove meshes from scene
      for (const mc of result.metalCollected) {
        const mesh = metalMeshMap.get(mc.id)
        if (mesh) {
          scene.remove(mesh)
          mesh.traverse(disposeMesh)
        }
        playCollectPling()
      }

      // Add meshes for scrap boxes spawned this tick (enemy / patrol drops).
      // Replaces the old "last box" heuristic, which dropped boxes whenever
      // several enemies died on the same tick.
      for (const sb of tickState.scrapBoxes) {
        if (!scrapMeshMap.has(sb.id)) {
          scene.add(sb.mesh)
          scrapMeshMap.set(sb.id, sb.mesh)
        }
      }

      // Scrap collected — remove meshes from scene
      for (const sc of result.scrapCollected) {
        const mesh = scrapMeshMap.get(sc.id)
        if (mesh) {
          scene.remove(mesh)
          mesh.traverse(disposeMesh)
        }
        playCollectPling()
      }

      // Loot stolen by scavengers — remove meshes silently (no pling, no credit)
      for (const id of result.metalStolen) {
        const mesh = metalMeshMap.get(id)
        if (mesh) {
          scene.remove(mesh)
          mesh.traverse(disposeMesh)
        }
      }
      for (const id of result.scrapStolen) {
        const mesh = scrapMeshMap.get(id)
        if (mesh) {
          scene.remove(mesh)
          mesh.traverse(disposeMesh)
        }
      }

      // Enemy spawned — add mesh to scene
      if (result.enemySpawned) {
        scene.add(result.enemySpawned.mesh)
        // Enemy faces the player, so place the bar behind the ship (-Y),
        // pushed clear of bigger hulls (the carrier).
        const enemyHealthMeter = createHealthMeter(
          -Math.max(HEALTH_BAR_OFFSET_Y, result.enemySpawned.collisionRadius + 8),
        )
        result.enemySpawned.mesh.add(enemyHealthMeter)
        result.enemySpawned.mesh.userData.healthMeter = enemyHealthMeter

        if (result.enemySpawned.kind === 'carrier') {
          const shieldMesh = createCarrierShieldMesh(result.enemySpawned.collisionRadius)
          result.enemySpawned.mesh.add(shieldMesh)
          result.enemySpawned.mesh.userData.carrierShieldMesh = shieldMesh
        }
      }

      // Enemy projectiles — add meshes
      for (const proj of result.newEnemyProjectiles) {
        scene.add(proj.mesh)
        // Register in mesh map so same-tick hits (spawned & collided in one frame) can be cleaned up
        enemyProjMeshMap.set(proj.id, proj.mesh)
      }

      // Remove expired enemy projectile meshes from scene
      for (const id of result.expiredEnemyProjectileIds) {
        const mesh = enemyProjMeshMap.get(id)
        if (mesh) {
          scene.remove(mesh)
          mesh.traverse(disposeMesh)
        }
      }

      // Remove enemy projectiles that hit the player
      for (const hit of result.enemyProjectileHits) {
        const mesh = enemyProjMeshMap.get(hit.id)
        if (mesh) {
          scene.remove(mesh)
          mesh.traverse(disposeMesh)
        }
        const hitExplosion = createExplosion(hit.x, hit.y)
        scene.add(hitExplosion.group)
        explosions.push(hitExplosion)
        dynamicLights.flashExplosion(hit.x, hit.y)
        explosionGlowParticles.emit(hit.x, hit.y, 10, {
          lifetime: 0.4, speed: 35, size: 1.5,
          colors: [0xff3322, 0xff6644, 0xffaa22], spread: Math.PI * 2,
        })
        shipDamageVfx.hitFlash()
        const dx = hit.x - ship.x
        const dy = hit.y - ship.y
        const angle = Math.atan2(dy, dx)
        addTrauma(screenShake, 0.4 + (hit.damage / PLAYER_MAX_HP) * 0.4, angle)
        impactFlashTimer = 0.05
        cineCam.impactPulse()
        playPlayerHit()
      }

      if (enemyBeforeTick && !tickState.enemy) {
        scene.remove(enemyBeforeTick.mesh)
        disposeEnemyShip(enemyBeforeTick)
        const wreck = createShipwreckDebris(enemyBeforeTick.x, enemyBeforeTick.y)
        scene.add(wreck.group)
        shipwreckDebrisList.push(wreck)

        const bigExplosion = createExplosion(enemyBeforeTick.x, enemyBeforeTick.y)
        scene.add(bigExplosion.group)
        explosions.push(bigExplosion)
        playExplosion()
        dynamicLights.flashExplosion(enemyBeforeTick.x, enemyBeforeTick.y)
        explosionGlowParticles.emit(enemyBeforeTick.x, enemyBeforeTick.y, 16, {
          lifetime: 0.6, speed: 40, size: 2,
          colors: [0xff6600, 0xffaa00, 0xff3322, 0xffcc44], spread: Math.PI * 2,
        })
      }

      // Ambush / patrol enemies — add meshes + health meters for newly spawned
      for (const ae of result.ambushEnemiesSpawned) {
        scene.add(ae.mesh)
        // Enemy faces the player, so place the bar behind the ship (-Y),
        // pushed clear of bigger hulls (the carrier).
        const hm = createHealthMeter(-Math.max(HEALTH_BAR_OFFSET_Y, ae.collisionRadius + 8))
        ae.mesh.add(hm)
        ae.mesh.userData.healthMeter = hm
        // One-shot tutorial-popup latches — fired the first time the player
        // encounters each new threat kind. Cheap per-frame check; we early
        // out after the first hit so steady-state spawns are a no-op.
        if (!firstFormationFired && ae.kind === 'wedge') {
          firstFormationFired = true
          onFirstFormation?.()
        }
        if (!firstSplitterFired && ae.kind === 'splitter') {
          firstSplitterFired = true
          onFirstSplitter?.()
        }
      }

      // Ambush enemies destroyed — remove mesh, spawn explosion + wreckage
      for (const ae of result.ambushEnemiesDestroyed) {
        scene.remove(ae.mesh)
        disposeEnemyShip(ae)

        const wreck = createShipwreckDebris(ae.x, ae.y)
        scene.add(wreck.group)
        shipwreckDebrisList.push(wreck)

        const bigExplosion = createExplosion(ae.x, ae.y)
        scene.add(bigExplosion.group)
        explosions.push(bigExplosion)
        playExplosion()
        dynamicLights.flashExplosion(ae.x, ae.y)
        explosionGlowParticles.emit(ae.x, ae.y, 14, {
          lifetime: 0.5, speed: 38, size: 2,
          colors: [0xff6600, 0xffaa00, 0xff3322], spread: Math.PI * 2,
        })
      }

      // Scavengers that escaped with loot — remove their meshes quietly
      // (they are far off-screen by the time they slip away).
      for (const ae of result.enemiesEscaped) {
        scene.remove(ae.mesh)
        disposeEnemyShip(ae)
      }

      // Update ambush enemy mesh positions (alive only)
      for (const ae of tickState.ambushEnemies) {
        if (ae.alive) {
          ae.mesh.position.set(ae.x, ae.y, 0)
          ae.mesh.rotation.z = ae.rotation
        }
      }
      syncFormationShieldVisuals(dt)

      // --- Fire callbacks from tick result ---
      if (result.shipMoved) onShipMoved?.()
      if (result.asteroidHit) onAsteroidHit?.()
      if (result.asteroidsDestroyed > 0) onAsteroidsDestroyed?.(result.asteroidsDestroyed)
      if (result.metalSpawned) onMetalSpawned?.()
      for (const mc of result.metalCollected) {
        onCollect?.(mc.variant)
        onMetalCollected?.()
      }
      if (result.playerDamaged) onPlayerDamage?.(tickState.playerHp)
      for (const sc of result.scrapCollected) {
        onScrapCollect?.(sc.value)
        onScrapCollected?.()
      }
      if (result.enemyNearby) onEnemyNearby?.()
      for (const kind of result.playerDestroyedEnemyKinds) onEnemyDestroyed?.(kind)
      if (result.nearStation) onNearStation?.()
      if (result.stationRangeChanged !== null) onStationRange?.(result.stationRangeChanged)
      if (result.stationRepaired) onStationDriveThrough?.()
      if (result.stationContactRequest) onStationContact?.()
      if (result.stationContactBlocked) onStationContactBlocked?.()
      if (result.drillNoseAsteroidFinishes > 0) {
        onDrillNoseAsteroidFinished?.(result.drillNoseAsteroidFinishes)
      }

      if (result.smartBombDetonated) {
        addTrauma(screenShake, 1.2)
        impactFlashTimer = 0.12
        bloom.setBloom(1.0, true)
        cineCam.impactPulse()
        playExplosion()
        const sw = createShockwave(ship.x, ship.y)
        scene.add(sw.mesh)
        shockwaves.push(sw)

        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2
          const dist = 4 + Math.random() * 20
          const boom = createExplosion(
            ship.x + Math.cos(angle) * dist,
            ship.y + Math.sin(angle) * dist,
          )
          scene.add(boom.group)
          explosions.push(boom)
        }
        dynamicLights.flashExplosion(ship.x, ship.y, 2)
        explosionGlowParticles.emit(ship.x, ship.y, 40, {
          lifetime: 0.6, speed: 60, size: 2,
          colors: [0x00ffff, 0x88eeff, 0xffffff], spread: Math.PI * 2,
        })
        onSmartBomb?.()
      }

      if (result.blackHoleSurvived) {
        onBlackHoleSurvived?.()
      }

      if (result.wormholeTeleported) {
        // Snap the camera/visuals to the new position and pop a cosmic-pink
        // arrival burst so the jump reads instantly.
        addTrauma(screenShake, 0.8)
        impactFlashTimer = 0.1
        bloom.setBloom(0.9, true)
        playExplosion()
        const sw = createShockwave(ship.x, ship.y)
        scene.add(sw.mesh)
        shockwaves.push(sw)
        explosionGlowParticles.emit(ship.x, ship.y, 36, {
          lifetime: 0.6, speed: 70, size: 2,
          colors: [0xff66ff, 0xff99ff, 0xffffff], spread: Math.PI * 2,
        })
        dynamicLights.flashExplosion(ship.x, ship.y, 2)
        onWormholeTeleported?.()
      }

      // --- Prologue events ---
      if (result.prologueReady) onPrologueReady?.()
      if (result.fieldCleared) onFieldCleared?.()
      if (result.arbiterArrived) onArbiterArrived?.()
      if (result.stripComplete) onStripComplete?.()

      // --- Endless mode: push the Ledger to the HUD when its integer changes ---
      const ledgerInt = Math.floor(result.ledger)
      if (ledgerInt !== prevLedgerInt) {
        prevLedgerInt = ledgerInt
        onLedgerChanged?.(ledgerInt)
      }

      // --- Arbiter visual management (prologue intro OR endless boss/enforcer) ---
      const visibleArbiter = tickState.arbiter ?? tickState.runawayEnforcer
      const wantArbiter = tickState.prologueArbiterSpawned || visibleArbiter !== null
      if (wantArbiter && !arbiterModel) {
        arbiterModel = createArbiterModel()
        scene.add(arbiterModel)
      } else if (!wantArbiter && arbiterModel) {
        scene.remove(arbiterModel)
        arbiterModel.traverse(disposeMesh)
        arbiterModel = null
      }
      if (arbiterModel) {
        if (visibleArbiter) {
          arbiterModel.position.set(visibleArbiter.x, visibleArbiter.y, 0)
          arbiterModel.rotation.z = visibleArbiter.rotation
        } else {
          // Prologue: game-tick drives the scripted approach distance.
          arbiterModel.position.set(ship.x, ship.y + tickState.prologueArbiterDistance, 0)
        }
      }

      // --- Twin escort visual management (endless only) ---
      if (tickState.arbiterEscort && !arbiterEscortModel) {
        arbiterEscortModel = createArbiterModel()
        scene.add(arbiterEscortModel)
      } else if (!tickState.arbiterEscort && arbiterEscortModel) {
        scene.remove(arbiterEscortModel)
        arbiterEscortModel.traverse(disposeMesh)
        arbiterEscortModel = null
      }
      if (arbiterEscortModel && tickState.arbiterEscort) {
        arbiterEscortModel.position.set(tickState.arbiterEscort.x, tickState.arbiterEscort.y, 0)
        arbiterEscortModel.rotation.z = tickState.arbiterEscort.rotation
      }

      // --- Arbiter encounter events ---
      if (result.arbiterSpawned) {
        addTrauma(screenShake, 0.6)
        bloom.setBloom(0.8, true)
        cineCam.zoomIn(4, 0.5)
        onArbiterEvent?.({ type: 'arrives', mark: result.arbiterSpawned.mark })
        playKlaxon('high')
      }
      if (result.arbiterDefeated) {
        const { x, y, mark } = result.arbiterDefeated
        addTrauma(screenShake, 1.0)
        bloom.setBloom(0.9, true)
        for (let i = 0; i < 6; i++) {
          const boom = createExplosion(
            x + (Math.random() - 0.5) * 24,
            y + (Math.random() - 0.5) * 24,
          )
          scene.add(boom.group)
          explosions.push(boom)
        }
        const wreck = createShipwreckDebris(x, y)
        scene.add(wreck.group)
        shipwreckDebrisList.push(wreck)
        dynamicLights.flashExplosion(x, y, 3)
        explosionGlowParticles.emit(x, y, 30, {
          lifetime: 0.8, speed: 50, size: 2.5,
          colors: [0x00ffff, 0x88eeff, 0xffffff, 0xff6600],
        })
        playExplosion()
        onArbiterEvent?.({ type: 'defeated', mark })
      }
      if (result.arbiterEscortDefeated) {
        // Escort destruction — same spectacle as the primary, but no comms
        // banner or camera zoom (the primary owns the encounter's beats).
        const { x, y } = result.arbiterEscortDefeated
        addTrauma(screenShake, 0.9)
        bloom.setBloom(0.9, true)
        for (let i = 0; i < 5; i++) {
          const boom = createExplosion(x + (Math.random() - 0.5) * 22, y + (Math.random() - 0.5) * 22)
          scene.add(boom.group)
          explosions.push(boom)
        }
        const wreck = createShipwreckDebris(x, y)
        scene.add(wreck.group)
        shipwreckDebrisList.push(wreck)
        dynamicLights.flashExplosion(x, y, 3)
        explosionGlowParticles.emit(x, y, 28, {
          lifetime: 0.8, speed: 50, size: 2.5,
          colors: [0x00ffff, 0x88eeff, 0xffffff, 0xff6600],
        })
        playExplosion()
      }
      if (result.arbiterWithdrawn) {
        onArbiterEvent?.({ type: 'withdrawn', mark: result.arbiterWithdrawn.mark })
      }

      // --- Run ended — hull lost ---
      // Defer the Game Over UI until after the death animation plays. We
      // spawn the explosion + shipwreck debris + glow particles here, hide
      // the ship model, and start a timer; the run-ended callback fires
      // when the timer elapses (see the deathSequenceTimer block below).
      if (result.playerKilled && deathSequenceTimer === null) {
        pendingRunStats = {
          marksDefeated: tickState.marksDefeated,
          peakLedger: Math.round(tickState.peakLedger),
          runTime: tickState.runTime,
          score: computeScore(tickState.peakLedger, tickState.marksDefeated),
        }
        deathSequenceTimer = DEATH_SEQUENCE_DURATION

        // Big primary blast at the ship.
        const primary = createExplosion(ship.x, ship.y)
        scene.add(primary.group)
        explosions.push(primary)

        // Hull fragments flying outward — same debris module the enemy
        // ships use when they pop, so the player blast reads consistently.
        const wreck = createShipwreckDebris(ship.x, ship.y)
        scene.add(wreck.group)
        shipwreckDebrisList.push(wreck)

        // Two staggered glow puffs in the ship's accent colors.
        explosionGlowParticles.emit(ship.x, ship.y, 22, {
          lifetime: 0.7,
          speed: 55,
          size: 2.4,
          colors: [0xffaa00, 0xff6600, 0xffdd44, 0xffffff],
          spread: Math.PI * 2,
        })
        explosionGlowParticles.emit(ship.x, ship.y, 14, {
          lifetime: 0.9,
          speed: 30,
          size: 1.8,
          colors: [0x00ccff, 0x88ccff, 0x77ffcc],
          spread: Math.PI * 2,
        })

        playExplosion()
        dynamicLights.flashExplosion(ship.x, ship.y)
        addTrauma(screenShake, 0.95)

        // Hide the ship for the duration of the sequence and freeze any
        // residual motion so we don't see a ghost ship sliding around.
        shipModel.visible = false
        rechargeMeter.visible = false
        ship.velocityX = 0
        ship.velocityY = 0
        tickState.fireTarget = null
        tickState.mouseHoldingFire = false
      }

      if (deathSequenceTimer !== null) {
        // Tick the death timer on real wall-clock so the slow-mo doesn't
        // stretch the 2.5-second window into a much longer one.
        deathSequenceTimer -= rawDt
        // Keep the wreck where it died — don't let the input loop nudge
        // physics in the next iteration.
        ship.velocityX = 0
        ship.velocityY = 0
        if (deathSequenceTimer <= 0) {
          deathSequenceTimer = null
          if (pendingRunStats) {
            onRunEnded?.(pendingRunStats)
            pendingRunStats = null
          }
        }
      }

      // --- Arbiter HUD sync (only when Mark / hull / phase changes) ---
      // The boss bar tracks the primary; if it falls first during a twin
      // encounter, fall back to the surviving escort so the bar doesn't blink
      // out while a boss is still on the field.
      const arb = tickState.arbiter ?? tickState.runawayEnforcer ?? tickState.arbiterEscort
      const arbiterKey = arb ? `${arb.mark}:${Math.ceil(arb.hp)}:${arb.phase}` : 'none'
      if (arbiterKey !== prevArbiterKey) {
        prevArbiterKey = arbiterKey
        onArbiterChanged?.(
          arb ? { mark: arb.mark, hp: arb.hp, maxHp: arb.maxHp, phase: arb.phase } : null,
        )
      }

      // --- Arbiter tractor beam visual + feedback ---
      const tractorStep = getTutorialStep()
      const prologueTractorActive =
        !arb &&
        tickState.prologueArbiterSpawned &&
        (tractorStep === 'prologue-arbiter' ||
          tractorStep === 'prologue-dialogue' ||
          tractorStep === 'prologue-strip')
      const prologueArbiterX = ship.x
      const prologueArbiterY = ship.y + tickState.prologueArbiterDistance
      const tractorActive = !!arb?.tractorActive || prologueTractorActive
      updateTractorBeam(
        tractorBeam,
        tractorActive,
        arb ? arb.x : prologueArbiterX,
        arb ? arb.y : prologueArbiterY,
        arb ? arb.tractorAngle : Math.atan2(ship.y - prologueArbiterY, ship.x - prologueArbiterX),
        arb ? arb.tractorElapsed : tickState.elapsedTime,
      )
      if (tractorActive && !prevTractorActive) addTrauma(screenShake, 0.45)
      prevTractorActive = tractorActive
      if (result.arbiterCaptureHit) {
        addTrauma(screenShake, 0.85)
        playPlayerHit()
      }

      // Strip modules during prologue-strip — armor first, then hull, peeling
      // from the outside in (turret bulk → wings → core last).
      if (result.stripAdvanced) {
        const moduleNames = [
          'armorTurret', 'armorWings', 'armorBody',
          'hullTurretBulk', 'hullWings', 'hullCore',
        ]
        const phase = tickState.prologueStripPhase - 1
        if (phase >= 0 && phase < moduleNames.length) {
          const mod = shipModel.getObjectByName(moduleNames[phase])
          if (mod) {
            // hullTurretBulk is parented to the turret, not the ship root —
            // detach from whatever its actual parent is.
            mod.parent?.remove(mod)
            mod.traverse(disposeMesh)
          }
        }
      }

      // --- Update asteroid health meters & visibility ---
      for (const a of asteroids) {
        const entry = asteroidModels.get(a.id)
        if (entry) {
          updateHealthMeter(entry.healthMeter, a.hp, a.maxHp)
          entry.model.visible = a.hp > 0

          let isHovered = false
          if (aimWorldPosition) {
            const dx = aimWorldPosition.x - a.x
            const dy = aimWorldPosition.y - a.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            const r = ASTEROID_SIZE_RADIUS[a.size] ?? 8
            if (dist <= r + 2) {
              isHovered = true
            }
          }
          if (!isHovered) {
            entry.healthMeter.visible = false
          }
        }
      }

      // --- Update enemy health meter ---
      if (tickState.enemy && tickState.enemy.alive) {
        applyEnemyDamageFeedback(tickState.enemy, dt)
        updateCarrierShield(tickState.enemy, dt)
        const ehm = tickState.enemy.mesh.userData.healthMeter as THREE.Group | undefined
        if (ehm) {
          updateHealthMeter(ehm, tickState.enemy.hp, tickState.enemy.maxHp)
        }
      }

      // --- Update ambush / patrol enemy health meters + sniper sights ---
      for (const ae of tickState.ambushEnemies) {
        if (!ae.alive) continue
        applyEnemyDamageFeedback(ae, dt)
        updateCarrierShield(ae, dt)
        const ahm = ae.mesh.userData.healthMeter as THREE.Group | undefined
        if (ahm) updateHealthMeter(ahm, ae.hp, ae.maxHp)

        // Sniper laser sight — visible and stretched to the player while charging
        if (ae.kind === 'sniper') {
          const sight = ae.mesh.userData.laserSight as THREE.Mesh | undefined
          if (sight) {
            sight.visible = ae.charging
            if (ae.charging) {
              const sdx = ship.x - ae.x
              const sdy = ship.y - ae.y
              sight.scale.y = Math.max(1, Math.hypot(sdx, sdy) - 8)
            }
          }
        }
      }

      // --- Enemy damage sparks ---
      for (let i = enemyDamageSparks.length - 1; i >= 0; i--) {
        const alive = updateEnemyDamageSparks(enemyDamageSparks[i], dt)
        if (!alive) {
          scene.remove(enemyDamageSparks[i].group)
          disposeEnemyDamageSparks(enemyDamageSparks[i])
          enemyDamageSparks.splice(i, 1)
        }
      }

      // --- Update Shipwreck Debris ---
      for (let i = shipwreckDebrisList.length - 1; i >= 0; i--) {
        const alive = updateShipwreckDebris(shipwreckDebrisList[i], dt)
        if (!alive) {
          scene.remove(shipwreckDebrisList[i].group)
          disposeShipwreckDebris(shipwreckDebrisList[i])
          shipwreckDebrisList.splice(i, 1)
        }
      }

      // --- Update Explosions ---
      for (let i = explosions.length - 1; i >= 0; i--) {
        const alive = updateExplosion(explosions[i], dt)
        if (!alive) {
          scene.remove(explosions[i].group)
          disposeExplosion(explosions[i])
          explosions.splice(i, 1)
        }
      }

      // --- Update Debris Chunks ---
      for (let i = debrisChunks.length - 1; i >= 0; i--) {
        const alive = updateDebrisChunk(debrisChunks[i], dt)
        if (!alive) {
          scene.remove(debrisChunks[i].mesh)
          disposeDebrisChunk(debrisChunks[i])
          debrisChunks.splice(i, 1)
        }
      }

      // --- Collector VFX & Audio ---
      // Collector VFX/hum: drive by "is any pickup within the active magnet
      // range right now?" The magnet itself is always-on; this just keeps the
      // visual swirl + audio quiet when there's nothing to pull.
      const isPrologueStep = getTutorialStep().startsWith('prologue-')
      const collectorRange = tickState.prologueShipFrozen
        ? 0
        : isPrologueStep
          ? PROLOGUE_SHIP.collectorRange
          : collectorRangeForTier(tickState.collectorTier)
      const rangeSq = collectorRange * collectorRange
      let anyInRange = false
      if (collectorRange > 0) {
        for (const m of tickState.metalChunks) {
          if ((m.x - ship.x) ** 2 + (m.y - ship.y) ** 2 < rangeSq) {
            anyInRange = true
            break
          }
        }
        if (!anyInRange) {
          for (const s of tickState.scrapBoxes) {
            if ((s.x - ship.x) ** 2 + (s.y - ship.y) ** 2 < rangeSq) {
              anyInRange = true
              break
            }
          }
        }
      }
      const collectingActive = anyInRange || tickState.prologueAutoCollect
      updateCollectorVfx(collectorVfx, dt, collectingActive, ship.x, ship.y, collectorRange)
      if (collectingActive) {
        startCollectorHum()
      } else {
        stopCollectorHum()
      }

      // --- Update Gas Station Neon ---
      updateGasStationNeon(gasStation.neonMeshes, now / 1000)

      // --- Engine Trail & Sound ---
      const shipSpeed = Math.sqrt(ship.velocityX * ship.velocityX + ship.velocityY * ship.velocityY)
      speedNorm = Math.min(1, shipSpeed / 50)
      updateEngineTrail(engineTrail, dt, ship.x, ship.y, ship.rotation, speedNorm)
      updateEngineSound(speedNorm)

      if (speedNorm > 0.1) {
        const facingAngle = ship.rotation + Math.PI / 2
        const rearAngle = facingAngle + Math.PI
        const spawnX = ship.x + Math.cos(rearAngle) * 5
        const spawnY = ship.y + Math.sin(rearAngle) * 5
        engineGlowParticles.emit(spawnX, spawnY, Math.ceil(speedNorm * 2), {
          lifetime: 0.3, speed: 5 + speedNorm * 15, size: 0.8 + speedNorm,
          colors: [0xff6600, 0xff4400, 0xffaa00], spread: 0.8, zRange: 0.2,
          inheritVelocity: { vx: ship.velocityX * 0.1, vy: ship.velocityY * 0.1 },
        })
      }

      // --- Boost feedback: whoosh + camera punch on activation, light rumble while held ---
      const boostActive = tickState.boostActiveTimer > 0
      if (boostActive && !prevBoostActive) {
        playBoostWhoosh()
        cineCam.impactPulse()
        addTrauma(screenShake, 0.35)
      }
      // A little sustained shake for the duration of the dash (frame-rate
      // independent; finds a low equilibrium against the shake's own decay).
      if (boostActive) addTrauma(screenShake, 0.9 * dt)
      prevBoostActive = boostActive

      // --- Speed Lines (directional dash streaks along the ship's travel) ---
      const boostSpeed = Math.sqrt(ship.velocityX * ship.velocityX + ship.velocityY * ship.velocityY)
      const boostDir = Math.atan2(ship.velocityY, ship.velocityX)
      updateSpeedLines(
        speedLines,
        dt,
        boostActive,
        ship.x,
        ship.y,
        boostDir,
        boostSpeed,
        tickState.elapsedTime,
      )

      // --- Warp Streaks (active when Arbiter takes control) ---
      const currentStep = getTutorialStep()
      const warpActive =
        currentStep === 'prologue-arbiter' ||
        currentStep === 'prologue-dialogue' ||
        currentStep === 'prologue-strip'
      updateWarpStreaks(warpStreaks, dt, warpActive, ship.x, ship.y, tickState.elapsedTime)

      // --- Screen Shake ---
      updateScreenShake(screenShake, dt, now / 1000)

      // --- Background Effects ---
      updateTwinkleStars(twinkleStars, now / 1000, camera.position.x, camera.position.y)
      updateNebulaSystem(nebulaSystem, now / 1000, camera.position.x, camera.position.y)

      // Prologue Wormhole demo: spawn the demo holes during free-mining, and
      // tear them down the moment that beat ends so they never persist into the
      // Arbiter cutscene or live play.
      if (currentStep === 'prologue-mining' && !prologueBlackHolesSpawned) {
        spawnPrologueBlackHoles()
      } else if (prologueBlackHolesSpawned && currentStep !== 'prologue-mining') {
        clearPrologueBlackHoles()
      }

      // Spawn the starter black hole the moment the tutorial completes — it was
      // suppressed during the tutorial so the player couldn't die to an untaught
      // hazard.
      if (!initialBlackHoleSpawned && getTutorialStep() === 'done') {
        spawnInitialBlackHole()
        initialBlackHoleSpawned = true
      }

      for (const h of blackHoles) {
        updateBlackHole(h, now / 1000, camera.position.x, camera.position.y)
      }

      // Spawn black hole rings as the player ventures further from the station
      const bhdx = ship.x - GAS_STATION_X
      const bhdy = ship.y - GAS_STATION_Y
      const bhDist = Math.sqrt(bhdx * bhdx + bhdy * bhdy)
      if (bhDist > blackHoleMaxDistFromStation) {
        blackHoleMaxDistFromStation = bhDist
        while (
          blackHoleNextRing < BLACK_HOLE_SPAWN_RINGS.length &&
          blackHoleMaxDistFromStation >= BLACK_HOLE_SPAWN_RINGS[blackHoleNextRing].threshold
        ) {
          const ring = BLACK_HOLE_SPAWN_RINGS[blackHoleNextRing]
          for (const pos of ring.positions) {
            const newHole = createBlackHole(pos.x, pos.y, ring.scale)
            scene.add(newHole.group)
            blackHoles.push(newHole)
          }
          blackHoleNextRing++
        }
      }

      // --- Tutorial: Station Arrow ---
      const sdx = GAS_STATION_X - ship.x
      const sdy = GAS_STATION_Y - ship.y
      const sDist = Math.sqrt(sdx * sdx + sdy * sdy)
      const inStationRange = sDist <= 60
      const tutStep = getTutorialStep()
      // Show the station chevron during the tutorial steps that direct the
      // player there, AND any time the cargo hold is full in normal play — so
      // "time to cash in" is always signposted, not just during the tutorial.
      const showArrow =
        tutStep === 'go-to-station' ||
        tutStep === 'approach-station' ||
        (tutStep === 'done' && cargoFull)
      arrowGroup.visible = showArrow && !inStationRange
      if (showArrow) {
        const angle = Math.atan2(sdy, sdx)
        const arrowDist = 8
        arrowGroup.position.set(
          ship.x + Math.cos(angle) * arrowDist,
          ship.y + Math.sin(angle) * arrowDist,
          5,
        )
        arrowGroup.rotation.z = angle
        const flash = 0.6 + 0.4 * Math.sin((now / 1000) * 4.0)
        arrowMat.emissiveIntensity = flash * 1.5
        arrowMat2.emissiveIntensity = flash * 0.7
        arrowGroup.position.z = 5 + Math.sin((now / 1000) * 2.5) * 2
      }

      // --- Update Arbiter Pointer Arrows ---
      const getScreenBorderIntersection = (
        cx: number, cy: number,
        ax: number, ay: number,
        halfW: number, halfH: number,
        margin: number = 6
      ) => {
        const dx = ax - cx
        const dy = ay - cy
        const w = halfW - margin
        const h = halfH - margin
        if (dx === 0 && dy === 0) return { x: cx, y: cy }
        const tX = dx > 0 ? w / dx : -w / dx
        const tY = dy > 0 ? h / dy : -h / dy
        const t = Math.min(Math.abs(tX), Math.abs(tY))
        return { x: cx + dx * t, y: cy + dy * t }
      }

      const handleArbiterPointer = (
        pointerMesh: THREE.Mesh,
        arbiter: { x: number; y: number } | null
      ) => {
        if (!arbiter) {
          pointerMesh.visible = false
          return
        }
        const adx = arbiter.x - camera.position.x
        const ady = arbiter.y - camera.position.y
        const isOffScreen = Math.abs(adx) > camHalfW || Math.abs(ady) > camHalfH
        if (isOffScreen) {
          pointerMesh.visible = true
          const borderPos = getScreenBorderIntersection(
            camera.position.x,
            camera.position.y,
            arbiter.x,
            arbiter.y,
            camHalfW,
            camHalfH,
            6
          )
          pointerMesh.position.set(borderPos.x, borderPos.y, 5)
          pointerMesh.rotation.z = Math.atan2(ady, adx)
        } else {
          pointerMesh.visible = false
        }
      }

      handleArbiterPointer(arbiterArrow, visibleArbiter)
      handleArbiterPointer(arbiterEscortArrow, tickState.arbiterEscort)

      // --- Harvesting Area Warning Check ---
      const hdx = ship.x - GAS_STATION_X
      const hdy = ship.y - GAS_STATION_Y
      const hDist = Math.sqrt(hdx * hdx + hdy * hdy)
      const isOutside = hDist > 600 && getTutorialStep() === 'done'
      if (isOutside !== isPlayerOutsideHarvestingArea) {
        isPlayerOutsideHarvestingArea = isOutside
        onHarvestingAreaWarning?.(isOutside)
      }

      // --- Sync projectile positions + trails ---
      for (const p of tickState.projectiles) {
        const model = projectileModels.get(p.id)
        if (model) {
          model.position.set(p.x, p.y, 0)
        }
        projectileTrails.addTrail(p.x, p.y, p.velocityX, p.velocityY)
      }

      // Sync ship model
      shipModel.position.set(ship.x, ship.y, 0)
      shipModel.rotation.z = ship.rotation
      rechargeMeter.position.set(ship.x, ship.y, 0)
      syncOptionOrbs()

      // Drill Nose visual: spin the named 'drillNose' group around its
      // forward axis when the tick reports active drilling, slow it back to
      // a stop otherwise. Decoupled from the per-frame contact check so
      // brief gaps between hits don't make it stutter.
      const drillNoseGroup = shipModel.getObjectByName('drillNose')
      const drillTarget = result.drillNoseActive ? 1 : 0
      drillNoseSpinIntensity += (drillTarget - drillNoseSpinIntensity) * Math.min(1, dt * 8)
      if (drillNoseGroup) {
        drillNoseGroup.rotation.y += drillNoseSpinIntensity * 24 * dt
      }
      // Drill SFX rides the same tween — silent when not engaged, swells
      // as the bit comes up to speed. Tune the pitch to the asteroid type.
      setDrillSoundIntensity(drillNoseSpinIntensity)
      if (result.drillNoseActive && result.drillNoseAsteroidType) {
        setDrillSoundType(result.drillNoseAsteroidType)
        // Sustained screen shake while grinding into rock
        addTrauma(screenShake, 0.35 * dt)
        // Sparks from the ship nose
        const noseAngle = ship.rotation - Math.PI / 2
        const noseX = ship.x + Math.cos(noseAngle) * 7
        const noseY = ship.y + Math.sin(noseAngle) * 7
        explosionGlowParticles.emit(noseX, noseY, 1, {
          lifetime: 0.15, speed: 18, size: 0.8,
          colors: [0xffcc44, 0xff8800, 0xffffff], spread: 1,
        })
      }

      // Mining drones — remove meshes for destroyed drones, then sync the
      // remaining drone positions and status-light colors. Meshes are
      // created lazily on first frame after build.
      for (const id of result.destroyedDroneIds) {
        const mesh = miningDroneMeshes.get(id)
        if (mesh) {
          disposeDroneMesh(mesh)
          miningDroneMeshes.delete(id)
        }
      }
      if (result.destroyedDroneIds.length > 0 || result.droneRebuilt) {
        onMiningDroneCountChanged?.(tickState.miningDrones.length)
      }
      if (result.droneRebuilt) onDroneRebuilt?.()
      const liveDroneIds = new Set<string>()
      for (const drone of tickState.miningDrones) {
        liveDroneIds.add(drone.id)
        let mesh = miningDroneMeshes.get(drone.id)
        if (!mesh) {
          mesh = createDroneMesh()
          miningDroneMeshes.set(drone.id, mesh)
          miningDroneGroup.add(mesh)
        }
        mesh.position.set(drone.x, drone.y, 0.6)
        const color = DRONE_STATE_COLOR[drone.state]
        const core = mesh.getObjectByName('core') as THREE.Mesh | undefined
        const halo = mesh.getObjectByName('halo') as THREE.Mesh | undefined
        if (core && core.material instanceof THREE.MeshBasicMaterial) {
          core.material.color.setHex(color)
          // Pulse drilling/retreating cores so they read as "busy" or "hurt".
          const pulse = drone.state === 'drilling' || drone.state === 'retreating'
            ? 0.7 + Math.sin(now / 60) * 0.3
            : 0.95
          core.material.opacity = pulse
        }
        if (halo && halo.material instanceof THREE.MeshBasicMaterial) {
          halo.material.color.setHex(color)
        }
        // Spin the drill bit while actively drilling — visual cue that the
        // bot is doing work even when the camera doesn't focus on it.
        const drill = mesh.getObjectByName('drill') as THREE.Mesh | undefined
        if (drill) {
          if (drone.state === 'drilling') {
            drill.rotation.y += 12 * dt
          }
        }
        // Spin to face direction of travel when moving; otherwise hold a
        // gentle bob so idle drones don't look frozen.
        const speedSq = drone.vx * drone.vx + drone.vy * drone.vy
        if (speedSq > 0.01) {
          mesh.rotation.z = Math.atan2(drone.vy, drone.vx) - Math.PI / 2
        }
      }
      // Tidy: any mesh whose drone no longer exists in state gets disposed.
      for (const [id, mesh] of miningDroneMeshes) {
        if (!liveDroneIds.has(id)) {
          disposeDroneMesh(mesh)
          miningDroneMeshes.delete(id)
        }
      }

      // Drone scrap delivery — credit the player wallet via the existing
      // scrap-collect callback so the HUD updates and the save triggers.
      if (result.droneScrapDelivered > 0) {
        onScrapCollect?.(result.droneScrapDelivered)
        onDroneScrapDelivered?.(result.droneScrapDelivered, result.droneDockCount)
      }

      // Aim guide — line from ship to aim point, with reticle ring at the
      // tip. Hidden while paused, when no aim is being tracked, during the
      // prologue capture beat, and whenever an Arbiter tractor beam has the
      // ship (firing is locked out then, so the reticle would lie).
      if (
        !paused &&
        !inputLocked &&
        aimWorldPosition &&
        currentStep !== 'prologue-arbiter' &&
        !result.playerTractorCaught
      ) {
        const pos = aimLineGeom.attributes.position as THREE.BufferAttribute
        pos.setXYZ(0, ship.x, ship.y, 0.5)
        pos.setXYZ(1, aimWorldPosition.x, aimWorldPosition.y, 0.5)
        pos.needsUpdate = true
        aimLine.visible = true
        aimReticle.position.set(aimWorldPosition.x, aimWorldPosition.y, 0.5)
        const pulse = 1 + Math.sin(now / 140) * 0.12
        aimReticle.scale.setScalar(pulse)
        aimReticle.visible = true
      } else {
        aimLine.visible = false
        aimReticle.visible = false
      }
      shieldVisual.visible = tickState.shieldCharges > 0 && !inputLocked
      shieldVisual.position.set(ship.x, ship.y, 1.3)
      shieldVisual.scale.setScalar(1 + tickState.shieldCharges * 0.12 + Math.sin(now / 120) * 0.04)
      const shieldMat = shieldVisual.material
      if (shieldMat instanceof THREE.MeshStandardMaterial) {
        shieldMat.opacity = 0.06 + tickState.shieldCharges * 0.02 + Math.sin(now / 160) * 0.01
        shieldMat.emissiveIntensity = 0.6 + Math.sin(now / 100) * 0.2
      }
      // Fire the defensive-hierarchy tutorial popup once per scene the first
      // time *any* layer absorbs a hit. Done before the layer-specific
      // handlers below so the popup beats their visual effects to the
      // player's attention.
      if (
        !firstDefensiveHitFired &&
        (result.shieldHit || result.hullModuleLost || result.armorHit)
      ) {
        firstDefensiveHitFired = true
        onFirstDefensiveHit?.()
      }
      if (result.shieldHit) {
        addTrauma(screenShake, 0.35)
        onShieldChanged?.(tickState.shieldCharges)
      }
      if (result.hullModuleLost) {
        // Drop the outermost visible module immediately so the player sees
        // the piece tear off in the same frame the absorb happened. The
        // React round-trip (onHullChanged → upgrades.hull update →
        // setCombatUpgrades → applyHullModules) will then re-run with the
        // same value — a no-op visually, but keeps state authoritative.
        applyHullModules(shipModel, tickState.hullCharges)
        addTrauma(screenShake, 0.45)
        onHullChanged?.(tickState.hullCharges)
      }
      if (result.armorHit) {
        applyArmorModules(shipModel, tickState.armorCharges)
        addTrauma(screenShake, 0.5)
        onArmorChanged?.(tickState.armorCharges)
      }

      // --- Turret rotation — tracks the player's aim (mouse / right stick).
      // Arrow barrel points in local +Y at rest; setting local rotation.z =
      // (worldAimAngle - π/2) - ship.rotation puts the arrow on the aim ray.
      // Falls back to "forward" (local 0) when no aim is active.
      const turret = shipModel.getObjectByName('turret')
      if (turret) {
        if (aimWorldPosition) {
          const tdx = aimWorldPosition.x - ship.x
          const tdy = aimWorldPosition.y - ship.y
          if (tdx * tdx + tdy * tdy > 0.25) {
            const worldAim = Math.atan2(tdy, tdx)
            turret.rotation.z = worldAim - Math.PI / 2 - ship.rotation
          }
        } else {
          turret.rotation.z = 0
        }
      }

      let combatIntensity = 0
      if (tickState.enemy && tickState.enemy.alive) combatIntensity = 0.4
      if (tickState.ambushEnemies.some((e) => e.alive)) combatIntensity = 0.6
      if (
        (tickState.arbiter && tickState.arbiter.mode === 'hunting') ||
        (tickState.arbiterEscort && tickState.arbiterEscort.mode === 'hunting')
      )
        combatIntensity = 1.0
      combatIntensity = Math.max(combatIntensity, tickState.ambushEnemies.filter((e) => e.alive).length * 0.15)

      if (photoModeActive) {
        // Photo mode: detach from the ship and pan the camera directly with
        // movement input. We use rawDt (not dt) so panning works at full
        // speed even though the simulation slow-mo / pause is in effect.
        const pan = PHOTO_PAN_SPEED * rawDt
        if (inputState.up) camera.position.y += pan
        if (inputState.down) camera.position.y -= pan
        if (inputState.left) camera.position.x -= pan
        if (inputState.right) camera.position.x += pan
      } else {
        const boostIntensity = tickState.boostActiveTimer > 0 ? 1 : 0
        cineCam.update(dt, ship.x, ship.y, ship.velocityX, ship.velocityY, combatIntensity, screenShake, boostIntensity)
      }

      stars.position.x = camera.position.x * 0.5
      stars.position.y = camera.position.y * 0.5

      // --- Arbiter approach siren ---
      // Wails throughout the prologue-arbiter beat, rising as it closes in.
      const sirenArb =
        tickState.arbiter?.mode === 'hunting'
          ? tickState.arbiter
          : tickState.runawayEnforcer?.mode === 'hunting'
            ? tickState.runawayEnforcer
          : tickState.arbiterEscort?.mode === 'hunting'
            ? tickState.arbiterEscort
            : null
      if (currentStep === 'prologue-arbiter') {
        startArbiterSiren()
        updateArbiterSiren(1 - tickState.prologueArbiterDistance / ARBITER_SPAWN_DISTANCE)
      } else if (sirenArb) {
        startArbiterSiren()
        const adx = sirenArb.x - ship.x
        const ady = sirenArb.y - ship.y
        const adist = Math.sqrt(adx * adx + ady * ady)
        updateArbiterSiren(Math.max(0.15, Math.min(1, 1 - adist / 220)))
      } else if (getTutorialStep() === 'done') {
        let closestHoleDist = Infinity
        for (const h of blackHoles) {
          const hx = h.x + camera.position.x * 0.1
          const hy = h.y + camera.position.y * 0.1
          const dist = Math.sqrt((hx - ship.x) ** 2 + (hy - ship.y) ** 2)
          const scaledDist = dist / Math.max(0.5, h.scale)
          if (scaledDist < closestHoleDist) closestHoleDist = scaledDist
        }
        if (closestHoleDist <= BLACK_HOLE_ALERT_RADIUS) {
          startArbiterSiren()
          const intensity =
            1 -
            Math.max(0, closestHoleDist - BLACK_HOLE_EVENT_HORIZON_RADIUS) /
              (BLACK_HOLE_ALERT_RADIUS - BLACK_HOLE_EVENT_HORIZON_RADIUS)
          updateArbiterSiren(Math.max(0.2, Math.min(1, intensity)))
        } else {
          stopArbiterSiren()
        }
        if (closestHoleDist <= BLACK_HOLE_WARN_RADIUS) {
          blackHoleWarningActive = true
        } else if (blackHoleWarningActive) {
          blackHoleWarningActive = false
          onBlackHoleEscaped?.()
        }
        if (!blackHoleWarnFired && closestHoleDist <= BLACK_HOLE_WARN_RADIUS) {
          blackHoleWarnFired = true
          onBlackHoleNearby?.()
        }
      } else {
        stopArbiterSiren()
      }

      // --- Radar mini-map ---
      if (radar) {
        const radarEnemies: RadarBlip[] = []
        if (tickState.enemy && tickState.enemy.alive) {
          radarEnemies.push({ x: tickState.enemy.x, y: tickState.enemy.y })
        }
        for (const ae of tickState.ambushEnemies) {
          if (ae.alive) radarEnemies.push({ x: ae.x, y: ae.y })
        }
        updateRadar(radar, {
          shipX: ship.x,
          shipY: ship.y,
          shipRotation: ship.rotation,
          asteroids: asteroids.filter((a) => a.hp > 0),
          comets: tickState.comets.map((c) => ({ x: c.x, y: c.y })),
          enemies: radarEnemies,
          blackHoles: blackHoles.map((h) => ({
            x: h.x + camera.position.x * 0.1,
            y: h.y + camera.position.y * 0.1,
          })),
          drones: tickState.miningDrones.map((d) => ({ x: d.x, y: d.y, state: d.state })),
          station: { x: GAS_STATION_X, y: GAS_STATION_Y },
          arbiter: arbiterModel ? { x: arbiterModel.position.x, y: arbiterModel.position.y } : null,
          rally: tickState.rallyPoint,
          sensorTier: tickState.sensorTier,
          gamepadCrosshair: gamepadResult.radarCrosshair,
        })
      }

      wasPaused = false
      resumeMusic()
    } else {
      // --- Paused: mute all looping audio ---
      if (!wasPaused) {
        wasPaused = true
        suspendEngineSound()
        stopCollectorHum()
        suspendDrillSound()
        stopArbiterSiren()
        suspendMusic()
      }
    }

    // --- Update particle systems ---
    if (!paused) {
      explosionGlowParticles.update(dt)
      engineGlowParticles.update(dt)
      projectileTrails.update(dt)
      shipDamageVfx.sparkSystem.update(dt)
    }

    // --- Update dynamic lights ---
    dynamicLights.update(dt, ship.x, ship.y, speedNorm)

    // --- Debug collision overlay ---
    if (debugCollisionOverlay) {
      updateCollisionDebugRings(
        collisionDebugGroup,
        ship,
        tickState.asteroids,
        tickState.projectiles,
        tickState.enemyProjectiles,
        tickState.miningDrones,
        tickState.enemy,
        tickState.ambushEnemies,
      )
    } else if (collisionDebugGroup.visible) {
      hideCollisionDebugRings(collisionDebugGroup)
    }

    // --- Update bloom ---
    bloom.update(dt)
    // Debug overrides — last write wins, so the panel can mute individual
    // post-process stages without touching the game code that set them.
    if (!debugBloomEnabled) bloom.setBloom(0, true)
    if (!debugVignetteEnabled) bloom.setVignette(0)
    if (!debugChromaticEnabled) bloom.setChromaticAberration(0)

    // --- Update environment ---
    dustMotes.update(dt, camera.position.x, camera.position.y)
    galaxySpiral.update(now / 1000, camera.position.x, camera.position.y)

    // Retro mode bypasses the bloom composer — chunky pixels and glow
    // don't mix. Both paths still pay for the same lighting + transform
    // work above; this only swaps the final composition step.
    if (userRetroMode) {
      retroRenderer.render(scene, camera)
    } else {
      bloom.composer.render()
    }
  }
  loop()

  // --- Cleanup ---
  function dispose(): void {
    cancelAnimationFrame(animId)
    unsubscribePauseSettings()
    inputHandler.detach()
    aimHandler.detach()
    joystick.detach()
    aimJoystick.detach()
    gamepad.detach()
    if (toolToggleButton) toolToggleButton.detach()
    renderer.domElement.removeEventListener('mousedown', onMouseDown)
    renderer.domElement.removeEventListener('mouseup', onMouseUp)
    renderer.domElement.removeEventListener('contextmenu', onContextMenu)
    container.removeEventListener('touchstart', onTouchStartSwallow)
    window.removeEventListener('keydown', onCollectKeyDown)
    window.removeEventListener('keydown', onToolToggleKeyDown)
    window.removeEventListener('resize', onResize)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    detachReducedMotion?.()

    // Clean up projectile tracking state
    projectileModels.clear()
    tickState.projectileElapsed.clear()
    tickState.projectiles = []

    // Clean up lazer beam
    disposeLazerBeam(lazerBeam)
    for (const beam of optionLazerBeams) disposeLazerBeam(beam)
    disposeRippleBeam(rippleBeam)
    disposeTractorBeam(tractorBeam)
    clearFormationShieldVisuals()

    // Clean up explosions
    for (const e of explosions) {
      disposeExplosion(e)
    }
    explosions.length = 0

    // Clean up debris
    for (const d of debrisChunks) {
      disposeDebrisChunk(d)
    }
    debrisChunks.length = 0

    // Clean up metal chunks
    for (const m of tickState.metalChunks) {
      disposeMetalChunk(m)
    }
    tickState.metalChunks.length = 0

    // Clean up enemy
    if (tickState.enemy) {
      disposeEnemyShip(tickState.enemy)
    }
    for (const ae of tickState.ambushEnemies) {
      disposeEnemyShip(ae)
    }
    tickState.ambushEnemies.length = 0
    for (const ep of tickState.enemyProjectiles) {
      disposeEnemyProjectile(ep)
    }
    tickState.enemyProjectiles.length = 0
    for (const wd of shipwreckDebrisList) {
      disposeShipwreckDebris(wd)
    }
    shipwreckDebrisList.length = 0
    for (const sparks of enemyDamageSparks) {
      disposeEnemyDamageSparks(sparks)
    }
    enemyDamageSparks.length = 0
    for (const sb of tickState.scrapBoxes) {
      disposeScrapBox(sb)
    }
    tickState.scrapBoxes.length = 0

    // Clean up asteroid models — the scene.traverse below catches any meshes
    // still attached to the scene graph, but we explicitly clear the lookup
    // map so re-creating the scene starts from an empty book.
    asteroidModels.clear()

    // Clean up roaming-comet models + data.
    for (const [, model] of cometModels) {
      scene.remove(model.group)
      disposeCometModel(model)
    }
    cometModels.clear()
    tickState.comets.length = 0

    // Clean up mining drone meshes. They're children of miningDroneGroup so
    // they'll get walked by scene.traverse(disposeMesh), but the meshes map
    // needs an explicit clear so a re-init doesn't see stale entries.
    for (const [, mesh] of miningDroneMeshes) disposeDroneMesh(mesh)
    miningDroneMeshes.clear()
    tickState.miningDrones.length = 0

    // Clean up collector VFX & audio
    disposeCollectorVfx(collectorVfx)
    disposeAudio()
    disposeSfx()
    disposeMusic()

    // Remove the radar overlay canvas
    if (radar) {
      radar.canvas.removeEventListener('pointerdown', onRadarPointerDown)
      disposeRadar(radar)
    }

    // Clean up background effects & engine trail
    disposeTwinkleStars(twinkleStars)
    disposeNebulaSystem(nebulaSystem)
    for (const h of blackHoles) disposeBlackHole(h)
    disposeEngineTrail(engineTrail)
    disposeWarpStreaks(warpStreaks)
    disposeSpeedLines(speedLines)

    // Clean up new visual systems
    bloom.dispose()
    retroRenderer.dispose()
    cineCam.dispose()
    explosionGlowParticles.dispose()
    engineGlowParticles.dispose()
    projectileTrails.dispose()
    shipDamageVfx.dispose()
    dynamicLights.dispose()
    dustMotes.dispose()
    galaxySpiral.dispose()

    // Dispose all Three.js geometries and materials
    scene.traverse(disposeMesh)

    renderer.dispose()
    if (renderer.domElement.parentElement) {
      renderer.domElement.parentElement.removeChild(renderer.domElement)
    }
  }

  function setFireRateBonus(multiplier: number) {
    tickState.fireRateBonus = multiplier
  }

  function setMiningTool(tool: MiningTool) {
    if (tool === 'lazer') lazerUnlocked = true
    tickState.activeMiningTool = tool
    toolToggleButton?.setTool(tool)
  }

  function setCollectorTier(tier: number) {
    tickState.collectorTier = Math.max(1, Math.min(5, Math.round(tier)))
  }

  function setCargoFull(full: boolean) {
    cargoFull = full
  }

  function setCombatUpgrades(upgrades: Upgrades) {
    tickState.blasterTier = upgrades.blaster
    tickState.fireRateBonus = 1.1 ** (upgrades.blaster - 1)
    tickState.collectorTier = upgrades.collector
    tickState.missileTier = upgrades.missiles
    tickState.rippleUnlocked = upgrades.ripple > 0
    tickState.optionCount = upgrades.options
    tickState.speedTier = upgrades.speed
    tickState.armorCharges = upgrades.armor
    tickState.shieldCharges = upgrades.shield
    tickState.smartBombCount = upgrades.smartBomb
    tickState.miningDroneCap = upgrades.drone
    tickState.spreadTier = upgrades.spread
    lazerUnlocked = upgrades.lazer > 0
    tickState.autoToolUnlocked = upgrades.autoTool > 0
    // Bulk the visible ship to match the player's purchases — scoop at tier
    // 1, cargo pods at tier 2, swept wings + gold accents at tier 3. The
    // hull count is also the consumable defensive layer: a hit tears off the
    // outermost module, decrementing both the visible tier and the charge
    // count in lockstep. Both flow through this same setter via the
    // onHullChanged → setUpgradeLevel round-trip.
    applyHullModules(shipModel, upgrades.hull)
    tickState.hullCharges = upgrades.hull
    // Exotic Matter Hull (prestige): outermost charge buffer + black-hole
    // immunity. Refills on (re)sync like shield/armor; no self-repair mid-run.
    tickState.voidImmune = upgrades.exoticHull > 0
    tickState.exoticHullCharges = upgrades.exoticHull > 0 ? EXOTIC_HULL_CHARGES : 0
    tickState.wormholeTier = upgrades.wormhole
    applyExoticHullVisual(shipModel, upgrades.exoticHull > 0)
    applyArmorModules(shipModel, upgrades.armor)
    tickState.coolingTier = upgrades.cooling
    tickState.magnetTier = upgrades.magnet
    tickState.bountyTier = upgrades.bounty
    tickState.missileBiasUnlocked = upgrades.missileBias > 0
    tickState.thrustersUnlocked = upgrades.thrusters > 0
    tickState.sensorTier = upgrades.sensor
    tickState.droneRepairUnlocked = upgrades.droneRepair > 0
    tickState.drillNoseTier = upgrades.drillNose
    // If the currently-selected tool is no longer unlocked, fall back to
    // blaster so the player isn't stranded on a tool they can't fire.
    if (tickState.activeMiningTool === 'lazer' && !lazerUnlocked) {
      tickState.activeMiningTool = 'blaster'
      toolToggleButton?.setTool('blaster')
      onToolChange?.('blaster')
    }
    if (tickState.activeMiningTool === 'ripple' && !tickState.rippleUnlocked) {
      tickState.activeMiningTool = 'blaster'
      toolToggleButton?.setTool('blaster')
      onToolChange?.('blaster')
    }
  }

  /** Reset ship to just north of station with full HP, swap to normal ship, clear prologue. */
  function resetShipToStation() {
    // Move ship to just north of the station (outside station range)
    ship.x = GAS_STATION_X
    ship.y = GAS_STATION_Y + STATION_ENTER_DISTANCE - 10
    ship.velocityX = 0
    ship.velocityY = 0

    // Restore full HP
    tickState.playerHp = effectivePlayerMaxHp()
    onPlayerDamage?.(tickState.playerHp)

    // Reset to tier-1 ship and clear prologue state. The intro hands the
    // player a fully-maxed loadout as a power-demonstration; this is where
    // we take it all back. Every upgrade/flag the prologue (or a later
    // purchase) might have set must reset to its default here, or the
    // player keeps capabilities they never bought.
    tickState.blasterTier = 1
    tickState.collectorTier = 1
    tickState.fireRateBonus = 1.0
    tickState.activeMiningTool = 'blaster'
    lazerUnlocked = false
    tickState.missileTier = 0
    tickState.rippleUnlocked = false
    tickState.optionCount = 0
    tickState.speedTier = 0
    tickState.armorCharges = 0
    tickState.shieldCharges = 0
    tickState.smartBombCount = 0
    tickState.spreadTier = 0
    tickState.autoToolUnlocked = false
    tickState.coolingTier = 0
    tickState.magnetTier = 0
    tickState.hullCharges = 0
    tickState.exoticHullCharges = 0
    tickState.voidImmune = false
    tickState.wormholeTier = 0
    tickState.wormholeCooldown = 0
    tickState.bountyTier = 0
    tickState.missileBiasUnlocked = false
    tickState.thrustersUnlocked = false
    tickState.sensorTier = 0
    tickState.droneRepairUnlocked = false
    tickState.drillNoseTier = 0

    // Wipe the mining-drone fleet — drones in particular were sneaking past
    // the previous reset because there was no code to remove them at all.
    tickState.miningDroneCap = 0
    tickState.miningDrones.length = 0
    tickState.rallyPoint = null
    for (const [, mesh] of miningDroneMeshes) disposeDroneMesh(mesh)
    miningDroneMeshes.clear()

    toolToggleButton?.setTool('blaster')
    onToolChange?.('blaster')
    tickState.prologueShipFrozen = false
    tickState.prologueAutoAim = null
    tickState.prologueAutoCollect = false
    tickState.prologueAutoPilotForward = false
    tickState.aimActive = false
    tickState.mouseHoldingFire = false
    tickState.fireTarget = null
    tickState.prologueArbiterSpawned = false
    tickState.prologueArbiterDistance = 0
    tickState.prologueFieldSpawned = false
    tickState.prologueEnemiesSpawned = false
    tickState.prologueReinforcementSpawned = false
    tickState.prologueStripPhase = 0
    tickState.prologueStripTimer = 0
    tickState.ambushSpawned = false
    tickState.playerKilledFired = false
    tickState.nearStationFired = false
    tickState.wasInStationRange = false
    tickState.repairedThisVisit = false
    tickState.enemySpawned = false
    tickState.enemyNearbyFired = false
    tickState.firstMetalCollectedTime = null

    // Reset endless-mode state — resetShipToStation marks the start of the run.
    tickState.ledger = 0
    tickState.patrolTimer = FIRST_PATROL_DELAY
    tickState.asteroidRespawnTimer = ASTEROID_REPLENISH_INTERVAL
    tickState.asteroidSpawnCounter = 1
    tickState.arbiter = null
    tickState.arbiterEscort = null
    tickState.runawayEnforcer = null
    tickState.runawayEnforcerMark = 0
    tickState.runawayEnforcerTimer = 0
    tickState.arbiterMark = 0
    tickState.peakLedger = 0
    tickState.marksDefeated = 0
    tickState.runTime = 0
    tickState.sectorCollapse = 0
    tickState.endlessDeathFired = false
    prevLedgerInt = -1
    prevArbiterKey = ''
    blackHoleWarningActive = false
    onLedgerChanged?.(0)
    onArbiterChanged?.(null)

    // Swap ship model to normal variant
    scene.remove(shipModel)
    shipModel.traverse(disposeMesh)
    shipModel = createShipModel('normal')
    scene.add(shipModel)

    // Remove Arbiter
    if (arbiterModel) {
      scene.remove(arbiterModel)
      arbiterModel.traverse(disposeMesh)
      arbiterModel = null
    }
    if (arbiterEscortModel) {
      scene.remove(arbiterEscortModel)
      arbiterEscortModel.traverse(disposeMesh)
      arbiterEscortModel = null
    }

    // Remove ambush enemies
    for (const ae of tickState.ambushEnemies) {
      scene.remove(ae.mesh)
      disposeEnemyShip(ae)
    }
    tickState.ambushEnemies.length = 0
    clearFormationShieldVisuals()

    // Remove all enemy projectiles
    for (let i = tickState.enemyProjectiles.length - 1; i >= 0; i--) {
      scene.remove(tickState.enemyProjectiles[i].mesh)
      disposeEnemyProjectile(tickState.enemyProjectiles[i])
    }
    tickState.enemyProjectiles.length = 0

    // Clear all explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
      scene.remove(explosions[i].group)
      disposeExplosion(explosions[i])
    }
    explosions.length = 0

    // Clear shipwreck debris
    for (let i = shipwreckDebrisList.length - 1; i >= 0; i--) {
      scene.remove(shipwreckDebrisList[i].group)
      disposeShipwreckDebris(shipwreckDebrisList[i])
    }
    shipwreckDebrisList.length = 0
    for (let i = enemyDamageSparks.length - 1; i >= 0; i--) {
      scene.remove(enemyDamageSparks[i].group)
      disposeEnemyDamageSparks(enemyDamageSparks[i])
    }
    enemyDamageSparks.length = 0

    // --- Spawn asteroid field around the station ---
    // Remove old asteroid models from scene
    for (const [, entry] of asteroidModels) {
      scene.remove(entry.model)
      entry.model.traverse(disposeMesh)
    }
    asteroidModels.clear()
    tickState.asteroidHitCounts.clear()

    // Remove any active roaming comets
    for (const [, model] of cometModels) {
      scene.remove(model.group)
      disposeCometModel(model)
    }
    cometModels.clear()
    tickState.comets.length = 0

    // Clear old asteroid data and generate new field
    asteroids.length = 0
    const newAsteroids = spawnAsteroidField(GAS_STATION_X, GAS_STATION_Y)
    for (const a of newAsteroids) {
      asteroids.push(a)

      // Create a visually unique model for each asteroid
      const model = createAsteroidModel(a.type, a.size, hashString(a.id))
      model.position.set(a.x, a.y, 0)
      scene.add(model)

      const hm = attachAsteroidHealthMeter(model, a.size)
      asteroidModels.set(a.id, { model, healthMeter: hm })
      tickState.asteroidHitCounts.set(a.id, 0)
    }

    // Sync ship model to new position immediately so it's not visible at the old spot
    shipModel.position.set(ship.x, ship.y, 0)
    rechargeMeter.position.set(ship.x, ship.y, 0)

    // Snap camera to station immediately
    camera.position.x = ship.x
    camera.position.y = ship.y
  }

  /**
   * Soft-fail respawn after the hull is lost: tow the ship home, restore full
   * hull, wipe every hostile and the Ledger, and lay down a fresh asteroid
   * field — but keep the player's upgrades. The summary screen handles the
   * cargo wipe and high-score on the React side.
   */
  function respawnAfterDeath() {
    // Clear any in-flight death animation and reveal the ship again.
    deathSequenceTimer = null
    pendingRunStats = null
    shipModel.visible = true
    rechargeMeter.visible = true

    ship.x = GAS_STATION_X
    ship.y = GAS_STATION_Y + STATION_ENTER_DISTANCE - 10
    ship.velocityX = 0
    ship.velocityY = 0
    tickState.playerHp = effectivePlayerMaxHp()
    onPlayerDamage?.(tickState.playerHp)

    // Drop the Arbiter
    tickState.arbiter = null
    tickState.arbiterEscort = null
    tickState.runawayEnforcer = null
    tickState.runawayEnforcerMark = 0
    tickState.runawayEnforcerTimer = 0
    tickState.arbiterMark = 0

    // Remove all enemies
    for (const ae of tickState.ambushEnemies) {
      scene.remove(ae.mesh)
      disposeEnemyShip(ae)
    }
    tickState.ambushEnemies.length = 0
    clearFormationShieldVisuals()
    if (tickState.enemy) {
      scene.remove(tickState.enemy.mesh)
      disposeEnemyShip(tickState.enemy)
      tickState.enemy = null
    }

    // Remove enemy projectiles
    for (const ep of tickState.enemyProjectiles) {
      scene.remove(ep.mesh)
      disposeEnemyProjectile(ep)
    }
    tickState.enemyProjectiles.length = 0

    // Remove player projectiles
    for (const [, model] of projectileModels) {
      scene.remove(model)
      model.traverse(disposeMesh)
    }
    projectileModels.clear()
    tickState.projectiles = []
    tickState.projectileElapsed.clear()

    // Remove metal chunks & scrap boxes
    for (const m of tickState.metalChunks) {
      scene.remove(m.mesh)
      disposeMetalChunk(m)
    }
    tickState.metalChunks.length = 0
    for (const sb of tickState.scrapBoxes) {
      scene.remove(sb.mesh)
      disposeScrapBox(sb)
    }
    tickState.scrapBoxes.length = 0

    // Clear explosions & shipwreck debris
    for (const e of explosions) {
      scene.remove(e.group)
      disposeExplosion(e)
    }
    explosions.length = 0
    for (const wd of shipwreckDebrisList) {
      scene.remove(wd.group)
      disposeShipwreckDebris(wd)
    }
    shipwreckDebrisList.length = 0
    for (const sparks of enemyDamageSparks) {
      scene.remove(sparks.group)
      disposeEnemyDamageSparks(sparks)
    }
    enemyDamageSparks.length = 0

    // Respawn a fresh asteroid field around the station
    for (const [, entry] of asteroidModels) {
      scene.remove(entry.model)
      entry.model.traverse(disposeMesh)
    }
    asteroidModels.clear()
    tickState.asteroidHitCounts.clear()

    // Remove any active roaming comets
    for (const [, model] of cometModels) {
      scene.remove(model.group)
      disposeCometModel(model)
    }
    cometModels.clear()
    tickState.comets.length = 0

    asteroids.length = 0
    for (const a of spawnAsteroidField(GAS_STATION_X, GAS_STATION_Y)) {
      asteroids.push(a)
      const model = createAsteroidModel(a.type, a.size, hashString(a.id))
      model.position.set(a.x, a.y, 0)
      scene.add(model)
      const hm = attachAsteroidHealthMeter(model, a.size)
      asteroidModels.set(a.id, { model, healthMeter: hm })
      tickState.asteroidHitCounts.set(a.id, 0)
    }

    // Reset endless state for a fresh run
    tickState.ledger = 0
    tickState.patrolTimer = FIRST_PATROL_DELAY
    tickState.asteroidRespawnTimer = ASTEROID_REPLENISH_INTERVAL
    tickState.asteroidSpawnCounter = 1
    tickState.cometSpawnTimer = COMET_FIRST_DELAY
    tickState.cometSpawnCounter = 1
    tickState.peakLedger = 0
    tickState.marksDefeated = 0
    tickState.runTime = 0
    tickState.sectorCollapse = 0
    tickState.endlessDeathFired = false
    tickState.nearStationFired = false
    tickState.wasInStationRange = false
    tickState.repairedThisVisit = false
    prevLedgerInt = -1
    prevArbiterKey = ''
    prevTractorActive = false
    prevBoostActive = false
    blackHoleWarningActive = false
    onLedgerChanged?.(0)
    onArbiterChanged?.(null)

    // Sync visuals & snap the camera home
    shipModel.position.set(ship.x, ship.y, 0)
    rechargeMeter.position.set(ship.x, ship.y, 0)
    camera.position.x = ship.x
    camera.position.y = ship.y
  }

  /** Simple string hash for deterministic asteroid shape seeds. */
  function hashString(str: string): number {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33 + str.charCodeAt(i)) % 2147483647
    }
    return hash
  }

  return {
    dispose,
    setFireRateBonus,
    resetShipToStation,
    setMiningTool,
    setCollectorTier,
    setCargoFull,
    setCombatUpgrades,
    buildMiningDrone() {
      if (tickState.miningDrones.length >= tickState.miningDroneCap) return false
      // Spawn slightly offset from the ship so meshes don't all stack on top
      // of each other when the player builds a fresh batch at the station.
      const idx = tickState.miningDrones.length
      const offsetAngle = (idx / 4) * Math.PI * 2
      const drone = createMiningDrone(
        ship.x + Math.cos(offsetAngle) * 6,
        ship.y + Math.sin(offsetAngle) * 6,
      )
      tickState.miningDrones.push(drone)
      return true
    },
    getMiningDroneCount() {
      return tickState.miningDrones.length
    },
    getRunStats() {
      return {
        runTimeSec: tickState.runTime,
        ledger: tickState.ledger,
        peakLedger: tickState.peakLedger,
        marksDefeated: tickState.marksDefeated,
        score: computeScore(tickState.peakLedger, tickState.marksDefeated),
      }
    },
    setPhotoMode(on: boolean) {
      photoModeActive = on
    },
    takeScreenshot() {
      // toBlob is async but reads the canvas synchronously at call time —
      // preserveDrawingBuffer keeps the contents valid in between. We wrap
      // in a Promise so callers can `await` and trigger a download cleanly.
      return new Promise<Blob | null>((resolve) => {
        renderer.domElement.toBlob((blob) => resolve(blob), 'image/png')
      })
    },
    respawnAfterDeath,
    debugApi: {
      // --- Player state ---
      setGodMode(on) {
        tickState.debugGodMode = on
      },
      getGodMode() {
        return tickState.debugGodMode
      },
      setPlayerHp(hp) {
        tickState.playerHp = Math.max(0, Math.min(PLAYER_MAX_HP, Math.round(hp)))
        onPlayerDamage?.(tickState.playerHp)
      },
      killPlayer() {
        tickState.playerHp = 0
        onPlayerDamage?.(0)
      },
      forceDeathSequence() {
        // Setting HP to 0 + clearing the latch makes the next tick fire
        // playerKilled, which then runs through the normal death sequence.
        tickState.playerHp = 0
        tickState.endlessDeathFired = false
        onPlayerDamage?.(0)
      },
      refillShieldArmor() {
        tickState.shieldCharges = 3
        tickState.armorCharges = 3
        onShieldChanged?.(tickState.shieldCharges)
        onArmorChanged?.(tickState.armorCharges)
      },

      // --- Economy / progression ---
      setUpgradesMaxed() {
        // Push every tier to its cap. Scene mirrors react state via setCombatUpgrades,
        // so the panel should call this *after* updating react state. This method
        // just hits scene-internal flags for completeness.
        tickState.blasterTier = 5
        tickState.collectorTier = 5
        tickState.fireRateBonus = 1
        tickState.missileTier = 8
        tickState.rippleUnlocked = true
        tickState.optionCount = 3
        tickState.speedTier = 5
        tickState.armorCharges = 3
        tickState.shieldCharges = 3
        tickState.smartBombCount = 1
        tickState.miningDroneCap = 4
        tickState.spreadTier = 1
        tickState.autoToolUnlocked = true
        tickState.voidImmune = true
        tickState.exoticHullCharges = EXOTIC_HULL_CHARGES
        tickState.wormholeTier = 2
        lazerUnlocked = true
      },
      unlockAllTools() {
        lazerUnlocked = true
        tickState.rippleUnlocked = true
        tickState.autoToolUnlocked = true
        tickState.spreadTier = 1
      },

      // --- Enemies ---
      spawnEnemyAtCursor(kind, worldX, worldY) {
        const damage = patrolEnemyDamage(tickState.ledger)
        const enemy = createEnemyShip(worldX, worldY, damage, kind)
        tickState.ambushEnemies.push(enemy)
        // Mesh registration normally happens via result.ambushEnemiesSpawned —
        // synthesize it here so the loop's "newly spawned" block adds the mesh
        // and health meter on the next frame.
        scene.add(enemy.mesh)
        const hm = createHealthMeter(
          -Math.max(HEALTH_BAR_OFFSET_Y, enemy.collisionRadius + 8),
        )
        enemy.mesh.add(hm)
        enemy.mesh.userData.healthMeter = hm
      },
      spawnArbiter() {
        // Bump to the next Mark and place the Arbiter just off-screen on a
        // random heading — same logic as the natural director, but bypassing
        // the ledger threshold.
        tickState.arbiterMark++
        const camHalfW = camera.position.z * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect
        const camHalfH = camera.position.z * Math.tan((camera.fov * Math.PI) / 360)
        const viewDiag = Math.hypot(camHalfW, camHalfH)
        const angle = Math.random() * Math.PI * 2
        const r = viewDiag + 45
        tickState.arbiter = createArbiterState(
          tickState.arbiterMark,
          ship.x + Math.cos(angle) * r,
          ship.y + Math.sin(angle) * r,
        )
      },
      despawnAllEnemies() {
        for (const ae of tickState.ambushEnemies) {
          scene.remove(ae.mesh)
          disposeEnemyShip(ae)
        }
        tickState.ambushEnemies.length = 0
        clearFormationShieldVisuals()
        if (tickState.enemy) {
          scene.remove(tickState.enemy.mesh)
          disposeEnemyShip(tickState.enemy)
          tickState.enemy = null
        }
        tickState.arbiter = null
        tickState.arbiterEscort = null
        tickState.runawayEnforcer = null
        tickState.runawayEnforcerMark = 0
        tickState.runawayEnforcerTimer = 0
        tickState.arbiterMark = 0
      },

      // --- Roaming comet ---
      spawnComet() {
        // Arm the spawn timer so the next endless tick emits a comet through
        // the normal path (which also creates its mesh + radar blip). No-op
        // outside endless mode, where updateComets doesn't run.
        tickState.cometSpawnTimer = 0
      },

      // --- Asteroids ---
      spawnAsteroidAtCursor(type, worldX, worldY) {
        const id = `dbg-${Math.random().toString(36).slice(2, 9)}`
        // Mid-size by default — biggest gives drones a meaningful target.
        const size = 1
        const baseHp = 12
        const ast: Asteroid = {
          id,
          x: worldX,
          y: worldY,
          velocityX: 0,
          velocityY: 0,
          type,
          hp: baseHp,
          maxHp: baseHp,
          size,
        }
        tickState.asteroids.push(ast)
        const model = createAsteroidModel(type, size, hashString(id))
        model.position.set(worldX, worldY, 0)
        scene.add(model)
        const hm = attachAsteroidHealthMeter(model, size)
        asteroidModels.set(id, { model, healthMeter: hm })
        tickState.asteroidHitCounts.set(id, 0)
      },
      clearAsteroids() {
        for (const [, entry] of asteroidModels) {
          scene.remove(entry.model)
          entry.model.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.geometry.dispose()
              if (obj.material instanceof THREE.Material) obj.material.dispose()
            }
          })
        }
        asteroidModels.clear()
        tickState.asteroidHitCounts.clear()
        tickState.asteroids.length = 0
      },

      // --- Drones ---
      buildDronesUpToCap() {
        let built = 0
        while (tickState.miningDrones.length < tickState.miningDroneCap) {
          const idx = tickState.miningDrones.length
          const offset = (idx / 4) * Math.PI * 2
          const d = createMiningDrone(
            ship.x + Math.cos(offset) * 6,
            ship.y + Math.sin(offset) * 6,
          )
          tickState.miningDrones.push(d)
          built++
        }
        return built
      },
      forceDroneState(forced) {
        for (const d of tickState.miningDrones) {
          d.state = forced
          if (forced === 'retreating') d.retreatTimer = 999
          if (forced === 'returning') d.carriedScrap = 25
        }
      },

      // --- Camera / nav ---
      teleportShip(x, y) {
        ship.x = x
        ship.y = y
        ship.velocityX = 0
        ship.velocityY = 0
      },
      teleportToStation() {
        ship.x = GAS_STATION_X
        ship.y = GAS_STATION_Y + STATION_ENTER_DISTANCE - 10
        ship.velocityX = 0
        ship.velocityY = 0
      },
      teleportToArbiter() {
        if (!tickState.arbiter) return
        ship.x = tickState.arbiter.x - 30
        ship.y = tickState.arbiter.y
        ship.velocityX = 0
        ship.velocityY = 0
      },
      teleportToNearestEnemy() {
        const enemies = tickState.ambushEnemies.filter((e) => e.alive)
        if (tickState.enemy && tickState.enemy.alive) enemies.push(tickState.enemy)
        if (enemies.length === 0) return
        let best = enemies[0]
        let bestD = Infinity
        for (const e of enemies) {
          const d = Math.hypot(e.x - ship.x, e.y - ship.y)
          if (d < bestD) {
            bestD = d
            best = e
          }
        }
        ship.x = best.x - 20
        ship.y = best.y
        ship.velocityX = 0
        ship.velocityY = 0
      },

      // --- Time ---
      setDtMultiplier(mult) {
        tickState.debugDtMultiplier = Math.max(0, mult)
      },
      getDtMultiplier() {
        return tickState.debugDtMultiplier
      },

      // --- Spawn director ---
      setEnemySpawnsDisabled(off) {
        tickState.debugDisableEnemySpawns = off
      },
      getEnemySpawnsDisabled() {
        return tickState.debugDisableEnemySpawns
      },

      // --- Post-process toggles ---
      setBloomEnabled(on) {
        debugBloomEnabled = on
        if (!on) bloom.setBloom(0, true)
      },
      setVignetteEnabled(on) {
        debugVignetteEnabled = on
        if (!on) bloom.setVignette(0)
      },
      setChromaticAberrationEnabled(on) {
        debugChromaticEnabled = on
        if (!on) bloom.setChromaticAberration(0)
      },
      setScreenShakeEnabled(on) {
        screenShake.enabled = on
      },

      // --- Collision overlay ---
      setCollisionDebugEnabled(on) {
        debugCollisionOverlay = on
        if (!on) hideCollisionDebugRings(collisionDebugGroup)
      },
      getCollisionDebugEnabled() {
        return debugCollisionOverlay
      },

      // --- Perf overlay ---
      setPerfOverlayEnabled(on) {
        debugPerfOverlay = on
      },
      getPerfOverlayEnabled() {
        return debugPerfOverlay
      },

      // --- Ledger ---
      addLedger(amount) {
        tickState.ledger = Math.max(0, tickState.ledger + amount)
      },
      setLedger(amount) {
        tickState.ledger = Math.max(0, amount)
      },

      // --- Snapshot ---
      snapshotTickState() {
        return JSON.stringify(
          {
            ship: { x: ship.x, y: ship.y, rotation: ship.rotation },
            hp: tickState.playerHp,
            ledger: tickState.ledger,
            arbiterMark: tickState.arbiterMark,
            blasterTier: tickState.blasterTier,
            collectorTier: tickState.collectorTier,
            missileTier: tickState.missileTier,
            optionCount: tickState.optionCount,
            speedTier: tickState.speedTier,
            armorCharges: tickState.armorCharges,
            shieldCharges: tickState.shieldCharges,
            smartBombCount: tickState.smartBombCount,
            miningDroneCap: tickState.miningDroneCap,
            spreadTier: tickState.spreadTier,
            lazerUnlocked,
            rippleUnlocked: tickState.rippleUnlocked,
            autoToolUnlocked: tickState.autoToolUnlocked,
            asteroidCount: tickState.asteroids.filter((a) => a.hp > 0).length,
            enemyCount:
              (tickState.enemy?.alive ? 1 : 0) +
              tickState.ambushEnemies.filter((e) => e.alive).length,
            droneCount: tickState.miningDrones.length,
            projectileCount: tickState.projectiles.length,
            enemyProjectileCount: tickState.enemyProjectiles.length,
          },
          null,
          2,
        )
      },
      getCursorWorld() {
        if (!aimState.active) return null
        return screenToWorld(aimState.screenX, aimState.screenY)
      },
    },
  }
}
