/**
 * The Arbiter — endless-mode recurring boss.
 *
 * Each time the Ledger crosses a threshold the Arbiter returns as a higher
 * Mark: more hull, faster volleys, more reinforcements. The player chooses
 * each encounter — destroy it for a big payout and Ledger relief, or simply
 * survive until it withdraws.
 *
 * This module owns pure Arbiter logic (state, movement, attacks, collision).
 * Rendering lives in scene.ts; arbiter-model.ts builds the mesh.
 */

import type { Ship } from '@/lib/schemas'
import type { Projectile } from './types'
import { createEnemyProjectile } from './enemy-ship'
import type { EnemyProjectile } from './enemy-ship'
import { PROJECTILE_RADIUS, LAZER_DAMAGE_MULTIPLIER } from './blaster-constants'

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/**
 * Collision radius — covers the Arbiter's dense core plus its inner blade
 * wings. The visible silhouette extends out to ~7 voxels (~3.5 world units)
 * at the blade tips and the body diamond is ~2.5 wide, but a single boss
 * disc this size feels far better than the player having to thread bolts
 * between blade arms. Hit-feedback now matches the visual bulk.
 */
export const ARBITER_COLLISION_RADIUS = 12

/** Movement speed (units/sec) per phase. */
const ARBITER_SPEED_P1 = 22
const ARBITER_SPEED_P2 = 32

/** Preferred distance the Arbiter holds from the player. */
const ARBITER_ORBIT_DISTANCE = 50

/** Speed the Arbiter retreats at once it gives up the hunt. */
const ARBITER_WITHDRAW_SPEED = 78

/** Distance from the player at which a withdrawing Arbiter is gone for good. */
const ARBITER_WITHDRAW_DISTANCE = 470

/** Arbiter projectile speed (slower than grunts — volume, not velocity). */
const ARBITER_PROJECTILE_SPEED = 95

/** Angular gap between bolts in a volley fan (radians). */
const ARBITER_VOLLEY_SPREAD = 0.26

/** Ominous constant spin rate of the construct (radians/sec). */
const ARBITER_SPIN_RATE = 0.35

/** Seconds the player must survive an encounter before the Arbiter withdraws. */
export const ARBITER_EVADE_TIME = 48

/** Grace period before the Arbiter's first volley. */
const ARBITER_FIRST_VOLLEY_DELAY = 2.5

// --- Tractor beam (capture attack) ----------------------------------------

/** Length of the tractor capture cone. */
export const TRACTOR_RANGE = 115

/** Half-angle of the capture cone (radians). */
export const TRACTOR_CONE_HALF_ANGLE = 0.42

/** Pull acceleration on a caught ship — well above the ship's own thrust. */
const TRACTOR_PULL_ACCEL = 300

/**
 * Sideways (swirl) acceleration perpendicular to the beam. Because the hull
 * faces its direction of travel, twisting the velocity vector visibly wrenches
 * the ship's heading off-course — the beam doesn't just drag, it spins you.
 */
const TRACTOR_SWIRL_ACCEL = 150

/** Per-second velocity drag while caught — bleeds speed so you can't power straight out. */
const TRACTOR_SLOW_DRAG = 1.1

/** How long a tractor beam stays active once fired. */
const TRACTOR_DURATION = 2.7

/** Grace period before the Arbiter's first tractor beam. */
const TRACTOR_FIRST_DELAY = 13

/** Damage dealt when the beam drags the ship into the Arbiter's hull. */
const TRACTOR_CAPTURE_DAMAGE = 22

/** Seconds between tractor beams. */
function tractorInterval(mark: number, phase: number): number {
  const base = Math.max(7, 13 - mark * 0.4)
  return phase === 2 ? base * 0.62 : base
}

// --- Per-Mark scaling --------------------------------------------------------

/** Total hull for a given Mark. */
export function arbiterMaxHp(mark: number): number {
  return 220 + (mark - 1) * 160
}

