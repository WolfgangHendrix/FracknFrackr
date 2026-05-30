/**
 * Prologue sequence configuration.
 *
 * The prologue showcases a fully maxed-out ship — high tier, fast, with a
 * wide magnet collector — before The Arbiter strips it all.
 */

import type { MiningTool } from './types'

export const PROLOGUE_SHIP = {
  blasterTier: 5,
  fireRateBonus: 1.1 ** 4,
  miningTool: 'lazer' as MiningTool,
  missileTier: 8,
  optionCount: 2,
  shieldCharges: 3,
  maxSpeed: 180,
  acceleration: 300,
  collectorRange: 40,
  collisionRadius: 5,
}

// Field density bumped alongside the 4× mining target — the player needs
// enough rock to destroy and enough enemies to feel like a power fantasy
// for the full duration. Each asteroid fragments on break, so total
// destructible bodies end up well above the spawn count.
export const PROLOGUE_ASTEROID_COUNT = 80
export const PROLOGUE_MOON_COUNT = 6
export const PROLOGUE_ENEMY_FLEET_SIZE = 10
// Bumped 4× since the intro ship now runs every upgrade — drone fleet,
// tri-bolt spread, drill nose, missiles, etc. — and was clearing the
// asteroid field too fast to give the cutscene room to breathe.
export const PROLOGUE_MINING_TARGET = 100

// Reinforcement wave — fires once the player has cleared
// PROLOGUE_REINFORCEMENT_THRESHOLD of the initial field. Without it the
// 80+6 starting field can't supply 100 destructible bodies and the prologue
// stalls (objective never advances). The wave also drops in a small enemy
// reinforcement so the "another round incoming" beat reads in both lanes.
export const PROLOGUE_REINFORCEMENT_THRESHOLD = 60
export const PROLOGUE_REINFORCEMENT_ASTEROIDS = 60

/**
 * Radius of the prologue containment bubble (world units, centered on origin).
 * The field spawns within ~120 units; asteroids that drift past this — from
 * their own drift, weapon impulses, or rock-on-rock collisions — bounce back
 * inward so the mining target always stays reachable.
 */
// Containment bubble widened so the larger field doesn't pack rocks on top
// of each other and the player has somewhere to chase enemies into.
export const PROLOGUE_FIELD_RADIUS = 270
export const PROLOGUE_SPEED_DURATION = 4
export const PROLOGUE_AMBUSH_SIZE = 14

export const ARBITER_SPAWN_DISTANCE = 80
export const ARBITER_APPROACH_SPEED = 30
export const ARBITER_STRIP_DELAY = 1.5

export const ARBITER_DIALOGUE = [
  'Fracker! You have exceeded authorized power limits.',
  'The belt was not designed for unilateral dominance.',
  'Initiating corrective actions.',
] as const
