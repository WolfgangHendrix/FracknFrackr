/**
 * Ship physics constants.
 */
export const SHIP_ACCELERATION = 200
export const SHIP_MAX_SPEED = 120
export const SHIP_FRICTION = 0.94

/**
 * How fast the hull rotates to face its direction of travel (radians/sec).
 * The hull tracks movement; the turret tracks aim independently.
 */
export const SHIP_TURN_RATE = 9

/**
 * Thruster Vectoring boost tuning. The boost is a punchy dash: an instant
 * velocity kick on activation, a higher speed cap so the kick persists, and a
 * short sustain window before a cooldown lockout. Gated by the
 * `thrustersUnlocked` upgrade in game-tick.
 */
export const BOOST_DURATION = 0.9 // sec of active boost
export const BOOST_COOLDOWN = 3 // sec lockout after a boost
export const BOOST_MULTIPLIER = 3 // accel + max-speed multiplier while boosting
export const BOOST_IMPULSE = 120 // instant velocity kick (units/sec) on activation

/**
 * Ship voxel colors (hex values).
 */
export const SHIP_COLORS = {
  hull: 0x6688aa,
  cockpit: 0x00aaff,
  engine: 0xff6600,
  wingTip: 0x00ff88,
} as const

/**
 * Voxel half-unit size.
 */
export const VOXEL_SIZE = 0.5
