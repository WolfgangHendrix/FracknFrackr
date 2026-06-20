import type { TutorialStep } from '@/hooks/useTutorial'
import type { AchievementMetrics, Cargo, Upgrades } from './schemas'

export type AchievementCategory =
  | 'Foundations'
  | 'Loadout & Systems'
  | 'Mining & Economy'
  | 'Combat & Survival'
  | 'Drone Command'
  | 'Hidden'

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  category: AchievementCategory
  hidden?: boolean
}

export interface AchievementRunState {
  continuedAfterDeath: boolean
  cargoFilledAtSec: number | null
  touchAndGoDockOpenedAtSec: number | null
  touchAndGoSold: boolean
  touchAndGoBought: boolean
  mixedPortfolioSale: boolean
  soldFullCargo: boolean
  soldTenExotics: boolean
  dockedWithinThirtySecondsOfFullCargo: boolean
  touchAndGoComplete: boolean
  tookHitThisRun: boolean
  shieldAbsorbedThisRun: boolean
  hullAbsorbedThisRun: boolean
  armorAbsorbedThisRun: boolean
  smartBombRecoveredAtSec: number | null
  arbiterSpawnActive: boolean
  dockedSinceArbiterSpawn: boolean
  arbiterDefeatedWithoutDocking: boolean
  arbiterDefeatedWithActiveDrone: boolean
  droneScrapThisRun: number
  droneDockEventsSec: number[]
  bestDroneDockBurst: number
  rallySetThisRun: boolean
  blackHoleWarned: boolean
  blackHoleEscapedThisRun: boolean
  driveThroughStreak: number
  bestDriveThroughStreak: number
  lowHpDocked: boolean
  lowHpDefensivePurchase: boolean
  photoWithArbiterTaken: boolean
  splitterDestroyed: boolean
  /** Survived inside a black hole's event horizon (only possible with the
   *  Exotic Matter Hull's void immunity). */
  blackHoleSurvivedThisRun: boolean
  /** Teleported via the Wormhole Generator at least once this run. */
  wormholeUsedThisRun: boolean
}

export const defaultAchievementRunState = (): AchievementRunState => ({
  continuedAfterDeath: false,
  cargoFilledAtSec: null,
  touchAndGoDockOpenedAtSec: null,
  touchAndGoSold: false,
  touchAndGoBought: false,
  mixedPortfolioSale: false,
  soldFullCargo: false,
  soldTenExotics: false,
  dockedWithinThirtySecondsOfFullCargo: false,
  touchAndGoComplete: false,
  tookHitThisRun: false,
  shieldAbsorbedThisRun: false,
  hullAbsorbedThisRun: false,
  armorAbsorbedThisRun: false,
  smartBombRecoveredAtSec: null,
  arbiterSpawnActive: false,
  dockedSinceArbiterSpawn: false,
  arbiterDefeatedWithoutDocking: false,
  arbiterDefeatedWithActiveDrone: false,
  droneScrapThisRun: 0,
  droneDockEventsSec: [],
  bestDroneDockBurst: 0,
  rallySetThisRun: false,
  blackHoleWarned: false,
  blackHoleEscapedThisRun: false,
  driveThroughStreak: 0,
  bestDriveThroughStreak: 0,
  lowHpDocked: false,
  lowHpDefensivePurchase: false,
  photoWithArbiterTaken: false,
  splitterDestroyed: false,
  blackHoleSurvivedThisRun: false,
  wormholeUsedThisRun: false,
})

export interface AchievementEvaluationContext {
  achievements: string[]
  metrics: AchievementMetrics
  cargo: Cargo
  upgrades: Upgrades
  hasLazer: boolean
  ledger: number
  droneCount: number
  tutorialStep: TutorialStep
  runTimeSec: number
  run: AchievementRunState
}

export interface AchievementProgress {
  current: number
  goal: number
}

interface AchievementDefinition extends Achievement {
  isUnlocked: (ctx: AchievementEvaluationContext) => boolean
  progress?: (ctx: AchievementEvaluationContext) => AchievementProgress | null
}

const STARTING_UPGRADE_LEVEL: Record<keyof Upgrades, number> = {
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
  refinery: 0,
  exoticHull: 0,
  wormhole: 0,
}

