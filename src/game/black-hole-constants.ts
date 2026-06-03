/**
 * Black-hole tuning — one home for both the physics (game-tick.ts) and the
 * visuals (background-effects.ts, scene.ts) so the menacing ring the player
 * sees lines up exactly with the gravity that's actually pulling on them.
 */

/** Radius at which gravity begins (gentle at the edge, quadratic toward center). */
export const BLACK_HOLE_PULL_RADIUS = 200

/** Peak pull acceleration (units/s²) at the very center, before falloff. */
export const BLACK_HOLE_PULL_ACCEL = 420

/** Player pull multiplier — the ship resists slightly better than loose debris. */
export const BLACK_HOLE_PLAYER_PULL_MULT = 0.8

/** Death radius — the ship is consumed inside this. Matches the visual void core. */
export const BLACK_HOLE_EVENT_HORIZON_RADIUS = 20

/**
 * "Point of no return" — inside this a base-thrust ship (SHIP_ACCELERATION 200)
 * can no longer out-accelerate the quadratic pull, so escape is impossible. The
 * bright warning ring in background-effects.ts is drawn at this radius so the
 * player can read exactly how close they dare get.
 *
 * Derivation: pull(d) = ACCEL · PLAYER_MULT · (1 − d/PULL_RADIUS)². Setting that
 * equal to SHIP_ACCELERATION (200) and solving gives d ≈ 48.
 */
export const BLACK_HOLE_POINT_OF_NO_RETURN_RADIUS = 48
