import * as THREE from 'three'
import type { Ship } from '@/lib/schemas'
import { VOXEL_SIZE } from './ship-constants'
import { SHIP_COLLISION_RADIUS, ENEMY_COLLISION_RADIUS } from './collision-constants'
import { PROJECTILE_RADIUS, LAZER_DAMAGE_MULTIPLIER } from './blaster-constants'
import type { Asteroid, Projectile } from './types'
import { segmentBlockedByAsteroid, resolveEnemyAsteroidCollision } from './collision'

/** Re-exported for callers that import it alongside the enemy ship API. */
export { ENEMY_COLLISION_RADIUS } from './collision-constants'

// ---------------------------------------------------------------------------
// Enemy ship constants
// ---------------------------------------------------------------------------

/** Enemy HP — takes 3 hits to destroy. */
export const ENEMY_MAX_HP = 3

/** Enemy movement speed (units/sec). */
const ENEMY_SPEED = 18

/** Maximum turn rate (radians/sec) — controls how sharply the enemy can steer. */
const ENEMY_TURN_RATE = 1.8

/** How often the enemy picks a new strafe direction (seconds). */
const ENEMY_STRAFE_CHANGE_INTERVAL = 3.0

/** Duration of idle (drifting) periods when in orbit sweet spot. */
const ENEMY_IDLE_DURATION = 3.0
/** Interval between idle periods. */
const ENEMY_IDLE_INTERVAL = 3.0

/** How often the enemy shoots (average seconds between shots). */
const ENEMY_SHOOT_INTERVAL = 3

/** Minimum interval between enemy shots. */
const ENEMY_SHOOT_MIN_INTERVAL = 1.5

/** Enemy projectile speed (units/sec). */
const ENEMY_PROJECTILE_SPEED = 120

/** Enemy projectile damage — very low for tutorial. */
export const ENEMY_PROJECTILE_DAMAGE = 5

/** Enemy projectile lifetime (seconds). */
const ENEMY_PROJECTILE_LIFETIME = 2.0

/** Enemy projectile collision radius. */
const ENEMY_PROJECTILE_RADIUS = 0.8

/** Orbit distance — enemy tries to stay roughly this far from player. */
export const ORBIT_DISTANCE = 50

/** How far from the player the enemy spawns. */
export const ENEMY_SPAWN_DISTANCE = 120

/** Colors for the enemy ship. */
const ENEMY_COLORS = {
  hull: 0xaa3333,
  cockpit: 0xff2200,
  engine: 0xff8800,
  wingTip: 0xff4444,
} as const

/** Colors for enemy projectiles — red energy. */
const ENEMY_PROJECTILE_COLORS = {
  core: 0xff3333,
  glow: 0xff6666,
} as const

// ---------------------------------------------------------------------------
// Shipwreck debris constants
// ---------------------------------------------------------------------------

/** Number of shipwreck debris particles on destruction. */
const WRECK_PARTICLE_COUNT = 16

/** How long wreck debris lasts (seconds). */
const WRECK_DURATION = 1.2

/** Speed wreck debris flies outward (units/sec). */
const WRECK_SPEED = 50

/** Wreck debris colors — mix of hull and fire. */
const WRECK_COLORS = [0xaa3333, 0xff6600, 0x884422, 0xff4444, 0x663322] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnemyShip {
  mesh: THREE.Group
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  hp: number
  maxHp: number
  alive: boolean
  /** Damage dealt by this enemy's projectiles when they hit the player. */
  projectileDamage: number
  /** Current heading angle (radians) — smoothly steered toward desired. */
  heading: number
  /** Timer for switching strafe direction (CW vs CCW). */
  strafeTimer: number
  /** +1 or -1 — current tangential strafe direction around the player. */
  strafeDir: number
  /** Time until next shot. */
  shootTimer: number
  /** Countdown to next idle/active transition. */
  idleTimer: number
  /** Whether the enemy is currently drifting idle. */
  idling: boolean
  /** Target cardinal angle (0, π/2, π, -π/2) the enemy is steering toward. */
  targetCardinal: number
}

export interface EnemyProjectile {
  id: string
  mesh: THREE.Group
  x: number
  y: number
  vx: number
  vy: number
  elapsed: number
  /** Damage dealt to the player on hit. */
  damage: number
}

