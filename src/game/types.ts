import type { Ship, Upgrades, Cargo } from '@/lib/schemas'

export interface Asteroid {
  id: string
  x: number
  y: number
  velocityX: number
  velocityY: number
  type: AsteroidType
  hp: number
  maxHp: number
  size: number
}

export type AsteroidType = 'c-type' | 's-type' | 'm-type' | 'v-type' | 'd-type' | 'comet'

/**
 * A rare roaming comet — a fast entity that crosses the field with a glowing
 * tail and drops bonus scrap when destroyed. Distinct from the static `comet`
 * asteroid type: this one streaks across space as an occasional event for
 * variance. Data-only here; the scene owns its mesh + tail (like asteroids).
 */
export interface Comet {
  id: string
  x: number
  y: number
  velocityX: number
  velocityY: number
  hp: number
  maxHp: number
  /** Bonus scrap awarded (split across drop boxes) when destroyed. */
  value: number
}

/**
 * Mineral fragment dropped when an asteroid is broken. One mineral per spectral
 * class, plus comet which drops carbon (carbonaceous/volatile composition).
 *
 * Each mineral has a fixed scrap value reflecting the real-world rarity tier
 * of its source class — see SCRAP_VALUE_BY_MINERAL in useGameState.
 */
export type MetalVariant = 'carbon' | 'silicates' | 'platinum' | 'titanium' | 'exotics'

/**
 * Deterministic asteroid → mineral mapping. Used by createMetalChunk to pick
 * the fragment variant at spawn time.
 */
export const MINERAL_BY_ASTEROID: Record<AsteroidType, MetalVariant> = {
  'c-type': 'carbon',
  's-type': 'silicates',
  'm-type': 'platinum',
  'v-type': 'titanium',
  'd-type': 'exotics',
  comet: 'carbon',
}

/** Mineral dropped by sources without a spectral class (enemy debris, etc). */
export const DEFAULT_MINERAL: MetalVariant = 'silicates'

export type MiningTool = 'blaster' | 'lazer' | 'ripple'
export type ProjectileTool = MiningTool | 'missile'

/**
 * Damage multiplier applied when a given tool hits a given asteroid type.
 * 1.0 = preferred weapon, full damage. Lower values mean the rock is the
 * "wrong tool for the job" — still mineable, just slower. Skilled players
 * learn the matrix; the auto-toggle upgrade picks the preferred weapon for
 * whatever the player is aiming at.
 */
export const WEAPON_AFFINITY: Record<AsteroidType, Record<MiningTool, number>> = {
  'c-type': { blaster: 1.0, lazer: 0.7, ripple: 0.5 },
  's-type': { blaster: 1.0, lazer: 0.8, ripple: 0.7 },
  'm-type': { blaster: 0.4, lazer: 0.7, ripple: 1.0 },
  'v-type': { blaster: 0.3, lazer: 1.0, ripple: 0.4 },
  'd-type': { blaster: 0.5, lazer: 1.0, ripple: 0.6 },
  comet: { blaster: 1.0, lazer: 0.8, ripple: 0.7 },
}

/**
 * Mass multiplier per asteroid type — affects collision physics:
 * - Heavier types resist push from projectiles, beams, and ship collisions
 * - Ship bounces *harder* off heavy types (more velocity transfer)
 * - Asteroid-asteroid collisions favor heavier types in momentum exchange
 */
export const ASTEROID_MASS: Record<AsteroidType, number> = {
  'c-type': 0.7,
  's-type': 0.8,
  'm-type': 1.3,
  'v-type': 1.5,
  'd-type': 1.1,
  comet:   0.5,
}

/**
 * Drill Nose damage multiplier per asteroid type. Soft/crumbly types (comet,
 * c-type) take extra damage; hard/metallic types resist. At max tier + boost
 * the effective damage ranges from ~32 (v-type) to ~158 (comet).
 */
export const DRILL_AFFINITY: Record<AsteroidType, number> = {
  'c-type': 1.2,
  's-type': 1.0,
  'm-type': 0.4,
  'v-type': 0.3,
  'd-type': 0.6,
  comet:   1.5,
}

/** Tool that deals 100% damage to each asteroid type — used by auto-toggle. */
export const PREFERRED_TOOL: Record<AsteroidType, MiningTool> = {
  'c-type': 'blaster',
  's-type': 'blaster',
  'm-type': 'ripple',
  'v-type': 'lazer',
  'd-type': 'lazer',
  comet: 'blaster',
}

export interface Fragment {
  id: string
  x: number
  y: number
  velocityX: number
  velocityY: number
  scrapValue: number
  lifetime: number
}

export interface Projectile {
  id: string
  x: number
  y: number
  /** Previous-frame position. Lets collision do a swept segment check so
   *  fast bolts can't tunnel past small targets (snipers, drones) between
   *  fixed-step physics frames. */
  prevX: number
  prevY: number
  velocityX: number
  velocityY: number
  damage: number
  tool: ProjectileTool
}

export interface GameEngine {
  ship: Ship
  upgrades: Upgrades
  cargo: Cargo
  asteroids: Asteroid[]
  fragments: Fragment[]
  projectiles: Projectile[]
  paused: boolean
  update(dt: number): void
  fire(targetX: number, targetY: number): void
  upgrade(system: 'blaster' | 'collector' | 'storage'): boolean
}

export interface UpgradeCost {
  tier: number
  cost: number
}

export const BLASTER_COSTS: UpgradeCost[] = [
  { tier: 2, cost: 50 },
  { tier: 3, cost: 150 },
  { tier: 4, cost: 400 },
  { tier: 5, cost: 1000 },
]

export const COLLECTOR_COSTS: UpgradeCost[] = [
  { tier: 2, cost: 40 },
  { tier: 3, cost: 120 },
  { tier: 4, cost: 350 },
  { tier: 5, cost: 900 },
]

export const STORAGE_COSTS: UpgradeCost[] = [
  { tier: 2, cost: 30 },
  { tier: 3, cost: 100 },
  { tier: 4, cost: 300 },
  { tier: 5, cost: 800 },
]
