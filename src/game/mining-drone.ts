import type { Asteroid } from './types'
import { MINERAL_BY_ASTEROID } from './types'
import { SCRAP_VALUE_BY_MINERAL } from '@/hooks/useGameState'

/**
 * Player-built mining drone. Tier of the `drone` upgrade caps how many can
 * be active at once; each individual drone is constructed at the trade
 * station for {@link MINING_DRONE_BUILD_COST} scrap, so losing one to enemy
 * fire still hurts. The state machine is intentionally simple — no
 * dependency on the full game loop, so it can be unit-tested in isolation.
 */
export type MiningDroneState = 'seeking' | 'drilling' | 'returning' | 'retreating'

export interface MiningDrone {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  state: MiningDroneState
  /** Asteroid currently being drilled/sought. Cleared on completion or retreat. */
  targetId: string | null
  /** Scrap value accumulated from the current drilling job; deposited on dock. */
  carriedScrap: number
  hp: number
  /** Seconds left in the current retreat cooldown (drone idles near ship). */
  retreatTimer: number
}

export const MINING_DRONE_MAX_HP = 3
export const MINING_DRONE_BUILD_COST = 60
export const MINING_DRONE_COLLISION_RADIUS = 3
/** Speed while pursuing or drilling (units/sec). */
const SEEK_SPEED = 38
/** Speed while returning with cargo — intentionally faster. */
const RETURN_SPEED = 75
/** Drill damage per second. Low enough that drones aren't strictly better than weapons. */
const DRILL_DPS = 9
/** Distance at which the drone "attaches" and begins drilling. */
const DRILL_RANGE = 6
/** Distance at which a returning drone is considered docked. */
const DOCK_RANGE = 4
/** How long a retreating drone hides near the ship before re-engaging. */
const RETREAT_DURATION = 4

let nextDroneId = 1

export function createMiningDrone(spawnX: number, spawnY: number): MiningDrone {
  return {
    id: `mdrone-${nextDroneId++}`,
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    state: 'seeking',
    targetId: null,
    carriedScrap: 0,
    hp: MINING_DRONE_MAX_HP,
    retreatTimer: 0,
  }
}

function pickTargetAsteroid(drone: MiningDrone, asteroids: readonly Asteroid[]): Asteroid | null {
  // Prefer 'large' rocks per the design spec — drones are the only safe way
  // to mine the biggest asteroids without committing the ship to a long
  // engagement.
  let best: Asteroid | null = null
  let bestDistSq = Infinity
  for (const a of asteroids) {
    if (a.hp <= 0) continue
    // Size: 0=moon, 1=large, 2=medium, 3=small. Drones go after the two
// biggest classes — they're the ones the player would otherwise spend a
// long time chipping at manually.
if (a.size > 1) continue
    const dSq = (a.x - drone.x) ** 2 + (a.y - drone.y) ** 2
    if (dSq < bestDistSq) {
      bestDistSq = dSq
      best = a
    }
  }
  return best
}

export interface MiningDroneTickResult {
  /** Scrap deposited to the player wallet this tick (sum across drones). */
  scrapDeposited: number
  /** IDs of drones that just completed a dock (for SFX hook). */
  dockedDrones: string[]
}

/**
 * Advance every mining drone by `dt` seconds. Asteroids are mutated in place
 * (hp deducted while drilling). Returns aggregated effects so the caller can
 * route them into the React/UI layer.
 */
