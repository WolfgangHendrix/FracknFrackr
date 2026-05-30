/**
 * Shared game tick logic — the single source of truth for game state updates.
 *
 * Both the Three.js renderer (scene.ts) and the headless integration test
 * simulation (GameSimulation) call tick() each frame. This ensures game
 * behavior is identical in production and tests.
 *
 * tick() owns ALL game logic: physics, collisions, firing, collection,
 * enemy AI, station proximity, and pause/unpause transitions.
 * It does NOT touch rendering, audio, or DOM.
 */

import type { Ship } from '@/lib/schemas'
import type { Asteroid, MiningTool, Projectile } from './types'
import { WEAPON_AFFINITY } from './types'
import type { MiningDrone } from './mining-drone'
import {
  updateMiningDrones,
  applyDroneHit,
  MINING_DRONE_COLLISION_RADIUS,
  createMiningDrone,
} from './mining-drone'
import type { InputState } from './input'
import type { BlasterState, LazerState } from './blaster'
import type { MetalChunk } from './metal-chunk'
import type { EnemyShip, EnemyProjectile } from './enemy-ship'
import type { ScrapBox } from './scrap-box'
import type { ProjectileHit, BeamHit } from './collision'
import type { TutorialStep } from '@/hooks/useTutorial'

import { updateShip } from './ship-controller'
import {
  createBlasterState,
  createLazerState,
  updateBlasterCooldown,
  updateLazerState,
  fireBlaster,
  fireBlasterFrom,
  createMissileProjectile,
  updateProjectiles,
} from './blaster'
import { DAMAGE_PER_TIER, LAZER_BEAM_RANGE, clampTier } from './blaster-constants'
import {
  resolveShipAsteroidCollision,
  resolveAsteroidAsteroidCollisions,
  checkProjectileAsteroidCollisions,
  checkBeamAsteroidCollisions,
} from './collision'
import { ASTEROID_SIZE_RADIUS } from './asteroid-model'
import {
  createMetalChunk,
  updateMetalChunk,
  bounceMetalOffShip,
  bounceMetalOffAsteroid,
  attractMetalToShip,
  METAL_SPAWN_CHANCE,
} from './metal-chunk'
import {
  createEnemyShip,
  updateEnemyShip,
  checkProjectileEnemyCollisions,
  checkBeamEnemyCollisions,
  checkEnemyProjectilePlayerCollisions,
  updateEnemyProjectile,
  ENEMY_SPAWN_DISTANCE,
  CARRIER_DRONE_INTERVAL,
  CARRIER_MAX_DRONES,
  DRONE_DAMAGE_MULT,
  SCAVENGER_GRAB_RANGE,
  SCAVENGER_ESCAPE_DISTANCE,
  DRIFTER_SPEED,
  SPLITTER_CHILD_COUNT,
} from './enemy-ship'
import type { EnemyKind } from './enemy-ship'
import { createScrapBox, updateScrapBox, attractScrapBoxToShip, SCRAP_BOX_VALUE } from './scrap-box'
import { HITS_PER_BREAK } from './asteroid-debris'
import { spawnEdgeAsteroid, spawnPrologueReinforcement } from './asteroid-spawner'
import {
  LEDGER_PER_ASTEROID,
  LEDGER_PER_METAL,
  patrolInterval,
  patrolSize,
  patrolEnemyDamage,
  MAX_PATROL_ENEMIES,
  FIRST_PATROL_DELAY,
  ASTEROID_FLOOR,
  ASTEROID_REPLENISH_BATCH,
  ASTEROID_REPLENISH_INTERVAL,
  arbiterThreshold,
  ARBITER_DEFEAT_LEDGER_FACTOR,
  ARBITER_EVADE_LEDGER_RELIEF,
} from './ledger-config'
import {
  createArbiterState,
  updateArbiter,
  checkProjectileArbiterCollisions,
  checkBeamArbiterCollisions,
  applyTractorPull,
  ARBITER_COLLISION_RADIUS,
} from './arbiter'
import type { ArbiterState } from './arbiter'
import {
  PROLOGUE_SHIP,
  PROLOGUE_MINING_TARGET,
  PROLOGUE_FIELD_RADIUS,
  PROLOGUE_REINFORCEMENT_THRESHOLD,
  PROLOGUE_REINFORCEMENT_ASTEROIDS,
  ARBITER_STRIP_DELAY,
  ARBITER_SPAWN_DISTANCE,
  ARBITER_APPROACH_SPEED,
} from './prologue-config'

// ---------------------------------------------------------------------------
// Constants (mirrored from scene.ts)
// ---------------------------------------------------------------------------

export const PLAYER_MAX_HP = 100
const ENEMY_NEARBY_DISTANCE = 60
const STATION_NEAR_DISTANCE = 80
const STATION_ENTER_DISTANCE = 60
const STATION_REPAIR_DISTANCE = 30
// Auto-open trade menu when the ship is physically *inside* the station —
// not merely touching the outer hull. The platform extends roughly ±20 in
// X and ±12 in Y from the station anchor (see gas-station-model.ts), so
// 15 sits well inside the structure footprint without demanding pinpoint
// accuracy. The 30-unit heal fires first as the ship crosses in, then
// this trigger lands once they're "in the building" — feels much more
// like docking than the previous touch-to-open behaviour.
const STATION_AUTO_TRADE_DISTANCE = 15
// Active-hostile lockout — any live enemy within this radius blocks the
// trade-menu auto-open, so the player can't use the station to escape a
// pursuit. Calibrated to roughly the radar range so off-map fights don't
// gate shopping but anything actually chasing the player does.
const STATION_HOSTILE_LOCKOUT_RADIUS = 180
const AMBUSH_SHOOT_MIN = 0.3
const AMBUSH_SHOOT_MAX = 0.5
const AMBUSH_PROJECTILE_DAMAGE = 20
const DRONE_POST_LAUNCH_SHOOT_DELAY = 0.8
const BLACK_HOLE_PULL_RADIUS = 120
const BLACK_HOLE_EVENT_HORIZON_RADIUS = 12
const BLACK_HOLE_PULL_ACCEL = 180
const BLACK_HOLE_PLAYER_PULL_MULT = 0.45

const DRONE_LAUNCH_SLOTS: readonly {
  bayX: number
  bayY: number
  targetX: number
  targetY: number
}[] = [
  { bayX: -0.5, bayY: 0.05, targetX: -1.2, targetY: 0.45 },
  { bayX: 0.5, bayY: 0.05, targetX: 1.2, targetY: 0.45 },
  { bayX: 0, bayY: -0.4, targetX: 0, targetY: -1.25 },
]

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** All mutable game state. Owned and mutated by tick(). */
export interface TickState {
  ship: Ship
  asteroids: Asteroid[]
  projectiles: Projectile[]
  metalChunks: MetalChunk[]
  enemy: EnemyShip | null
  enemyProjectiles: EnemyProjectile[]
  scrapBoxes: ScrapBox[]
  playerHp: number

  blasterState: BlasterState
  lazerState: LazerState
  missileCooldown: number
  missileData: Map<string, { phase: 'deploy' | 'homing'; timer: number; targetId: string | null }>
  projectileElapsed: Map<string, number>
  asteroidHitCounts: Map<string, number>
  blasterTier: number
  /** Collector upgrade tier (1–5). Widens the magnet pickup range. */
  collectorTier: number
  activeMiningTool: MiningTool
  fireRateBonus: number
  missileTier: number
  rippleUnlocked: boolean
  autoToolUnlocked: boolean
  /** Max active mining drones (player's drone upgrade tier). */
  miningDroneCap: number
  /** All currently-built player mining drones. Built one-at-a-time at station. */
  miningDrones: MiningDrone[]
  /** Optional player-set rally world coordinate. Drones prefer rocks here. */
  rallyPoint: { x: number; y: number } | null
  /** Spread-shot upgrade tier. 0 = single bolt, 1 = 3-bolt fan. */
  spreadTier: number

  // --- Capstone upgrades (tier counts mirror Upgrades schema) ---
  /** Cooling Vanes 0-3: +50% max heat & +50% cool rate per tier. */
  coolingTier: number
  /** Magnetic Hopper 0-3: extra pickup radius multiplier (+30% per tier). */
  magnetTier: number
  /**
   * Hull modules — consumable defensive layer. Each module bolts a visible
   * piece onto the ship and absorbs one hit before tearing off. Mirrors
   * upgrades.hull; range 0-3. Purchased per-charge at the trade station,
   * decremented on hit between shield and armor in the damage hierarchy.
   */
  hullCharges: number
  /** Bounty Manifest 0-3: +15% enemy-kill scrap per tier. */
  bountyTier: number
  /** Heat-Seeker Bias 0/1: missiles prefer Arbiter + carriers when on. */
  missileBiasUnlocked: boolean
  /** Thruster Vectoring 0/1: tap-to-boost availability flag. */
  thrustersUnlocked: boolean
  /** Sensor Array 0-3: radar range bonus. */
  sensorTier: number
  /** Drone Repair Bay 0/1: passive drone rebuild while near station. */
  droneRepairUnlocked: boolean
  /** Drill Nose 0-3: per-tier ramming damage to asteroids. */
  drillNoseTier: number
  /** Active boost timer (sec). Velocity boost while > 0. */
  boostActiveTimer: number
  /** Boost cooldown timer (sec). Boost is unavailable while > 0. */
  boostCooldownTimer: number
  /** Drone-repair countdown (sec). Builds one drone when it reaches 0. */
  droneRepairTimer: number

  // --- Debug-only knobs. Always present on the type so the tick code
  // doesn't have to thread `DEBUG_ENABLED` everywhere, but only ever
  // toggled away from defaults when the debug build is active.
  /** When true, damagePlayer is a no-op. */
  debugGodMode: boolean
  /** Multiplier on the simulation dt — 0.25 = slow-mo, 2 = fast-forward. */
  debugDtMultiplier: number
  /** When true, periodic patrol / Arbiter spawns are suppressed. */
  debugDisableEnemySpawns: boolean

  /**
   * Cinematic-time multiplier driven by gameplay events (not debug). Scene
   * ramps this during the death sequence so the explosion + debris play out
   * in slow motion. 1 = normal.
   */
  slowMoFactor: number
  optionCount: number
  speedTier: number
  armorCharges: number
  shieldCharges: number
  smartBombCount: number
  invulnerabilityTimer: number

  // Fire/aim state — tick() clears these on unpause
  fireTarget: { x: number; y: number } | null
  mouseHoldingFire: boolean
  aimActive: boolean

  /**
   * Countdown (seconds) after unpausing during which aim/fire input is ignored.
   * Prevents synthesized mouse events from touch dismiss (~300ms delay) from
   * leaking into the canvas and locking the ship's rotation.
   */
  inputCooldown: number

  // Internal flags
  wasPaused: boolean
  nearStationFired: boolean
  wasInStationRange: boolean
  /** Latch — true while the ship is inside STATION_AUTO_TRADE_DISTANCE.
   *  Rising edge fires either stationContactRequest (clear) or
   *  stationContactBlocked (hostiles nearby) exactly once per entry. */
  wasInStationContact: boolean
  repairedThisVisit: boolean
  firstMetalCollectedTime: number | null
  enemySpawned: boolean
  enemyNearbyFired: boolean

  /** Previous tick's tutorial step — used to detect step transitions. */
  prevTutorialStep: TutorialStep | null

  // Ambush (used by prologue)
  ambushEnemies: EnemyShip[]
  ambushSpawned: boolean
  playerKilledFired: boolean

  positionHistory: { x: number; y: number; rotation: number }[]

  // Station position
  stationX: number
  stationY: number

  elapsedTime: number

  // --- Endless mode (active once tutorialStep === 'done') ---
  /** The Ledger — escalation meter driving patrol cadence and difficulty. */
  ledger: number
  /** Countdown (seconds) to the next enemy patrol spawn. */
  patrolTimer: number
  /** Countdown (seconds) to the next asteroid replenishment pulse. */
  asteroidRespawnTimer: number
  /** Monotonic counter for unique replenished-asteroid ids. */
  asteroidSpawnCounter: number
  /** The active Arbiter boss, or null when no encounter is underway. */
  arbiter: ArbiterState | null
  /** Number of Arbiter encounters started so far (the current/last Mark). */
  arbiterMark: number
  /** Highest Ledger value reached this run (end-of-run scoring). */
  peakLedger: number
  /** Arbiters destroyed this run. */
  marksDefeated: number
  /** Seconds elapsed in endless play this run. */
  runTime: number
  /** Latch so the run-ended event fires exactly once. */
  endlessDeathFired: boolean

  // Prologue
  prologueFieldSpawned: boolean
  prologueAsteroidsDestroyed: number
  prologueEnemiesSpawned: boolean
  /** Latch — second-wave reinforcement (asteroids + a few enemies) fires once
   *  the player has destroyed PROLOGUE_REINFORCEMENT_THRESHOLD of the field. */
  prologueReinforcementSpawned: boolean
  prologueEnemiesKilled: number
  prologueArbiterSpawned: boolean
  prologueShipFrozen: boolean
  /** Set true at the top of tick whenever the tutorial step is a prologue
   *  beat — damagePlayer no-ops while this is on. Cleared every tick. */
  prologueInvulnerable: boolean
  prologueStripPhase: number
  prologueStripTimer: number
  /** Arbiter approach distance remaining (scene.ts decrements, tick checks). */
  prologueArbiterDistance: number
  /** Auto-aim target set by prologueTick, consumed by ship update. */
  prologueAutoAim: { x: number; y: number } | null
  /** Whether prologue auto-collect is active. */
  prologueAutoCollect: boolean
  /** Whether prologue auto-pilots the ship forward. */
  prologueAutoPilotForward: boolean
}

/** Per-frame inputs — NOT owned by tick(), only read. */
export interface TickInput {
  dt: number
  paused: boolean
  inputState: InputState
  /** World-space aim position (null = no active aim). */
  aimWorldPosition: { x: number; y: number } | null
  collecting: boolean
  tutorialStep: TutorialStep
  /** Camera-visible world-space rectangle, for gating fire to on-screen targets. */
  viewBounds: { centerX: number; centerY: number; halfW: number; halfH: number }
  /** Active black-hole hazard position, matching the visible background object. */
  blackHole: { x: number; y: number } | null
}

import type { MetalVariant } from './types'
export type { MetalVariant }