export interface ShipwreckDebris {
  group: THREE.Group
  particles: { mesh: THREE.Mesh; vx: number; vy: number; rotSpeed: number }[]
  elapsed: number
}

// ---------------------------------------------------------------------------
// Enemy ship model
// ---------------------------------------------------------------------------

let nextEnemyProjectileId = 0

function addVoxel(group: THREE.Group, x: number, y: number, z: number, color: number): void {
  const geo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE)
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x * VOXEL_SIZE, y * VOXEL_SIZE, z * VOXEL_SIZE)
  group.add(mesh)
}

/**
 * Build a voxel enemy ship — similar shape to player but red-themed and
 * slightly more angular/aggressive looking.
 */
function createEnemyShipModel(): THREE.Group {
  const group = new THREE.Group()
  const { hull, cockpit, engine, wingTip } = ENEMY_COLORS

  // Main body — narrower, more aggressive
  for (let row = -2; row <= 3; row++) {
    addVoxel(group, 0, row, 0, hull)
    if (row >= -1 && row <= 2) {
      addVoxel(group, -1, row, 0, hull)
      addVoxel(group, 1, row, 0, hull)
    }
  }

  // Cockpit — red glow
  addVoxel(group, 0, 4, 0.5, cockpit)

  // Wings — swept back, sharper
  for (let w = 2; w <= 4; w++) {
    const row = -w + 1
    addVoxel(group, -w, row, 0, hull)
    addVoxel(group, w, row, 0, hull)
  }

  // Wing tips — red accent
  addVoxel(group, -4, -3, 0, wingTip)
  addVoxel(group, 4, -3, 0, wingTip)

  // Engine glow
  addVoxel(group, -1, -3, -0.3, engine)
  addVoxel(group, 0, -3, -0.3, engine)
  addVoxel(group, 1, -3, -0.3, engine)

  return group
}

// ---------------------------------------------------------------------------
// Enemy projectile model
// ---------------------------------------------------------------------------

