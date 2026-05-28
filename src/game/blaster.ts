import type { Ship } from '@/lib/schemas'
import type { MiningTool, Projectile, ProjectileTool } from './types'
import {
  BASE_PROJECTILE_SPEED,
  SPEED_MULTIPLIERS,
  FIRE_RATES,
  DAMAGE_PER_TIER,
  PROJECTILE_LIFETIME,
  TRIPLE_SPREAD_ANGLE,
  LAZER_MAX_HEAT,
  LAZER_HEAT_RATE,
  LAZER_COOL_RATE,
  LAZER_COOLDOWN_TIME,
  LAZER_FIRE_INTERVAL,
  clampTier,
} from './blaster-constants'

let nextProjectileId = 0

/** Reset the projectile ID counter (for testing). */
export function resetProjectileIdCounter(): void {
  nextProjectileId = 0
}

function generateProjectileId(): string {
  return `proj-${nextProjectileId++}`
}

export interface BlasterState {
  cooldownRemaining: number
}

export function createBlasterState(): BlasterState {
  return { cooldownRemaining: 0 }
}

export interface LazerState {
  /** Current heat level (0 = cool, LAZER_MAX_HEAT = overheated). */
  heat: number
  /** Whether the lazer is in forced cooldown after overheating. */
  overheated: boolean
  /** Time remaining in forced cooldown (seconds). */
  cooldownRemaining: number
  /** Internal fire interval timer. */
  fireTimer: number
}

export function createLazerState(): LazerState {
  return { heat: 0, overheated: false, cooldownRemaining: 0, fireTimer: 0 }
}

/**
 * Update lazer heat/cooldown each frame. Call once per frame.
 * Returns true if the lazer is able to fire this frame.
 * `coolingTier` (0-3) extends the heat tank and the cool rate by +50% per
 * tier — the Cooling Vanes upgrade.
 */
export function updateLazerState(
  lazer: LazerState,
  dt: number,
  firing: boolean,
  coolingTier = 0,
): boolean {
  const tierMult = 1 + 0.5 * coolingTier
  const maxHeat = LAZER_MAX_HEAT * tierMult
  const coolRate = LAZER_COOL_RATE * tierMult

  if (lazer.overheated) {
    lazer.cooldownRemaining = Math.max(0, lazer.cooldownRemaining - dt)
    if (lazer.cooldownRemaining <= 0) {
      lazer.overheated = false
      lazer.heat = 0
    }
    return false
  }

  if (firing) {
    lazer.heat = Math.min(maxHeat, lazer.heat + LAZER_HEAT_RATE * dt)
    if (lazer.heat >= maxHeat) {
      lazer.overheated = true
      lazer.cooldownRemaining = LAZER_COOLDOWN_TIME
      return false
    }
    lazer.fireTimer += dt
    if (lazer.fireTimer >= LAZER_FIRE_INTERVAL) {
      lazer.fireTimer -= LAZER_FIRE_INTERVAL
      return true
    }
    return false
  }

  // Not firing, not overheated — passively cool down
  lazer.heat = Math.max(0, lazer.heat - coolRate * dt)
  lazer.fireTimer = 0
  return false
}

/**
 * Mutable fire-input state that tracks whether the mouse/touch is held down.
 * When the game pauses (e.g. a popup overlay), mouseup events may not reach
 * the canvas, leaving `mouseHoldingFire` stuck true. Call `clearStaleFireState`
 * on pause→unpause transitions to prevent the ship from auto-firing and
 * locking its rotation to a stale aim position.
 */
export interface FireInputState {
  mouseHoldingFire: boolean
  fireTarget: { x: number; y: number } | null
}

export function createFireInputState(): FireInputState {
  return { mouseHoldingFire: false, fireTarget: null }
}

/**
 * Clear stale fire-input state after a pause→unpause transition.
 * Prevents the hold-to-fire loop from using stale aim data, which would
 * lock the ship's rotation and auto-fire at the pre-pause position.
 */
export function clearStaleFireState(state: FireInputState): void {
  state.mouseHoldingFire = false
  state.fireTarget = null
}

/**
 * Update blaster cooldown. Call once per frame.
 */
export function updateBlasterCooldown(blaster: BlasterState, dt: number): void {
  blaster.cooldownRemaining = Math.max(0, blaster.cooldownRemaining - dt)
}

