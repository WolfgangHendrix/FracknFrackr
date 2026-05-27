import type { Asteroid, AsteroidType } from './types'

/** Number of asteroids to spawn after tutorial. */
const ASTEROID_COUNT = 40

/** Minimum distance from station center to spawn asteroids. */
const MIN_STATION_DISTANCE = 80

/** Maximum spawn distance from station center. */
const MAX_SPAWN_DISTANCE = 350

/** V-type (basaltic) asteroids spawn closer to the station so players discover them early. */
const V_TYPE_MAX_DISTANCE = 180

/** Minimum spacing between asteroids. */
const MIN_ASTEROID_SPACING = 20

/**
 * HP values per asteroid type and size. Size 0 = moon (prologue only).
 *
 * Types map to real-world spectral classes: C (carbonaceous), S (silicaceous),
 * M (metallic), V (vestoid/basaltic), D (dark/organic). Comet is kept as a
 * non-spectral icy outlier alongside the five classes.
 */
const HP_TABLE: Record<AsteroidType, Record<number, number>> = {
  'c-type': { 0: 40, 1: 15, 2: 8, 3: 4 },
  's-type': { 0: 30, 1: 12, 2: 7, 3: 4 },
  'm-type': { 0: 60, 1: 25, 2: 14, 3: 8 },
  'v-type': { 0: 80, 1: 30, 2: 18, 3: 10 },
  'd-type': { 0: 50, 1: 22, 2: 13, 3: 7 },
  comet: { 0: 45, 1: 18, 2: 10, 3: 5 },
}

/**
 * Weighted type distribution. Weights track real belt abundance with mild
 * game-feel softening on the rare tiers so high-multiplier loot is reachable
 * within a normal run.
 */
const TYPE_WEIGHTS: { type: AsteroidType; weight: number }[] = [
  { type: 'c-type', weight: 75 },
  { type: 's-type', weight: 17 },
  { type: 'm-type', weight: 10 },
  { type: 'v-type', weight: 5 },
  { type: 'd-type', weight: 2 },
  { type: 'comet', weight: 10 },
]

/** Weighted size distribution (1=large, 2=medium, 3=small). */
const SIZE_WEIGHTS: { size: number; weight: number }[] = [
  { size: 1, weight: 30 },
  { size: 2, weight: 40 },
  { size: 3, weight: 30 },
]

/** Maximum drift speed for asteroids (units/sec). */
const MAX_DRIFT_SPEED = 3

function pickWeighted<T>(items: { weight: number }[] & { type?: T }[], rand: () => number): number {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  let r = rand() * total
  for (let i = 0; i < items.length; i++) {
    r -= items[i].weight
    if (r <= 0) return i
  }
  return items.length - 1
}

/**
 * Generate a field of asteroids spread around a center point (the station).
 * Returns asteroid data objects ready to be added to the game state.
 *
 * @param stationX - Station X position (asteroids avoid this area)
 * @param stationY - Station Y position
 * @param seed - Random seed for reproducible generation
 */