/** Events produced by a single tick, consumed by renderer or test harness. */
export interface TickResult {
  // Projectile lifecycle
  newProjectiles: Projectile[]
  expiredProjectileIds: string[]
  // Asteroid collision details (for VFX positioning)
  asteroidHits: ProjectileHit[]
  // Lazer beam state (for rendering the beam visual)
  beamActive: boolean
  beamStartX: number
  beamStartY: number
  beamEndX: number
  beamEndY: number
  beamHits: BeamHit[]
  optionBeams: { startX: number; startY: number; endX: number; endY: number }[]
  rippleActive: boolean
  rippleStartX: number
  rippleStartY: number
  rippleEndX: number
  rippleEndY: number
  // Metal spawned from asteroid hits
  newMetalChunks: MetalChunk[]
  // Collection events
  metalCollected: { id: string; variant: MetalVariant }[]
  scrapCollected: { id: string; value: number }[]
  /** Scrap deposited by mining drones returning to the ship this tick. */
  droneScrapDelivered: number
  /** Drone IDs destroyed by enemy fire this tick — scene removes their meshes. */
  destroyedDroneIds: string[]
  /** Scrap value snatched by enemies that shot a carrying drone this tick. */
  scrapStolenByEnemies: number
  /** True if Drone Repair Bay rebuilt a drone this tick (scene needs to bump count). */
  droneRebuilt: boolean
  /** True while the ship is actively drilling an asteroid with the nose drill. */
  drillNoseActive: boolean
  // Enemy lifecycle
  enemySpawned: EnemyShip | null
  enemyDestroyed: { x: number; y: number } | null
  enemyDamaged: {
    enemy: EnemyShip
    damage: number
    x: number
    y: number
    source: 'beam' | 'projectile'
  }[]
  newEnemyProjectiles: EnemyProjectile[]
  expiredEnemyProjectileIds: string[]
  enemyProjectileHits: { id: string; x: number; y: number; damage: number }[]
  // Ambush
  ambushEnemiesSpawned: EnemyShip[]
  ambushEnemiesDestroyed: EnemyShip[]
  /** Scavengers that fled the sector with loot — remove their meshes quietly. */
  enemiesEscaped: EnemyShip[]
  /** Ids of metal chunks stolen by scavengers (mesh removal, no player credit). */
  metalStolen: string[]
  /** Ids of scrap boxes stolen by scavengers (mesh removal, no player credit). */
  scrapStolen: string[]
  /** Ids of asteroids consumed by the black hole. */
  blackHoleAsteroidsConsumed: string[]
  // Callback events (booleans/counts for scene.ts callbacks)
  shipMoved: boolean
  asteroidHit: boolean
  metalSpawned: boolean
  metalCollectedEvent: boolean
  enemyNearby: boolean
  nearStation: boolean
  stationRangeChanged: boolean | null // true=entered, false=left, null=no change
  stationRepaired: boolean
  /** Set the tick the ship first enters STATION_AUTO_TRADE_DISTANCE with
   *  no hostiles within STATION_HOSTILE_LOCKOUT_RADIUS — page layer opens
   *  the trade menu in response. */
  stationContactRequest: boolean
  /** Set the tick the ship enters auto-trade range but hostiles are present
   *  in the lockout radius. Page layer shows a brief "clear the sector"
   *  banner instead of opening the trade menu. */
  stationContactBlocked: boolean
  playerDamaged: boolean
  playerKilled: boolean
  enemyDestroyedEvent: boolean
  scrapCollectedEvent: boolean
  // Prologue events
  prologueReady: boolean
  fieldCleared: boolean
  arbiterArrived: boolean
  stripAdvanced: boolean
  stripComplete: boolean
  prologuePlayerKilled: boolean
  shieldHit: boolean
  armorHit: boolean
  /** A hull module was torn off this tick — scene re-applies modules at the
   *  new (lower) tickState.hullCharges to drop the outermost visible piece. */
  hullModuleLost: boolean
  /** The tick a Smart Bomb detonates (auto-bomb on death). */
  smartBombDetonated: boolean
  // Endless mode
  /** Current Ledger value (always set, even outside endless mode). */
  ledger: number
  /** Asteroids spawned this tick by field replenishment. */
  newAsteroids: Asteroid[]
  /** Ids of asteroids removed this tick (destroyed or culled far off-screen). */
  expiredAsteroidIds: string[]
  /** Set the tick an Arbiter encounter begins. */
  arbiterSpawned: { mark: number } | null
  /** Set the tick the Arbiter is destroyed by the player. */
  arbiterDefeated: { x: number; y: number; mark: number } | null
  /** Set the tick the Arbiter gives up and withdraws. */
  arbiterWithdrawn: { mark: number } | null
  /** True on any tick the player damaged the Arbiter. */
  arbiterHit: boolean
  /** True the tick the Arbiter's tractor beam drags the ship into its hull. */
  arbiterCaptureHit: boolean
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface TickStateConfig {
  shipPosition?: { x: number; y: number }
  playerHp?: number
  blasterTier?: number
  collectorTier?: number
  miningTool?: MiningTool
  fireRateBonus?: number
  missileTier?: number
  rippleUnlocked?: boolean
  optionCount?: number
  speedTier?: number
  armorCharges?: number
  shieldCharges?: number
  smartBombCount?: number
  invulnerabilityTimer?: number
  asteroids?: Asteroid[]
  stationPosition?: { x: number; y: number }
}

/** Collector pickup range per upgrade tier (1–5). */
const COLLECTOR_RANGE_BY_TIER = [12, 20, 28, 36, 50] as const

export function collectorRangeForTier(tier: number): number {
  const clamped = Math.max(1, Math.min(5, Math.round(tier)))
  return COLLECTOR_RANGE_BY_TIER[clamped - 1]
}

export function createTickState(config?: TickStateConfig): TickState {
  const pos = config?.shipPosition ?? { x: 0, y: 0 }
  const station = config?.stationPosition ?? { x: 30, y: 200 }
  const asteroids = config?.asteroids ?? []
  const hitCounts = new Map<string, number>()
  for (const a of asteroids) {
    hitCounts.set(a.id, 0)
  }

  return {
    ship: { x: pos.x, y: pos.y, rotation: 0, velocityX: 0, velocityY: 0 },
    asteroids,
    projectiles: [],
    metalChunks: [],
    enemy: null,
    enemyProjectiles: [],
    scrapBoxes: [],
    playerHp: config?.playerHp ?? PLAYER_MAX_HP,

    blasterState: createBlasterState(),
    lazerState: createLazerState(),
    missileCooldown: 0,
    missileData: new Map(),
    projectileElapsed: new Map(),
    asteroidHitCounts: hitCounts,
    blasterTier: config?.blasterTier ?? 1,
    collectorTier: config?.collectorTier ?? 1,
    activeMiningTool: config?.miningTool ?? 'blaster',
    fireRateBonus: config?.fireRateBonus ?? 1.0,
    missileTier: config?.missileTier ?? 0,
    rippleUnlocked: config?.rippleUnlocked ?? false,
    autoToolUnlocked: false,
    miningDroneCap: 0,
    miningDrones: [],
    rallyPoint: null,
    spreadTier: 0,
    coolingTier: 0,
    magnetTier: 0,
    hullCharges: 0,
    bountyTier: 0,
    missileBiasUnlocked: false,
    thrustersUnlocked: false,
    sensorTier: 0,
    droneRepairUnlocked: false,
    drillNoseTier: 0,
    boostActiveTimer: 0,
    boostCooldownTimer: 0,
    droneRepairTimer: 10,
    debugGodMode: false,
    debugDtMultiplier: 1,
    debugDisableEnemySpawns: false,
    slowMoFactor: 1,
    optionCount: config?.optionCount ?? 0,
    speedTier: config?.speedTier ?? 0,
    armorCharges: config?.armorCharges ?? 0,
    shieldCharges: config?.shieldCharges ?? 0,
    smartBombCount: config?.smartBombCount ?? 0,
    invulnerabilityTimer: config?.invulnerabilityTimer ?? 0,

    fireTarget: null,
    mouseHoldingFire: false,
    aimActive: false,
    inputCooldown: 0,

    wasPaused: false,
    nearStationFired: false,
    wasInStationRange: false,
    wasInStationContact: false,
    repairedThisVisit: false,
    firstMetalCollectedTime: null,
    enemySpawned: false,
    enemyNearbyFired: false,

    prevTutorialStep: null,

    ambushEnemies: [],
    ambushSpawned: false,
    playerKilledFired: false,

    positionHistory: [],

    stationX: station.x,
    stationY: station.y,

    elapsedTime: 0,

    ledger: 0,
    patrolTimer: FIRST_PATROL_DELAY,
    asteroidRespawnTimer: ASTEROID_REPLENISH_INTERVAL,
    asteroidSpawnCounter: 1,
    arbiter: null,
    arbiterMark: 0,
    peakLedger: 0,
    marksDefeated: 0,
    runTime: 0,
    endlessDeathFired: false,

    prologueFieldSpawned: false,
    prologueAsteroidsDestroyed: 0,
    prologueEnemiesSpawned: false,
    prologueReinforcementSpawned: false,
    prologueEnemiesKilled: 0,
    prologueArbiterSpawned: false,
    prologueShipFrozen: false,
    prologueInvulnerable: false,
    prologueStripPhase: 0,
    prologueStripTimer: 0,
    prologueArbiterDistance: ARBITER_SPAWN_DISTANCE,
    prologueAutoAim: null,
    prologueAutoCollect: false,
    prologueAutoPilotForward: false,
  }
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

function emptyResult(): TickResult {
  return {
    newProjectiles: [],
    expiredProjectileIds: [],
    asteroidHits: [],
    beamActive: false,
    beamStartX: 0,
    beamStartY: 0,
    beamEndX: 0,
    beamEndY: 0,
    beamHits: [],
    optionBeams: [],
    rippleActive: false,
    rippleStartX: 0,
    rippleStartY: 0,
    rippleEndX: 0,
    rippleEndY: 0,
    newMetalChunks: [],
    metalCollected: [],
    scrapCollected: [],
    droneScrapDelivered: 0,
    destroyedDroneIds: [],
    scrapStolenByEnemies: 0,
    droneRebuilt: false,
    drillNoseActive: false,
    enemySpawned: null,
    enemyDestroyed: null,
    enemyDamaged: [],
    newEnemyProjectiles: [],
    expiredEnemyProjectileIds: [],
    enemyProjectileHits: [],
    ambushEnemiesSpawned: [],
    ambushEnemiesDestroyed: [],
    enemiesEscaped: [],
    metalStolen: [],
    scrapStolen: [],
    blackHoleAsteroidsConsumed: [],
    shipMoved: false,
    asteroidHit: false,
    metalSpawned: false,
    metalCollectedEvent: false,
    enemyNearby: false,
    nearStation: false,
    stationRangeChanged: null,
    stationRepaired: false,
    stationContactRequest: false,
    stationContactBlocked: false,
    playerDamaged: false,
    playerKilled: false,
    enemyDestroyedEvent: false,
    scrapCollectedEvent: false,
    prologueReady: false,
    fieldCleared: false,
    arbiterArrived: false,
    stripAdvanced: false,
    stripComplete: false,
    prologuePlayerKilled: false,
    shieldHit: false,
    armorHit: false,
    hullModuleLost: false,
    smartBombDetonated: false,
    ledger: 0,
    newAsteroids: [],
    expiredAsteroidIds: [],
    arbiterSpawned: null,
    arbiterDefeated: null,
    arbiterWithdrawn: null,
    arbiterHit: false,
    arbiterCaptureHit: false,
  }
}

// ---------------------------------------------------------------------------
// Aim-targeting helpers
// ---------------------------------------------------------------------------

/** Squared distance from point (cx, cy) to segment (ax, ay)→(bx, by). */
function pointToSegmentDistSq(
  cx: number,
  cy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax
  const aby = by - ay
  const lenSq = abx * abx + aby * aby
  if (lenSq < 0.0001) {
    const dx = cx - ax
    const dy = cy - ay
    return dx * dx + dy * dy
  }
  let t = ((cx - ax) * abx + (cy - ay) * aby) / lenSq
  t = Math.max(0, Math.min(1, t))
  const px = ax + t * abx
  const py = ay + t * aby
  const dx = cx - px
  const dy = cy - py
  return dx * dx + dy * dy
}

/**
 * True when a live asteroid or enemy is BOTH (a) visible on screen and (b) on
 * the firing line from the ship along the aim direction. Gates firing so the
 * weapon only shoots at on-screen things the player is actually pointing at —
 * never at off-screen rocks that merely share the bearing.
 */
function aimLineHasVisibleTarget(
  state: TickState,
  aim: { x: number; y: number },
  view: TickInput['viewBounds'],
): boolean {
  const ship = state.ship
  const dx = aim.x - ship.x
  const dy = aim.y - ship.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.5) return false
  const ux = dx / dist
  const uy = dy / dist
  // Ray long enough to span the whole visible area; the visibility test below
  // is what actually bounds which targets count.
  const rayLen = Math.hypot(view.halfW * 2, view.halfH * 2)
  const endX = ship.x + ux * rayLen
  const endY = ship.y + uy * rayLen

  // A target counts only if its body overlaps the viewport (visible, even
  // partially) AND the firing line passes within its radius (in line).
  const onScreen = (x: number, y: number, r: number): boolean =>
    Math.abs(x - view.centerX) <= view.halfW + r && Math.abs(y - view.centerY) <= view.halfH + r

  for (const a of state.asteroids) {
    if (a.hp <= 0) continue
    const r = ASTEROID_SIZE_RADIUS[a.size] ?? 5
    if (!onScreen(a.x, a.y, r)) continue
    if (pointToSegmentDistSq(a.x, a.y, ship.x, ship.y, endX, endY) < r * r) return true
  }
  if (state.enemy && state.enemy.alive) {
    if (
      onScreen(state.enemy.x, state.enemy.y, state.enemy.collisionRadius) &&
      pointToSegmentDistSq(state.enemy.x, state.enemy.y, ship.x, ship.y, endX, endY) <
        state.enemy.collisionRadius * state.enemy.collisionRadius
    ) {
      return true
    }
  }
  for (const e of state.ambushEnemies) {
    if (!e.alive) continue
    if (
      onScreen(e.x, e.y, e.collisionRadius) &&
      pointToSegmentDistSq(e.x, e.y, ship.x, ship.y, endX, endY) <
        e.collisionRadius * e.collisionRadius
    ) {
      return true
    }
  }
  if (state.arbiter && state.arbiter.hp > 0 && state.arbiter.mode === 'hunting') {
    const ar = state.arbiter
    if (
      onScreen(ar.x, ar.y, ARBITER_COLLISION_RADIUS) &&
      pointToSegmentDistSq(ar.x, ar.y, ship.x, ship.y, endX, endY) <
        ARBITER_COLLISION_RADIUS * ARBITER_COLLISION_RADIUS
    ) {
      return true
    }
  }
  return false
}

function segmentProjection(
  cx: number,
  cy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { t: number; distSq: number } {
  const abx = bx - ax
  const aby = by - ay
  const lenSq = abx * abx + aby * aby
  if (lenSq < 0.0001) {
    const dx = cx - ax
    const dy = cy - ay
    return { t: 0, distSq: dx * dx + dy * dy }
  }
  const t = Math.max(0, Math.min(1, ((cx - ax) * abx + (cy - ay) * aby) / lenSq))
  const px = ax + abx * t
  const py = ay + aby * t
  const dx = cx - px
  const dy = cy - py
  return { t, distSq: dx * dx + dy * dy }
}

function optionMuzzlePositions(state: TickState): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = []
  const count = Math.max(0, Math.min(2, state.optionCount))
  if (count === 0) return positions

  // Life-Force style trailing options
  const spacing = 18
  for (let i = 0; i < count; i++) {
    const historyIndex = state.positionHistory.length - 1 - (i + 1) * spacing
    if (historyIndex >= 0) {
      const hist = state.positionHistory[historyIndex]
      positions.push({ x: hist.x, y: hist.y })
    } else {
      positions.push({ x: state.ship.x, y: state.ship.y })
    }
  }
  return positions
}

function nearestHomingTarget(state: TickState, x: number, y: number): PositionBody | null {
  // Heat-Seeker Bias upgrade: once unlocked, the Arbiter is always preferred,
  // then carriers (biggest non-boss target), then anything else. Without it,
  // missiles use plain nearest-distance.
  if (state.missileBiasUnlocked) {
    if (state.arbiter && state.arbiter.hp > 0 && state.arbiter.mode === 'hunting') {
      return state.arbiter
    }
    let bestCarrier: PositionBody | null = null
    let bestCarrierSq = Infinity
    for (const e of state.ambushEnemies) {
      if (!e.alive || e.kind !== 'carrier') continue
      const dx = e.x - x
      const dy = e.y - y
      const d = dx * dx + dy * dy
      if (d < bestCarrierSq) {
        bestCarrierSq = d
        bestCarrier = e
      }
    }
    if (bestCarrier) return bestCarrier
  }

  let best: PositionBody | null = null
  let bestSq = Infinity
  const consider = (target: PositionBody): void => {
    const dx = target.x - x
    const dy = target.y - y
    const d = dx * dx + dy * dy
    if (d < bestSq) {
      bestSq = d
      best = target
    }
  }
  if (state.enemy?.alive) consider(state.enemy)
  for (const e of state.ambushEnemies) if (e.alive) consider(e)
  if (state.arbiter && state.arbiter.hp > 0 && state.arbiter.mode === 'hunting')
    consider(state.arbiter)
  return best
}

function steerMissiles(state: TickState, dt: number): void {
  const missileSpeed = 160

  // Collect all valid targets once per frame
  const targets: (PositionBody & { id: string })[] = []
  if (state.enemy?.alive) targets.push({ x: state.enemy.x, y: state.enemy.y, id: state.enemy.id })
  for (const e of state.ambushEnemies) if (e.alive) targets.push({ x: e.x, y: e.y, id: e.id })
  if (state.arbiter && state.arbiter.hp > 0 && state.arbiter.mode === 'hunting') {
    targets.push({ x: state.arbiter.x, y: state.arbiter.y, id: 'arbiter' })
  }
  // Add some asteroids as fallback targets
  if (targets.length < 5) {
    for (const a of state.asteroids) {
      if (a.hp > 0 && a.size > 12) {
        targets.push({ x: a.x, y: a.y, id: a.id })
        if (targets.length >= 10) break
      }
    }
  }

  for (const p of state.projectiles) {
    if (p.tool !== 'missile') continue

    let data = state.missileData.get(p.id)
    if (!data) {
      data = { phase: 'deploy', timer: 0.3, targetId: null }
      state.missileData.set(p.id, data)
    }

    if (data.phase === 'deploy') {
      data.timer -= dt
      p.velocityX *= 0.95
      p.velocityY *= 0.95
      if (data.timer <= 0) {
        data.phase = 'homing'
        if (targets.length > 0) {
          // Spread targets among missiles
          const targetIndex = Math.floor(Math.random() * targets.length)
          data.targetId = targets[targetIndex].id
        }
      }
    }

    if (data.phase === 'homing') {
      let target: PositionBody | null = null
      if (data.targetId) {
        if (data.targetId === 'arbiter') {
          if (state.arbiter && state.arbiter.hp > 0) target = state.arbiter
        } else if (data.targetId === state.enemy?.id) {
          if (state.enemy.alive) target = state.enemy
        } else {
          const ae = state.ambushEnemies.find((e) => e.id === data.targetId)
          if (ae && ae.alive) target = ae
          else {
            const a = state.asteroids.find((a) => a.id === data.targetId)
            if (a && a.hp > 0) target = a
          }
        }
      }

      if (!target && targets.length > 0) {
        const nt = nearestHomingTarget(state, p.x, p.y)
        if (nt) target = nt
      }

      if (target) {
        const dx = target.x - p.x
        const dy = target.y - p.y
        const speed = Math.hypot(p.velocityX, p.velocityY)
        const targetSpeed = Math.max(speed, missileSpeed)
        const desired = Math.atan2(dy, dx)
        const current = Math.atan2(p.velocityY, p.velocityX)
        let diff = desired - current
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2

        const turnSpeed = 8.0
        const next = current + Math.max(-turnSpeed * dt, Math.min(turnSpeed * dt, diff))

        const newSpeed = Math.min(targetSpeed, speed + 240 * dt)
        p.velocityX = Math.cos(next) * newSpeed
        p.velocityY = Math.sin(next) * newSpeed
      }
    }
  }
}

/**
 * Bend a newly-spawned enemy projectile toward the nearest mining drone if
 * that drone is closer than ~40% of the player's distance. Re-aiming uses
 * the projectile's current speed so the firing rate / damage feel doesn't
 * change. Mutates the projectile in place.
 */
function redirectEnemyShotAtDrone(
  proj: EnemyProjectile,
  shooterX: number,
  shooterY: number,
  player: Ship,
  drones: MiningDrone[],
): void {
  if (drones.length === 0) return
  const playerDx = player.x - shooterX
  const playerDy = player.y - shooterY
  const playerDist = Math.hypot(playerDx, playerDy)
  if (playerDist < 1) return
  let best: MiningDrone | null = null
  let bestDist = playerDist * 0.4
  for (const d of drones) {
    const dx = d.x - shooterX
    const dy = d.y - shooterY
    const dist = Math.hypot(dx, dy)
    if (dist < bestDist) {
      bestDist = dist
      best = d
    }
  }
  if (!best) return
  const speed = Math.hypot(proj.vx, proj.vy)
  if (speed < 0.001) return
  const dx = best.x - shooterX
  const dy = best.y - shooterY
  const dist = Math.hypot(dx, dy)
  if (dist < 0.001) return
  proj.vx = (dx / dist) * speed
  proj.vy = (dy / dist) * speed
}

/**
 * Player's max HP. Now a flat constant — under the one-shot model the HP
 * value is essentially binary (alive at PLAYER_MAX_HP, dead at 0), and the
 * old Hull Plating scaling has no effect because any unabsorbed hit drops
 * HP straight to 0. Kept as a function so existing callsites don't have to
 * change shape if the model evolves again later.
 */
export function effectivePlayerMaxHp(): number {
  return PLAYER_MAX_HP
}

/** Bounty-Manifest-adjusted scrap value for an enemy-kill drop. */
function bountyScrapValue(state: TickState): number {
  return Math.round(SCRAP_BOX_VALUE * (1 + 0.15 * state.bountyTier))
}

function absorbDamageWithShield(state: TickState, result: TickResult): boolean {
  if (state.shieldCharges <= 0) return false
  state.shieldCharges -= 1
  result.shieldHit = true
  return true
}

/**
 * Absorb a hit with a hull module — visible bolt-on piece tears off. Each
 * module corresponds one-to-one with a tier of {@link applyHullModules}; the
 * scene re-applies modules on the new (lower) charge count to drop the
 * outermost piece.
 */
function absorbDamageWithHull(state: TickState, result: TickResult): boolean {
  if (state.hullCharges <= 0) return false
  state.hullCharges -= 1
  result.hullModuleLost = true
  return true
}

function absorbDamageWithArmor(state: TickState, result: TickResult): boolean {
  if (state.armorCharges <= 0) return false
  state.armorCharges -= 1
  result.armorHit = true
  return true
}

/**
 * Apply one unit of incoming damage.
 *
 * Damage hierarchy (one-shot world):
 *   1. Shield charge — energy bubble, absorbed cleanly with a flash
 *   2. Hull module — outer bolt-on piece visibly tears off
 *   3. Armor charge — internal plating, absorbed cleanly
 *   4. Smart bomb — resurrects at HP=1 + clears nearby threats
 *   5. Death — HP drops to 0 and the run ends
 *
 * The `damage` value is preserved for the non-oneHitKill code path (the
 * prologue is the only place that ever runs with oneHitKill=false today).
 * In one-shot mode, any defense failing to absorb means an immediate kill,
 * regardless of how much damage the projectile carried.
 */
function damagePlayer(
  state: TickState,
  result: TickResult,
  damage: number,
  oneHitKill: boolean,
): void {
  if (state.debugGodMode) return
  // The prologue is a scripted power demo — the player isn't supposed to
  // die in it. A single stray hit during the intro would zero HP and lock
  // firing (firingAllowed is gated on playerHp > 0), leaving the player
  // stuck unable to mine the asteroids that gate the next tutorial step.
  // So damage is fully absorbed while in the prologue.
  if (state.prologueInvulnerable) return
  if (state.invulnerabilityTimer > 0) return

  if (absorbDamageWithShield(state, result)) return
  if (absorbDamageWithHull(state, result)) return
  if (absorbDamageWithArmor(state, result)) return

  const nextHp = oneHitKill ? 0 : Math.max(0, state.playerHp - damage)

  if (nextHp <= 0 && state.smartBombCount > 0) {
    state.smartBombCount = 0
    state.playerHp = 1
    state.invulnerabilityTimer = 2.0
    result.smartBombDetonated = true
    result.playerDamaged = true
    detonateSmartBomb(state, result)
    return
  }

  state.playerHp = nextHp
  result.playerDamaged = true
}

function detonateSmartBomb(state: TickState, result: TickResult): void {
  const BOMB_RADIUS = 300
  const BOMB_DAMAGE = 1000

  for (const a of state.asteroids) {
    const dx = a.x - state.ship.x
    const dy = a.y - state.ship.y
    const d2 = dx * dx + dy * dy
    if (d2 < BOMB_RADIUS * BOMB_RADIUS) {
      a.hp = 0
      result.asteroidHit = true
    }
  }

  const damageEnemy = (e: EnemyShip | null) => {
    if (!e || !e.alive) return
    const dx = e.x - state.ship.x
    const dy = e.y - state.ship.y
    const d2 = dx * dx + dy * dy
    if (d2 < BOMB_RADIUS * BOMB_RADIUS) {
      e.hp -= BOMB_DAMAGE
      result.enemyDamaged.push({
        enemy: e,
        damage: BOMB_DAMAGE,
        x: e.x,
        y: e.y,
        source: 'projectile',
      })
    }
  }

  damageEnemy(state.enemy)
  for (const ae of state.ambushEnemies) damageEnemy(ae)

  if (state.arbiter && state.arbiter.hp > 0) {
    const dx = state.arbiter.x - state.ship.x
    const dy = state.arbiter.y - state.ship.y
    const d2 = dx * dx + dy * dy
    if (d2 < BOMB_RADIUS * BOMB_RADIUS) {
      state.arbiter.hp -= BOMB_DAMAGE
      result.arbiterHit = true
    }
  }
}

type PositionBody = { x: number; y: number }
type VelocityBody = PositionBody & { velocityX: number; velocityY: number }
type VBody = PositionBody & { vx: number; vy: number }

function blackHolePullFactor(
  body: PositionBody,
  hole: PositionBody,
): { nx: number; ny: number; factor: number } | null {
  const dx = hole.x - body.x
  const dy = hole.y - body.y
  const distSq = dx * dx + dy * dy
  if (distSq <= 0.0001) return { nx: 1, ny: 0, factor: 1 }
  if (distSq > BLACK_HOLE_PULL_RADIUS * BLACK_HOLE_PULL_RADIUS) return null
  const dist = Math.sqrt(distSq)
  const proximity = 1 - dist / BLACK_HOLE_PULL_RADIUS
  return {
    nx: dx / dist,
    ny: dy / dist,
    factor: proximity * proximity,
  }
}

function applyBlackHolePullToBody(
  body: VelocityBody,
  hole: PositionBody,
  dt: number,
  multiplier = 1,
): void {
  const pull = blackHolePullFactor(body, hole)
  if (!pull) return
  const accel = BLACK_HOLE_PULL_ACCEL * pull.factor * multiplier
  body.velocityX += pull.nx * accel * dt
  body.velocityY += pull.ny * accel * dt
}

function applyBlackHolePullToAsteroid(asteroid: Asteroid, hole: PositionBody, dt: number): void {
  applyBlackHolePullToBody(asteroid, hole, dt)
}

function applyBlackHolePullToVBody(body: VBody, hole: PositionBody, dt: number): void {
  const pull = blackHolePullFactor(body, hole)
  if (!pull) return
  const accel = BLACK_HOLE_PULL_ACCEL * pull.factor
  body.vx += pull.nx * accel * dt
  body.vy += pull.ny * accel * dt
}

function applyBlackHolePullAndDriftToVBody(body: VBody, hole: PositionBody, dt: number): void {
  applyBlackHolePullToVBody(body, hole, dt)
  body.x += body.vx * dt
  body.y += body.vy * dt
}

function applyBlackHolePullToVelocityBody(
  body: VelocityBody,
  hole: PositionBody,
  dt: number,
): void {
  applyBlackHolePullToBody(body, hole, dt)
}

function isInsideBlackHole(body: PositionBody, hole: PositionBody): boolean {
  const dx = body.x - hole.x
  const dy = body.y - hole.y
  return dx * dx + dy * dy <= BLACK_HOLE_EVENT_HORIZON_RADIUS * BLACK_HOLE_EVENT_HORIZON_RADIUS
}

function applyBlackHoleConsumption(state: TickState, input: TickInput, result: TickResult): void {
  const hole = input.blackHole
  if (!hole) return

  if (isInsideBlackHole(state.ship, hole) && !state.endlessDeathFired) {
    state.playerHp = 0
    state.endlessDeathFired = true
    result.playerDamaged = true
    result.playerKilled = true
  }

  if (state.enemy && state.enemy.alive) {
    applyBlackHolePullAndDriftToVBody(state.enemy, hole, input.dt)
    if (isInsideBlackHole(state.enemy, hole)) {
      result.enemyDestroyed = { x: state.enemy.x, y: state.enemy.y }
      result.enemyDestroyedEvent = true
      state.enemy.alive = false
      state.enemy = null
    }
  }

  for (let i = state.asteroids.length - 1; i >= 0; i--) {
    const a = state.asteroids[i]
    if (a.hp <= 0 || !isInsideBlackHole(a, hole)) continue
    result.expiredAsteroidIds.push(a.id)
    result.blackHoleAsteroidsConsumed.push(a.id)
    state.asteroidHitCounts.delete(a.id)
    state.asteroids.splice(i, 1)
  }
}

// ---------------------------------------------------------------------------
// Prologue auto-behavior
// ---------------------------------------------------------------------------

/**
 * Phase-specific prologue logic.
 *
 * Sets TickState fields for auto-fire/auto-aim/auto-collect — never mutates
 * TickInput directly. The main tick() function reads these TickState fields
 * to drive ship rotation, firing, and collection.
 */
function prologueTick(state: TickState, input: TickInput, result: TickResult): void {
  const { dt } = input
  const step = input.tutorialStep

  // Reset per-frame auto-behavior flags (set below per phase)
  state.prologueAutoAim = null
  state.prologueAutoCollect = false
  state.prologueAutoPilotForward = false

  // --- prologue-start: initialize maxed ship and fire ready ---
  // The intro is meant to show the *full* fracker loadout — every upgrade
  // available in the trade station is on. When you add a new upgrade,
  // mirror it here so the prologue keeps showing the player what they're
  // working toward. (Visuals on the prologue ship are handled separately
  // by createPrologueShipModel; the drone cap + auto-build below makes
  // sure the RTS layer is also live during the intro.)
  if (step === 'prologue-start') {
    if (!state.prologueFieldSpawned) {
      state.prologueFieldSpawned = true
      state.blasterTier = PROLOGUE_SHIP.blasterTier
      state.collectorTier = 5
      state.fireRateBonus = PROLOGUE_SHIP.fireRateBonus
      state.activeMiningTool = PROLOGUE_SHIP.miningTool
      state.missileTier = PROLOGUE_SHIP.missileTier
      state.rippleUnlocked = true
      state.autoToolUnlocked = true
      state.spreadTier = 1
      state.optionCount = PROLOGUE_SHIP.optionCount
      state.speedTier = 5
      state.armorCharges = 3
      state.shieldCharges = PROLOGUE_SHIP.shieldCharges
      state.smartBombCount = 1
      state.coolingTier = 3
      state.magnetTier = 3
      state.hullCharges = 3
      state.bountyTier = 3
      state.missileBiasUnlocked = true
      state.thrustersUnlocked = true
      state.sensorTier = 3
      state.droneRepairUnlocked = true
      state.drillNoseTier = 3
      // Mining-drone fleet at cap so the player sees the full RTS layer.
      state.miningDroneCap = 4
      const needed = state.miningDroneCap - state.miningDrones.length
      for (let i = 0; i < needed; i++) {
        const idx = state.miningDrones.length
        const offset = (idx / 4) * Math.PI * 2
        state.miningDrones.push(
          createMiningDrone(
            state.ship.x + Math.cos(offset) * 6,
            state.ship.y + Math.sin(offset) * 6,
          ),
        )
      }
      // Heal to the inflated HP cap so the new plating actually shows.
      state.playerHp = effectivePlayerMaxHp()
    }
    // Clear any stale Arbiter-approach state so the scripted fly-in always
    // plays from full distance. Without this a leftover `prologueArbiterSpawned`
    // (from a replay or hot-reload) skips the distance reset in the
    // `prologue-arbiter` beat, making the Arbiter "arrive" instantly unseen.
    state.prologueArbiterSpawned = false
    state.prologueArbiterDistance = ARBITER_SPAWN_DISTANCE
    result.prologueReady = true
    return
  }

  // --- prologue-mining: free play — mine asteroids and fight enemies ---
  // Enemies spawn alongside asteroids. Firing uses the same aim-gated rule as
  // normal gameplay (handled in tick() — see `firingAllowed`). Advances when
  // enough asteroids destroyed AND all enemies dead.
  if (step === 'prologue-mining') {
    state.prologueAutoCollect = true

    // Spawn enemy fleet once (alongside asteroids). The prologue showcases
    // every hostile class — a grunt pair, snipers, a scavenger, and a carrier
    // (which then launches its own drones) — as a taste of the threats ahead.
    if (!state.prologueEnemiesSpawned) {
      state.prologueEnemiesSpawned = true
      const fleet: EnemyKind[] = ['grunt', 'grunt', 'sniper', 'sniper', 'scavenger', 'carrier']
      for (let i = 0; i < fleet.length; i++) {
        const angle = (i / fleet.length) * Math.PI * 2
        const ex = state.ship.x + Math.cos(angle) * ENEMY_SPAWN_DISTANCE
        const ey = state.ship.y + Math.sin(angle) * ENEMY_SPAWN_DISTANCE
        const enemy = createEnemyShip(ex, ey, AMBUSH_PROJECTILE_DAMAGE, fleet[i])
        state.ambushEnemies.push(enemy)
        result.ambushEnemiesSpawned.push(enemy)
      }
    }

    // Reinforcement wave — once the player has cleared most of the initial
    // field, drop in a second batch of asteroids plus a small enemy squad.
    // Without this the 80 + 6 starting field tops out below the 100-rock
    // mining target and the objective can never complete.
    if (
      !state.prologueReinforcementSpawned &&
      state.prologueEnemiesSpawned &&
      state.prologueAsteroidsDestroyed >= PROLOGUE_REINFORCEMENT_THRESHOLD
    ) {
      state.prologueReinforcementSpawned = true

      // Wave drifts in from the outer containment ring so the rocks glide
      // into view from beyond the play area rather than popping in on top
      // of the player. At ~22 units/sec inward, a rock spawned at the edge
      // reaches the 30–120 play ring in roughly 6–11 seconds (the per-rock
      // speed jitter inside the helper staggers individual arrivals).
      const reinforcement = spawnPrologueReinforcement(
        0,
        0,
        PROLOGUE_REINFORCEMENT_ASTEROIDS,
        'wave2',
        PROLOGUE_FIELD_RADIUS,
        22,
      )
      for (const a of reinforcement) {
        state.asteroids.push(a)
        state.asteroidHitCounts.set(a.id, 0)
        result.newAsteroids.push(a)
      }

      // Small enemy reinforcement — pressure-on-pressure with the wave of
      // rocks. The advance gate already requires all ambush enemies dead,
      // so these must be defeated before the prologue can complete.
      const wave: EnemyKind[] = ['grunt', 'grunt', 'sniper']
      for (let i = 0; i < wave.length; i++) {
        // Offset by π/4 so the second wave doesn't drop in the exact same
        // angular slots as the initial fleet (which used i/6 * 2π).
        const angle = (i / wave.length) * Math.PI * 2 + Math.PI / 4
        const ex = state.ship.x + Math.cos(angle) * ENEMY_SPAWN_DISTANCE
        const ey = state.ship.y + Math.sin(angle) * ENEMY_SPAWN_DISTANCE
        const enemy = createEnemyShip(ex, ey, AMBUSH_PROJECTILE_DAMAGE, wave[i])
        state.ambushEnemies.push(enemy)
        result.ambushEnemiesSpawned.push(enemy)
      }
    }

    // Track progress
    const destroyed = state.asteroids.filter((a) => a.hp <= 0).length
    if (destroyed > state.prologueAsteroidsDestroyed) {
      state.prologueAsteroidsDestroyed = destroyed
    }
    const allEnemiesDead =
      state.prologueEnemiesSpawned && state.ambushEnemies.every((e) => !e.alive)

    // Advance when most asteroids destroyed AND all enemies dead
    if (state.prologueAsteroidsDestroyed >= PROLOGUE_MINING_TARGET && allEnemiesDead) {
      result.fieldCleared = true
    }
    return
  }

  // --- prologue-arbiter: freeze ship, track approach distance ---
  if (step === 'prologue-arbiter') {
    state.prologueShipFrozen = true
    state.mouseHoldingFire = false
    state.fireTarget = null
    if (!state.prologueArbiterSpawned) {
      state.prologueArbiterSpawned = true
      state.prologueArbiterDistance = ARBITER_SPAWN_DISTANCE
    }
    // Decrement approach distance (scene.ts moves the model to match)
    state.prologueArbiterDistance -= ARBITER_APPROACH_SPEED * dt
    if (state.prologueArbiterDistance <= 25) {
      result.arbiterArrived = true
    }
    return
  }

  // --- prologue-dialogue: ship frozen, waiting for player clicks ---
  if (step === 'prologue-dialogue') {
    state.prologueShipFrozen = true
    state.mouseHoldingFire = false
    state.fireTarget = null
    return
  }

  // --- prologue-strip: timed module removal ---
  if (step === 'prologue-strip') {
    state.prologueShipFrozen = true
    state.prologueStripTimer += dt
    if (state.prologueStripTimer >= ARBITER_STRIP_DELAY) {
      state.prologueStripTimer -= ARBITER_STRIP_DELAY
      state.prologueStripPhase++
      result.stripAdvanced = true
      if (state.prologueStripPhase >= 4) {
        result.stripComplete = true
      }
    }
    return
  }
}

/**
 * Advance the game state by one frame.
 *
 * This is the SINGLE source of truth for all game logic. Both scene.ts
 * (production) and GameSimulation (tests) call this function.
 */
export function tick(state: TickState, input: TickInput): TickResult {
  const result = emptyResult()
  // Apply the debug dt multiplier (default 1). Cinematic slow-mo (e.g. the
  // death sequence) is applied by the scene to input.dt before we get here.
  const dt = input.dt * state.debugDtMultiplier

  state.elapsedTime += dt

  // --- Paused: skip entire frame ---
  if (input.paused) {
    state.wasPaused = true
    return result
  }

  // --- Resume from pause: clear stale state and start input cooldown ---
  // While paused, popup overlays capture mouse events so aimState and
  // mouseHoldingFire can be stale. On mobile, dismissing a popup via touch
  // causes the browser to synthesize mousemove/mousedown events ~300ms later.
  // The cooldown window ignores all aim/fire input so these leaked events
  // cannot lock the ship's rotation to the dismiss tap position.
  if (state.wasPaused) {
    state.mouseHoldingFire = false
    state.fireTarget = null
    state.aimActive = false
    state.inputCooldown = 0.5 // 500ms — covers synthesized event delay
    state.wasPaused = false
  }

  // --- Input cooldown: ignore aim/fire input while active ---
  if (state.inputCooldown > 0) {
    state.inputCooldown -= dt
    state.mouseHoldingFire = false
    state.fireTarget = null
    state.aimActive = false
  }
  if (state.invulnerabilityTimer > 0) {
    state.invulnerabilityTimer = Math.max(0, state.invulnerabilityTimer - dt)
  }

  // --- Prologue auto-behavior ---
  const isPrologue = input.tutorialStep.startsWith('prologue-')
  state.prologueInvulnerable = isPrologue
  if (isPrologue) {
    prologueTick(state, input, result)

    // Skip rest of tick during fade
    if (input.tutorialStep === 'prologue-fade') return result

    // Ship frozen by Arbiter — zero velocity, skip ship update
    if (state.prologueShipFrozen) {
      state.ship.velocityX = 0
      state.ship.velocityY = 0
      return result
    }
  }

  // Firing is allowed in normal gameplay and during the prologue's free-play
  // mining phase — both use the same aim-gated rule. Other prologue beats
  // (intro, arbiter, dialogue, strip) never fire.
  // No firing once the hull is gone. The scene continues to run for ~2.5s
  // after playerKilled so the death animation can play, but we don't want
  // the auto-fire path or missile auto-launcher conjuring shots out of the
  // wreckage. Same gate prologue cutscenes use.
  const playerAlive = state.playerHp > 0
  const firingAllowed =
    playerAlive && (!isPrologue || input.tutorialStep === 'prologue-mining')

  // Collection is always automatic — the magnet runs by default. `input.collecting`
  // (E key / mobile button / right-click) is now effectively cosmetic. Only the
  // pickup range varies, driven by the Collector upgrade tier.
  const collecting = true
  void input.collecting

  // --- Endless mode: active once the tutorial is complete. Snapshot which
  // asteroids are alive now so updateEndlessMode() can count kills this tick. ---
  const endlessActive = input.tutorialStep === 'done'
  const asteroidsAliveBefore: Set<string> | null = endlessActive
    ? new Set(state.asteroids.filter((a) => a.hp > 0).map((a) => a.id))
    : null

  // --- Ship update ---
  // The hull always faces its direction of travel (handled inside updateShip)
  // so the engine exhaust stays consistent with movement. Aim only steers the
  // turret, which scene.ts rotates independently of the hull.

  // Thruster Vectoring: a *tap* of the boost key triggers a 0.4s burst with
  // a 3s cooldown. The raw boost input from input.inputState is treated as
  // the trigger; updateShip reads from boostActiveTimer instead so a hold
  // doesn't drain the cooldown faster than the cadence allows.
  state.boostActiveTimer = Math.max(0, state.boostActiveTimer - dt)
  state.boostCooldownTimer = Math.max(0, state.boostCooldownTimer - dt)
  const wantBoost = input.inputState.boost
  if (
    wantBoost &&
    state.thrustersUnlocked &&
    state.boostActiveTimer <= 0 &&
    state.boostCooldownTimer <= 0
  ) {
    state.boostActiveTimer = 0.4
    state.boostCooldownTimer = 3
  }

  // Prologue auto-pilot: synthesize forward input without mutating TickInput
  const effectiveInput = state.prologueAutoPilotForward
    ? { ...input.inputState, up: true, boost: state.boostActiveTimer > 0 }
    : { ...input.inputState, boost: state.boostActiveTimer > 0 }
  const speedMultiplier = 1 + state.speedTier * 0.1
  updateShip(state.ship, effectiveInput, dt, speedMultiplier)
  if (endlessActive && input.blackHole) {
    applyBlackHolePullToBody(state.ship, input.blackHole, dt, BLACK_HOLE_PLAYER_PULL_MULT)
  }

  // Prologue speed override: boost acceleration and raise speed cap.
  // updateShip() clamps at SHIP_MAX_SPEED (120), so we uncap and re-apply
  // the prologue acceleration to allow speeds up to PROLOGUE_SHIP.maxSpeed (180).
  if (isPrologue) {
    if (state.prologueAutoPilotForward) {
      // Apply full prologue acceleration (not just the delta) since updateShip
      // already clamped at 120. This pushes the ship past the normal cap.
      const dir = state.ship.rotation
      const fx = -Math.sin(dir)
      const fy = Math.cos(dir)
      state.ship.velocityX += fx * PROLOGUE_SHIP.acceleration * dt
      state.ship.velocityY += fy * PROLOGUE_SHIP.acceleration * dt
    }
    const speed = Math.sqrt(state.ship.velocityX ** 2 + state.ship.velocityY ** 2)
    if (speed > PROLOGUE_SHIP.maxSpeed) {
      const scale = PROLOGUE_SHIP.maxSpeed / speed
      state.ship.velocityX *= scale
      state.ship.velocityY *= scale
    }
  }

  if (Math.sqrt(state.ship.x ** 2 + state.ship.y ** 2) > 2) {
    result.shipMoved = true
  }

  // Record history for trailing options
  state.positionHistory.push({
    x: state.ship.x,
    y: state.ship.y,
    rotation: state.ship.rotation,
  })
  if (state.positionHistory.length > 100) {
    state.positionHistory.shift()
  }

  // --- Arbiter tractor beam: haul the ship in while caught in the cone ---
  if (state.arbiter && state.arbiter.tractorActive) {
    const { captureDamage } = applyTractorPull(state.arbiter, state.ship, dt)
    if (captureDamage > 0) {
      damagePlayer(state, result, captureDamage, endlessActive)
      result.arbiterCaptureHit = true
    }
  }

  // --- Asteroid drift ---
  for (const a of state.asteroids) {
    if (endlessActive && input.blackHole && a.hp > 0) {
      applyBlackHolePullToAsteroid(a, input.blackHole, dt)
    }
    if (a.velocityX !== 0 || a.velocityY !== 0) {
      a.x += a.velocityX * dt
      a.y += a.velocityY * dt
    }
  }

  // --- Asteroid-asteroid collision ---
  resolveAsteroidAsteroidCollisions(state.asteroids)

  // --- Prologue containment: bounce asteroids off an invisible bubble so the
  // field never drifts out of reach and the mining target stays achievable ---
  if (isPrologue) {
    const rSq = PROLOGUE_FIELD_RADIUS * PROLOGUE_FIELD_RADIUS
    for (const a of state.asteroids) {
      const distSq = a.x * a.x + a.y * a.y
      if (distSq <= rSq) continue
      const dist = Math.sqrt(distSq) || 1
      const nx = a.x / dist
      const ny = a.y / dist
      // Clamp back onto the boundary
      a.x = nx * PROLOGUE_FIELD_RADIUS
      a.y = ny * PROLOGUE_FIELD_RADIUS
      // Reflect any outward velocity inward (damped bounce)
      const outward = a.velocityX * nx + a.velocityY * ny
      if (outward > 0) {
        a.velocityX -= 1.6 * outward * nx
        a.velocityY -= 1.6 * outward * ny
      }
    }
  }

  // --- Ship-asteroid collision ---
  // The Drill Nose upgrade gates the ramming damage. Tier 1-3 scales the
  // damage; tier 0 is contact-only (still bounces the ship off, no harm to
  // the rock).
  //
  // To detect "the player is actively ramming this rock" we sample the
  // velocity *before* resolveShipAsteroidCollision applies its bounce — by
  // the time the function returns, the inward velocity component has been
  // canceled, and a post-bounce check would essentially never pass. We
  // then evaluate cosine(angle) between velocity and direction-to-asteroid
  // against a generous 0.3 threshold (~73° cone) so the player doesn't have
  // to aim laser-straight at the asteroid center to trigger the drill.
  for (const a of state.asteroids) {
    if (a.hp <= 0) continue

    const toAsteroidX = a.x - state.ship.x
    const toAsteroidY = a.y - state.ship.y
    const distToAsteroid = Math.hypot(toAsteroidX, toAsteroidY)
    const shipSpeed = Math.hypot(state.ship.velocityX, state.ship.velocityY)
    let ramming = false
    if (shipSpeed > 3 && distToAsteroid > 0.001) {
      const cos =
        (state.ship.velocityX * toAsteroidX + state.ship.velocityY * toAsteroidY) /
        (shipSpeed * distToAsteroid)
      ramming = cos > 0.3
    }

    if (!resolveShipAsteroidCollision(state.ship, a)) continue
    if (state.drillNoseTier <= 0) continue
    if (!ramming) continue

    const drillDamage = 8 * state.drillNoseTier * dt
    a.hp = Math.max(0, a.hp - drillDamage)
    result.asteroidHit = true
    result.drillNoseActive = true
  }

  // --- Blaster cooldown ---
  updateBlasterCooldown(state.blasterState, dt)
  state.missileCooldown = Math.max(0, state.missileCooldown - dt)

  // Snapshot the player's actual mouse-hold state BEFORE the auto-fire block
  // may flip mouseHoldingFire on. This lets us distinguish "user is manually
  // holding fire" from "auto-fire ran last frame and left fireTarget set."
  const userHoldingFire = state.mouseHoldingFire

  // Clear any stale fireTarget when the user isn't manually holding — without
  // this the lazer would keep beaming for one frame after aim leaves a target,
  // because the lazer branch only nulls fireTarget when !mouseHoldingFire and
  // auto-fire had just set mouseHoldingFire true last tick.
  if (!userHoldingFire) {
    state.fireTarget = null
  }

  // --- Hold-to-fire: re-set fireTarget each frame while held ---
  if (userHoldingFire && state.aimActive && input.aimWorldPosition) {
    state.fireTarget = { x: input.aimWorldPosition.x, y: input.aimWorldPosition.y }
  }

  // --- Auto-fire: when aim is active and the aim ray passes through a live
  // asteroid or enemy, fire automatically (player doesn't have to hold).
  if (firingAllowed && state.aimActive && input.aimWorldPosition && state.inputCooldown <= 0) {
    if (aimLineHasVisibleTarget(state, input.aimWorldPosition, input.viewBounds)) {
      state.fireTarget = { x: input.aimWorldPosition.x, y: input.aimWorldPosition.y }
      state.mouseHoldingFire = true
    }
  }

  // --- Universal "only fire at targets" gate ---
  // Applies to every input path AND every tool. If the player is trying to
  // fire — either a fireTarget was set (manual hold, gamepad aim, mobile fire
  // button, auto-fire) OR the fire button is held — suppress firing unless the
  // aim direction crosses a live, on-screen asteroid or enemy.
  //
  // The `|| mouseHoldingFire` term matters for the lazer: it fires on
  // `mouseHoldingFire` alone, so a gate guarded only by `fireTarget` would let
  // a held lazer beam into empty space whenever fireTarget happened to be null.
  if (!firingAllowed) {
    // Prologue beats where firing is disallowed — force fire state off.
    state.fireTarget = null
    state.mouseHoldingFire = false
  } else if (state.fireTarget || state.mouseHoldingFire) {
    const aimPoint = state.fireTarget ?? input.aimWorldPosition
    if (!aimPoint || !aimLineHasVisibleTarget(state, aimPoint, input.viewBounds)) {
      state.fireTarget = null
      state.mouseHoldingFire = false
    }
  }

  if (state.missileTier > 0 && state.missileCooldown <= 0 && firingAllowed) {
    const count = Math.max(1, Math.min(8, state.missileTier))
    const damage = 2 + Math.floor(state.blasterTier / 2)
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1
      const row = Math.floor(i / 2)
      // Shoot out sideways in a formation
      const deployAngle = state.ship.rotation + (side < 0 ? Math.PI : 0)
      const ox = Math.cos(deployAngle) * 2
      const oy = Math.sin(deployAngle) * 2
      const missile = createMissileProjectile(
        state.ship.x + ox,
        state.ship.y + oy,
        deployAngle,
        damage,
      )
      // Initial burst speed
      missile.velocityX = Math.cos(deployAngle) * (80 + row * 20)
      missile.velocityY = Math.sin(deployAngle) * (80 + row * 20)

      state.projectiles.push(missile)
      result.newProjectiles.push(missile)

      state.missileData.set(missile.id, {
        phase: 'deploy',
        timer: 0.3 + row * 0.1,
        targetId: null,
      })
    }
    state.missileCooldown = 1.3
  }

