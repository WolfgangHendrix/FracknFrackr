import type * as THREE from 'three'
import type { ScreenShake } from './screen-shake'

export interface CinematicCamera {
  update: (dt: number, shipX: number, shipY: number, shipVX: number, shipVY: number, combatIntensity: number, screenShake: ScreenShake, boostIntensity?: number) => void
  getFOV: () => number
  getZoom: () => number
  setBaseFOV: (fov: number) => void
  zoomIn: (amount: number, duration: number) => void
  impactPulse: () => void
  dispose: () => void
}

const CAMERA_HEIGHT = 150
const CAMERA_LERP = 0.08
const LEAD_FACTOR = 0.18
const BASE_FOV = 50
const COMBAT_ZOOM_FOV = 44
const COMBAT_ZOOM_SPEED = 3
/** Extra degrees the FOV tightens at full boost — brings the camera a little closer. */
const BOOST_ZOOM_FOV = 6
/** How fast the boost tighten ramps in/out — snappy so the dash reads. */
const BOOST_ZOOM_SPEED = 8

export function createCinematicCamera(camera: THREE.PerspectiveCamera): CinematicCamera {
  let currentFOV = BASE_FOV
  let targetFOV = BASE_FOV
  let zoomTimer = 0
  let zoomDuration = 0
  let zoomAmount = 0
  let pulseTimer = 0
  let boostZoom = 0

  function update(dt: number, shipX: number, shipY: number, shipVX: number, shipVY: number, combatIntensity: number, screenShake: ScreenShake, boostIntensity = 0): void {
    // Keep the normal lead during boost — extra lead-ahead shoved the ship off
    // the edge of the frame. The boost sells speed via the FOV tighten below.
    const targetCamX = shipX + shipVX * LEAD_FACTOR
    const targetCamY = shipY + shipVY * LEAD_FACTOR

    const lerpFactor = 1 - Math.pow(1 - CAMERA_LERP, dt * 60)
    camera.position.x += (targetCamX - camera.position.x) * lerpFactor
    camera.position.y += (targetCamY - camera.position.y) * lerpFactor
    camera.position.z = CAMERA_HEIGHT

    camera.position.x += screenShake.offsetX
    camera.position.y += screenShake.offsetY

    const combatZoom = BASE_FOV - (BASE_FOV - COMBAT_ZOOM_FOV) * combatIntensity
    targetFOV = combatZoom

    if (zoomTimer > 0) {
      zoomTimer -= dt
      const t = zoomTimer / zoomDuration
      targetFOV -= zoomAmount * (1 - t)
    }

    if (pulseTimer > 0) {
      pulseTimer -= dt
      const pulse = Math.sin(pulseTimer * 40) * 0.3 * Math.min(1, pulseTimer * 4)
      camera.position.z = CAMERA_HEIGHT + pulse
    }

    const fovDiff = targetFOV - currentFOV
    currentFOV += fovDiff * Math.min(1, COMBAT_ZOOM_SPEED * dt)

    // Boost tighten rides on top of the combat-zoom FOV with its own fast ramp,
    // so a tap snaps the view in and it eases back out when the burst ends.
    boostZoom += (boostIntensity * BOOST_ZOOM_FOV - boostZoom) * Math.min(1, BOOST_ZOOM_SPEED * dt)

    camera.fov = currentFOV - boostZoom
    camera.updateProjectionMatrix()
  }

  function getFOV(): number { return currentFOV }
  function getZoom(): number { return (BASE_FOV - currentFOV) / (BASE_FOV - COMBAT_ZOOM_FOV) }

  function setBaseFOV(fov: number): void {
    targetFOV = fov
    currentFOV = fov
  }

  function zoomIn(amount: number, duration: number): void {
    zoomAmount = amount
    zoomDuration = duration
    zoomTimer = duration
  }

  function impactPulse(): void {
    pulseTimer = 0.15
  }

  function dispose(): void {}

  return { update, getFOV, getZoom, setBaseFOV, zoomIn, impactPulse, dispose }
}
