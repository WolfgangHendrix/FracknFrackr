/**
 * Screen shake effect — offsets the camera temporarily on impact.
 * Decays exponentially over time.
 */

export interface ScreenShake {
  offsetX: number
  offsetY: number
  trauma: number
  biasX: number
  biasY: number
}

/** Decay rate per second — trauma halves roughly every 0.3 seconds. */
const DECAY_RATE = 4.0

/** Decay rate for directional bias. */
const BIAS_DECAY = 12.0

/** Maximum pixel offset at trauma = 1. */
const MAX_OFFSET = 4.0

/** Frequency of shake oscillation. */
const SHAKE_FREQUENCY = 25

export function createScreenShake(): ScreenShake {
  return { offsetX: 0, offsetY: 0, trauma: 0, biasX: 0, biasY: 0 }
}

/** Add trauma (0–1). Multiple hits stack, clamped to 1. */
export function addTrauma(shake: ScreenShake, amount: number, angle?: number): void {
  shake.trauma = Math.min(1, shake.trauma + amount)
  if (angle !== undefined) {
    // Jolt away from the impact angle
    shake.biasX += Math.cos(angle) * amount * 15
    shake.biasY += Math.sin(angle) * amount * 15
  }
}

/** Update shake each frame. Returns current offset to apply to camera. */
export function updateScreenShake(shake: ScreenShake, dt: number, time: number): void {
  // Decay trauma
  shake.trauma = Math.max(0, shake.trauma - DECAY_RATE * dt)
  
  // Decay bias
  shake.biasX *= Math.max(0, 1 - BIAS_DECAY * dt)
  shake.biasY *= Math.max(0, 1 - BIAS_DECAY * dt)

  if (shake.trauma <= 0.001 && Math.abs(shake.biasX) < 0.01 && Math.abs(shake.biasY) < 0.01) {
    shake.offsetX = 0
    shake.offsetY = 0
    shake.trauma = 0
    shake.biasX = 0
    shake.biasY = 0
    return
  }

  // Quadratic falloff for perceptual intensity
  const intensity = shake.trauma * shake.trauma

  // Use time-based noise (pseudo-random via sin) for smooth shake + bias
  shake.offsetX = shake.biasX + MAX_OFFSET * intensity * Math.sin(time * SHAKE_FREQUENCY)
  shake.offsetY = shake.biasY + MAX_OFFSET * intensity * Math.cos(time * SHAKE_FREQUENCY * 1.3)
}