  // --- Fire ---
  if (state.activeMiningTool === 'lazer') {
    // Sustained lazer beam: continuous beam while held, direct-hit damage each tick
    const hasFireTarget = state.fireTarget !== null
    const lazerFiring = (state.mouseHoldingFire || hasFireTarget) && !state.lazerState.overheated
    updateLazerState(state.lazerState, dt, lazerFiring, state.coolingTier)

    if (lazerFiring && state.fireTarget && !state.lazerState.overheated) {
      // Compute beam direction from ship toward fire target
      const dx = state.fireTarget.x - state.ship.x
      const dy = state.fireTarget.y - state.ship.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      let dirX: number
      let dirY: number
      if (dist < 0.5) {
        // Fire forward along ship's facing direction
        dirX = Math.cos(state.ship.rotation + Math.PI / 2)
        dirY = Math.sin(state.ship.rotation + Math.PI / 2)
      } else {
        dirX = dx / dist
        dirY = dy / dist
      }

      const beamEndX = state.ship.x + dirX * LAZER_BEAM_RANGE
      const beamEndY = state.ship.y + dirY * LAZER_BEAM_RANGE

      // Beam damage scales with tier and dt (continuous DPS)
      const baseDamage = DAMAGE_PER_TIER[clampTier(state.blasterTier) - 1]
      const dps = baseDamage * 5
      const frameDamage = dps * dt

      const processBeamAsteroidHits = (hits: BeamHit[]): void => {
        for (const hit of hits) {
          // `hit.deflected` (kept on BeamHit / ProjectileHit for future VFX
          // hookup) used to drive a tutorial popup that nagged the player to
          // buy the Lazer. Removed because the affinity matrix now lets the
          // blaster chip basalt slowly — the popup was technically wrong
          // and the paused-modal UX bred input-routing bugs.
          if (!hit.deflected) {
            result.asteroidHit = true
            const prevHits = state.asteroidHitCounts.get(hit.asteroidId) ?? 0
            const newHits = prevHits + 1
            state.asteroidHitCounts.set(hit.asteroidId, newHits)

            if (newHits % HITS_PER_BREAK === 0) {
              if (Math.random() < METAL_SPAWN_CHANCE) {
                const hitAsteroid = state.asteroids.find((a) => a.id === hit.asteroidId)
                const ax = hitAsteroid ? hitAsteroid.x : hit.x
                const ay = hitAsteroid ? hitAsteroid.y : hit.y
                const ddx = hit.x - ax
                const ddy = hit.y - ay
                const d = Math.sqrt(ddx * ddx + ddy * ddy)
                const nx = d > 0.01 ? ddx / d : Math.random() - 0.5
                const ny = d > 0.01 ? ddy / d : Math.random() - 0.5
                const metal = createMetalChunk(hit.x, hit.y, nx, ny, hitAsteroid?.type)
                state.metalChunks.push(metal)
                result.newMetalChunks.push(metal)
                result.metalSpawned = true
              }
            }
          }
        }
      }

      const processBeamEnemies = (
        startX: number,
        startY: number,
        endX: number,
        endY: number,
      ): { endX: number; endY: number } => {
        const beamHitEnemies: {
          enemy: EnemyShip
          killed: boolean
          isAmbush: boolean
          t: number
        }[] = []
        const tryBeamEnemy = (en: EnemyShip | null, isAmbush: boolean): void => {
          if (!en || !en.alive) return
          const r = checkBeamEnemyCollisions(startX, startY, endX, endY, frameDamage, en)
          if (r.hit) {
            result.enemyDamaged.push({
              enemy: en,
              damage: frameDamage,
              x: en.x,
              y: en.y,
              source: 'beam',
            })
            beamHitEnemies.push({ enemy: en, killed: r.killed, isAmbush, t: r.t })
          }
        }
        tryBeamEnemy(state.enemy, false)
        for (const ae of state.ambushEnemies) tryBeamEnemy(ae, true)

        let clippedEndX = endX
        let clippedEndY = endY
        if (beamHitEnemies.length > 0) {
          let minT = 1
          for (const h of beamHitEnemies) if (h.t < minT) minT = h.t
          const bx = endX - startX
          const by = endY - startY
          clippedEndX = startX + bx * minT
          clippedEndY = startY + by * minT

          for (const h of beamHitEnemies) {
            if (!h.killed) continue
            const box = createScrapBox(h.enemy.x, h.enemy.y, bountyScrapValue(state))
            state.scrapBoxes.push(box)
            result.enemyDestroyed = { x: h.enemy.x, y: h.enemy.y }
            result.enemyDestroyedEvent = true
            dropScavengerLoot(state, result, h.enemy)
            if (h.isAmbush) {
              result.ambushEnemiesDestroyed.push(h.enemy)
            } else if (state.enemy === h.enemy) {
              state.enemy = null
            }
          }
        }
        return { endX: clippedEndX, endY: clippedEndY }
      }

      const liveAsteroids = state.asteroids.filter((a) => a.hp > 0)
      const beamResult = checkBeamAsteroidCollisions(
        state.ship.x,
        state.ship.y,
        beamEndX,
        beamEndY,
        frameDamage,
        liveAsteroids,
      )

      result.beamActive = true
      result.beamStartX = state.ship.x
      result.beamStartY = state.ship.y
      result.beamEndX = beamResult.beamEndX
      result.beamEndY = beamResult.beamEndY
      result.beamHits = beamResult.hits

      const clippedPrimary = processBeamEnemies(
        state.ship.x,
        state.ship.y,
        result.beamEndX,
        result.beamEndY,
      )
      result.beamEndX = clippedPrimary.endX
      result.beamEndY = clippedPrimary.endY

      // --- Beam vs Arbiter — truncate the beam to the boss if it reaches ---
      if (state.arbiter) {
        const ab = checkBeamArbiterCollisions(
          state.ship.x,
          state.ship.y,
          result.beamEndX,
          result.beamEndY,
          frameDamage,
          state.arbiter,
        )
        if (ab.hit) {
          result.arbiterHit = true
          const bx = result.beamEndX - state.ship.x
          const by = result.beamEndY - state.ship.y
          result.beamEndX = state.ship.x + bx * ab.t
          result.beamEndY = state.ship.y + by * ab.t
        }
      }

      processBeamAsteroidHits(beamResult.hits)

      for (const option of optionMuzzlePositions(state)) {
        const odx = state.fireTarget.x - option.x
        const ody = state.fireTarget.y - option.y
        const odist = Math.sqrt(odx * odx + ody * ody)
        if (odist < 0.5) continue
        const optionEndX = option.x + (odx / odist) * LAZER_BEAM_RANGE
        const optionEndY = option.y + (ody / odist) * LAZER_BEAM_RANGE
        const optionBeamResult = checkBeamAsteroidCollisions(
          option.x,
          option.y,
          optionEndX,
          optionEndY,
          frameDamage,
          state.asteroids.filter((a) => a.hp > 0),
        )
        const clippedOption = processBeamEnemies(
          option.x,
          option.y,
          optionBeamResult.beamEndX,
          optionBeamResult.beamEndY,
        )
        result.optionBeams.push({
          startX: option.x,
          startY: option.y,
          endX: clippedOption.endX,
          endY: clippedOption.endY,
        })
        result.beamHits.push(...optionBeamResult.hits)
        processBeamAsteroidHits(optionBeamResult.hits)

        if (state.arbiter) {
          const ab = checkBeamArbiterCollisions(
            option.x,
            option.y,
            clippedOption.endX,
            clippedOption.endY,
            frameDamage,
            state.arbiter,
          )
          if (ab.hit) {
            result.arbiterHit = true
          }
        }
      }
    }
    if (!state.mouseHoldingFire) {
      state.fireTarget = null
    }
  } else if (state.activeMiningTool === 'ripple') {
    const hasFireTarget = state.fireTarget !== null
    const rippleFiring = state.rippleUnlocked && (state.mouseHoldingFire || hasFireTarget)
    if (rippleFiring && state.fireTarget) {
      const dx = state.fireTarget.x - state.ship.x
      const dy = state.fireTarget.y - state.ship.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const dirX = dist < 0.5 ? Math.cos(state.ship.rotation + Math.PI / 2) : dx / dist
      const dirY = dist < 0.5 ? Math.sin(state.ship.rotation + Math.PI / 2) : dy / dist
      // Bumped well past the on-screen viewport so the wave-fronts can
       // travel off the edges instead of dissolving mid-air on wide laptops.
       const range = LAZER_BEAM_RANGE * 1.7
      result.rippleActive = true
      result.rippleStartX = state.ship.x
      result.rippleStartY = state.ship.y
      result.rippleEndX = state.ship.x + dirX * range
      result.rippleEndY = state.ship.y + dirY * range

      const dps =
        DAMAGE_PER_TIER[clampTier(state.blasterTier) - 1] * (3.8 + state.optionCount * 0.7)
      const frameDamage = dps * dt
      for (const a of state.asteroids) {
        if (a.hp <= 0) continue
        const hit = segmentProjection(
          a.x,
          a.y,
          result.rippleStartX,
          result.rippleStartY,
          result.rippleEndX,
          result.rippleEndY,
        )
        const radius = 4 + hit.t * 22
        if (hit.distSq > radius * radius) continue
        const affinity = WEAPON_AFFINITY[a.type].ripple
        a.hp = Math.max(0, a.hp - frameDamage * affinity)
        result.asteroidHit = true
      }
      const rippleEnemy = (en: EnemyShip | null, isAmbush: boolean): void => {
        if (!en || !en.alive) return
        const hit = segmentProjection(
          en.x,
          en.y,
          result.rippleStartX,
          result.rippleStartY,
          result.rippleEndX,
          result.rippleEndY,
        )
        const radius = 5 + hit.t * 26 + en.collisionRadius * 0.35
        if (hit.distSq > radius * radius) return
        en.hp = Math.max(0, en.hp - frameDamage)
        result.enemyDamaged.push({
          enemy: en,
          damage: frameDamage,
          x: en.x,
          y: en.y,
          source: 'beam',
        })
        if (en.hp <= 0) {
          en.alive = false
          const box = createScrapBox(en.x, en.y, bountyScrapValue(state))
          state.scrapBoxes.push(box)
          result.enemyDestroyed = { x: en.x, y: en.y }
          result.enemyDestroyedEvent = true
          dropScavengerLoot(state, result, en)
          if (isAmbush) result.ambushEnemiesDestroyed.push(en)
          else if (state.enemy === en) state.enemy = null
        }
      }
      rippleEnemy(state.enemy, false)
      for (const ae of state.ambushEnemies) rippleEnemy(ae, true)
    }
    if (!state.mouseHoldingFire) {
      state.fireTarget = null
    }
  } else {
    // Blaster: standard cooldown-based firing
    if (state.fireTarget) {
      const newProjectiles = fireBlaster(
        state.blasterState,
        state.ship,
        state.fireTarget.x,
        state.fireTarget.y,
        state.blasterTier,
        state.activeMiningTool,
        state.spreadTier,
      )
      if (newProjectiles.length > 0 && state.fireRateBonus > 1) {
        state.blasterState.cooldownRemaining /= state.fireRateBonus
      }
      for (const p of newProjectiles) {
        state.projectiles.push(p)
        result.newProjectiles.push(p)
      }
      for (const option of optionMuzzlePositions(state)) {
        for (const p of fireBlasterFrom(
          option.x,
          option.y,
          state.fireTarget.x,
          state.fireTarget.y,
          state.blasterTier,
          state.activeMiningTool,
          state.spreadTier,
        )) {
          state.projectiles.push(p)
          result.newProjectiles.push(p)
        }
      }
      state.fireTarget = null
    }
  }

