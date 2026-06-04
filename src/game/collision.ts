/**
 * Collision detection and resolution for game objects.
 */
import type { Ship } from '@/lib/schemas'
import type { Asteroid, Projectile, MiningTool } from './types'
import { WEAPON_AFFINITY } from './types'
import { PROJECTILE_RADIUS, LAZER_DAMAGE_MULTIPLIER } from './blaster-constants'
import {
  SHIP_COLLISION_RADIUS,
  ASTEROID_COLLISION_RADIUS,
  COLLISION_PUSH_BUFFER,
} from './collision-constants'
import { ASTEROID_SIZE_RADIUS } from './asteroid-model'

/** Base impulse magnitude (units/sec) applied to an asteroid by a single projectile hit. */
const PROJECTILE_IMPULSE = 6
/** Impulse magnitude per unit damage from a sustained beam (units/sec per damage). */
const BEAM_IMPULSE_PER_DAMAGE = 30

/** Apply a small velocity nudge to an asteroid in the given direction. */
function nudgeAsteroid(a: Asteroid, dirX: number, dirY: number, impulse: number): void {
  // Bigger asteroids resist more. size 0 = moon (heaviest), size 3 = small.
  const sizeFactor = 1 / (1 + (3 - a.size))
  const k = impulse * sizeFactor
  a.velocityX += dirX * k
  a.velocityY += dirY * k
}

/**
 * Check if two circles overlap.
 */
function circlesOverlap(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  const distSq = dx * dx + dy * dy
  const radiiSum = r1 + r2
  return distSq < radiiSum * radiiSum
}

/**
 * Resolve ship-asteroid collision by pushing the ship out of the asteroid.
 * Mutates the ship position and zeroes velocity toward the asteroid.
 *
 * When `plowThrough` is set (a boosting maxed Drill Nose driving into the rock)
 * the contact is still reported so the drill damage lands, but the ship is
 * neither pushed out nor slowed — the dash blasts straight through.
 */
export function resolveShipAsteroidCollision(
  ship: Ship,
  asteroid: Asteroid,
  plowThrough = false,
): boolean {
  const dx = ship.x - asteroid.x
  const dy = ship.y - asteroid.y
  const distSq = dx * dx + dy * dy
  const asteroidRadius = ASTEROID_SIZE_RADIUS[asteroid.size] ?? ASTEROID_COLLISION_RADIUS
  const minDist = SHIP_COLLISION_RADIUS + asteroidRadius

  if (distSq >= minDist * minDist) return false

  if (plowThrough) return true

  const dist = Math.sqrt(distSq)

  // If ship is exactly on asteroid center, push in an arbitrary direction
  if (dist < 0.001) {
    ship.x = asteroid.x + minDist + COLLISION_PUSH_BUFFER
    ship.velocityX = 0
    ship.velocityY = 0
    return true
  }

  // Normalize direction from asteroid to ship
  const nx = dx / dist
  const ny = dy / dist

  // Push ship out to the edge + buffer
  const pushDist = minDist + COLLISION_PUSH_BUFFER - dist
  ship.x += nx * pushDist
  ship.y += ny * pushDist

  // Cancel velocity component toward the asteroid
  const velDot = ship.velocityX * nx + ship.velocityY * ny
  if (velDot < 0) {
    const asteroidMassFactor = Math.max(1, 5 - asteroid.size)
    const impact = -velDot
    ship.velocityX += impact * nx * 0.35
    ship.velocityY += impact * ny * 0.35
    asteroid.velocityX -= nx * impact * (0.28 / asteroidMassFactor)
    asteroid.velocityY -= ny * impact * (0.28 / asteroidMassFactor)
  }

  return true
}

/**
 * Resolve enemy-asteroid collision by pushing the enemy out of the asteroid.
 * Mirrors resolveShipAsteroidCollision but operates on the enemy's vx/vy
 * fields and its own `collisionRadius` (which varies by enemy kind).
 * Mutates the enemy and returns true if a collision was resolved.
 */
export function resolveEnemyAsteroidCollision(
  enemy: { x: number; y: number; vx: number; vy: number; collisionRadius: number },
  asteroid: Asteroid,
): boolean {
  const dx = enemy.x - asteroid.x
  const dy = enemy.y - asteroid.y
  const distSq = dx * dx + dy * dy
  const asteroidRadius = ASTEROID_SIZE_RADIUS[asteroid.size] ?? ASTEROID_COLLISION_RADIUS
  const minDist = enemy.collisionRadius + asteroidRadius

  if (distSq >= minDist * minDist) return false

  const dist = Math.sqrt(distSq)

  // If enemy is exactly on the asteroid center, push in an arbitrary direction
  if (dist < 0.001) {
    enemy.x = asteroid.x + minDist + COLLISION_PUSH_BUFFER
    enemy.vx = 0
    enemy.vy = 0
    return true
  }

  // Normalize direction from asteroid to enemy
  const nx = dx / dist
  const ny = dy / dist

  // Push enemy out to the edge + buffer
  const pushDist = minDist + COLLISION_PUSH_BUFFER - dist
  enemy.x += nx * pushDist
  enemy.y += ny * pushDist

  // Cancel velocity component heading into the asteroid
  const velDot = enemy.vx * nx + enemy.vy * ny
  if (velDot < 0) {
    enemy.vx -= velDot * nx
    enemy.vy -= velDot * ny
  }

  return true
}