/** Damage dealt by an Arbiter projectile. */
function arbiterProjectileDamage(mark: number): number {
  return 10 + mark * 2
}

/** Seconds between volleys. */
function attackInterval(mark: number, phase: number): number {
  const base = Math.max(1.5, 3.0 - mark * 0.12)
  return phase === 2 ? base * 0.62 : base
}

/** Bolts per volley fan. */
function volleyCount(mark: number, phase: number): number {
  return Math.min(7, (phase === 2 ? 3 : 2) + Math.floor(mark / 2))
}

/** Seconds between reinforcement waves. */
function reinforceInterval(mark: number, phase: number): number {
  const base = Math.max(8, 17 - mark)
  return phase === 2 ? base * 0.65 : base
}

/** Reinforcement enemies per wave. */
export function arbiterReinforceCount(mark: number): number {
  return Math.min(4, 1 + Math.floor(mark / 2))
}

// --- Per-Mark behaviour gates ----------------------------------------------

/** From this Mark on the Arbiter launches destructible homing missiles. */
export const ARBITER_MISSILE_MARK = 3
/** From this Mark on the Arbiter's volleys become rotating bullet-hell spirals. */
export const ARBITER_BULLET_HELL_MARK = 5

// --- Bullet-hell spiral (Mark >= ARBITER_BULLET_HELL_MARK) ------------------

/** Rotation rate of the firing ring (rad/sec) — gives the spiral its spin. */
const ARBITER_SPIRAL_SPIN_RATE = 1.1
/** Spiral bolt speed — deliberately slow so the woven pattern is dodgeable. */
const ARBITER_SPIRAL_BULLET_SPEED = 68
/** Rapid sub-volley cadence; successive rings sweep into continuous arms. */
const ARBITER_SPIRAL_INTERVAL = 0.34

/** Arms (bolts per ring) in a bullet-hell volley. */
function spiralArms(mark: number, phase: number): number {
  const base = Math.min(6, 3 + Math.floor((mark - ARBITER_BULLET_HELL_MARK) / 2))
  return base + (phase === 2 ? 1 : 0)
}

// --- Homing missiles (Mark >= ARBITER_MISSILE_MARK) ------------------------

/** Grace period before the Arbiter's first missile salvo. */
const MISSILE_FIRST_DELAY = 8

/** Seconds between missile salvos. */
function missileInterval(mark: number, phase: number): number {
  const base = Math.max(4.5, 9 - mark * 0.4)
  return phase === 2 ? base * 0.7 : base
}

/** Missiles launched per salvo. */
export function arbiterMissileCount(mark: number): number {
  return Math.min(3, 1 + Math.floor((mark - ARBITER_MISSILE_MARK) / 2))
}

