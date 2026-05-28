import { z } from 'zod'

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
  hullPlating: z.number().int().min(0).max(3).default(0),
  bounty: z.number().int().min(0).max(3).default(0),
  missileBias: z.number().int().min(0).max(1).default(0),
  thrusters: z.number().int().min(0).max(1).default(0),
  sensor: z.number().int().min(0).max(3).default(0),
  droneRepair: z.number().int().min(0).max(1).default(0),
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

export const GameStateSchema = z.object({
  ship: ShipSchema,
  upgrades: UpgradesSchema,
  cargo: CargoSchema,
  hp: z.number().int().min(0).max(100),
  // Best endless-run score for this slot. Optional/defaulted so saves
  // written before endless mode still load cleanly.
  highScore: z.number().min(0).default(0),
  timestamp: z.number(),
  // Achievement/Leaderboard prep
  achievements: z.array(z.string()).default([]),
  metrics: z
    .object({
      totalScrapMined: z.number().default(0),
      totalArbitersDefeated: z.number().default(0),
      totalRuns: z.number().default(0),
      maxLedgerReached: z.number().default(0),
    })
    .default({}),
})
export type GameState = z.infer<typeof GameStateSchema>

export const SAVE_SLOT_IDS = ['save-1', 'save-2', 'save-3'] as const
export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number]

export const SaveSlotSummarySchema = z.object({
  slotId: z.enum(SAVE_SLOT_IDS),
  timestamp: z.number(),
})
export type SaveSlotSummary = z.infer<typeof SaveSlotSummarySchema>

export function defaultGameState(): GameState {
  return {
    ship: { x: 0, y: 0, rotation: 0, velocityX: 0, velocityY: 0 },
    upgrades: {
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
      hullPlating: 0,
      bounty: 0,
      missileBias: 0,
      thrusters: 0,
      sensor: 0,
      droneRepair: 0,
    },
    cargo: {
      scrap: 0,
      fragments: 0,
      carbon: 0,
      silicates: 0,
      platinum: 0,
      titanium: 0,
      exotics: 0,
      capacity: 50,
    },
    hp: 100,
    highScore: 0,
    timestamp: Date.now(),
    achievements: [],
    metrics: {
      totalScrapMined: 0,
      totalArbitersDefeated: 0,
      totalRuns: 0,
      maxLedgerReached: 0,
    },
  }
}