/** Bounciness of asteroid-asteroid collisions (0 = inelastic, 1 = elastic). */
const ASTEROID_RESTITUTION = 0.4

/** Collision mass of an asteroid — scales with area (radius squared). */
function asteroidMass(a: Asteroid): number {
  const r = ASTEROID_SIZE_RADIUS[a.size] ?? ASTEROID_COLLISION_RADIUS
  return r * r
}

/**
 * Resolve collisions between every pair of live asteroids: separate any
 * overlapping pair along the contact normal and exchange momentum so heavier
 * (larger) rocks shrug off smaller ones. Mutates asteroid positions/velocities.
 */
export function resolveAsteroidAsteroidCollisions(asteroids: Asteroid[]): void {
  for (let i = 0; i < asteroids.length; i++) {
    const a = asteroids[i]
    if (a.hp <= 0) continue
    const ra = ASTEROID_SIZE_RADIUS[a.size] ?? ASTEROID_COLLISION_RADIUS

    for (let j = i + 1; j < asteroids.length; j++) {
      const b = asteroids[j]
      if (b.hp <= 0) continue
      const rb = ASTEROID_SIZE_RADIUS[b.size] ?? ASTEROID_COLLISION_RADIUS

      const dx = b.x - a.x
      const dy = b.y - a.y
      const minDist = ra + rb
      const distSq = dx * dx + dy * dy
      if (distSq >= minDist * minDist) continue

      let dist = Math.sqrt(distSq)
      let nx: number
      let ny: number
      if (dist < 0.001) {
        // Concentric — separate along an arbitrary axis
        nx = 1
        ny = 0
        dist = 0
      } else {
        nx = dx / dist
        ny = dy / dist
      }

      const invA = 1 / asteroidMass(a)
      const invB = 1 / asteroidMass(b)
      const invSum = invA + invB

      // --- Positional separation, weighted by inverse mass ---
      const overlap = minDist - dist + COLLISION_PUSH_BUFFER
      a.x -= nx * overlap * (invA / invSum)
      a.y -= ny * overlap * (invA / invSum)
      b.x += nx * overlap * (invB / invSum)
      b.y += ny * overlap * (invB / invSum)

      // --- Velocity response: impulse along the contact normal ---
      const rvx = b.velocityX - a.velocityX
      const rvy = b.velocityY - a.velocityY
      const velAlongNormal = rvx * nx + rvy * ny
      if (velAlongNormal > 0) continue // already separating

      const impulse = (-(1 + ASTEROID_RESTITUTION) * velAlongNormal) / invSum
      const ix = impulse * nx
      const iy = impulse * ny
      a.velocityX -= ix * invA
      a.velocityY -= iy * invA
      b.velocityX += ix * invB
      b.velocityY += iy * invB
    }
  }
}

export interface ProjectileHit {
  projectileId: string
  asteroidId: string
  damage: number
  x: number
  y: number
  /** True when a blaster projectile bounced off a crystalline asteroid. */
  deflected?: boolean
}

/**
 * Check all projectiles against all asteroids.
 * Returns hits and the surviving projectiles (those that didn't hit anything).
 * Mutates asteroid HP and applies a small impact impulse along the projectile's
 * velocity direction. Blaster projectiles deflect off crystalline asteroids
 * (no damage dealt, hit still reported with `deflected: true`).
 * Lazer projectiles deal bonus damage to all asteroid types.
 */
