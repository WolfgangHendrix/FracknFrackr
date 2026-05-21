/**
 * Collision radii for game objects.
 * Circle-circle collision used for all overlap checks.
 */

/** Ship collision radius in world units (~4 unit half-width for the voxel ship). */
export const SHIP_COLLISION_RADIUS = 3

/** Asteroid collision radius in world units (~10 voxel half-width at 2.0 voxel size). */
export const ASTEROID_COLLISION_RADIUS = 8

/** Collision radius for an enemy ship in world units. */
export const ENEMY_COLLISION_RADIUS = 3

/** Push-out buffer to prevent ship from sitting exactly on the edge. */
export const COLLISION_PUSH_BUFFER = 0.5