  // --- Projectile update ---
  if (endlessActive && input.blackHole) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i]
      applyBlackHolePullToVelocityBody(p, input.blackHole, dt)
      if (!isInsideBlackHole(p, input.blackHole)) continue
      result.expiredProjectileIds.push(p.id)
      state.projectileElapsed.delete(p.id)
      state.projectiles.splice(i, 1)
    }
  }
  steerMissiles(state, dt)
  const prevIds = state.projectiles.map((p) => p.id)
  state.projectiles = updateProjectiles(state.projectiles, dt, state.projectileElapsed)
  const currentIds = new Set(state.projectiles.map((p) => p.id))
  for (const id of prevIds) {
    if (!currentIds.has(id)) {
      result.expiredProjectileIds.push(id)
      state.missileData.delete(id)
    }
  }

  // --- Projectile-asteroid collision ---
  const liveAsteroids = state.asteroids.filter((a) => a.hp > 0)
  if (state.projectiles.length > 0 && liveAsteroids.length > 0) {
    const { surviving, hits } = checkProjectileAsteroidCollisions(state.projectiles, liveAsteroids)

    if (hits.some((h) => !h.deflected)) {
      result.asteroidHit = true
    }

    for (const hit of hits) {
      state.projectileElapsed.delete(hit.projectileId)
      result.asteroidHits.push(hit)

      if (hit.deflected) continue

      const prevHits = state.asteroidHitCounts.get(hit.asteroidId) ?? 0
      const newHits = prevHits + 1
      state.asteroidHitCounts.set(hit.asteroidId, newHits)

      if (newHits % HITS_PER_BREAK === 0) {
        if (Math.random() < METAL_SPAWN_CHANCE) {
          const hitAsteroid = state.asteroids.find((a) => a.id === hit.asteroidId)
          const ax = hitAsteroid ? hitAsteroid.x : hit.x
          const ay = hitAsteroid ? hitAsteroid.y : hit.y
          const ddx = hit.x - ax
          const ddy = hit.y - ay
          const d = Math.sqrt(ddx * ddx + ddy * ddy)
          const nx = d > 0.01 ? ddx / d : Math.random() - 0.5
          const ny = d > 0.01 ? ddy / d : Math.random() - 0.5
          const metal = createMetalChunk(hit.x, hit.y, nx, ny, hitAsteroid?.type)
          state.metalChunks.push(metal)
          result.newMetalChunks.push(metal)
          result.metalSpawned = true
        }
      }
    }

    state.projectiles = surviving
  }

  // --- Enemy spawn (after first metal collected) ---
  // Tutorial-only scripted enemy. In endless mode the director owns all
  // enemy spawning, so this single-shot spawn is suppressed.
  if (!endlessActive && !state.enemySpawned && state.firstMetalCollectedTime !== null) {
    state.enemySpawned = true
    const spawnAngle = Math.random() * Math.PI * 2
    const ex = state.ship.x + Math.cos(spawnAngle) * ENEMY_SPAWN_DISTANCE
    const ey = state.ship.y + Math.sin(spawnAngle) * ENEMY_SPAWN_DISTANCE
    state.enemy = createEnemyShip(ex, ey)
    result.enemySpawned = state.enemy
  }

  // --- Update enemy ---
  if (state.enemy && state.enemy.alive) {
    if (!state.enemyNearbyFired) {
      const edx = state.enemy.x - state.ship.x
      const edy = state.enemy.y - state.ship.y
      if (Math.sqrt(edx * edx + edy * edy) <= ENEMY_NEARBY_DISTANCE) {
        state.enemyNearbyFired = true
        result.enemyNearby = true
      }
    }

    const newEnemyProjs = updateEnemyShip(state.enemy, state.ship, dt, state.asteroids)
    for (const proj of newEnemyProjs) {
      // Aggro split: if a mining drone is within ~40% of the player distance,
      // bend this shot toward the drone instead. Gives drones their stated
      // role as bullet-magnets while still letting enemies pressure the ship
      // when no drones are exposed.
      redirectEnemyShotAtDrone(proj, state.enemy.x, state.enemy.y, state.ship, state.miningDrones)
      state.enemyProjectiles.push(proj)
      result.newEnemyProjectiles.push(proj)
    }

    if (state.projectiles.length > 0) {
      const { surviving, hitProjectileIds } = checkProjectileEnemyCollisions(
        state.projectiles,
        state.enemy,
      )
      for (const hitId of hitProjectileIds) {
        state.projectileElapsed.delete(hitId)
        result.expiredProjectileIds.push(hitId)
        result.enemyDamaged.push({
          enemy: state.enemy,
          damage: 1,
          x: state.enemy.x,
          y: state.enemy.y,
          source: 'projectile',
        })
      }
      state.projectiles = surviving

      if (!state.enemy.alive) {
        const box = createScrapBox(state.enemy.x, state.enemy.y, bountyScrapValue(state))
        state.scrapBoxes.push(box)
        result.enemyDestroyed = { x: state.enemy.x, y: state.enemy.y }
        result.enemyDestroyedEvent = true
        state.enemy = null
      }
    }
  }

  // --- Enemy projectile update ---
  for (let i = state.enemyProjectiles.length - 1; i >= 0; i--) {
    if (endlessActive && input.blackHole) {
      applyBlackHolePullToVBody(state.enemyProjectiles[i], input.blackHole, dt)
      if (isInsideBlackHole(state.enemyProjectiles[i], input.blackHole)) {
        result.expiredEnemyProjectileIds.push(state.enemyProjectiles[i].id)
        state.enemyProjectiles.splice(i, 1)
        continue
      }
    }
    const alive = updateEnemyProjectile(state.enemyProjectiles[i], dt)
    if (!alive) {
      result.expiredEnemyProjectileIds.push(state.enemyProjectiles[i].id)
      state.enemyProjectiles.splice(i, 1)
    }
  }

  // --- Enemy projectile → player collision ---
  if (state.enemyProjectiles.length > 0) {
    const hitIds = new Set(checkEnemyProjectilePlayerCollisions(state.enemyProjectiles, state.ship))
    if (hitIds.size > 0) {
      for (let i = state.enemyProjectiles.length - 1; i >= 0; i--) {
        const proj = state.enemyProjectiles[i]
        if (!hitIds.has(proj.id)) continue
        const damage = proj.damage
        damagePlayer(state, result, damage, endlessActive)
        result.enemyProjectileHits.push({ id: proj.id, x: proj.x, y: proj.y, damage })
        state.enemyProjectiles.splice(i, 1)
      }
    }
  }

  // --- Mining drone state machine ---
  // Drones are owned by tick state but their build/spawn happens at the
  // station (page.tsx). Tick just advances the AI, deposits scrap, and
  // applies enemy-projectile damage to drones.
  if (state.miningDrones.length > 0) {
    const droneOutcome = updateMiningDrones(
      state.miningDrones,
      state.asteroids,
      state.ship.x,
      state.ship.y,
      dt,
      state.rallyPoint,
    )
    if (droneOutcome.scrapDeposited > 0) {
      result.droneScrapDelivered += droneOutcome.scrapDeposited
    }
  }

  // --- Enemy projectile → mining drone collision ---
  if (state.enemyProjectiles.length > 0 && state.miningDrones.length > 0) {
    for (let i = state.enemyProjectiles.length - 1; i >= 0; i--) {
      const proj = state.enemyProjectiles[i]
      let hitDroneIdx = -1
      for (let d = 0; d < state.miningDrones.length; d++) {
        const drone = state.miningDrones[d]
        const dx = drone.x - proj.x
        const dy = drone.y - proj.y
        if (dx * dx + dy * dy <= MINING_DRONE_COLLISION_RADIUS * MINING_DRONE_COLLISION_RADIUS) {
          hitDroneIdx = d
          break
        }
      }
      if (hitDroneIdx === -1) continue
      const drone = state.miningDrones[hitDroneIdx]
      const outcome = applyDroneHit(drone, proj.damage)
      result.scrapStolenByEnemies += outcome.stolenScrap
      result.enemyProjectileHits.push({ id: proj.id, x: proj.x, y: proj.y, damage: 0 })
      state.enemyProjectiles.splice(i, 1)
      if (outcome.destroyed) {
        result.destroyedDroneIds.push(drone.id)
        state.miningDrones.splice(hitDroneIdx, 1)
      }
    }
  }

  // --- Scrap box update & collection ---
  for (let i = state.scrapBoxes.length - 1; i >= 0; i--) {
    if (endlessActive && input.blackHole) {
      applyBlackHolePullToVBody(state.scrapBoxes[i], input.blackHole, dt)
      if (isInsideBlackHole(state.scrapBoxes[i], input.blackHole)) {
        result.scrapStolen.push(state.scrapBoxes[i].id)
        state.scrapBoxes.splice(i, 1)
        continue
      }
    }
    updateScrapBox(state.scrapBoxes[i], dt)
    if (collecting) {
      const collectorRange = isPrologue
        ? PROLOGUE_SHIP.collectorRange
        : collectorRangeForTier(state.collectorTier) * (1 + 0.3 * state.magnetTier)
      const collected = attractScrapBoxToShip(state.scrapBoxes[i], state.ship, dt, collectorRange)
      if (collected) {
        result.scrapCollected.push({ id: state.scrapBoxes[i].id, value: state.scrapBoxes[i].value })
        result.scrapCollectedEvent = true
        state.scrapBoxes.splice(i, 1)
        continue
      }
    }
  }

  // --- Metal chunk update & collection ---
  for (let i = state.metalChunks.length - 1; i >= 0; i--) {
    const metal = state.metalChunks[i]
    if (endlessActive && input.blackHole) {
      applyBlackHolePullToVBody(metal, input.blackHole, dt)
      if (isInsideBlackHole(metal, input.blackHole)) {
        result.metalStolen.push(metal.id)
        state.metalChunks.splice(i, 1)
        continue
      }
    }
    updateMetalChunk(metal, dt)

    if (collecting) {
      const metalRange = isPrologue
        ? PROLOGUE_SHIP.collectorRange
        : collectorRangeForTier(state.collectorTier)
      const collected = attractMetalToShip(metal, state.ship, dt, metalRange)
      if (collected) {
        if (state.firstMetalCollectedTime === null) {
          state.firstMetalCollectedTime = state.elapsedTime
        }
        result.metalCollected.push({ id: metal.id, variant: metal.variant })
        result.metalCollectedEvent = true
        state.metalChunks.splice(i, 1)
        continue
      }
    }

    if (!collecting) {
      bounceMetalOffShip(metal, state.ship)
    }
    for (const a of state.asteroids) {
      bounceMetalOffAsteroid(metal, a)
    }
  }

  // --- Station proximity ---
  const sdx = state.stationX - state.ship.x
  const sdy = state.stationY - state.ship.y
  const sDist = Math.sqrt(sdx * sdx + sdy * sdy)

  if (!state.nearStationFired && sDist <= STATION_NEAR_DISTANCE) {
    state.nearStationFired = true
    result.nearStation = true
  }

  // Tutorial catch-up: if the player is already near the station when the tutorial
  // reaches go-to-station, re-fire the event so the step can advance.
  const tutStep = input.tutorialStep
  if (tutStep === 'go-to-station' && sDist <= STATION_NEAR_DISTANCE) {
    result.nearStation = true
  }

  // Reset repair flag on entering drive-through so a heal that already fired
  // this visit (e.g. during approach-station) doesn't block step completion.
  if (tutStep === 'drive-through' && state.prevTutorialStep !== 'drive-through') {
    state.repairedThisVisit = false
  }
  state.prevTutorialStep = tutStep

  const inStationRange = sDist <= STATION_ENTER_DISTANCE
  if (inStationRange !== state.wasInStationRange) {
    state.wasInStationRange = inStationRange
    result.stationRangeChanged = inStationRange
    if (!inStationRange) state.repairedThisVisit = false
  }

  // Station drive-through detection. The auto-heal that used to live here was
  // removed when the game committed to the one-shot kill model — there is no
  // partial-HP state for healing to repair. The latch + result event remain
  // because the tutorial uses `onStationDriveThrough` to advance the
  // approach-station beat, and the one-per-visit gate is still what keeps
  // the signal from firing every frame the ship is inside the pump.
  if (
    inStationRange &&
    !state.repairedThisVisit &&
    sDist <= STATION_REPAIR_DISTANCE &&
    state.playerHp > 0
  ) {
    state.repairedThisVisit = true
    result.stationRepaired = true
  }

  // Auto-trade contact + hostile lockout. Fly the ship physically into the
  // station to open the trade menu — but in endless mode only if the sector
  // is clear. Any live hostile inside STATION_HOSTILE_LOCKOUT_RADIUS
  // (~radar range) blocks the open and the page layer shows a brief
  // warning banner instead, so the station can't be used as a panic dock
  // to escape a pursuit. Tutorial and prologue beats skip the lockout —
  // their scripted pacing already controls when hostiles are around, and
  // tutorial step `approach-station` relies on contact to advance.
  const inStationContact = sDist <= STATION_AUTO_TRADE_DISTANCE
  if (inStationContact !== state.wasInStationContact) {
    state.wasInStationContact = inStationContact
    if (inStationContact && !tutStep.startsWith('prologue-')) {
      const lockoutActive = tutStep === 'done'
      let hostilesNearby = false
      if (lockoutActive) {
        const lockoutSq = STATION_HOSTILE_LOCKOUT_RADIUS * STATION_HOSTILE_LOCKOUT_RADIUS
        const shipX = state.ship.x
        const shipY = state.ship.y
        const within = (x: number, y: number): boolean => {
          const dx = x - shipX
          const dy = y - shipY
          return dx * dx + dy * dy <= lockoutSq
        }
        if (state.enemy && state.enemy.alive && within(state.enemy.x, state.enemy.y)) {
          hostilesNearby = true
        }
        if (!hostilesNearby) {
          for (const ae of state.ambushEnemies) {
            if (ae.alive && within(ae.x, ae.y)) {
              hostilesNearby = true
              break
            }
          }
        }
        if (
          !hostilesNearby &&
          state.arbiter &&
          state.arbiter.mode === 'hunting' &&
          within(state.arbiter.x, state.arbiter.y)
        ) {
          hostilesNearby = true
        }
      }
      if (hostilesNearby) {
        result.stationContactBlocked = true
      } else {
        result.stationContactRequest = true
      }
    }
  }

  // Drone Repair Bay: while near the station and the upgrade is owned,
  // tick down a timer and rebuild a single lost drone each cycle. Resets
  // immediately when the player leaves range so it can't be exploited by
  // hovering far away.
  if (state.droneRepairUnlocked && inStationRange) {
    if (state.miningDrones.length < state.miningDroneCap) {
      state.droneRepairTimer -= dt
      if (state.droneRepairTimer <= 0) {
        state.droneRepairTimer = 10
        const idx = state.miningDrones.length
        const offset = (idx / 4) * Math.PI * 2
        const drone = createMiningDrone(
          state.ship.x + Math.cos(offset) * 6,
          state.ship.y + Math.sin(offset) * 6,
        )
        state.miningDrones.push(drone)
        result.droneRebuilt = true
      }
    } else {
      state.droneRepairTimer = 10
    }
  } else {
    state.droneRepairTimer = 10
  }

  // --- Ambush enemies (used by prologue) ---
  if (state.ambushEnemies.length > 0) {
    for (const ae of state.ambushEnemies) {
      if (!ae.alive) continue
      const newProjs = updateEnemyShip(ae, state.ship, dt, state.asteroids)
      // Prologue grunts/drones fire a frantic barrage; ranged kinds keep
      // their own cadence, and endless patrols use the updateEnemyShip default.
      if (
        isPrologue &&
        (ae.kind === 'grunt' || ae.kind === 'drone') &&
        ae.shootTimer > AMBUSH_SHOOT_MAX
      ) {
        ae.shootTimer = AMBUSH_SHOOT_MIN + Math.random() * (AMBUSH_SHOOT_MAX - AMBUSH_SHOOT_MIN)
      }
      for (const proj of newProjs) {
        state.enemyProjectiles.push(proj)
        result.newEnemyProjectiles.push(proj)
      }
      if (endlessActive && input.blackHole) {
        applyBlackHolePullAndDriftToVBody(ae, input.blackHole, dt)
        if (isInsideBlackHole(ae, input.blackHole)) {
          ae.alive = false
          result.enemiesEscaped.push(ae)
        }
      }
    }

    // Carriers launch drone swarms; scavengers acquire/steal loot and flee.
    updateSpecialEnemies(state, result)

    // Projectile collision check against ambush enemies
    if (state.projectiles.length > 0) {
      for (const ae of state.ambushEnemies) {
        if (!ae.alive) continue
        const { surviving, hitProjectileIds } = checkProjectileEnemyCollisions(
          state.projectiles,
          ae,
        )
        for (const hitId of hitProjectileIds) {
          state.projectileElapsed.delete(hitId)
          result.expiredProjectileIds.push(hitId)
          result.enemyDamaged.push({
            enemy: ae,
            damage: 1,
            x: ae.x,
            y: ae.y,
            source: 'projectile',
          })
        }
        state.projectiles = surviving

        if (!ae.alive) {
          const box = createScrapBox(ae.x, ae.y, bountyScrapValue(state))
          state.scrapBoxes.push(box)
          result.enemyDestroyed = { x: ae.x, y: ae.y }
          result.enemyDestroyedEvent = true
          dropScavengerLoot(state, result, ae)
          result.ambushEnemiesDestroyed.push(ae)
        }
      }
    }
  }

  // --- Endless mode: the Ledger, field replenishment, enemy director ---
  if (endlessActive && asteroidsAliveBefore) {
    updateEndlessMode(state, input, result, asteroidsAliveBefore)
  }
  if (endlessActive && input.blackHole) {
    applyBlackHoleConsumption(state, input, result)
  }
  result.ledger = state.ledger

  return result
}