export function updateMiningDrones(
  drones: MiningDrone[],
  asteroids: readonly Asteroid[],
  shipX: number,
  shipY: number,
  dt: number,
): MiningDroneTickResult {
  const result: MiningDroneTickResult = { scrapDeposited: 0, dockedDrones: [] }
  const asteroidById = new Map(asteroids.map((a) => [a.id, a]))

  for (const drone of drones) {
    switch (drone.state) {
      case 'retreating': {
        // Hug the ship at high speed, count down, then re-engage.
        const dx = shipX - drone.x
        const dy = shipY - drone.y
        const d = Math.hypot(dx, dy)
        if (d > 0.1) {
          const inv = RETURN_SPEED / d
          drone.x += dx * inv * dt
          drone.y += dy * inv * dt
        }
        drone.retreatTimer -= dt
        if (drone.retreatTimer <= 0) {
          drone.state = 'seeking'
          drone.targetId = null
        }
        break
      }

      case 'seeking': {
        const target = pickTargetAsteroid(drone, asteroids)
        if (!target) {
          // No work — orbit the ship lazily so the player can see we're idle.
          drone.targetId = null
          const dx = shipX - drone.x
          const dy = shipY - drone.y
          const d = Math.hypot(dx, dy)
          if (d > 12) {
            const inv = SEEK_SPEED * 0.4 / d
            drone.x += dx * inv * dt
            drone.y += dy * inv * dt
          }
          break
        }
        drone.targetId = target.id
        const dx = target.x - drone.x
        const dy = target.y - drone.y
        const d = Math.hypot(dx, dy)
        if (d < DRILL_RANGE) {
          drone.state = 'drilling'
          drone.vx = 0
          drone.vy = 0
        } else {
          const inv = SEEK_SPEED / d
          drone.x += dx * inv * dt
          drone.y += dy * inv * dt
        }
        break
      }

      case 'drilling': {
        const target = drone.targetId ? asteroidById.get(drone.targetId) : null
        if (!target || target.hp <= 0 || target.size > 1) {
          // Asteroid gone or shrunk — head home with whatever we've got.
          drone.state = drone.carriedScrap > 0 ? 'returning' : 'seeking'
          drone.targetId = null
          break
        }
        // Hold near the target; small drift to look alive.
        const dx = target.x - drone.x
        const dy = target.y - drone.y
        const d = Math.hypot(dx, dy)
        if (d > DRILL_RANGE * 0.7 && d > 0.001) {
          const inv = SEEK_SPEED * 0.5 / d
          drone.x += dx * inv * dt
          drone.y += dy * inv * dt
        }
        const damage = DRILL_DPS * dt
        const before = target.hp
        target.hp = Math.max(0, target.hp - damage)
        const dealt = before - target.hp
        // Convert damage to scrap using the asteroid's mineral value, scaled
        // so a fully drilled large rock pays out roughly in line with what
        // the player would earn breaking + collecting it manually.
        const mineral = MINERAL_BY_ASTEROID[target.type]
        const rate = SCRAP_VALUE_BY_MINERAL[mineral] * 0.18
        drone.carriedScrap += dealt * rate
        if (target.hp <= 0) {
          drone.state = 'returning'
          drone.targetId = null
        }
        break
      }

      case 'returning': {
        const dx = shipX - drone.x
        const dy = shipY - drone.y
        const d = Math.hypot(dx, dy)
        if (d < DOCK_RANGE) {
          const deposit = Math.round(drone.carriedScrap)
          if (deposit > 0) {
            result.scrapDeposited += deposit
            result.dockedDrones.push(drone.id)
          }
          drone.carriedScrap = 0
          drone.state = 'seeking'
          drone.targetId = null
        } else if (d > 0.001) {
          const inv = RETURN_SPEED / d
          drone.x += dx * inv * dt
          drone.y += dy * inv * dt
        }
        break
      }
    }
  }
  return result
}

/**
 * Apply a hit from an enemy projectile to a drone. If the drone was carrying
 * scrap, the load is "stolen" — returned to the caller so it can be added to
 * the enemy's coffers (or simply lost) — and the drone enters a retreat
 * cooldown rather than dying outright. The drone is only destroyed when its
 * HP runs out across multiple hits.
 */
export interface DroneHitResult {
  destroyed: boolean
  stolenScrap: number
}

export function applyDroneHit(drone: MiningDrone, damage: number): DroneHitResult {
  drone.hp = Math.max(0, drone.hp - damage)
  const stolenScrap = Math.round(drone.carriedScrap)
  drone.carriedScrap = 0
  if (drone.hp <= 0) {
    return { destroyed: true, stolenScrap }
  }
  drone.state = 'retreating'
  drone.targetId = null
  drone.retreatTimer = RETREAT_DURATION
  return { destroyed: false, stolenScrap }
}
