/**
 * The Ledger — endless-mode escalation engine.
 *
 * The Arbiter's enforcement AI keeps a running tally of everything the player
 * strips out of the contested belt. Mining rocks and hauling ore raise the
 * Ledger; the Ledger decides how hard the sector hunts back — how often
 * patrols arrive, how big they are, and how hard they hit. The player drives
 * their own difficulty: play greedy, get hunted harder.
 *
 * All endless-mode tuning lives here so the whole escalation curve can be
 * balanced from one file.
 */

// ---------------------------------------------------------------------------
// Ledger gain
// ---------------------------------------------------------------------------

/** Ledger points added per asteroid destroyed. */
export const LEDGER_PER_ASTEROID = 4

/** Ledger points added per metal chunk hauled in. */
export const LEDGER_PER_METAL = 2

// ---------------------------------------------------------------------------
// Threat tiers — flavour labels shown on the HUD as the Ledger climbs
// ---------------------------------------------------------------------------

export interface LedgerTier {
  /** Ledger value at which this tier begins. */
  at: number
  /** HUD label. */
  label: string
  /** HUD accent colour (hex string). */
  color: string
}

/** Ascending threat tiers. The first entry must start at 0. */
export const LEDGER_TIERS: readonly LedgerTier[] = [
  { at: 0, label: 'UNLISTED', color: '#9ca3af' },
  { at: 70, label: 'FLAGGED', color: '#fbbf24' },
  { at: 180, label: 'WATCHED', color: '#fb923c' },
  { at: 340, label: 'HUNTED', color: '#f87171' },
  { at: 560, label: 'MARKED', color: '#ef4444' },
  { at: 850, label: 'CONDEMNED', color: '#dc2626' },
] as const

export interface LedgerStatus {
  /** Index into LEDGER_TIERS. */
  tier: number
  /** Current tier label. */
  label: string
  /** Current tier accent colour. */
  color: string
  /** 0–1 progress toward the next tier (1 once at the final tier). */
  progress: number
}

/** Resolve a Ledger value to its current threat tier and progress. */
export function ledgerStatus(ledger: number): LedgerStatus {
  let tier = 0
  for (let i = 0; i < LEDGER_TIERS.length; i++) {
    if (ledger >= LEDGER_TIERS[i].at) tier = i
  }
  const cur = LEDGER_TIERS[tier]
  const next = LEDGER_TIERS[tier + 1]
  const progress = next ? (ledger - cur.at) / (next.at - cur.at) : 1
  return {
    tier,
    label: cur.label,
    color: cur.color,
    progress: Math.max(0, Math.min(1, progress)),
  }
}

// ---------------------------------------------------------------------------
// Enemy director — escalating patrols
// ---------------------------------------------------------------------------

/** Seconds between enemy patrol spawns. Shrinks as the Ledger climbs. */
export function patrolInterval(ledger: number): number {
  return Math.max(7, 24 - ledger / 28)
}

/** Enemies per patrol. Grows with the Ledger. */
export function patrolSize(ledger: number): number {
  return Math.min(4, 1 + Math.floor(ledger / 160))
}

/** Per-projectile damage for patrol enemies. Scales gently with the Ledger. */
export function patrolEnemyDamage(ledger: number): number {
  return Math.min(15, 6 + Math.floor(ledger / 140))
}

/** Hard cap on concurrent patrol enemies so the screen never becomes unplayable. */
export const MAX_PATROL_ENEMIES = 8

/** Seconds before the first patrol arrives in a fresh endless run. */
export const FIRST_PATROL_DELAY = 14

// ---------------------------------------------------------------------------
// The Arbiter — recurring boss encounters
// ---------------------------------------------------------------------------

/** Ledger value that triggers the next Arbiter encounter (Mark `mark`). */
export function arbiterThreshold(mark: number): number {
  return 250 + (mark - 1) * 320
}

/** The Ledger is multiplied by this when an Arbiter is destroyed — real relief. */
export const ARBITER_DEFEAT_LEDGER_FACTOR = 0.35

/** The Ledger drops by this flat amount when an Arbiter is merely evaded. */
export const ARBITER_EVADE_LEDGER_RELIEF = 90

/**
 * Later Marks grant less Ledger relief on defeat, so expert players cannot
 * keep resetting the run to a stable low-threat loop forever.
 */
export function arbiterDefeatLedgerFactor(mark: number): number {
  return Math.min(0.75, ARBITER_DEFEAT_LEDGER_FACTOR + Math.max(0, mark - 1) * 0.05)
}

/** Later Marks also give less relief when merely outlasted. */
export function arbiterEvadeLedgerRelief(mark: number): number {
  return Math.max(20, ARBITER_EVADE_LEDGER_RELIEF - Math.max(0, mark - 1) * 8)
}