/**
 * Attempt to fire the mining laser toward a world-space target.
 * Returns an array of new projectiles (empty if on cooldown).
 *
 * @param blaster - Blaster cooldown state (mutated)
 * @param ship - Current ship state
 * @param targetX - World-space X of the aim target
 * @param targetY - World-space Y of the aim target
 * @param tier - Current blaster upgrade tier (1–5)
 */
/**
 * Map a spread-shot upgrade tier to a list of angle offsets around the aim
 * direction. Tier 0 = single forward bolt; tier 1 = 3-bolt fan. The 2-bolt
 * "dual" pattern is intentionally skipped — the upgrade ladder reads cleaner
 * as "single → 3-fan" and the 3-bolt centre keeps the same hit feel as
 * a single shot for precision aiming.
 */
function spreadOffsets(spreadTier: number): number[] {
  if (spreadTier >= 1) return [-TRIPLE_SPREAD_ANGLE, 0, TRIPLE_SPREAD_ANGLE]
  return [0]
}

export function fireBlaster(
  blaster: BlasterState,
  ship: Ship,
  targetX: number,
  targetY: number,
  tier: number,
  tool: MiningTool = 'blaster',
  spreadTier = 0,
): Projectile[] {
  if (blaster.cooldownRemaining > 0) return []

  const clamped = clampTier(tier)
  const tierIndex = clamped - 1

  const fireRate = FIRE_RATES[tierIndex]
  blaster.cooldownRemaining = 1 / fireRate

  const speed = BASE_PROJECTILE_SPEED * SPEED_MULTIPLIERS[tierIndex]
  const damage = DAMAGE_PER_TIER[tierIndex]

  // Direction from ship to target
  const dx = targetX - ship.x
  const dy = targetY - ship.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  // If target is on top of ship, fire forward (ship faces +Y at rotation=0)
  const baseAngle = dist < 0.5 ? ship.rotation + Math.PI / 2 : Math.atan2(dy, dx)

  return spreadOffsets(spreadTier).map((offset) =>
    makeProjectile(ship.x, ship.y, baseAngle + offset, speed, damage, tool),
  )
}

export function fireBlasterFrom(
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  tier: number,
  tool: MiningTool = 'blaster',
  spreadTier = 0,
): Projectile[] {
  const clamped = clampTier(tier)
  const tierIndex = clamped - 1
  const speed = BASE_PROJECTILE_SPEED * SPEED_MULTIPLIERS[tierIndex]
  const damage = DAMAGE_PER_TIER[tierIndex]
  const dx = targetX - x
  const dy = targetY - y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const baseAngle = dist < 0.5 ? Math.PI / 2 : Math.atan2(dy, dx)

  return spreadOffsets(spreadTier).map((offset) =>
    makeProjectile(x, y, baseAngle + offset, speed, damage, tool),
  )
}

export function createMissileProjectile(
  x: number,
  y: number,
  angle: number,
  damage: number,
): Projectile {
  return makeProjectile(x, y, angle, 95, damage, 'missile')
}

function makeProjectile(
  x: number,
  y: number,
  angle: number,
  speed: number,
  damage: number,
  tool: ProjectileTool = 'blaster',
): Projectile {
  return {
    id: generateProjectileId(),
    x,
    y,
    prevX: x,
    prevY: y,
    velocityX: Math.cos(angle) * speed,
    velocityY: Math.sin(angle) * speed,
    damage,
    tool,
  }
}

/**
 * Update all projectile positions and remove expired ones.
 * Returns the surviving projectiles array.
 *
 * @param projectiles - Current projectile list
 * @param dt - Delta time in seconds
 * @param elapsed - Map of projectile ID to elapsed lifetime (mutated)
 */
export function updateProjectiles(
  projectiles: Projectile[],
  dt: number,
  elapsed: Map<string, number>,
): Projectile[] {
  const surviving: Projectile[] = []

  for (const p of projectiles) {
    p.prevX = p.x
    p.prevY = p.y
    p.x += p.velocityX * dt
    p.y += p.velocityY * dt

    const age = (elapsed.get(p.id) ?? 0) + dt
    elapsed.set(p.id, age)

    if (age < PROJECTILE_LIFETIME) {
      surviving.push(p)
    } else {
      elapsed.delete(p.id)
    }
  }

  return surviving
}