// ---------------------------------------------------------------------------
// Endless mode
// ---------------------------------------------------------------------------

/**
 * Endless-mode systems, run once per tick after the tutorial completes:
 *
 *  - The Ledger rises as the player destroys asteroids and hauls metal.
 *  - The asteroid field is culled of dead/far rocks and replenished around
 *    the player so the belt never runs dry.
 *  - An enemy director spawns escalating patrols on a Ledger-driven cadence.
 *
 * Endless patrol enemies share the `ambushEnemies` pool (already wired for
 * multi-enemy combat, beam hits, radar, and aim targeting); dead ones are
 * pruned here so the pool stays bounded over a long run.
 */
function updateEndlessMode(
  state: TickState,
  input: TickInput,
  result: TickResult,
  asteroidsAliveBefore: Set<string>,
): void {
  const { dt } = input

  // --- The Ledger rises with extraction ---
  let destroyed = 0
  for (const a of state.asteroids) {
    if (a.hp <= 0 && asteroidsAliveBefore.has(a.id)) destroyed++
  }
  state.ledger += destroyed * LEDGER_PER_ASTEROID
  state.ledger += result.metalCollected.length * LEDGER_PER_METAL
  state.peakLedger = Math.max(state.peakLedger, state.ledger)
  state.runTime += dt

  // --- Cull destroyed rocks and ones the player has long since left behind ---
  const viewDiag = Math.hypot(input.viewBounds.halfW, input.viewBounds.halfH)
  const cullRadiusSq = (viewDiag * 3.5) ** 2
  for (let i = state.asteroids.length - 1; i >= 0; i--) {
    const a = state.asteroids[i]
    const dx = a.x - state.ship.x
    const dy = a.y - state.ship.y
    if (a.hp <= 0 || dx * dx + dy * dy > cullRadiusSq) {
      result.expiredAsteroidIds.push(a.id)
      state.asteroids.splice(i, 1)
      state.asteroidHitCounts.delete(a.id)
    }
  }

  // --- Replenish the field when it thins out around the player ---
  const localRadiusSq = (viewDiag * 2.2) ** 2
  let localCount = 0
  for (const a of state.asteroids) {
    const dx = a.x - state.ship.x
    const dy = a.y - state.ship.y
    if (dx * dx + dy * dy < localRadiusSq) localCount++
  }
  if (localCount < ASTEROID_FLOOR) {
    state.asteroidRespawnTimer -= dt
    if (state.asteroidRespawnTimer <= 0) {
      state.asteroidRespawnTimer = ASTEROID_REPLENISH_INTERVAL
      const batch = Math.min(ASTEROID_REPLENISH_BATCH, ASTEROID_FLOOR - localCount)
      for (let i = 0; i < batch; i++) {
        const a = spawnEdgeAsteroid(input.viewBounds, `asteroid-r${state.asteroidSpawnCounter++}`)
        state.asteroids.push(a)
        state.asteroidHitCounts.set(a.id, 0)
        result.newAsteroids.push(a)
      }
    }
  } else {
    state.asteroidRespawnTimer = ASTEROID_REPLENISH_INTERVAL
  }

  // --- The Arbiter — recurring boss encounter ---
  if (state.arbiter) {
    const arb = state.arbiter

    // Player projectiles vs the Arbiter
    if (state.projectiles.length > 0) {
      const { surviving, hitProjectileIds } = checkProjectileArbiterCollisions(
        state.projectiles,
        arb,
      )
      for (const id of hitProjectileIds) {
        state.projectileElapsed.delete(id)
        result.expiredProjectileIds.push(id)
      }
      state.projectiles = surviving
      if (hitProjectileIds.length > 0) result.arbiterHit = true
    }

    if (arb.hp <= 0) {
      // Destroyed — scrap payout, full hull restored, hard Ledger relief.
      const boxCount = 4 + arb.mark
      for (let i = 0; i < boxCount; i++) {
        const a = (i / boxCount) * Math.PI * 2 + Math.random() * 0.5
        const r = 5 + Math.random() * 8
        state.scrapBoxes.push(createScrapBox(arb.x + Math.cos(a) * r, arb.y + Math.sin(a) * r, bountyScrapValue(state)))
      }
      state.ledger = Math.max(0, state.ledger * ARBITER_DEFEAT_LEDGER_FACTOR)
      state.playerHp = effectivePlayerMaxHp()
      state.marksDefeated++
      result.playerDamaged = true
      result.arbiterDefeated = { x: arb.x, y: arb.y, mark: arb.mark }
      state.arbiter = null
    } else {
      // Still in the fight — move, fire volleys, call reinforcements.
      const upd = updateArbiter(arb, state.ship, dt)
      for (const p of upd.projectiles) {
        state.enemyProjectiles.push(p)
        result.newEnemyProjectiles.push(p)
      }
      if (upd.reinforcements > 0) {
        spawnPatrol(state, result, upd.reinforcements, viewDiag)
      }
      if (upd.finishedWithdrawing) {
        state.ledger = Math.max(0, state.ledger - ARBITER_EVADE_LEDGER_RELIEF)
        result.arbiterWithdrawn = { mark: arb.mark }
        state.arbiter = null
      }
    }
  } else if (
    state.ledger >= arbiterThreshold(state.arbiterMark + 1) &&
    !state.debugDisableEnemySpawns
  ) {
    // The Ledger crossed the next threshold — summon the next Arbiter Mark.
    state.arbiterMark++
    const angle = Math.random() * Math.PI * 2
    const r = viewDiag + 45
    state.arbiter = createArbiterState(
      state.arbiterMark,
      state.ship.x + Math.cos(angle) * r,
      state.ship.y + Math.sin(angle) * r,
    )
    result.arbiterSpawned = { mark: state.arbiterMark }
  }

  // --- Enemy director: escalating patrols (paused while the Arbiter is here) ---
  //
  // Once per cadence the director picks ONE of two events:
  //   • a normal patrol of `patrolSize(ledger)` mixed kinds drawn from
  //     `pickPatrolKind`, or
  //   • a Galaga-style formation swoop (a wedge of 5 flying in along a single
  //     bearing toward the player).
  //
  // The formation roll is gated by Ledger so a fresh run sees plain patrols
  // first and formations emerge as a mid-run escalation beat. Formations
  // replace a patrol rather than stacking on top of one — the wedge IS the
  // wave that tick.
  if (!state.arbiter && !state.debugDisableEnemySpawns) {
    state.patrolTimer -= dt
    if (state.patrolTimer <= 0) {
      state.patrolTimer = patrolInterval(state.ledger)
      const rollFormation = state.ledger >= 220 && Math.random() < 0.28
      if (rollFormation) {
        spawnWedgeFormation(state, result, viewDiag)
      } else {
        spawnPatrol(state, result, patrolSize(state.ledger), viewDiag)
      }
    }
  }

  // --- Splitter death → spawn 3 grunt children ---
  // Done after all damage / death detection sites have pushed to
  // ambushEnemiesDestroyed and BEFORE the prune step, so newly-spawned
  // children are immediately part of the live pool and the next tick can
  // run their AI without a one-frame gap.
  if (result.ambushEnemiesDestroyed.length > 0) {
    for (const dead of result.ambushEnemiesDestroyed) {
      if (dead.kind === 'splitter') {
        spawnSplitterChildren(state, result, dead)
      }
    }
  }

  // --- Prune destroyed enemies so the pool never grows unbounded ---
  if (state.ambushEnemies.some((e) => !e.alive)) {
    state.ambushEnemies = state.ambushEnemies.filter((e) => e.alive)
  }

  // --- Run-ending: hull lost ---
  if (state.playerHp <= 0 && !state.endlessDeathFired) {
    state.endlessDeathFired = true
    result.playerKilled = true
  }
}