// NOTE: the prestige upgrades (`refinery`, `exoticHull`, `wormhole`) are NOT
// in this list. "Full Compliance" must stay achievable mid-game; folding the
// astronomically-priced prestige tier into "own everything" would gate it
// behind tens of thousands of scrap.
const PERMANENT_UPGRADE_KEYS: readonly (keyof Upgrades)[] = [
  'blaster',
  'collector',
  'storage',
  'missiles',
  'ripple',
  'options',
  'speed',
  'lazer',
  'autoTool',
  'drone',
  'spread',
  'cooling',
  'magnet',
  'bounty',
  'missileBias',
  'thrusters',
  'sensor',
  'droneRepair',
  'drillNose',
] as const

function hasAnyPurchasedUpgrade(upgrades: Upgrades): boolean {
  return (Object.keys(upgrades) as (keyof Upgrades)[]).some(
    (key) => upgrades[key] > STARTING_UPGRADE_LEVEL[key],
  )
}

function hasFullCompliance(upgrades: Upgrades): boolean {
  return PERMANENT_UPGRADE_KEYS.every((key) => upgrades[key] > STARTING_UPGRADE_LEVEL[key])
}

const DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'licensed-extraction',
    title: 'Licensed Extraction',
    description: 'Complete the onboarding sequence and enter live operations.',
    icon: 'ID',
    category: 'Foundations',
    isUnlocked: (ctx) => ctx.tutorialStep === 'done',
  },
  {
    id: 'asset-on-file',
    title: 'Asset on File',
    description: 'Collect your first fragment.',
    icon: 'C',
    category: 'Foundations',
    isUnlocked: (ctx) =>
      ctx.cargo.fragments > 0 || ctx.metrics.totalSales > 0 || ctx.metrics.totalScrapMined > 0,
  },
  {
    id: 'first-invoice',
    title: 'First Invoice',
    description: 'Sell materials once.',
    icon: '$',
    category: 'Foundations',
    isUnlocked: (ctx) => ctx.metrics.totalSales >= 1,
  },
  {
    id: 'approved-purchase-order',
    title: 'Approved Purchase Order',
    description: 'Buy your first upgrade.',
    icon: '+',
    category: 'Foundations',
    isUnlocked: (ctx) => hasAnyPurchasedUpgrade(ctx.upgrades),
  },
  {
    id: 'capacity-reached',
    title: 'Capacity Reached',
    description: 'Fill the cargo hold.',
    icon: '[]',
    category: 'Foundations',
    isUnlocked: (ctx) =>
      ctx.run.cargoFilledAtSec !== null || ctx.cargo.fragments >= ctx.cargo.capacity,
  },
  {
    id: 'tooling-request-granted',
    title: 'Tooling Request Granted',
    description: 'Buy the Lazer.',
    icon: 'LZ',
    category: 'Foundations',
    isUnlocked: (ctx) => ctx.hasLazer,
  },
  {
    id: 'fleet-clearance',
    title: 'Fleet Clearance',
    description: 'Unlock Mining Drone Bay.',
    icon: 'DR',
    category: 'Foundations',
    isUnlocked: (ctx) => ctx.upgrades.drone > 0,
  },
  {
    id: 'back-on-payroll',
    title: 'Back on Payroll',
    description: 'Continue after your first hull loss.',
    icon: '++',
    category: 'Foundations',
    isUnlocked: (ctx) => ctx.run.continuedAfterDeath,
  },
  {
    id: 'max-blaster',
    title: 'Maximum Overdrive',
    description: 'Upgrade your blaster to Mark V.',
    icon: 'V',
    category: 'Loadout & Systems',
    isUnlocked: (ctx) => ctx.upgrades.blaster >= 5,
  },
  {
    id: 'orbital-accounting',
    title: 'Orbital Accounting',
    description: 'Own both Options at once.',
    icon: 'OO',
    category: 'Loadout & Systems',
    isUnlocked: (ctx) => ctx.upgrades.options >= 2,
  },
  {
    id: 'missile-paper-trail',
    title: 'Missile Paper Trail',
    description: 'Raise missiles to tier 4.',
    icon: 'M4',
    category: 'Loadout & Systems',
    isUnlocked: (ctx) => ctx.upgrades.missiles >= 4,
  },
  {
    id: 'escalation-clause',
    title: 'Escalation Clause',
    description: 'Unlock Ripple Beam.',
    icon: 'RB',
    category: 'Loadout & Systems',
    isUnlocked: (ctx) => ctx.upgrades.ripple > 0,
  },
  {
    id: 'three-point-policy',
    title: 'Three-Point Policy',
    description: 'Unlock Tri-Bolt Spread.',
    icon: '3X',
    category: 'Loadout & Systems',
    isUnlocked: (ctx) => ctx.upgrades.spread > 0,
  },
  {
    id: 'hands-free-extraction',
    title: 'Hands-Free Extraction',
    description: 'Unlock Auto Targeting Assist.',
    icon: 'AT',
    category: 'Loadout & Systems',
    isUnlocked: (ctx) => ctx.upgrades.autoTool > 0,
  },
  {
    id: 'unsafe-working-speed',
    title: 'Unsafe Working Speed',
    description: 'Unlock Thruster Vectoring.',
    icon: '>>',
    category: 'Loadout & Systems',
    isUnlocked: (ctx) => ctx.upgrades.thrusters > 0,
  },
  {
    id: 'full-compliance-package',
    title: 'Full Compliance Package',
    description: 'Own every permanent upgrade at least once.',
    icon: 'FC',
    category: 'Loadout & Systems',
    isUnlocked: (ctx) => hasFullCompliance(ctx.upgrades),
  },
  {
    id: 'mixed-portfolio',
    title: 'Mixed Portfolio',
    description: 'Sell at least one of every mineral in a single dock.',
    icon: 'MX',
    category: 'Mining & Economy',
    isUnlocked: (ctx) => ctx.run.mixedPortfolioSale,
  },
  {
    id: 'bulk-shipment',
    title: 'Bulk Shipment',
    description: 'Sell a full cargo hold.',
    icon: 'BX',
    category: 'Mining & Economy',
    isUnlocked: (ctx) => ctx.run.soldFullCargo,
  },
  {
    id: 'open-pit-dividend',
    title: 'Open-Pit Dividend',
    description: 'Earn 500 scrap from a single sale.',
    icon: '500',
    category: 'Mining & Economy',
    isUnlocked: (ctx) => ctx.metrics.bestSaleValue >= 500,
  },
  {
    id: 'rare-earth-accounting',
    title: 'Rare Earth Accounting',
    description: 'Sell 10 Exotics in one dock.',
    icon: 'EX',
    category: 'Mining & Economy',
    isUnlocked: (ctx) => ctx.run.soldTenExotics,
  },
  {
    id: 'lean-inventory',
    title: 'Lean Inventory',
    description: 'Fill the cargo hold and dock within 30 seconds.',
    icon: '30',
    category: 'Mining & Economy',
    isUnlocked: (ctx) => ctx.run.dockedWithinThirtySecondsOfFullCargo,
  },
  {
    id: 'touch-and-go-accounting',
    title: 'Touch-and-Go Accounting',
    description: 'Dock, sell, buy, and undock within 20 seconds.',
    icon: '20',
    category: 'Mining & Economy',
    isUnlocked: (ctx) => ctx.run.touchAndGoComplete,
  },
  {
    id: 'rich-miner',
    title: 'Corporate Favorite',
    description: 'Mine a total of 5000 scrap.',
    icon: '$$',
    category: 'Mining & Economy',
    isUnlocked: (ctx) => ctx.metrics.totalScrapMined >= 5000,
    progress: (ctx) => ({ current: Math.min(ctx.metrics.totalScrapMined, 5000), goal: 5000 }),
  },
  {
    id: 'strip-rights',
    title: 'Strip Rights',
    description: 'Destroy 250 asteroids across all runs.',
    icon: '250',
    category: 'Mining & Economy',
    isUnlocked: (ctx) => ctx.metrics.totalAsteroidsDestroyed >= 250,
    progress: (ctx) => ({ current: Math.min(ctx.metrics.totalAsteroidsDestroyed, 250), goal: 250 }),
  },
  {
    id: 'quantum-dividends',
    title: 'Quantum Dividends',
    description: 'Acquire the Quantum Refinery.',
    icon: 'QR',
    category: 'Mining & Economy',
    isUnlocked: (ctx) => ctx.upgrades.refinery > 0,
  },
  {
    id: 'first-objection',
    title: 'First Objection',
    description: 'Destroy your first hostile.',
    icon: 'X1',
    category: 'Combat & Survival',
    isUnlocked: (ctx) => ctx.metrics.totalEnemyKills >= 1,
  },
  {
    id: 'defensive-spending',
    title: 'Defensive Spending',
    description: 'Have shield, hull, and armor each absorb a hit in one run.',
    icon: 'DEF',
    category: 'Combat & Survival',
    isUnlocked: (ctx) =>
      ctx.run.shieldAbsorbedThisRun && ctx.run.hullAbsorbedThisRun && ctx.run.armorAbsorbedThisRun,
  },
  {
    id: 'survivor',
    title: 'Hard to Kill',
    description: 'Trigger a Smart Bomb and survive for another 2 minutes.',
    icon: 'SB',
    category: 'Combat & Survival',
    isUnlocked: (ctx) =>
      ctx.run.smartBombRecoveredAtSec !== null &&
      ctx.runTimeSec >= ctx.run.smartBombRecoveredAtSec + 120,
  },
  {
    id: 'paperwork-error',
    title: 'Paperwork Error',
    description: 'Outlast an Arbiter until it withdraws.',
    icon: 'WR',
    category: 'Combat & Survival',
    isUnlocked: (ctx) => ctx.metrics.arbiterWithdrawals >= 1,
  },
  {
    id: 'first-arbiter',
    title: 'Rules are for Sunkers',
    description: 'Defeat your first Arbiter.',
    icon: 'AR',
    category: 'Combat & Survival',
    isUnlocked: (ctx) => ctx.metrics.totalArbitersDefeated >= 1,
  },
  {
    id: 'appeals-process',
    title: 'Appeals Process',
    description: 'Defeat Arbiter Mark III.',
    icon: 'III',
    category: 'Combat & Survival',
    isUnlocked: (ctx) => ctx.metrics.maxArbiterMarkDefeated >= 3,
  },
  {
    id: 'endless-voyage',
    title: 'Condemned and Operational',
    description: 'Reach the CONDEMNED Ledger tier.',
    icon: 'LG',
    category: 'Combat & Survival',
    isUnlocked: (ctx) => Math.max(ctx.ledger, ctx.metrics.maxLedgerReached) >= 850,
  },
  {
    id: 'quiet-shift',
    title: 'Quiet Shift',
    description: 'Survive 5 minutes without taking a hit.',
    icon: '05',
    category: 'Combat & Survival',
    isUnlocked: (ctx) => !ctx.run.tookHitThisRun && ctx.runTimeSec >= 300,
  },
  {
    id: 'delegated-labor',
    title: 'Delegated Labor',
    description: 'Set your first drone rally point.',
    icon: 'RP',
    category: 'Drone Command',
    isUnlocked: (ctx) => ctx.run.rallySetThisRun,
  },
  {
    id: 'payroll-expansion',
    title: 'Payroll Expansion',
    description: 'Build your first mining drone.',
    icon: 'D1',
    category: 'Drone Command',
    isUnlocked: (ctx) => ctx.metrics.totalDronesBuilt >= 1,
  },
  {
    id: 'middle-management',
    title: 'Middle Management',
    description: 'Have 4 active drones at once.',
    icon: 'D4',
    category: 'Drone Command',
    isUnlocked: (ctx) => ctx.droneCount >= 4,
  },
  {
    id: 'remote-revenue',
    title: 'Remote Revenue',
    description: 'Have drones deliver 250 scrap in a single run.',
    icon: 'RD',
    category: 'Drone Command',
    isUnlocked: (ctx) => ctx.run.droneScrapThisRun >= 250,
  },
  {
    id: 'maintenance-budget',
    title: 'Maintenance Budget',
    description: 'Unlock Drone Repair Bay.',
    icon: 'RB',
    category: 'Drone Command',
    isUnlocked: (ctx) => ctx.upgrades.droneRepair > 0,
  },
  {
    id: 'self-healing-workforce',
    title: 'Self-Healing Workforce',
    description: 'Have Drone Repair Bay rebuild a destroyed drone.',
    icon: 'RE',
    category: 'Drone Command',
    isUnlocked: (ctx) => ctx.metrics.totalDroneRebuilds >= 1,
  },
  {
    id: 'salvage-chain',
    title: 'Salvage Chain',
    description: 'Get 3 drone dock-ins within 10 seconds.',
    icon: '3D',
    category: 'Drone Command',
    isUnlocked: (ctx) => Math.max(ctx.run.bestDroneDockBurst, ctx.metrics.bestDroneDockBurst) >= 3,
  },
  {
    id: 'distributed-operations',
    title: 'Distributed Operations',
    description: 'Defeat an Arbiter while at least one drone is active.',
    icon: 'OP',
    category: 'Drone Command',
    isUnlocked: (ctx) => ctx.run.arbiterDefeatedWithActiveDrone,
  },
  {
    id: 'edge-of-the-permit',
    title: 'Edge of the Permit',
    description: 'Approach a black hole and make it back out.',
    icon: 'BH',
    category: 'Hidden',
    hidden: true,
    isUnlocked: (ctx) => ctx.run.blackHoleEscapedThisRun,
  },
  {
    id: 'for-the-record',
    title: 'For the Record',
    description: 'Take your first photo.',
    icon: 'PH',
    category: 'Hidden',
    hidden: true,
    isUnlocked: (ctx) => ctx.metrics.totalPhotosTaken >= 1,
  },
  {
    id: 'evidence-locker',
    title: 'Evidence Locker',
    description: 'Take a photo while an Arbiter is on screen.',
    icon: 'EV',
    category: 'Hidden',
    hidden: true,
    isUnlocked: (ctx) => ctx.run.photoWithArbiterTaken,
  },
  {
    id: 'drive-through-audit',
    title: 'Drive-Through Audit',
    description: 'Pass through the station 3 times in one run without docking.',
    icon: '3X',
    category: 'Hidden',
    hidden: true,
    isUnlocked: (ctx) => ctx.run.bestDriveThroughStreak >= 3,
  },
  {
    id: 'tool-misuse-report',
    title: 'Tool Misuse Report',
    description: 'Finish an asteroid with Drill Nose.',
    icon: 'DN',
    category: 'Hidden',
    hidden: true,
    isUnlocked: (ctx) => ctx.metrics.drillNoseAsteroidFinishes >= 1,
  },
  {
    id: 'emergency-procurement',
    title: 'Emergency Procurement',
    description: 'Dock at 1 HP and buy a defensive charge before leaving.',
    icon: 'HP',
    category: 'Hidden',
    hidden: true,
    isUnlocked: (ctx) => ctx.run.lowHpDefensivePurchase,
  },
  {
    id: 'no-appeal-filed',
    title: 'No Appeal Filed',
    description: 'Defeat an Arbiter without docking after it spawns.',
    icon: 'ND',
    category: 'Hidden',
    hidden: true,
    isUnlocked: (ctx) => ctx.run.arbiterDefeatedWithoutDocking,
  },
  {
    id: 'split-the-difference',
    title: 'Split the Difference',
    description: 'Destroy a Splitter after it enters the sector.',
    icon: 'SP',
    category: 'Hidden',
    hidden: true,
    isUnlocked: (ctx) => ctx.run.splitterDestroyed,
  },
  {
    id: 'event-horizon-tourist',
    title: 'Event Horizon Tourist',
    description: 'Survive inside a black hole.',
    icon: 'EH',
    category: 'Hidden',
    hidden: true,
    isUnlocked: (ctx) => ctx.run.blackHoleSurvivedThisRun,
  },
  {
    id: 'expedited-routing',
    title: 'Expedited Routing',
    description: 'Take a Wormhole Generator jump.',
    icon: 'WH',
    category: 'Hidden',
    hidden: true,
    isUnlocked: (ctx) => ctx.run.wormholeUsedThisRun,
  },
]

export const ACHIEVEMENTS: Achievement[] = DEFINITIONS.map(
  ({ id, title, description, icon, category, hidden }) => ({
    id,
    title,
    description,
    icon,
    category,
    hidden,
  }),
)

export const ACHIEVEMENT_COUNT = DEFINITIONS.length

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return DEFINITIONS.find((achievement) => achievement.id === id)
}

export function getAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id)
}

export function getAchievementProgress(
  id: string,
  ctx: AchievementEvaluationContext,
): AchievementProgress | null {
  return getAchievementDefinition(id)?.progress?.(ctx) ?? null
}

export function findNewAchievementUnlocks(ctx: AchievementEvaluationContext): Achievement[] {
  const unlocked = new Set(ctx.achievements)
  return DEFINITIONS.filter((achievement) => !unlocked.has(achievement.id) && achievement.isUnlocked(ctx))
}