export function spawnAsteroidField(stationX: number, stationY: number, seed?: number): Asteroid[] {
  const asteroids: Asteroid[] = []
  const positions: { x: number; y: number }[] = []

  // Simple seeded random
  let s = seed ?? Date.now() % 2147483647
  function rand(): number {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }

  let attempts = 0
  const maxAttempts = ASTEROID_COUNT * 20

  while (asteroids.length < ASTEROID_COUNT && attempts < maxAttempts) {
    attempts++

    const typeIdx = pickWeighted(TYPE_WEIGHTS, rand)
    const type = TYPE_WEIGHTS[typeIdx].type

    // V-type (basaltic) asteroids spawn closer to the station
    const maxDist = type === 'v-type' ? V_TYPE_MAX_DISTANCE : MAX_SPAWN_DISTANCE

    // Random position in a ring around the station
    const angle = rand() * Math.PI * 2
    const distance = MIN_STATION_DISTANCE + rand() * (maxDist - MIN_STATION_DISTANCE)
    const x = stationX + Math.cos(angle) * distance
    const y = stationY + Math.sin(angle) * distance

    // Check minimum spacing against existing asteroids
    let tooClose = false
    for (const pos of positions) {
      const dx = x - pos.x
      const dy = y - pos.y
      if (dx * dx + dy * dy < MIN_ASTEROID_SPACING * MIN_ASTEROID_SPACING) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue
    const sizeIdx = pickWeighted(SIZE_WEIGHTS, rand)
    const size = SIZE_WEIGHTS[sizeIdx].size

    const hp = HP_TABLE[type][size]

    // Slow random drift
    const driftAngle = rand() * Math.PI * 2
    const driftSpeed = rand() * MAX_DRIFT_SPEED
    const velocityX = Math.cos(driftAngle) * driftSpeed
    const velocityY = Math.sin(driftAngle) * driftSpeed

    asteroids.push({
      id: `asteroid-${asteroids.length}`,
      x,
      y,
      velocityX,
      velocityY,
      type,
      hp,
      maxHp: hp,
      size,
    })
    positions.push({ x, y })
  }

  return asteroids
}

/** Camera-visible world rectangle, used to place replenished rocks off-screen. */
export interface ViewBounds {
  centerX: number
  centerY: number
  halfW: number
  halfH: number
}

/**
 * Spawn a single asteroid just outside the camera view, drifting roughly
 * inward so it enters play. Used for endless-mode field replenishment.
 *
 * @param view - Camera-visible world rectangle
 * @param id - Unique id for the new asteroid
 * @param rand - Random source (defaults to Math.random)
 */
export function spawnEdgeAsteroid(
  view: ViewBounds,
  id: string,
  rand: () => number = Math.random,
): Asteroid {
  const typeIdx = pickWeighted(TYPE_WEIGHTS, rand)
  const type = TYPE_WEIGHTS[typeIdx].type
  const sizeIdx = pickWeighted(SIZE_WEIGHTS, rand)
  const size = SIZE_WEIGHTS[sizeIdx].size
  const hp = HP_TABLE[type][size]

  // Place on a ring that fully encloses the viewport so it spawns off-screen.
  const ringRadius = Math.hypot(view.halfW, view.halfH) + 15 + rand() * 30
  const angle = rand() * Math.PI * 2
  const x = view.centerX + Math.cos(angle) * ringRadius
  const y = view.centerY + Math.sin(angle) * ringRadius

  // Drift generally toward the viewport centre, with some spread.
  const inward = Math.atan2(view.centerY - y, view.centerX - x)
  const drift = inward + (rand() - 0.5) * 1.4
  const driftSpeed = 2 + rand() * MAX_DRIFT_SPEED

  return {
    id,
    x,
    y,
    velocityX: Math.cos(drift) * driftSpeed,
    velocityY: Math.sin(drift) * driftSpeed,
    type,
    hp,
    maxHp: hp,
    size,
  }
}

/** Prologue-specific size weights: biased toward large asteroids (moons are spawned explicitly). */
const PROLOGUE_SIZE_WEIGHTS: { size: number; weight: number }[] = [
  { size: 1, weight: 50 },
  { size: 2, weight: 35 },
  { size: 3, weight: 15 },
]

/** Minimum spacing for prologue field (tighter than normal). */
const PROLOGUE_MIN_SPACING = 12

/** Spawn a dense asteroid field for the prologue sequence. */
export function spawnPrologueField(
  cx: number,
  cy: number,
  count: number,
  moonCount: number,
  seed?: number,
): Asteroid[] {
  const asteroids: Asteroid[] = []
  const positions: { x: number; y: number }[] = []

  let s = seed ?? Date.now() % 2147483647
  function rand(): number {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }

  // Spawn moon-size asteroids first in a ring around center
  for (let i = 0; i < moonCount; i++) {
    const angle = (i / moonCount) * Math.PI * 2 + rand() * 0.5
    const distance = 60 + rand() * 40
    const x = cx + Math.cos(angle) * distance
    const y = cy + Math.sin(angle) * distance

    const typeIdx = pickWeighted(TYPE_WEIGHTS, rand)
    const type = TYPE_WEIGHTS[typeIdx].type
    const hp = HP_TABLE[type][0]

    const driftAngle = rand() * Math.PI * 2
    const driftSpeed = rand() * 1.5
    asteroids.push({
      id: `prologue-moon-${i}`,
      x,
      y,
      velocityX: Math.cos(driftAngle) * driftSpeed,
      velocityY: Math.sin(driftAngle) * driftSpeed,
      type,
      hp,
      maxHp: hp,
      size: 0,
    })
    positions.push({ x, y })
  }

  // Spawn remaining asteroids in a tighter ring
  let attempts = 0
  const maxAttempts = count * 20
  while (asteroids.length < count + moonCount && attempts < maxAttempts) {
    attempts++

    const typeIdx = pickWeighted(TYPE_WEIGHTS, rand)
    const type = TYPE_WEIGHTS[typeIdx].type

    const angle = rand() * Math.PI * 2
    const distance = 30 + rand() * 90
    const x = cx + Math.cos(angle) * distance
    const y = cy + Math.sin(angle) * distance

    let tooClose = false
    for (const pos of positions) {
      const dx = x - pos.x
      const dy = y - pos.y
      if (dx * dx + dy * dy < PROLOGUE_MIN_SPACING * PROLOGUE_MIN_SPACING) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    const sizeIdx = pickWeighted(PROLOGUE_SIZE_WEIGHTS, rand)
    const size = PROLOGUE_SIZE_WEIGHTS[sizeIdx].size
    const hp = HP_TABLE[type][size]

    const driftAngle = rand() * Math.PI * 2
    const driftSpeed = rand() * MAX_DRIFT_SPEED
    asteroids.push({
      id: `prologue-asteroid-${asteroids.length}`,
      x,
      y,
      velocityX: Math.cos(driftAngle) * driftSpeed,
      velocityY: Math.sin(driftAngle) * driftSpeed,
      type,
      hp,
      maxHp: hp,
      size,
    })
    positions.push({ x, y })
  }

  return asteroids
}