/**
 * Pick a patrol enemy class. The roster opens up as the Ledger climbs, so a
 * fresh run faces plain grunts and later runs see the full bestiary.
 *
 * Drifters are sprinkled in at all Ledger values as low-stakes XP filler —
 * 1 HP and no weapon, they read as a "feel powerful" beat rather than a
 * threat. Splitters appear once the player can routinely handle splash damage.
 */
function pickPatrolKind(ledger: number): EnemyKind {
  const r = Math.random()
  if (ledger > 2200 && r < 0.10) return 'splitter'
  if (ledger > 2000 && r < 0.18) return 'carrier'
  if (ledger > 900 && r < 0.34) return 'scavenger'
  if (ledger > 300 && r < 0.56) return 'sniper'
  // Drifters cap out at a small share so they remain a flavour spawn, not the
  // dominant patrol enemy. Slight bias to early game where the XP matters more.
  const drifterChance = ledger < 200 ? 0.18 : 0.1
  if (r < drifterChance) return 'drifter'
  return 'grunt'
}

/** Spawn up to `requested` patrol enemies off-screen around the player. */
function spawnPatrol(
  state: TickState,
  result: TickResult,
  requested: number,
  viewDiag: number,
): void {
  const aliveEnemies = state.ambushEnemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0)
  const count = Math.min(requested, MAX_PATROL_ENEMIES - aliveEnemies)
  if (count <= 0) return
  const damage = patrolEnemyDamage(state.ledger)
  const ringRadius = viewDiag + 25
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const ex = state.ship.x + Math.cos(angle) * ringRadius
    const ey = state.ship.y + Math.sin(angle) * ringRadius
    const kind = pickPatrolKind(state.ledger)
    const enemy = createEnemyShip(ex, ey, damage, kind)
    // Drifters have no steering AI — give them a fixed velocity at spawn so
    // they cross the screen on a straight line. Aimed roughly at the player
    // with a small angular jitter so the path varies between spawns.
    if (kind === 'drifter') {
      const toPlayer = Math.atan2(state.ship.y - ey, state.ship.x - ex)
      const jitter = (Math.random() - 0.5) * 0.6
      const heading = toPlayer + jitter
      enemy.vx = Math.cos(heading) * DRIFTER_SPEED
      enemy.vy = Math.sin(heading) * DRIFTER_SPEED
      enemy.heading = heading
    }
    state.ambushEnemies.push(enemy)
    result.ambushEnemiesSpawned.push(enemy)
  }
}

