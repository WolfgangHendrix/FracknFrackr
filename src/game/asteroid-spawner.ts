import type { Asteroid, AsteroidType, Comet } from './types'

/** Number of asteroids to spawn after tutorial. */
const ASTEROID_COUNT = 55

/** Minimum distance from station center to spawn asteroids (clears the dock area). */
const MIN_STATION_DISTANCE = 65

/** Maximum spawn distance from station center.
 *  Kept just inside the tier-0 radar range (540) so the full field is visible. */
const MAX_SPAWN_DISTANCE = 510

/** V-type (basaltic) asteroids spawn closer to the station so players discover them early. */
const V_TYPE_MAX_DISTANCE = 300

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
  'c-type': { 0: 55, 1: 20, 2: 10, 3: 5 },
  's-type': { 0: 45, 1: 18, 2: 9, 3: 5 },
  'm-type': { 0: 110, 1: 45, 2: 22, 3: 12 },
  'v-type': { 0: 160, 1: 60, 2: 30, 3: 16 },
  'd-type': { 0: 80, 1: 32, 2: 18, 3: 9 },
  comet: { 0: 35, 1: 14, 2: 8, 3: 4 },
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

    // Area-uniform scatter: picking distance linearly produces a donut because
    // annular area grows with r. Using sqrt gives equal probability per unit
    // of area, so rocks are visually scattered across the full disk.
    const angle = rand() * Math.PI * 2
    const minR = MIN_STATION_DISTANCE
    const maxR = maxDist
    const distance = Math.sqrt(minR * minR + rand() * (maxR * maxR - minR * minR))
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
 * Spawn a single asteroid area-uniformly across the radar disk but always
 * off-camera, for endless-mode field replenishment. Unlike {@link spawnEdgeAsteroid}
 * (a thin ring just past the camera, which reads as a tight circle on the
 * wider radar), this scatters new rocks anywhere from just outside the
 * viewport out to the radar rim, so the whole radar stays populated and rocks
 * "come up on the radar" at the edge as the player travels.
 *
 * @param view - Camera-visible world rectangle (to keep spawns off-screen)
 * @param radarRange - Current radar world range (sensor-tier aware)
 * @param shipX - Ship X (disk is centered on the ship, matching the radar)
 * @param shipY - Ship Y
 * @param id - Unique id for the new asteroid
 * @param rand - Random source (defaults to Math.random)
 */
export function spawnFieldAsteroid(
  view: ViewBounds,
  radarRange: number,
  shipX: number,
  shipY: number,
  id: string,
  rand: () => number = Math.random,
): Asteroid {
  const typeIdx = pickWeighted(TYPE_WEIGHTS, rand)
  const type = TYPE_WEIGHTS[typeIdx].type
  const sizeIdx = pickWeighted(SIZE_WEIGHTS, rand)
  const size = SIZE_WEIGHTS[sizeIdx].size
  const hp = HP_TABLE[type][size]

  // Inner radius clears the camera (plus a margin) so nothing pops into view;
  // outer radius reaches just past the radar rim so rocks appear at the edge.
  const innerR = Math.hypot(view.halfW, view.halfH) + 25
  const outerR = Math.max(innerR + 40, radarRange + 30)
  // Area-uniform radius so rocks scatter evenly across the disk (not bunched
  // at the inner ring).
  const distance = Math.sqrt(innerR * innerR + rand() * (outerR * outerR - innerR * innerR))
  const angle = rand() * Math.PI * 2
  const x = shipX + Math.cos(angle) * distance
  const y = shipY + Math.sin(angle) * distance

  // Slow random drift, matching the ambient field.
  const driftAngle = rand() * Math.PI * 2
  const driftSpeed = rand() * MAX_DRIFT_SPEED
  return {
    id,
    x,
    y,
    velocityX: Math.cos(driftAngle) * driftSpeed,
    velocityY: Math.sin(driftAngle) * driftSpeed,
    type,
    hp,
    maxHp: hp,
    size,
  }
}

/** Roaming comet hit points — a few solid shots to crack. */
export const COMET_HP = 30

/** Bonus scrap a destroyed comet drops (split across boxes). */
export const COMET_VALUE = 120

/** Comet travel speed (units/sec) — well above ambient asteroid drift. */
const COMET_SPEED_MIN = 26
const COMET_SPEED_MAX = 38

/**
 * Spawn a rare roaming comet: starts beyond the radar rim and streaks across
 * the field toward a jittered point near the ship, so the player sees it enter
 * from the edge of the radar and cross through. Fast, with a glowing tail
 * (rendered scene-side) and bonus scrap on destruction.
 */
