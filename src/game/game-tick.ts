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
} from './enemy-ship'
import type { EnemyKind } from './enemy-ship'
import { createScrapBox, updateScrapBox, attractScrapBoxToShip, SCRAP_BOX_VALUE } from './scrap-box'
import { HITS_PER_BREAK } from './asteroid-debris'
import { spawnEdgeAsteroid } from './asteroid-spawner'
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
  projectileElapsed: Map<string, number>
  asteroidHitCounts: Map<string, number>
  blasterTier: number
  /** Collector upgrade tier (1–5). Widens the magnet pickup range. */
  collectorTier: number
  activeMiningTool: MiningTool
  fireRateBonus: number

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
  prologueEnemiesKilled: number
  prologueArbiterSpawned: boolean
  prologueShipFrozen: boolean
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

export type MetalVariant = 'silver' | 'gold'

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
  // Metal spawned from asteroid hits
  newMetalChunks: MetalChunk[]
  // Collection events
  metalCollected: { id: string; variant: MetalVariant }[]
  scrapCollected: { id: string; value: number }[]
  // Enemy lifecycle
  enemySpawned: EnemyShip | null
  enemyDestroyed: { x: number; y: number } | null
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
  crystallineDeflect: boolean
  metalSpawned: boolean
  metalCollectedEvent: boolean
  enemyNearby: boolean
  nearStation: boolean
  stationRangeChanged: boolean | null // true=entered, false=left, null=no change
  stationRepaired: boolean
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
    projectileElapsed: new Map(),
    asteroidHitCounts: hitCounts,
    blasterTier: config?.blasterTier ?? 1,
    collectorTier: config?.collectorTier ?? 1,
    activeMiningTool: config?.miningTool ?? 'blaster',
    fireRateBonus: config?.fireRateBonus ?? 1.0,

    fireTarget: null,
    mouseHoldingFire: false,
    aimActive: false,
    inputCooldown: 0,

    wasPaused: false,
    nearStationFired: false,
    wasInStationRange: false,
    repairedThisVisit: false,
    firstMetalCollectedTime: null,
    enemySpawned: false,
    enemyNearbyFired: false,

    prevTutorialStep: null,

    ambushEnemies: [],
    ambushSpawned: false,
    playerKilledFired: false,

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
    prologueEnemiesKilled: 0,
    prologueArbiterSpawned: false,
    prologueShipFrozen: false,
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
    newMetalChunks: [],
    metalCollected: [],
    scrapCollected: [],
    enemySpawned: null,
    enemyDestroyed: null,
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
    crystallineDeflect: false,
    metalSpawned: false,
    metalCollectedEvent: false,
    enemyNearby: false,
    nearStation: false,
    stationRangeChanged: null,
    stationRepaired: false,
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
    Math.abs(x - view.centerX) <= view.halfW + r &&
    Math.abs(y - view.centerY) <= view.halfH + r

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

