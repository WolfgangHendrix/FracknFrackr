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
  ENEMY_COLLISION_RADIUS,
  ENEMY_SPAWN_DISTANCE,
  ENEMY_PROJECTILE_DAMAGE,
} from './enemy-ship'
import { createScrapBox, updateScrapBox, attractScrapBoxToShip, SCRAP_BOX_VALUE } from './scrap-box'
import { HITS_PER_BREAK } from './asteroid-debris'
import {
  PROLOGUE_SHIP,
  PROLOGUE_ENEMY_FLEET_SIZE,
  PROLOGUE_MINING_TARGET,
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
      onScreen(state.enemy.x, state.enemy.y, ENEMY_COLLISION_RADIUS) &&
      pointToSegmentDistSq(state.enemy.x, state.enemy.y, ship.x, ship.y, endX, endY) <
        ENEMY_COLLISION_RADIUS * ENEMY_COLLISION_RADIUS
    ) {
      return true
    }
  }
  for (const e of state.ambushEnemies) {
    if (!e.alive) continue
    if (
      onScreen(e.x, e.y, ENEMY_COLLISION_RADIUS) &&
      pointToSegmentDistSq(e.x, e.y, ship.x, ship.y, endX, endY) <
        ENEMY_COLLISION_RADIUS * ENEMY_COLLISION_RADIUS
    ) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Prologue auto-behavior
// ---------------------------------------------------------------------------

/** Find nearest live target for auto-targeting. */
function findNearestTarget(
  state: TickState,
  preferEnemies: boolean,
): { x: number; y: number } | null {
  let target: { x: number; y: number } | null = null
  let minDist = Infinity

  // Check asteroids
  for (const a of state.asteroids) {
    if (a.hp <= 0) continue
    const d = Math.hypot(a.x - state.ship.x, a.y - state.ship.y)
    if (d < minDist) {
      minDist = d
      target = { x: a.x, y: a.y }
    }
  }

  // Check enemies (take priority when preferEnemies is true)
  if (preferEnemies) {
    const enemies: { x: number; y: number; alive: boolean }[] = [
      ...(state.enemy && state.enemy.alive ? [state.enemy] : []),
      ...state.ambushEnemies.filter((e) => e.alive),
    ]
    for (const e of enemies) {
      const d = Math.hypot(e.x - state.ship.x, e.y - state.ship.y)
      if (d < minDist) {
        minDist = d
        target = { x: e.x, y: e.y }
      }
    }
  }

  return target
}

/**
 * Auto-fire at the nearest target when one is within range.
 *
 * Fires directly toward the target (smart aim). Player can still
 * manually fire in the ship's facing direction via the fire button.
 */
function autoFireAtTarget(state: TickState, preferEnemies: boolean): void {
  const nearest = findNearestTarget(state, preferEnemies)
  if (!nearest) return

  const dist = Math.hypot(nearest.x - state.ship.x, nearest.y - state.ship.y)
  if (dist > PROLOGUE_SHIP.autoFireRange) return

  // Only auto-fire if player is not already manually firing
  if (!state.fireTarget) {
    state.mouseHoldingFire = true
    state.fireTarget = { x: nearest.x, y: nearest.y }
  }
}

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
    result.prologueReady = true
    return
  }

  // --- prologue-mining: free play — mine asteroids and fight enemies ---
  // Enemies spawn alongside asteroids. Auto-fires at nearest target
  // (enemies prioritized). Advances when enough asteroids destroyed AND
  // all enemies dead.
  if (step === 'prologue-mining') {
    state.prologueAutoCollect = true

    // Spawn enemy fleet once (alongside asteroids)
    if (!state.prologueEnemiesSpawned) {
      state.prologueEnemiesSpawned = true
      for (let i = 0; i < PROLOGUE_ENEMY_FLEET_SIZE; i++) {
        const angle = (i / PROLOGUE_ENEMY_FLEET_SIZE) * Math.PI * 2
        const dist = ENEMY_SPAWN_DISTANCE
        const ex = state.ship.x + Math.cos(angle) * dist
        const ey = state.ship.y + Math.sin(angle) * dist
        const enemy = createEnemyShip(ex, ey)
        state.ambushEnemies.push(enemy)
        result.ambushEnemiesSpawned.push(enemy)
      }
    }

    // Auto-fire: prioritize enemies when any are alive
    const hasLiveEnemies = state.ambushEnemies.some((e) => e.alive)
    autoFireAtTarget(state, hasLiveEnemies)

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

  // Collection is always automatic — the magnet runs by default. `input.collecting`
  // (E key / mobile button / right-click) is now effectively cosmetic. Only the
  // pickup range varies, driven by the Collector upgrade tier.
  const collecting = true
  void input.collecting

  // --- Ship update ---
  // During prologue: player controls rotation via joystick/input, auto-fire aims
  // independently. prologueAutoAim only drives fireTarget, NOT ship facing.
  // During normal play: mouse aim drives both rotation and fire direction.
  let aimRotation: number | null = null
  if (!isPrologue && state.aimActive && input.aimWorldPosition) {
    const adx = input.aimWorldPosition.x - state.ship.x
    const ady = input.aimWorldPosition.y - state.ship.y
    if (Math.abs(adx) > 0.5 || Math.abs(ady) > 0.5) {
      aimRotation = Math.atan2(-adx, ady)
    }
  }

  // Prologue auto-pilot: synthesize forward input without mutating TickInput
  const effectiveInput = state.prologueAutoPilotForward
    ? { ...input.inputState, up: true }
    : input.inputState
  updateShip(state.ship, effectiveInput, dt, aimRotation)

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

  // --- Asteroid drift ---
  for (const a of state.asteroids) {
    if (a.velocityX !== 0 || a.velocityY !== 0) {
      a.x += a.velocityX * dt
      a.y += a.velocityY * dt
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
  // Skip during prologue — that flow has its own scripted auto-fire.
  if (!isPrologue && state.aimActive && input.aimWorldPosition && state.inputCooldown <= 0) {
    if (aimLineHasVisibleTarget(state, input.aimWorldPosition, input.viewBounds)) {
      state.fireTarget = { x: input.aimWorldPosition.x, y: input.aimWorldPosition.y }
      state.mouseHoldingFire = true
    }
  }

  // --- Universal "only fire at targets" gate ---
  // Whatever set fireTarget (manual hold, gamepad right-stick aim, mobile fire
  // button, auto-fire), only proceed if the aim direction actually passes
  // through a live asteroid or enemy that's on screen. Skip during prologue
  // (it scripts its own aim and always targets a live entity anyway).
  if (
    !isPrologue &&
    state.fireTarget &&
    !aimLineHasVisibleTarget(state, state.fireTarget, input.viewBounds)
  ) {
    state.fireTarget = null
    state.mouseHoldingFire = false
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
          if (h.isAmbush) {
            result.ambushEnemiesDestroyed.push(h.enemy)
          } else if (state.enemy === h.enemy) {
            state.enemy = null
          }
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
  if (!state.enemySpawned && state.firstMetalCollectedTime !== null) {
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
        const damage =
          proj.mesh.userData['ambush'] === true ? AMBUSH_PROJECTILE_DAMAGE : ENEMY_PROJECTILE_DAMAGE
        state.playerHp = Math.max(0, state.playerHp - damage)
        result.enemyProjectileHits.push({ id: proj.id, x: proj.x, y: proj.y, damage })
        state.enemyProjectiles.splice(i, 1)
      }
      result.playerDamaged = true
    }
  }

  // --- Scrap box update & collection ---
  for (let i = state.scrapBoxes.length - 1; i >= 0; i--) {
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

  if (inStationRange && !state.repairedThisVisit && sDist <= STATION_REPAIR_DISTANCE) {
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
      if (ae.shootTimer > AMBUSH_SHOOT_MAX) {
        ae.shootTimer = AMBUSH_SHOOT_MIN + Math.random() * (AMBUSH_SHOOT_MAX - AMBUSH_SHOOT_MIN)
      }
      for (const proj of newProjs) {
        proj.mesh.userData['ambush'] = true
        state.enemyProjectiles.push(proj)
        result.newEnemyProjectiles.push(proj)
      }
    }

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
          result.ambushEnemiesDestroyed.push(ae)
        }
      }
    }
  }

  return result
}