/**
 * V-formation slot offsets (5 ships), measured from the leader along the
 * swoop axes: `x` is lateral (perpendicular to flight), `y` is trailing
 * (negative = behind the leader).
 *
 * Layout:
 * ```
 *          (0,0)            <- leader
 *      .          .
 *   (-8,-8)     (8,-8)      <- inner wings
 *      .          .
 *  (-16,-16)   (16,-16)     <- outer wings
 * ```
 */
const WEDGE_SLOTS: readonly { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: -8, y: -8 },
  { x: 8, y: -8 },
  { x: -16, y: -16 },
  { x: 16, y: -16 },
] as const

/**
 * Spawn a wedge formation: 5 wedge ships, off-screen on a random bearing,
 * pointed at the player. The leader flies straight along the bearing;
 * followers hold a V-slot relative to the leader until the wing breaks
 * (see {@link updateWedgeAI} for the break conditions).
 *
 * Stays within MAX_PATROL_ENEMIES — if the cap is tight, we spawn fewer
 * followers rather than skipping the formation entirely so the bearing
 * threat still telegraphs.
 */
function spawnWedgeFormation(state: TickState, result: TickResult, viewDiag: number): void {
  const aliveEnemies = state.ambushEnemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0)
  const budget = MAX_PATROL_ENEMIES - aliveEnemies
  if (budget <= 0) return
  const count = Math.min(WEDGE_SLOTS.length, budget)
  const damage = patrolEnemyDamage(state.ledger)

  // Spawn on a ring well outside the camera diagonal so the formation has
  // travel room before reaching engagement range. The swoop bearing points
  // FROM the spawn point TOWARD the ship.
  const spawnDist = viewDiag + 50
  const fromAngle = Math.random() * Math.PI * 2
  const spawnAnchorX = state.ship.x + Math.cos(fromAngle) * spawnDist
  const spawnAnchorY = state.ship.y + Math.sin(fromAngle) * spawnDist
  const swoopBearing = Math.atan2(
    state.ship.y - spawnAnchorY,
    state.ship.x - spawnAnchorX,
  )
  const cos = Math.cos(swoopBearing)
  const sin = Math.sin(swoopBearing)

  let leader: EnemyShip | null = null
  for (let i = 0; i < count; i++) {
    const slot = WEDGE_SLOTS[i]
    // Slot offset rotated into the swoop axes: forward = (cos, sin), lateral = (-sin, cos).
    const sx = spawnAnchorX + slot.y * cos + slot.x * -sin
    const sy = spawnAnchorY + slot.y * sin + slot.x * cos
    const enemy = createEnemyShip(sx, sy, damage, 'wedge')
    enemy.inFormation = true
    enemy.swoopBearing = swoopBearing
    enemy.formationSlotX = slot.x
    enemy.formationSlotY = slot.y
    enemy.heading = swoopBearing
    enemy.rotation = swoopBearing - Math.PI / 2
    if (i === 0) {
      leader = enemy
      enemy.formationLeader = null
    } else {
      enemy.formationLeader = leader
    }
    state.ambushEnemies.push(enemy)
    result.ambushEnemiesSpawned.push(enemy)
  }
}