export function spawnRoamingComet(
  view: ViewBounds,
  radarRange: number,
  shipX: number,
  shipY: number,
  id: string,
  rand: () => number = Math.random,
): Comet {
  // Start just beyond the radar rim so it slides into radar view.
  const startR = radarRange + 60 + rand() * 120
  const startAngle = rand() * Math.PI * 2
  const x = shipX + Math.cos(startAngle) * startR
  const y = shipY + Math.sin(startAngle) * startR

  // Aim across the field toward a jittered point near the ship so the path
  // cuts through the play area rather than clipping the corner.
  const aimJitter = 160
  const targetX = shipX + (rand() - 0.5) * aimJitter
  const targetY = shipY + (rand() - 0.5) * aimJitter
  const dirX = targetX - x
  const dirY = targetY - y
  const len = Math.hypot(dirX, dirY) || 1
  const speed = COMET_SPEED_MIN + rand() * (COMET_SPEED_MAX - COMET_SPEED_MIN)

  // View is unused for geometry (disk is ship-centered) but kept in the
  // signature for parity with the other spawners and future tuning.
  void view

  return {
    id,
    x,
    y,
    velocityX: (dirX / len) * speed,
    velocityY: (dirY / len) * speed,
    hp: COMET_HP,
    maxHp: COMET_HP,
    value: COMET_VALUE,
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

  // Spawn moon-size asteroids first spread around center
  for (let i = 0; i < moonCount; i++) {
    const angle = (i / moonCount) * Math.PI * 2 + rand() * 0.5
    const distance = 80 + rand() * 120
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

  // Spawn remaining asteroids spread across the play area using area-uniform
  // distribution so rocks fill the radar instead of clustering at the center.
  let attempts = 0
  const maxAttempts = count * 20
  const PROLOGUE_MIN_R = 50
  const PROLOGUE_MAX_R = 400
  while (asteroids.length < count + moonCount && attempts < maxAttempts) {
    attempts++

    const typeIdx = pickWeighted(TYPE_WEIGHTS, rand)
    const type = TYPE_WEIGHTS[typeIdx].type

    const angle = rand() * Math.PI * 2
    const distance = Math.sqrt(
      PROLOGUE_MIN_R * PROLOGUE_MIN_R +
        rand() * (PROLOGUE_MAX_R * PROLOGUE_MAX_R - PROLOGUE_MIN_R * PROLOGUE_MIN_R),
    )
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

/**
 * Spawn a reinforcement wave of prologue asteroids along the outer edge of
 * the containment field, drifting inward toward the play area. Unlike
 * {@link spawnPrologueField} this skips moons (the moons are a one-time
 * scenic beat) and uses label-prefixed IDs so the new rocks coexist with
 * the initial field's `prologue-asteroid-N` ids.
 *
 * The wave is placed on a ring just inside `fieldRadius` (so the containment
 * bubble's first-frame position-clamp doesn't yank them) with predominantly
 * inward velocity plus a small lateral wobble and per-rock speed jitter, so
 * they read as "drifting in from beyond" over a few seconds rather than
 * popping into existence inside the play area.
 */
export function spawnPrologueReinforcement(
  cx: number,
  cy: number,
  count: number,
  idLabel: string,
  fieldRadius: number,
  inwardSpeed: number,
  seed?: number,
): Asteroid[] {
  const asteroids: Asteroid[] = []
  const positions: { x: number; y: number }[] = []
  const spacingSq = PROLOGUE_MIN_SPACING * PROLOGUE_MIN_SPACING

  let s = seed ?? Date.now() % 2147483647
  function rand(): number {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }

  let attempts = 0
  const maxAttempts = count * 20
  while (asteroids.length < count && attempts < maxAttempts) {
    attempts++

    const typeIdx = pickWeighted(TYPE_WEIGHTS, rand)
    const type = TYPE_WEIGHTS[typeIdx].type

    // Spawn just inside the containment radius — a small radial inset both
    // avoids the bubble's outward-clamp and gives the rocks a tiny ring
    // depth so they don't read as a perfectly geometric circle.
    const angle = rand() * Math.PI * 2
    const radius = fieldRadius - 4 - rand() * 8
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius

    let tooClose = false
    for (const pos of positions) {
      const dx = x - pos.x
      const dy = y - pos.y
      if (dx * dx + dy * dy < spacingSq) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    const sizeIdx = pickWeighted(PROLOGUE_SIZE_WEIGHTS, rand)
    const size = PROLOGUE_SIZE_WEIGHTS[sizeIdx].size
    const hp = HP_TABLE[type][size]

    // Velocity: mostly inward toward (cx, cy) with a small tangential bias
    // so the wave doesn't funnel onto the origin. Per-rock speed jitter
    // staggers arrivals so the player sees rocks gliding into view over
    // several seconds instead of arriving in a synchronized clump.
    const inDirX = (cx - x) / radius
    const inDirY = (cy - y) / radius
    const tangX = -inDirY
    const tangY = inDirX
    const lateral = (rand() - 0.5) * 0.5
    const speedJitter = 0.6 + rand() * 0.8
    const speed = inwardSpeed * speedJitter
    const vx = (inDirX + tangX * lateral) * speed
    const vy = (inDirY + tangY * lateral) * speed

    asteroids.push({
      id: `prologue-${idLabel}-${asteroids.length}`,
      x,
      y,
      velocityX: vx,
      velocityY: vy,
      type,
      hp,
      maxHp: hp,
      size,
    })
    positions.push({ x, y })
  }

  return asteroids
}
