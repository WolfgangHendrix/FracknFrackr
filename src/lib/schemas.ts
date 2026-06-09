import { z } from 'zod'

// --- Runtime types (used by game engine, not persisted directly) ---

export const ShipSchema = z.object({
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  velocityX: z.number(),
  velocityY: z.number(),
})
export type Ship = z.infer<typeof ShipSchema>

export const UpgradesSchema = z.object({
  blaster: z.number().int().min(1).max(5),
  collector: z.number().int().min(1).max(5),
  storage: z.number().int().min(1).max(5),
  missiles: z.number().int().min(0).max(8).default(0),
  ripple: z.number().int().min(0).max(1).default(0),
  options: z.number().int().min(0).max(2).default(0),
  speed: z.number().int().min(0).max(5).default(0),
  armor: z.number().int().min(0).max(3).default(0),
  shield: z.number().int().min(0).max(3).default(0),
  smartBomb: z.number().int().min(0).max(1).default(0),
  lazer: z.number().int().min(0).max(1).default(0),
  autoTool: z.number().int().min(0).max(1).default(0),
  drone: z.number().int().min(0).max(4).default(0),
  spread: z.number().int().min(0).max(1).default(0),
  hull: z.number().int().min(0).max(3).default(0),
  cooling: z.number().int().min(0).max(3).default(0),
  magnet: z.number().int().min(0).max(3).default(0),
  bounty: z.number().int().min(0).max(3).default(0),
  missileBias: z.number().int().min(0).max(1).default(0),
  thrusters: z.number().int().min(0).max(1).default(0),
  sensor: z.number().int().min(0).max(3).default(0),
  droneRepair: z.number().int().min(0).max(1).default(0),
  drillNose: z.number().int().min(0).max(3).default(0),
})
export type Upgrades = z.infer<typeof UpgradesSchema>

export const CargoSchema = z.object({
  scrap: z.number().min(0),
  fragments: z.number().min(0),
  carbon: z.number().int().min(0),
  silicates: z.number().int().min(0),
  platinum: z.number().int().min(0),
  titanium: z.number().int().min(0),
  exotics: z.number().int().min(0),
  capacity: z.number().int().min(1),
})
export type Cargo = z.infer<typeof CargoSchema>

export const AchievementMetricsSchema = z.object({
  totalScrapMined: z.number().default(0),
  totalArbitersDefeated: z.number().default(0),
  maxArbiterMarkDefeated: z.number().default(0),
  totalRuns: z.number().default(0),
  maxLedgerReached: z.number().default(0),
  totalEnemyKills: z.number().default(0),
  totalAsteroidsDestroyed: z.number().default(0),
  totalDroneScrapDelivered: z.number().default(0),
  totalDronesBuilt: z.number().default(0),
  totalDroneRebuilds: z.number().default(0),
  totalPhotosTaken: z.number().default(0),
  totalSales: z.number().default(0),
  bestSaleValue: z.number().default(0),
  arbiterWithdrawals: z.number().default(0),
  stationDriveThroughs: z.number().default(0),
  drillNoseAsteroidFinishes: z.number().default(0),
  soldByMineral: z
    .object({
      carbon: z.number().default(0),
      silicates: z.number().default(0),
      platinum: z.number().default(0),
      titanium: z.number().default(0),
      exotics: z.number().default(0),
    })
    .default({}),
  bestDroneDockBurst: z.number().default(0),
})
export type AchievementMetrics = z.infer<typeof AchievementMetricsSchema>

// --- Persisted profile schema (records only, no in-game state) ---

export const ProfileSchema = z.object({
  highScore: z.number().min(0).default(0),
  timestamp: z.number(),
  achievements: z.array(z.string()).default([]),
  metrics: AchievementMetricsSchema.default({}),
  prologueSeen: z.boolean().default(false),
})
export type Profile = z.infer<typeof ProfileSchema>

export const PROFILE_IDS = ['profile-1', 'profile-2', 'profile-3'] as const
export type ProfileId = (typeof PROFILE_IDS)[number]

export const ProfileSummarySchema = z.object({
  profileId: z.enum(PROFILE_IDS),
  timestamp: z.number(),
  highScore: z.number().default(0),
})
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>

export function defaultProfile(): Profile {
  return {
    highScore: 0,
    timestamp: Date.now(),
    achievements: [],
    metrics: {
      totalScrapMined: 0,
      totalArbitersDefeated: 0,
      maxArbiterMarkDefeated: 0,
      totalRuns: 0,
      maxLedgerReached: 0,
      totalEnemyKills: 0,
      totalAsteroidsDestroyed: 0,
      totalDroneScrapDelivered: 0,
      totalDronesBuilt: 0,
      totalDroneRebuilds: 0,
      totalPhotosTaken: 0,
      totalSales: 0,
      bestSaleValue: 0,
      arbiterWithdrawals: 0,
      stationDriveThroughs: 0,
      drillNoseAsteroidFinishes: 0,
      soldByMineral: {
        carbon: 0,
        silicates: 0,
        platinum: 0,
        titanium: 0,
        exotics: 0,
      },
      bestDroneDockBurst: 0,
    },
    prologueSeen: false,
  }
}

export function defaultUpgrades(): Upgrades {
  return {
    blaster: 1,
    collector: 1,
    storage: 1,
    missiles: 0,
    ripple: 0,
    options: 0,
    speed: 0,
    armor: 0,
    shield: 0,
    smartBomb: 0,
    lazer: 0,
    autoTool: 0,
    drone: 0,
    spread: 0,
    hull: 0,
    cooling: 0,
    magnet: 0,
    bounty: 0,
    missileBias: 0,
    thrusters: 0,
    sensor: 0,
    droneRepair: 0,
    drillNose: 0,
  }
}

export function defaultCargo(): Cargo {
  return {
    scrap: 0,
    fragments: 0,
    carbon: 0,
    silicates: 0,
    platinum: 0,
    titanium: 0,
    exotics: 0,
    capacity: 50,
  }
}
