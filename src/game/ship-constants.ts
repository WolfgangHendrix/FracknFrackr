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