function createEnemyProjectileModel(): THREE.Group {
  const group = new THREE.Group()
  const coreGeo = new THREE.BoxGeometry(0.8, 1.6, 0.8)
  const coreMat = new THREE.MeshStandardMaterial({
    color: ENEMY_PROJECTILE_COLORS.core,
    emissive: ENEMY_PROJECTILE_COLORS.core,
    emissiveIntensity: 0.8,
    flatShading: true,
  })
  const core = new THREE.Mesh(coreGeo, coreMat)
  group.add(core)

  const glowGeo = new THREE.BoxGeometry(1.2, 0.8, 0.6)
  const glowMat = new THREE.MeshStandardMaterial({
    color: ENEMY_PROJECTILE_COLORS.glow,
    emissive: ENEMY_PROJECTILE_COLORS.glow,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.6,
    flatShading: true,
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  group.add(glow)

  return group
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Create an enemy ship at the given position.
 *
 * @param projectileDamage - Damage this enemy's shots deal to the player.
 *   Defaults to the standard enemy value; the prologue ambush and endless
 *   patrols pass their own scaled values.
 */
export function createEnemyShip(
  x: number,
  y: number,
  projectileDamage: number = ENEMY_PROJECTILE_DAMAGE,
): EnemyShip {
  const mesh = createEnemyShipModel()
  mesh.position.set(x, y, 0)

  // Pick the nearest cardinal angle based on spawn position relative to origin
  const spawnAngle = Math.atan2(y, x)
  const initialCardinal = nearestCardinal(spawnAngle)

  return {
    mesh,
    x,
    y,
    vx: 0,
    vy: 0,
    rotation: 0,
    hp: Math.ceil(ENEMY_MAX_HP / 2),
    maxHp: ENEMY_MAX_HP,
    alive: true,
    projectileDamage,
    heading: Math.random() * Math.PI * 2,
    strafeTimer: ENEMY_STRAFE_CHANGE_INTERVAL * (0.5 + Math.random() * 0.5),
    strafeDir: Math.random() < 0.5 ? 1 : -1,
    shootTimer: ENEMY_SHOOT_INTERVAL * 0.5, // first shot comes quicker
    idleTimer: ENEMY_IDLE_INTERVAL * (0.5 + Math.random() * 0.5),
    idling: false,
    targetCardinal: initialCardinal,
  }
}

// ---------------------------------------------------------------------------
// AI update
// ---------------------------------------------------------------------------

/**
 * Normalise an angle to the range (-PI, PI].
 */
function normaliseAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a <= -Math.PI) a += Math.PI * 2
  return a
}

/** The four cardinal angles (12, 3, 6, 9 o'clock). */
const CARDINAL_ANGLES = [
  Math.PI / 2, // 12 o'clock (up / +Y)
  0, // 3 o'clock (right / +X)
  -Math.PI / 2, // 6 o'clock (down / -Y)
  Math.PI, // 9 o'clock (left / -X)
] as const

/**
 * Return the cardinal angle (0, π/2, π, -π/2) closest to the given angle.
 */
function nearestCardinal(angle: number): number {
  let best = CARDINAL_ANGLES[0]
  let bestDiff = Math.abs(normaliseAngle(angle - best))
  for (let i = 1; i < CARDINAL_ANGLES.length; i++) {
    const diff = Math.abs(normaliseAngle(angle - CARDINAL_ANGLES[i]))
    if (diff < bestDiff) {
      bestDiff = diff
      best = CARDINAL_ANGLES[i]
    }
  }
  return best
}

/**
 * Return the next cardinal angle in the given direction (+1 = CCW, -1 = CW).
 */
function nextCardinal(current: number, direction: number): number {
  // Find current index in CARDINAL_ANGLES (sorted CCW: 90°, 0°, -90°, 180°)
  // We need to order them by angle for rotation: 0, π/2, π/-π, -π/2
  const ordered = [0, Math.PI / 2, Math.PI, -Math.PI / 2] // CCW order
  let idx = 0
  let bestDiff = Math.abs(normaliseAngle(current - ordered[0]))
  for (let i = 1; i < ordered.length; i++) {
    const diff = Math.abs(normaliseAngle(current - ordered[i]))
    if (diff < bestDiff) {
      bestDiff = diff
      idx = i
    }
  }
  const next = (idx + (direction > 0 ? 1 : 3)) % 4
  return ordered[next]
}

/**
 * Update enemy ship AI — smoothly orbits the player like a dogfight.
 * Returns new projectiles spawned this frame (if any).
 *
 * Pass `asteroids` so the enemy holds fire when its line of sight to the
 * player is blocked by a live asteroid (no more shooting through rocks).
 */
export function updateEnemyShip(
  enemy: EnemyShip,
  player: Ship,
  dt: number,
  asteroids: Asteroid[] = [],
): EnemyProjectile[] {
  if (!enemy.alive) return []

  const newProjectiles: EnemyProjectile[] = []

  // --- Compute desired heading based on distance to player ---
  const dx = player.x - enemy.x
  const dy = player.y - enemy.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const toPlayer = Math.atan2(dy, dx)

  // Blend a radial component (toward/away from player) with a cardinal-
  // seeking component. The enemy prefers to sit at 90° angles (12/3/6/9
  // o'clock) from the player at ORBIT_DISTANCE.
  let radialWeight: number
  if (dist < ORBIT_DISTANCE * 0.7) {
    // Too close — push away
    radialWeight = -0.8
  } else if (dist > ORBIT_DISTANCE * 1.3) {
    // Too far — pull in
    radialWeight = 0.8
  } else {
    // In the sweet spot — gentle distance correction
    const t = (dist - ORBIT_DISTANCE) / (ORBIT_DISTANCE * 0.3)
    radialWeight = t * 0.3
  }

  // Strafe timer — move to the next cardinal position
  enemy.strafeTimer -= dt
  if (enemy.strafeTimer <= 0) {
    enemy.strafeTimer = ENEMY_STRAFE_CHANGE_INTERVAL * (0.7 + Math.random() * 0.6)
    enemy.strafeDir = -enemy.strafeDir
    enemy.targetCardinal = nextCardinal(enemy.targetCardinal, enemy.strafeDir)
  }

  // Idle timer — periodically drift to a stop when near target cardinal
  const inSweetSpot = dist >= ORBIT_DISTANCE * 0.7 && dist <= ORBIT_DISTANCE * 1.3
  enemy.idleTimer -= dt
  if (enemy.idleTimer <= 0) {
    if (enemy.idling) {
      enemy.idling = false
      enemy.idleTimer = ENEMY_IDLE_INTERVAL * (0.7 + Math.random() * 0.6)
    } else {
      enemy.idling = true
      enemy.idleTimer = ENEMY_IDLE_DURATION * (0.7 + Math.random() * 0.6)
    }
  }

  // The target position on the orbit circle at the desired cardinal angle
  const targetX = player.x + Math.cos(enemy.targetCardinal) * ORBIT_DISTANCE
  const targetY = player.y + Math.sin(enemy.targetCardinal) * ORBIT_DISTANCE
  const toTargetDx = targetX - enemy.x
  const toTargetDy = targetY - enemy.y
  const toTargetDist = Math.sqrt(toTargetDx * toTargetDx + toTargetDy * toTargetDy)

  // Only idle when close to the target cardinal and at the right distance
  const nearCardinal = toTargetDist < ORBIT_DISTANCE * 0.3
  const effectivelyIdle = enemy.idling && inSweetSpot && nearCardinal

  // Compute desired heading: blend radial correction with cardinal-seeking
  let desiredAngle: number
  const absRadial = Math.abs(radialWeight)
  if (absRadial > 0.3) {
    // Distance correction dominates — move radially with some cardinal pull
    const radialAngle = radialWeight >= 0 ? toPlayer : toPlayer + Math.PI
    const cardinalAngle = toTargetDist > 0.1 ? Math.atan2(toTargetDy, toTargetDx) : enemy.heading
    const cardinalWeight = 1 - absRadial
    const desiredX = Math.cos(radialAngle) * absRadial + Math.cos(cardinalAngle) * cardinalWeight
    const desiredY = Math.sin(radialAngle) * absRadial + Math.sin(cardinalAngle) * cardinalWeight
    desiredAngle = Math.atan2(desiredY, desiredX)
  } else {
    // In sweet spot — steer toward the target cardinal position
    desiredAngle = toTargetDist > 0.1 ? Math.atan2(toTargetDy, toTargetDx) : enemy.heading
  }

  // --- Smoothly steer heading toward desired angle ---
  const angleDiff = normaliseAngle(desiredAngle - enemy.heading)
  const maxTurn = ENEMY_TURN_RATE * dt
  if (Math.abs(angleDiff) <= maxTurn) {
    enemy.heading = desiredAngle
  } else {
    enemy.heading += Math.sign(angleDiff) * maxTurn
  }
  enemy.heading = normaliseAngle(enemy.heading)

  // --- Move along current heading (decelerate when idling) ---
  const speed = effectivelyIdle ? 0 : ENEMY_SPEED
  enemy.vx = Math.cos(enemy.heading) * speed
  enemy.vy = Math.sin(enemy.heading) * speed
  enemy.x += enemy.vx * dt
  enemy.y += enemy.vy * dt

  // --- Face toward player ---
  const toPlayerDx = player.x - enemy.x
  const toPlayerDy = player.y - enemy.y
  const toPlayerDist = Math.sqrt(toPlayerDx * toPlayerDx + toPlayerDy * toPlayerDy)
  enemy.rotation = Math.atan2(toPlayerDy, toPlayerDx) - Math.PI / 2

  // --- Shoot timer ---
  enemy.shootTimer -= dt
  if (enemy.shootTimer <= 0) {
    // Line-of-sight check: don't fire through asteroids.
    // If blocked, reset to a short retry interval instead of a full reload.
    const losBlocked =
      asteroids.length > 0 &&
      segmentBlockedByAsteroid(enemy.x, enemy.y, player.x, player.y, asteroids)

    if (losBlocked) {
      enemy.shootTimer = 0.25 + Math.random() * 0.25
    } else {
      enemy.shootTimer =
        ENEMY_SHOOT_MIN_INTERVAL +
        Math.random() * (ENEMY_SHOOT_INTERVAL - ENEMY_SHOOT_MIN_INTERVAL)

      // Fire toward player
      if (toPlayerDist > 0.1) {
        const nx = toPlayerDx / toPlayerDist
        const ny = toPlayerDy / toPlayerDist
        const proj = createEnemyProjectile(
          enemy.x + nx * 4,
          enemy.y + ny * 4,
          nx * ENEMY_PROJECTILE_SPEED,
          ny * ENEMY_PROJECTILE_SPEED,
          enemy.projectileDamage,
        )
        newProjectiles.push(proj)
      }
    }
  }

  // --- Asteroid collision — push the enemy out of any rock it overlaps ---
  for (const a of asteroids) {
    if (a.hp > 0) resolveEnemyAsteroidCollision(enemy, a)
  }

  // --- Sync mesh ---
  enemy.mesh.position.set(enemy.x, enemy.y, 0)
  enemy.mesh.rotation.z = enemy.rotation

  return newProjectiles
}

/**
 * Create a hostile projectile. Used by grunt enemies and the Arbiter alike;
 * `damage` is carried per-projectile so each shooter scales independently.
 */
export function createEnemyProjectile(
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number,
): EnemyProjectile {
  const mesh = createEnemyProjectileModel()
  mesh.position.set(x, y, 0)
  const angle = Math.atan2(vy, vx)
  mesh.rotation.z = angle - Math.PI / 2

  return {
    id: `enemy-proj-${nextEnemyProjectileId++}`,
    mesh,
    x,
    y,
    vx,
    vy,
    elapsed: 0,
    damage,
  }
}

// ---------------------------------------------------------------------------
// Enemy projectile update
// ---------------------------------------------------------------------------

/**
 * Update enemy projectile position. Returns false when expired.
 */
export function updateEnemyProjectile(proj: EnemyProjectile, dt: number): boolean {
  proj.elapsed += dt
  if (proj.elapsed >= ENEMY_PROJECTILE_LIFETIME) return false

  proj.x += proj.vx * dt
  proj.y += proj.vy * dt
  proj.mesh.position.set(proj.x, proj.y, 0)

  return true
}

/**
 * Dispose an enemy projectile mesh.
 */
export function disposeEnemyProjectile(proj: EnemyProjectile): void {
  for (const child of proj.mesh.children) {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (child.material instanceof THREE.Material) {
        child.material.dispose()
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Collision: player projectiles hitting enemy
// ---------------------------------------------------------------------------

/**
 * Check if any player projectiles hit the enemy ship.
 * Returns IDs of projectiles that hit, and mutates enemy HP.
 */
export function checkProjectileEnemyCollisions(
  projectiles: Projectile[],
  enemy: EnemyShip,
): { surviving: Projectile[]; hitProjectileIds: string[] } {
  if (!enemy.alive || enemy.hp <= 0) return { surviving: projectiles, hitProjectileIds: [] }

  const surviving: Projectile[] = []
  const hitProjectileIds: string[] = []

  for (const p of projectiles) {
    if (!enemy.alive) {
      surviving.push(p)
      continue
    }

    const dx = p.x - enemy.x
    const dy = p.y - enemy.y
    const distSq = dx * dx + dy * dy
    const minDist = PROJECTILE_RADIUS + ENEMY_COLLISION_RADIUS

    if (distSq < minDist * minDist) {
      enemy.hp = Math.max(0, enemy.hp - p.damage)
      hitProjectileIds.push(p.id)
      if (enemy.hp <= 0) {
        enemy.alive = false
      }
    } else {
      surviving.push(p)
    }
  }

  return { surviving, hitProjectileIds }
}

/**
 * Closest distance squared from a point to a line segment.
 */
function pointToSegmentDistSqLocal(
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
 * Apply lazer beam damage to an enemy if the beam passes through it.
 * Returns `{ hit: true, t }` if the beam intersects the enemy (where `t` is
 * the parameter along the beam at the enemy's center, in [0,1]), so the caller
 * can truncate the beam endpoint at the nearest enemy.
 */
export function checkBeamEnemyCollisions(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  damage: number,
  enemy: EnemyShip,
): { hit: boolean; t: number; killed: boolean } {
  if (!enemy.alive || enemy.hp <= 0) return { hit: false, t: 1, killed: false }

  const distSq = pointToSegmentDistSqLocal(enemy.x, enemy.y, startX, startY, endX, endY)
  if (distSq >= ENEMY_COLLISION_RADIUS * ENEMY_COLLISION_RADIUS) {
    return { hit: false, t: 1, killed: false }
  }

  const effective = damage * LAZER_DAMAGE_MULTIPLIER
  enemy.hp = Math.max(0, enemy.hp - effective)
  const killed = enemy.hp <= 0
  if (killed) enemy.alive = false

  const dx = endX - startX
  const dy = endY - startY
  const lenSq = dx * dx + dy * dy
  let t = 1
  if (lenSq > 0.0001) {
    t = Math.max(0, Math.min(1, ((enemy.x - startX) * dx + (enemy.y - startY) * dy) / lenSq))
  }
  return { hit: true, t, killed }
}

// ---------------------------------------------------------------------------
// Collision: enemy projectiles hitting player
// ---------------------------------------------------------------------------

/**
 * Check if any enemy projectiles hit the player ship.
 * Returns IDs of projectiles that hit.
 */
export function checkEnemyProjectilePlayerCollisions(
  projectiles: EnemyProjectile[],
  player: Ship,
): string[] {
  const hitIds: string[] = []

  for (const p of projectiles) {
    const dx = p.x - player.x
    const dy = p.y - player.y
    const distSq = dx * dx + dy * dy
    const minDist = ENEMY_PROJECTILE_RADIUS + SHIP_COLLISION_RADIUS

    if (distSq < minDist * minDist) {
      hitIds.push(p.id)
    }
  }

  return hitIds
}

// ---------------------------------------------------------------------------
// Shipwreck debris (explosion effect on enemy death)
// ---------------------------------------------------------------------------

/**
 * Create a shipwreck debris explosion at the enemy position.
 * Bigger and more dramatic than regular projectile explosions.
 */
export function createShipwreckDebris(x: number, y: number): ShipwreckDebris {
  const group = new THREE.Group()
  group.position.set(x, y, 0)

  const particles: ShipwreckDebris['particles'] = []

  for (let i = 0; i < WRECK_PARTICLE_COUNT; i++) {
    const angle = (i / WRECK_PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6
    const speed = WRECK_SPEED * (0.4 + Math.random() * 0.6)
    const color = WRECK_COLORS[i % WRECK_COLORS.length]

    // Vary particle sizes for interesting debris
    const size = 0.6 + Math.random() * 0.8
    const geo = new THREE.BoxGeometry(size, size, size)
    const mat = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      emissive: color,
      emissiveIntensity: 0.6,
    })
    const mesh = new THREE.Mesh(geo, mat)
    group.add(mesh)

    particles.push({
      mesh,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotSpeed: (Math.random() - 0.5) * 10,
    })
  }

  return { group, particles, elapsed: 0 }
}

/**
 * Update shipwreck debris animation. Returns true if still active.
 */
export function updateShipwreckDebris(debris: ShipwreckDebris, dt: number): boolean {
  debris.elapsed += dt
  if (debris.elapsed >= WRECK_DURATION) return false

  const progress = debris.elapsed / WRECK_DURATION

  for (const p of debris.particles) {
    p.mesh.position.x += p.vx * dt
    p.mesh.position.y += p.vy * dt
    p.mesh.rotation.z += p.rotSpeed * dt
    p.mesh.rotation.x += p.rotSpeed * 0.7 * dt

    // Shrink and fade out
    const scale = 1 - progress
    p.mesh.scale.setScalar(scale)

    // Reduce emissive as it fades
    const mat = p.mesh.material as THREE.MeshStandardMaterial
    mat.emissiveIntensity = 0.6 * (1 - progress)
  }

  return true
}

/**
 * Dispose shipwreck debris.
 */
export function disposeShipwreckDebris(debris: ShipwreckDebris): void {
  for (const p of debris.particles) {
    p.mesh.geometry.dispose()
    if (p.mesh.material instanceof THREE.Material) {
      p.mesh.material.dispose()
    }
  }
}

// ---------------------------------------------------------------------------
// Dispose enemy ship
// ---------------------------------------------------------------------------

export function disposeEnemyShip(enemy: EnemyShip): void {
  enemy.mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (child.material instanceof THREE.Material) {
        child.material.dispose()
      }
    }
  })
}

/** Reset enemy projectile ID counter (for testing). */
export function resetEnemyProjectileIdCounter(): void {
  nextEnemyProjectileId = 0
}
