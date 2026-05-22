import type { Ship } from '@/lib/schemas'
import type { InputState, AimState } from './input'
import { inputToDirection } from './input'
import { SHIP_ACCELERATION, SHIP_MAX_SPEED, SHIP_FRICTION, SHIP_TURN_RATE } from './ship-constants'

/** Speed (units/sec) below which the hull keeps its current heading. */
const HEADING_HOLD_SPEED = 4

/**
 * Rotate `current` toward `target` by at most `maxDelta` radians, taking the
 * shortest way around the circle.
 */
function steerAngle(current: number, target: number, maxDelta: number): number {
  let diff = target - current
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  if (Math.abs(diff) <= maxDelta) return target
  return current + Math.sign(diff) * maxDelta
}

/**
 * Convert screen-space aim coordinates to a world-space aim angle
 * relative to the ship's position.
 *
 * @param ship - Current ship state
 * @param aim - Screen-space aim state
 * @param screenToWorld - Function that converts screen coords to world coords
 * @returns Rotation angle in radians, or null if aim is not active
 */
export function aimToRotation(
  ship: Ship,
  aim: AimState,
  screenToWorld: (sx: number, sy: number) => { x: number; y: number },
): number | null {
  if (!aim.active) return null

  const world = screenToWorld(aim.screenX, aim.screenY)
  const dx = world.x - ship.x
  const dy = world.y - ship.y

  // Don't update if cursor is basically on top of the ship
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null

  // Ship model faces +Y; Three.js rotation.z is CCW, so the forward
  // vector after rotation θ is [-sin(θ), cos(θ)].  Solving for θ
  // gives atan2(-dx, dy).
  return Math.atan2(-dx, dy)
}

/**
 * Update ship physics for one frame.
 * Mutates the ship state in place.
 *
 * The hull always faces its direction of travel, so the engine exhaust
 * (drawn opposite the hull's heading) stays consistent with how the ship
 * actually moves. The shooting turret tracks the aim direction separately
 * (see scene.ts) and is therefore decoupled from the hull.
 *
 * @param ship - Current ship state (mutated)
 * @param input - Current keyboard input state
 * @param dt - Delta time in seconds
 */
export function updateShip(ship: Ship, input: InputState, dt: number, speedMultiplier = 1): void {
  const [dx, dy] = inputToDirection(input)
  const boostMultiplier = input.boost ? 1.55 : 1
  const accelMultiplier = speedMultiplier * boostMultiplier

  // Apply acceleration
  ship.velocityX += dx * SHIP_ACCELERATION * accelMultiplier * dt
  ship.velocityY += dy * SHIP_ACCELERATION * accelMultiplier * dt

  // Clamp to max speed
  const speed = Math.sqrt(ship.velocityX ** 2 + ship.velocityY ** 2)
  const maxSpeed = SHIP_MAX_SPEED * speedMultiplier * boostMultiplier
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed
    ship.velocityX *= scale
    ship.velocityY *= scale
  }

  // Apply friction (frame-rate independent: raise to dt*60 so behavior
  // is consistent whether running at 30fps or 144fps)
  const friction = Math.pow(SHIP_FRICTION, dt * 60)
  ship.velocityX *= friction
  ship.velocityY *= friction

  // Stop micro-drift
  if (Math.abs(ship.velocityX) < 0.1) ship.velocityX = 0
  if (Math.abs(ship.velocityY) < 0.1) ship.velocityY = 0

  // Update position
  ship.x += ship.velocityX * dt
  ship.y += ship.velocityY * dt

  // Rotate the hull toward its direction of travel. The model faces local +Y,
  // so a velocity of (vx, vy) maps to rotation atan2(-vx, vy). Below the hold
  // speed the heading is kept so a stopped ship doesn't spin from drift noise.
  const speed2 = Math.sqrt(ship.velocityX ** 2 + ship.velocityY ** 2)
  if (speed2 > HEADING_HOLD_SPEED) {
    const targetRotation = Math.atan2(-ship.velocityX, ship.velocityY)
    ship.rotation = steerAngle(ship.rotation, targetRotation, SHIP_TURN_RATE * dt)
  }
}