// ---------------------------------------------------------------------------
// Auto-balance — player-power-driven difficulty
// ---------------------------------------------------------------------------
//
// The raw Ledger only climbs from mining, so a player who stops mining to fight
// freezes their own difficulty — and a full loadout trivialises a modest
// Ledger. Auto-balance fixes both: it derives a 0–1 "power index" from the
// player's permanent loadout and folds it (plus run progress) into an
// `effectiveThreat` the enemy director reads in place of the raw Ledger. A
// maxed ship faces denser, harder, more varied waves at the same Ledger.
//
// Consumable charges (armor/shield/hull) are deliberately NOT inputs — they
// refill constantly, and feeding them in would make difficulty oscillate as
// the player spends and tops them up.

/** Permanent (non-consumable) upgrade levels that define loadout strength. */
export interface LoadoutPower {
  blasterTier: number // 1..5
  collectorTier: number // 1..5
  speedTier: number // 0..5
  spreadTier: number // 0..1
  missileTier: number // 0..8
  optionCount: number // 0..3 (3rd orb from Exotic Matter Hull)
  coolingTier: number // 0..3
  magnetTier: number // 0..3
  sensorTier: number // 0..3
  drillNoseTier: number // 0..3
  bountyTier: number // 0..3
  droneTier: number // 0..4
  rippleUnlocked: boolean
  autoToolUnlocked: boolean
  thrustersUnlocked: boolean
  droneRepairUnlocked: boolean
  missileBiasUnlocked: boolean
  smartBomb: boolean
}

/** 0–1 measure of loadout completeness — 1 ≈ everything bought/maxed. */
export function computePowerIndex(p: LoadoutPower): number {
  const frac = (v: number, min: number, max: number) =>
    Math.max(0, Math.min(1, (v - min) / (max - min)))
  const parts = [
    frac(p.blasterTier, 1, 5),
    frac(p.collectorTier, 1, 5),
    frac(p.speedTier, 0, 5),
    p.spreadTier > 0 ? 1 : 0,
    frac(p.missileTier, 0, 8),
    frac(p.optionCount, 0, 3),
    frac(p.coolingTier, 0, 3),
    frac(p.magnetTier, 0, 3),
    frac(p.sensorTier, 0, 3),
    frac(p.drillNoseTier, 0, 3),
    frac(p.bountyTier, 0, 3),
    frac(p.droneTier, 0, 4),
    p.rippleUnlocked ? 1 : 0,
    p.autoToolUnlocked ? 1 : 0,
    p.thrustersUnlocked ? 1 : 0,
    p.droneRepairUnlocked ? 1 : 0,
    p.missileBiasUnlocked ? 1 : 0,
    p.smartBomb ? 1 : 0,
  ]
  const sum = parts.reduce((a, b) => a + b, 0)
  return sum / parts.length
}

/** Phantom Ledger a full loadout (powerIndex 1) adds to the director. */
const POWER_THREAT_MAX = 350
/** Phantom Ledger added per Arbiter destroyed this run. */
const MARK_THREAT_STEP = 60
/** Fraction of peak Ledger folded back in as a slow run-depth ratchet. */
const PEAK_THREAT_FACTOR = 0.15
/** Cap on the run-depth contribution so it never dominates the curve. */
const PEAK_THREAT_CAP = 200

/**
 * Extra "phantom Ledger" the enemy director sees on top of the raw Ledger,
 * blending loadout power (the main lever), Arbiter kills, and run depth.
 */
export function threatBonus(
  powerIndex: number,
  marksDefeated: number,
  peakLedger: number,
): number {
  const loadout = powerIndex * POWER_THREAT_MAX
  const marks = marksDefeated * MARK_THREAT_STEP
  const depth = Math.min(PEAK_THREAT_CAP, peakLedger * PEAK_THREAT_FACTOR)
  return loadout + marks + depth
}

// ---------------------------------------------------------------------------
// Run scoring
// ---------------------------------------------------------------------------

/** End-of-run statistics surfaced to the summary screen. */
export interface RunStats {
  /** Arbiters destroyed this run. */
  marksDefeated: number
  /** Highest Ledger value reached this run. */
  peakLedger: number
  /** Seconds survived this run. */
  runTime: number
  /** Composite score (see computeScore). */
  score: number
}

/** Composite run score: peak Ledger plus a heavy bonus per Arbiter destroyed. */
export function computeScore(peakLedger: number, marksDefeated: number): number {
  return Math.round(peakLedger) + marksDefeated * 500
}

// ---------------------------------------------------------------------------
// Field replenishment
// ---------------------------------------------------------------------------

/** Minimum live asteroid count below which the field replenishes (used for
 *  very small radar ranges; normally the area-derived floor below is larger). */
export const ASTEROID_FLOOR = 28

/**
 * Target field density (rocks per square world unit), tuned to match the
 * initial field (~55 rocks within radius 510). Replenishment keeps the whole
 * radar disk populated at roughly this density, so the field reads as a full
 * belt rather than a small ring near the player. */
export const ASTEROID_DENSITY = 55 / (Math.PI * 510 * 510)

/** Hard cap on the live field count so large sensor ranges don't tank perf. */
export const ASTEROID_FIELD_CAP = 130

/** Asteroids added per replenishment pulse. */
export const ASTEROID_REPLENISH_BATCH = 6

/** Seconds between replenishment pulses while below the floor. */
export const ASTEROID_REPLENISH_INTERVAL = 2.5