export function checkProjectileAsteroidCollisions(
  projectiles: Projectile[],
  asteroids: Asteroid[],
): { surviving: Projectile[]; hits: ProjectileHit[] } {
  const hits: ProjectileHit[] = []
  const surviving: Projectile[] = []

  for (const p of projectiles) {
    let hitSomething = false
    for (const a of asteroids) {
      if (a.hp <= 0) continue
      const aRadius = ASTEROID_SIZE_RADIUS[a.size] ?? ASTEROID_COLLISION_RADIUS
      if (circlesOverlap(p.x, p.y, PROJECTILE_RADIUS, a.x, a.y, aRadius)) {
        // Affinity matrix replaces the old hard "v-type deflects everything
        // except lazer" gate — wrong-tool shots still chip, they just do
        // less damage and impart a weaker nudge to telegraph the mismatch.
        const tool: MiningTool = p.tool === 'missile' ? 'blaster' : p.tool
        const affinity = WEAPON_AFFINITY[a.type][tool]
        const lazerBoost = p.tool === 'lazer' ? LAZER_DAMAGE_MULTIPLIER : 1
        const effectiveDamage = Math.max(1, Math.ceil(p.damage * lazerBoost * affinity))
        a.hp = Math.max(0, a.hp - effectiveDamage)
        const vmag = Math.hypot(p.velocityX, p.velocityY)
        if (vmag > 0.001) {
          nudgeAsteroid(
            a,
            p.velocityX / vmag,
            p.velocityY / vmag,
            PROJECTILE_IMPULSE * Math.max(0.3, affinity),
          )
        }
        hits.push({
          projectileId: p.id,
          asteroidId: a.id,
          damage: effectiveDamage,
          x: p.x,
          y: p.y,
          // Per-hit `deflected` is retained for any future visual feedback
          // (a spark / clang when blaster vs basalt). It used to trigger a
          // tutorial popup that nagged the player to buy the Lazer; that
          // popup was removed because the affinity matrix now lets the
          // blaster chip basalt slowly, so the "you NEED the Lazer" claim
          // was outdated and the modal had recurring input-routing bugs.
          deflected: affinity < 0.35,
        })
        hitSomething = true
        break // one projectile hits one asteroid
      }
    }
    if (!hitSomething) {
      surviving.push(p)
    }
  }

  return { surviving, hits }
}

export interface BeamHit {
  asteroidId: string
  damage: number
  x: number
  y: number
  deflected?: boolean
}

/**
 * Closest distance from a point (cx, cy) to a line segment (ax, ay)→(bx, by).
 */
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
 * Return true if any live asteroid blocks the line segment from
 * (x1,y1) to (x2,y2). Used for line-of-sight checks (auto-fire targeting,
 * enemy shot suppression).
 */
export function segmentBlockedByAsteroid(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  asteroids: Asteroid[],
): boolean {
  for (const a of asteroids) {
    if (a.hp <= 0) continue
    const aRadius = ASTEROID_SIZE_RADIUS[a.size] ?? ASTEROID_COLLISION_RADIUS
    const distSq = pointToSegmentDistSq(a.x, a.y, x1, y1, x2, y2)
    if (distSq < aRadius * aRadius) return true
  }
  return false
}

/**
 * Check a beam (line segment) against all live asteroids.
 * Returns all asteroid hits along the beam and the hit point of the nearest one
 * (used for beam endpoint rendering). Applies a stronger impulse to the
 * nearest asteroid (it's absorbing the beam, not the ones further along).
 */
export function checkBeamAsteroidCollisions(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  damage: number,
  asteroids: Asteroid[],
): { hits: BeamHit[]; beamEndX: number; beamEndY: number } {
  const hits: BeamHit[] = []
  let nearestT = 1.0
  let nearestAsteroidId: string | null = null
  const dx = endX - startX
  const dy = endY - startY
  const beamLen = Math.hypot(dx, dy)
  const dirX = beamLen > 0.001 ? dx / beamLen : 0
  const dirY = beamLen > 0.001 ? dy / beamLen : 0

  for (const a of asteroids) {
    if (a.hp <= 0) continue
    const aRadius = ASTEROID_SIZE_RADIUS[a.size] ?? ASTEROID_COLLISION_RADIUS
    const distSq = pointToSegmentDistSq(a.x, a.y, startX, startY, endX, endY)
    if (distSq < aRadius * aRadius) {
      // Beam is always lazer; affinity modulates how preferred it is on each
      // asteroid type. Basaltic/exotic rocks take full damage; softer rocks
      // still chip but slower (better mined with the blaster).
      const affinity = WEAPON_AFFINITY[a.type].lazer
      const effectiveDamage = Math.max(1, Math.ceil(damage * LAZER_DAMAGE_MULTIPLIER * affinity))
      a.hp = Math.max(0, a.hp - effectiveDamage)
      hits.push({ asteroidId: a.id, damage: effectiveDamage, x: a.x, y: a.y })
      // Find parameter t along the beam where it enters the asteroid
      const lenSq = dx * dx + dy * dy
      if (lenSq > 0.0001) {
        const t = ((a.x - startX) * dx + (a.y - startY) * dy) / lenSq
        if (t < nearestT) {
          nearestT = Math.max(0, t)
          nearestAsteroidId = a.id
        }
      }
    }
  }

  // Push only the nearest asteroid — it's the one actually absorbing the beam.
  if (nearestAsteroidId !== null && (dirX !== 0 || dirY !== 0)) {
    const a = asteroids.find((x) => x.id === nearestAsteroidId)
    if (a) nudgeAsteroid(a, dirX, dirY, damage * BEAM_IMPULSE_PER_DAMAGE)
  }

  return {
    hits,
    beamEndX: startX + dx * nearestT,
    beamEndY: startY + dy * nearestT,
  }
}