/** Damage a homing missile deals if it detonates against the ship. */
export function arbiterMissileDamage(mark: number): number {
  return 14 + mark * 2
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface ArbiterState {
  mark: number
  x: number
  y: number
  vx: number
  vy: number
  /** Visual spin angle (radians) — purely cosmetic. */
  rotation: number
  hp: number
  maxHp: number
  /** 1 above half hull, 2 below — phase 2 is faster and more aggressive. */
  phase: 1 | 2
  mode: 'hunting' | 'withdrawing'
  /** Counts up while hunting; at ARBITER_EVADE_TIME the Arbiter withdraws. */
  encounterTimer: number
  attackTimer: number
  reinforceTimer: number
  // --- Tractor beam ---
  /** Countdown to the next tractor beam. */
  tractorTimer: number
  /** Whether a capture beam is currently projecting. */
  tractorActive: boolean
  /** Seconds the current tractor beam has been active. */
  tractorElapsed: number
  /** Beam direction (radians), locked when the beam fires. */
  tractorAngle: number
  /** Whether this beam has already landed its capture hit. */
  tractorHitLanded: boolean
  // --- Per-Mark behaviour ---
  /** Mark >= ARBITER_BULLET_HELL_MARK: volleys are rotating spirals. */
  bulletHell: boolean
  /** Mark >= ARBITER_MISSILE_MARK: launches destructible homing missiles. */
  missilesEnabled: boolean
  /** Whether this Arbiter projects a tractor beam (escorts don't, to keep the
   *  capture single-source and avoid two beams fighting over the ship). */
  tractorEnabled: boolean
  /** Rotating base angle of the bullet-hell firing ring (radians). */
  spiralAngle: number
  /** Countdown to the next missile salvo. */
  missileTimer: number
}

/** Optional overrides when spawning an Arbiter (e.g. a twin-encounter escort). */
export interface ArbiterSpawnOpts {
  /** When false, this Arbiter never fires a tractor beam. Default true. */
  tractorEnabled?: boolean
}

/** Spawn a fresh Arbiter of the given Mark at a position. */
export function createArbiterState(
  mark: number,
  x: number,
  y: number,
  opts?: ArbiterSpawnOpts,
): ArbiterState {
  const maxHp = arbiterMaxHp(mark)
  return {
    mark,
    x,
    y,
    vx: 0,
    vy: 0,
    rotation: 0,
    hp: maxHp,
    maxHp,
    phase: 1,
    mode: 'hunting',
    encounterTimer: 0,
    attackTimer: ARBITER_FIRST_VOLLEY_DELAY,
    reinforceTimer: reinforceInterval(mark, 1),
    tractorTimer: TRACTOR_FIRST_DELAY,
    tractorActive: false,
    tractorElapsed: 0,
    tractorAngle: 0,
    tractorHitLanded: false,
    bulletHell: mark >= ARBITER_BULLET_HELL_MARK,
    missilesEnabled: mark >= ARBITER_MISSILE_MARK,
    tractorEnabled: opts?.tractorEnabled ?? true,
    spiralAngle: Math.random() * Math.PI * 2,
    missileTimer: MISSILE_FIRST_DELAY,
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface ArbiterUpdate {
  /** Projectiles fired this tick. */
  projectiles: EnemyProjectile[]
  /** Reinforcement enemies to spawn this tick (tick() performs the spawn). */
  reinforcements: number
  /** Homing missiles to launch this tick (tick() performs the spawn). */
  missiles: number
  /** True the tick the Arbiter has fully withdrawn and should be removed. */
  finishedWithdrawing: boolean
}

/**
 * Advance the Arbiter by one tick: movement, volleys, reinforcement timing,
 * phase transitions, and the evade-timeout that ends the encounter.
 */
export function updateArbiter(arbiter: ArbiterState, player: Ship, dt: number): ArbiterUpdate {
  const result: ArbiterUpdate = {
    projectiles: [],
    reinforcements: 0,
    missiles: 0,
    finishedWithdrawing: false,
  }

  // Cosmetic spin + the bullet-hell firing ring's rotation.
  arbiter.rotation += ARBITER_SPIN_RATE * dt
  arbiter.spiralAngle += ARBITER_SPIRAL_SPIN_RATE * dt

  // --- Withdrawing: flee the player, then signal removal ---
  if (arbiter.mode === 'withdrawing') {
    const dx = arbiter.x - player.x
    const dy = arbiter.y - player.y
    const dist = Math.hypot(dx, dy) || 1
    arbiter.vx = (dx / dist) * ARBITER_WITHDRAW_SPEED
    arbiter.vy = (dy / dist) * ARBITER_WITHDRAW_SPEED
    arbiter.x += arbiter.vx * dt
    arbiter.y += arbiter.vy * dt
    result.finishedWithdrawing = dist > ARBITER_WITHDRAW_DISTANCE
    return result
  }

  // --- Phase transition at half hull ---
  if (arbiter.phase === 1 && arbiter.hp <= arbiter.maxHp / 2) {
    arbiter.phase = 2
    // Tighten timers immediately so phase 2 bites without waiting a full cycle.
    arbiter.attackTimer = Math.min(arbiter.attackTimer, 0.6)
    arbiter.reinforceTimer = Math.min(arbiter.reinforceTimer, 1.5)
  }

  // --- Evade timeout: the player outlasted the Arbiter ---
  arbiter.encounterTimer += dt
  if (arbiter.encounterTimer >= ARBITER_EVADE_TIME) {
    arbiter.mode = 'withdrawing'
    arbiter.tractorActive = false
    return result
  }

  // --- Tractor beam: while a capture beam is up the Arbiter focuses it,
  // holding position and holding fire until the beam expires. ---
  if (arbiter.tractorActive) {
    arbiter.tractorElapsed += dt
    arbiter.vx *= 0.88
    arbiter.vy *= 0.88
    arbiter.x += arbiter.vx * dt
    arbiter.y += arbiter.vy * dt
    if (arbiter.tractorElapsed >= TRACTOR_DURATION) {
      arbiter.tractorActive = false
      arbiter.tractorTimer = tractorInterval(arbiter.mark, arbiter.phase)
    }
    return result
  }

  // --- Movement: hold orbit distance with a tangential drift ---
  const dx = player.x - arbiter.x
  const dy = player.y - arbiter.y
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  let radial = 0
  if (dist > ARBITER_ORBIT_DISTANCE * 1.15) radial = 1
  else if (dist < ARBITER_ORBIT_DISTANCE * 0.8) radial = -1
  // Perpendicular drift so the Arbiter circles rather than sits still.
  let dirX = ux * radial - uy * 0.55
  let dirY = uy * radial + ux * 0.55
  const dl = Math.hypot(dirX, dirY) || 1
  dirX /= dl
  dirY /= dl
  const speed = arbiter.phase === 2 ? ARBITER_SPEED_P2 : ARBITER_SPEED_P1
  const smooth = 1 - Math.pow(0.0015, dt)
  arbiter.vx += (dirX * speed - arbiter.vx) * smooth
  arbiter.vy += (dirY * speed - arbiter.vy) * smooth
  arbiter.x += arbiter.vx * dt
  arbiter.y += arbiter.vy * dt

  // --- Volley fire ---
  arbiter.attackTimer -= dt
  if (arbiter.attackTimer <= 0) {
    const damage = arbiterProjectileDamage(arbiter.mark)
    const muzzle = ARBITER_COLLISION_RADIUS + 2
    const fire = (a: number, speed: number): void => {
      result.projectiles.push(
        createEnemyProjectile(
          arbiter.x + Math.cos(a) * muzzle,
          arbiter.y + Math.sin(a) * muzzle,
          Math.cos(a) * speed,
          Math.sin(a) * speed,
          damage,
        ),
      )
    }

    if (arbiter.bulletHell) {
      // Rapid rings off the rotating base angle weave into spinning spiral
      // arms. Phase 2 adds a counter-rotating, half-offset set for a denser
      // lattice the player must thread.
      arbiter.attackTimer = ARBITER_SPIRAL_INTERVAL
      const arms = spiralArms(arbiter.mark, arbiter.phase)
      for (let i = 0; i < arms; i++) {
        fire(arbiter.spiralAngle + (i / arms) * Math.PI * 2, ARBITER_SPIRAL_BULLET_SPEED)
      }
      if (arbiter.phase === 2) {
        for (let i = 0; i < arms; i++) {
          fire(
            -arbiter.spiralAngle + (i / arms) * Math.PI * 2 + Math.PI / arms,
            ARBITER_SPIRAL_BULLET_SPEED,
          )
        }
      }
    } else {
      // Aimed fan — the classic volley for early Marks.
      arbiter.attackTimer = attackInterval(arbiter.mark, arbiter.phase)
      const aim = Math.atan2(player.y - arbiter.y, player.x - arbiter.x)
      const n = volleyCount(arbiter.mark, arbiter.phase)
      for (let i = 0; i < n; i++) {
        fire(aim + (i - (n - 1) / 2) * ARBITER_VOLLEY_SPREAD, ARBITER_PROJECTILE_SPEED)
      }
    }
  }

  // --- Reinforcement waves ---
  arbiter.reinforceTimer -= dt
  if (arbiter.reinforceTimer <= 0) {
    arbiter.reinforceTimer = reinforceInterval(arbiter.mark, arbiter.phase)
    result.reinforcements = arbiterReinforceCount(arbiter.mark)
  }

  // --- Homing-missile salvos ---
  if (arbiter.missilesEnabled) {
    arbiter.missileTimer -= dt
    if (arbiter.missileTimer <= 0) {
      arbiter.missileTimer = missileInterval(arbiter.mark, arbiter.phase)
      result.missiles = arbiterMissileCount(arbiter.mark)
    }
  }

  // --- Tractor beam charge-up: fire a capture cone at the player's bearing ---
  if (arbiter.tractorEnabled) {
    arbiter.tractorTimer -= dt
    if (arbiter.tractorTimer <= 0) {
      arbiter.tractorActive = true
      arbiter.tractorElapsed = 0
      arbiter.tractorHitLanded = false
      arbiter.tractorAngle = Math.atan2(player.y - arbiter.y, player.x - arbiter.x)
    }
  }

  return result
}

/**
 * Apply the tractor beam's pull to the ship for one tick.
 *
 * While a beam is active and the ship sits inside the capture cone, the ship
 * is hauled toward the Arbiter — the player must thrust clear (ideally
 * sideways, out of the cone). If the beam drags the ship into the Arbiter's
 * hull it lands one capture hit and the ship is flung back out.
 *
 * Returns the capture damage dealt this tick (0 on a normal tick).
 */
export function applyTractorPull(
  arbiter: ArbiterState,
  ship: Ship,
  dt: number,
): { captureDamage: number; caught: boolean } {
  if (!arbiter.tractorActive) return { captureDamage: 0, caught: false }

  const dx = ship.x - arbiter.x
  const dy = ship.y - arbiter.y
  const dist = Math.hypot(dx, dy) || 1
  if (dist > TRACTOR_RANGE) return { captureDamage: 0, caught: false }

  // Inside the capture cone?
  let diff = Math.atan2(dy, dx) - arbiter.tractorAngle
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  if (Math.abs(diff) > TRACTOR_CONE_HALF_ANGLE) return { captureDamage: 0, caught: false }

  // Caught — the beam hauls the ship in, wrenches its heading off-course, and
  // bleeds its speed so the player can't just hold thrust and power straight out.
  const markScale = 1 + (arbiter.mark - 1) * 0.1
  const ux = dx / dist
  const uy = dy / dist
  // Inward haul, toward the Arbiter.
  ship.velocityX -= ux * TRACTOR_PULL_ACCEL * markScale * dt
  ship.velocityY -= uy * TRACTOR_PULL_ACCEL * markScale * dt
  // Swirl: a perpendicular shove that twists the direction of travel, so the
  // hull visibly turns as it's reeled in (heading tracks velocity each frame).
  ship.velocityX += uy * TRACTOR_SWIRL_ACCEL * markScale * dt
  ship.velocityY -= ux * TRACTOR_SWIRL_ACCEL * markScale * dt
  // Drag: shed speed while held, so escaping demands sustained counter-thrust.
  const drag = Math.max(0, 1 - TRACTOR_SLOW_DRAG * dt)
  ship.velocityX *= drag
  ship.velocityY *= drag

  // Dragged into the hull — land the capture hit and fling the ship clear.
  if (!arbiter.tractorHitLanded && dist < ARBITER_COLLISION_RADIUS + 7) {
    arbiter.tractorHitLanded = true
    const knockback = 95
    ship.velocityX = (dx / dist) * knockback
    ship.velocityY = (dy / dist) * knockback
    return { captureDamage: TRACTOR_CAPTURE_DAMAGE, caught: true }
  }
  return { captureDamage: 0, caught: true }
}

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

/** Squared distance from point (cx,cy) to segment (ax,ay)→(bx,by). */
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
    return (cx - ax) ** 2 + (cy - ay) ** 2
  }
  let t = ((cx - ax) * abx + (cy - ay) * aby) / lenSq
  t = Math.max(0, Math.min(1, t))
  const px = ax + t * abx
  const py = ay + t * aby
  return (cx - px) ** 2 + (cy - py) ** 2
}

/** True while the Arbiter can still take damage (alive and not fleeing). */
function arbiterVulnerable(arbiter: ArbiterState): boolean {
  return arbiter.hp > 0 && arbiter.mode === 'hunting'
}

/**
 * Player projectiles vs the Arbiter. Mutates Arbiter hp; returns the
 * surviving projectiles and the ids of those that hit.
 */
export function checkProjectileArbiterCollisions(
  projectiles: Projectile[],
  arbiter: ArbiterState,
): { surviving: Projectile[]; hitProjectileIds: string[] } {
  if (!arbiterVulnerable(arbiter)) return { surviving: projectiles, hitProjectileIds: [] }

  const surviving: Projectile[] = []
  const hitProjectileIds: string[] = []
  const minDist = PROJECTILE_RADIUS + ARBITER_COLLISION_RADIUS
  const minDistSq = minDist * minDist

  // Swept segment-vs-circle: the projectile traversed prevPos → pos this frame,
  // so check the whole segment against the Arbiter's disc. Without this, fast
  // blaster bolts could step straight past the boss between two ticks and the
  // shot visibly went through with no damage.
  for (const p of projectiles) {
    if (arbiter.hp <= 0) {
      surviving.push(p)
      continue
    }
    const sx = p.prevX
    const sy = p.prevY
    const ex = p.x
    const ey = p.y
    const segDx = ex - sx
    const segDy = ey - sy
    const segLenSq = segDx * segDx + segDy * segDy
    let closestDistSq: number
    if (segLenSq < 0.0001) {
      const cdx = ex - arbiter.x
      const cdy = ey - arbiter.y
      closestDistSq = cdx * cdx + cdy * cdy
    } else {
      let t = ((arbiter.x - sx) * segDx + (arbiter.y - sy) * segDy) / segLenSq
      t = Math.max(0, Math.min(1, t))
      const px = sx + t * segDx
      const py = sy + t * segDy
      const cdx = px - arbiter.x
      const cdy = py - arbiter.y
      closestDistSq = cdx * cdx + cdy * cdy
    }

    if (closestDistSq < minDistSq) {
      arbiter.hp = Math.max(0, arbiter.hp - p.damage)
      hitProjectileIds.push(p.id)
    } else {
      surviving.push(p)
    }
  }
  return { surviving, hitProjectileIds }
}

/**
 * Lazer beam vs the Arbiter. Mutates Arbiter hp. Returns whether the beam
 * struck and the parameter `t` along the beam at the Arbiter's centre, so the
 * caller can truncate the rendered beam at the impact.
 */
export function checkBeamArbiterCollisions(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  damage: number,
  arbiter: ArbiterState,
): { hit: boolean; t: number } {
  if (!arbiterVulnerable(arbiter)) return { hit: false, t: 1 }

  const distSq = pointToSegmentDistSq(arbiter.x, arbiter.y, startX, startY, endX, endY)
  if (distSq >= ARBITER_COLLISION_RADIUS * ARBITER_COLLISION_RADIUS) {
    return { hit: false, t: 1 }
  }

  arbiter.hp = Math.max(0, arbiter.hp - damage * LAZER_DAMAGE_MULTIPLIER)

  const dx = endX - startX
  const dy = endY - startY
  const lenSq = dx * dx + dy * dy
  let t = 1
  if (lenSq > 0.0001) {
    t = Math.max(0, Math.min(1, ((arbiter.x - startX) * dx + (arbiter.y - startY) * dy) / lenSq))
  }
  return { hit: true, t }
}