function applyBlackHolePullToAsteroid(
  asteroid: Asteroid,
  hole: PositionBody,
  dt: number,
): void {
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

function applyBlackHoleConsumption(
  state: TickState,
  input: TickInput,
  result: TickResult,
): void {
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
  if (step === 'prologue-start') {
    if (!state.prologueFieldSpawned) {
      state.prologueFieldSpawned = true
      state.blasterTier = PROLOGUE_SHIP.blasterTier
      state.fireRateBonus = PROLOGUE_SHIP.fireRateBonus
      state.activeMiningTool = PROLOGUE_SHIP.miningTool
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
  const { dt } = input

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

  // --- Prologue auto-behavior ---
  const isPrologue = input.tutorialStep.startsWith('prologue-')
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
  const firingAllowed = !isPrologue || input.tutorialStep === 'prologue-mining'

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

  // Prologue auto-pilot: synthesize forward input without mutating TickInput
  const effectiveInput = state.prologueAutoPilotForward
    ? { ...input.inputState, up: true }
    : input.inputState
  updateShip(state.ship, effectiveInput, dt)
  if (endlessActive && input.blackHole) {
    applyBlackHolePullToBody(
      state.ship,
      input.blackHole,
      dt,
      BLACK_HOLE_PLAYER_PULL_MULT,
    )
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

  // --- Arbiter tractor beam: haul the ship in while caught in the cone ---
  if (state.arbiter && state.arbiter.tractorActive) {
    const { captureDamage } = applyTractorPull(state.arbiter, state.ship, dt)
    if (captureDamage > 0) {
      state.playerHp = Math.max(0, state.playerHp - captureDamage)
      result.playerDamaged = true
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
  for (const a of state.asteroids) {
    if (a.hp > 0) {
      resolveShipAsteroidCollision(state.ship, a)
    }
  }

  // --- Blaster cooldown ---
  updateBlasterCooldown(state.blasterState, dt)

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

  // --- Fire ---
  if (state.activeMiningTool === 'lazer') {
    // Sustained lazer beam: continuous beam while held, direct-hit damage each tick
    const hasFireTarget = state.fireTarget !== null
    const lazerFiring = (state.mouseHoldingFire || hasFireTarget) && !state.lazerState.overheated
    updateLazerState(state.lazerState, dt, lazerFiring)

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
      const dps = baseDamage * 5 // 5x base damage per second for sustained beam
      const frameDamage = dps * dt

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

      // --- Beam vs enemies (along the segment already truncated by asteroids,
      // so beams don't reach enemies behind rocks) ---
      const beamHitEnemies: { enemy: EnemyShip; killed: boolean; isAmbush: boolean; t: number }[] =
        []
      const tryBeamEnemy = (en: EnemyShip | null, isAmbush: boolean): void => {
        if (!en || !en.alive) return
        const r = checkBeamEnemyCollisions(
          state.ship.x,
          state.ship.y,
          result.beamEndX,
          result.beamEndY,
          frameDamage,
          en,
        )
        if (r.hit) beamHitEnemies.push({ enemy: en, killed: r.killed, isAmbush, t: r.t })
      }
      tryBeamEnemy(state.enemy, false)
      for (const ae of state.ambushEnemies) tryBeamEnemy(ae, true)

      // Truncate beam end to the nearest enemy hit if any
      if (beamHitEnemies.length > 0) {
        let minT = 1
        for (const h of beamHitEnemies) if (h.t < minT) minT = h.t
        const bx = result.beamEndX - state.ship.x
        const by = result.beamEndY - state.ship.y
        result.beamEndX = state.ship.x + bx * minT
        result.beamEndY = state.ship.y + by * minT

        // Handle kills
        for (const h of beamHitEnemies) {
          if (!h.killed) continue
          const box = createScrapBox(h.enemy.x, h.enemy.y)
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

      // Process beam hits for events and metal spawning
      for (const hit of beamResult.hits) {
        if (hit.deflected) {
          result.crystallineDeflect = true
        } else {
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
              const metal = createMetalChunk(hit.x, hit.y, nx, ny)
              state.metalChunks.push(metal)
              result.newMetalChunks.push(metal)
              result.metalSpawned = true
            }
          }
        }
      }
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
      )
      if (newProjectiles.length > 0 && state.fireRateBonus > 1) {
        state.blasterState.cooldownRemaining /= state.fireRateBonus
      }
      for (const p of newProjectiles) {
        state.projectiles.push(p)
        result.newProjectiles.push(p)
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
  const prevIds = state.projectiles.map((p) => p.id)
  state.projectiles = updateProjectiles(state.projectiles, dt, state.projectileElapsed)
  const currentIds = new Set(state.projectiles.map((p) => p.id))
  for (const id of prevIds) {
    if (!currentIds.has(id)) {
      result.expiredProjectileIds.push(id)
    }
  }

  // --- Projectile-asteroid collision ---
  const liveAsteroids = state.asteroids.filter((a) => a.hp > 0)
  if (state.projectiles.length > 0 && liveAsteroids.length > 0) {
    const { surviving, hits } = checkProjectileAsteroidCollisions(state.projectiles, liveAsteroids)

    if (hits.some((h) => !h.deflected)) {
      result.asteroidHit = true
    }
    if (hits.some((h) => h.deflected)) {
      result.crystallineDeflect = true
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
          const metal = createMetalChunk(hit.x, hit.y, nx, ny)
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
      }
      state.projectiles = surviving

      if (!state.enemy.alive) {
        const box = createScrapBox(state.enemy.x, state.enemy.y)
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
        state.playerHp = Math.max(0, state.playerHp - damage)
        result.enemyProjectileHits.push({ id: proj.id, x: proj.x, y: proj.y, damage })
        state.enemyProjectiles.splice(i, 1)
      }
      result.playerDamaged = true
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
        : collectorRangeForTier(state.collectorTier)
      const collected = attractScrapBoxToShip(state.scrapBoxes[i], state.ship, dt, collectorRange)
      if (collected) {
        result.scrapCollected.push({ id: state.scrapBoxes[i].id, value: SCRAP_BOX_VALUE })
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

  if (
    inStationRange &&
    !state.repairedThisVisit &&
    sDist <= STATION_REPAIR_DISTANCE &&
    state.playerHp > 0
  ) {
    state.repairedThisVisit = true
    state.playerHp = PLAYER_MAX_HP
    result.stationRepaired = true
    result.playerDamaged = true // triggers onPlayerDamage callback with restored HP
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
        }
        state.projectiles = surviving

        if (!ae.alive) {
          const box = createScrapBox(ae.x, ae.y)
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
        state.scrapBoxes.push(createScrapBox(arb.x + Math.cos(a) * r, arb.y + Math.sin(a) * r))
      }
      state.ledger = Math.max(0, state.ledger * ARBITER_DEFEAT_LEDGER_FACTOR)
      state.playerHp = PLAYER_MAX_HP
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
  } else if (state.ledger >= arbiterThreshold(state.arbiterMark + 1)) {
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
  if (!state.arbiter) {
    state.patrolTimer -= dt
    if (state.patrolTimer <= 0) {
      state.patrolTimer = patrolInterval(state.ledger)
      spawnPatrol(state, result, patrolSize(state.ledger), viewDiag)
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
 */
function pickPatrolKind(ledger: number): EnemyKind {
  const r = Math.random()
  if (ledger > 2000 && r < 0.14) return 'carrier'
  if (ledger > 900 && r < 0.36) return 'scavenger'
  if (ledger > 300 && r < 0.62) return 'sniper'
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
    const enemy = createEnemyShip(ex, ey, damage, pickPatrolKind(state.ledger))
    state.ambushEnemies.push(enemy)
    result.ambushEnemiesSpawned.push(enemy)
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
      state.scrapBoxes.push(createScrapBox(enemy.x, enemy.y))
    }
  }
  enemy.stolenLoot = []
}