/**
 * Spawn SPLITTER_CHILD_COUNT grunt children radiating outward from a
 * splitter's death point. Called once per splitter death; the children are
 * regular grunts (not recursive splitters) so we don't end up with a
 * runaway swarm.
 */
function spawnSplitterChildren(
  state: TickState,
  result: TickResult,
  parent: EnemyShip,
): void {
  const aliveEnemies = state.ambushEnemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0)
  const budget = MAX_PATROL_ENEMIES - aliveEnemies
  if (budget <= 0) return
  const count = Math.min(SPLITTER_CHILD_COUNT, budget)
  for (let i = 0; i < count; i++) {
    const angle = (i / SPLITTER_CHILD_COUNT) * Math.PI * 2 + Math.random() * 0.4
    const r = 8
    const cx = parent.x + Math.cos(angle) * r
    const cy = parent.y + Math.sin(angle) * r
    const child = createEnemyShip(cx, cy, parent.projectileDamage, 'grunt')
    // Outward kick + heading so the children visibly burst from the wreck
    // rather than smoothly orbiting from frame one.
    child.vx = Math.cos(angle) * 22
    child.vy = Math.sin(angle) * 22
    child.heading = angle
    // Children spawn at full HP so they're a real threat — without this,
    // the grunt-default half-HP would make splitter death too cheap.
    child.hp = child.maxHp
    state.ambushEnemies.push(child)
    result.ambushEnemiesSpawned.push(child)
  }
}

/**
 * Per-frame upkeep for the special enemy kinds: carriers launch drone swarms,
 * scavengers acquire and steal loot, then flee the sector once they have it.
 */
function updateSpecialEnemies(state: TickState, result: TickResult): void {
  // --- Carriers launch drones ---
  const carriers = state.ambushEnemies.filter((e) => e.kind === 'carrier' && e.alive)
  for (const carrier of carriers) {
    if (carrier.droneTimer > 0) continue
    carrier.droneTimer = CARRIER_DRONE_INTERVAL
    const aliveDrones = state.ambushEnemies.reduce(
      (n, e) => n + (e.kind === 'drone' && e.alive ? 1 : 0),
      0,
    )
    const maxDrones = CARRIER_MAX_DRONES * carriers.length
    const spawnCount = Math.min(CARRIER_MAX_DRONES, maxDrones - aliveDrones)
    if (spawnCount <= 0) continue

    for (let i = 0; i < spawnCount; i++) {
      const slot = DRONE_LAUNCH_SLOTS[i % DRONE_LAUNCH_SLOTS.length]
      const bay = carrierLocalPoint(carrier, slot.bayX, slot.bayY)
      const target = carrierLocalPoint(carrier, slot.targetX, slot.targetY)
      const drone = createEnemyShip(
        bay.x,
        bay.y,
        carrier.projectileDamage * DRONE_DAMAGE_MULT,
        'drone',
      )
      drone.launching = true
      drone.launchTargetX = target.x
      drone.launchTargetY = target.y
      drone.shootTimer = DRONE_POST_LAUNCH_SHOOT_DELAY
      drone.rotation = Math.atan2(target.y - bay.y, target.x - bay.x) - Math.PI / 2
      state.ambushEnemies.push(drone)
      result.ambushEnemiesSpawned.push(drone)
    }
  }

  // --- Scavengers chase loot, steal it, then flee ---
  const scavengers = state.ambushEnemies.filter((e) => e.kind === 'scavenger' && e.alive)
  for (const sc of scavengers) {
    if (sc.fleeing) {
      const fdx = sc.x - state.ship.x
      const fdy = sc.y - state.ship.y
      if (fdx * fdx + fdy * fdy > SCAVENGER_ESCAPE_DISTANCE * SCAVENGER_ESCAPE_DISTANCE) {
        // Got away clean — drop it from the fight (scene removes the mesh).
        sc.alive = false
        result.enemiesEscaped.push(sc)
      }
      continue
    }

    // Keep the cached target position fresh; drop it if the loot is gone
    // (the player collected it, or another scavenger grabbed it first).
    if (sc.targetLootId) {
      const loot = findLoot(state, sc.targetLootId)
      if (loot) {
        sc.targetLootX = loot.x
        sc.targetLootY = loot.y
      } else {
        sc.targetLootId = null
      }
    }
    if (!sc.targetLootId) {
      const nearest = nearestLoot(state, sc.x, sc.y)
      if (nearest) {
        sc.targetLootId = nearest.id
        sc.targetLootX = nearest.x
        sc.targetLootY = nearest.y
      }
    }
    // Snatch the loot once it is in reach, then bolt.
    if (sc.targetLootId) {
      const gdx = sc.targetLootX - sc.x
      const gdy = sc.targetLootY - sc.y
      if (gdx * gdx + gdy * gdy < SCAVENGER_GRAB_RANGE * SCAVENGER_GRAB_RANGE) {
        const stolen = stealLoot(state, result, sc.targetLootId)
        if (stolen) sc.stolenLoot.push(stolen)
        sc.fleeing = true
        sc.targetLootId = null
      }
    }
  }
}

function carrierLocalPoint(
  carrier: EnemyShip,
  localXRadius: number,
  localYRadius: number,
): { x: number; y: number } {
  const x = localXRadius * carrier.collisionRadius
  const y = localYRadius * carrier.collisionRadius
  const cos = Math.cos(carrier.rotation)
  const sin = Math.sin(carrier.rotation)
  return {
    x: carrier.x + x * cos - y * sin,
    y: carrier.y + x * sin + y * cos,
  }
}

/** Find a loot item (metal chunk or scrap box) by id. */
function findLoot(state: TickState, id: string): { x: number; y: number } | null {
  const m = state.metalChunks.find((c) => c.id === id)
  if (m) return m
  const s = state.scrapBoxes.find((b) => b.id === id)
  if (s) return s
  return null
}

/** Nearest loot item to a point, or null when the field has none. */
function nearestLoot(
  state: TickState,
  x: number,
  y: number,
): { id: string; x: number; y: number } | null {
  let best: { id: string; x: number; y: number } | null = null
  let bestSq = Infinity
  for (const c of state.metalChunks) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2
    if (d < bestSq) {
      bestSq = d
      best = c
    }
  }
  for (const b of state.scrapBoxes) {
    const d = (b.x - x) ** 2 + (b.y - y) ** 2
    if (d < bestSq) {
      bestSq = d
      best = b
    }
  }
  return best
}

/**
 * Remove a stolen loot item from the world; scene.ts clears its mesh.
 * Returns which kind was taken so the scavenger can drop it back on death.
 */
function stealLoot(state: TickState, result: TickResult, id: string): 'metal' | 'scrap' | null {
  const mi = state.metalChunks.findIndex((c) => c.id === id)
  if (mi >= 0) {
    state.metalChunks.splice(mi, 1)
    result.metalStolen.push(id)
    return 'metal'
  }
  const si = state.scrapBoxes.findIndex((b) => b.id === id)
  if (si >= 0) {
    state.scrapBoxes.splice(si, 1)
    result.scrapStolen.push(id)
    return 'scrap'
  }
  return null
}

/**
 * Scatter the loot a scavenger had stolen when it is destroyed — the player's
 * reward for catching the thief before it escaped the sector.
 */
function dropScavengerLoot(state: TickState, result: TickResult, enemy: EnemyShip): void {
  if (enemy.kind !== 'scavenger' || enemy.stolenLoot.length === 0) return
  for (const kind of enemy.stolenLoot) {
    const angle = Math.random() * Math.PI * 2
    if (kind === 'metal') {
      const chunk = createMetalChunk(enemy.x, enemy.y, Math.cos(angle), Math.sin(angle))
      state.metalChunks.push(chunk)
      result.newMetalChunks.push(chunk)
    } else {
      state.scrapBoxes.push(createScrapBox(enemy.x, enemy.y, bountyScrapValue(state)))
    }
  }
  enemy.stolenLoot = []
}
