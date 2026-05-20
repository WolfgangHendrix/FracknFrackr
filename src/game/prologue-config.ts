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
  maxSpeed: 180,
  acceleration: 300,
  collectorRange: 40,
  collisionRadius: 5,
}

export const PROLOGUE_ASTEROID_COUNT = 30
export const PROLOGUE_MOON_COUNT = 3
export const PROLOGUE_ENEMY_FLEET_SIZE = 6
export const PROLOGUE_MINING_TARGET = 25
export const PROLOGUE_SPEED_DURATION = 4
export const PROLOGUE_AMBUSH_SIZE = 10

export const ARBITER_SPAWN_DISTANCE = 80
export const ARBITER_APPROACH_SPEED = 30
export const ARBITER_STRIP_DELAY = 1.5

export const ARBITER_DIALOGUE = [
  'You have grown too powerful, fracker.',
  'The belt was not built for one to dominate.',
  'I am restoring balance.',
] as const
