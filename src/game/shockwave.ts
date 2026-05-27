import * as THREE from 'three'

/** Duration of the shockwave animation in seconds. */
export const SHOCKWAVE_DURATION = 1.0

export interface Shockwave {
  mesh: THREE.Mesh
  elapsed: number
}

/**
 * Create a expanding ring shockwave for massive impacts (Smart Bomb).
 */
export function createShockwave(x: number, y: number): Shockwave {
  // Use a thin ring that starts tiny
  const geo = new THREE.RingGeometry(0.1, 1, 64)
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, y, 0.5)
  // Initially rotate so it lies flat on the XY plane
  mesh.rotation.x = 0 
  
  return { mesh, elapsed: 0 }
}

/**
 * Update the shockwave scale and opacity.
 * Returns true if still active.
 */
export function updateShockwave(sw: Shockwave, dt: number): boolean {
  sw.elapsed += dt
  if (sw.elapsed >= SHOCKWAVE_DURATION) return false

  const progress = sw.elapsed / SHOCKWAVE_DURATION
  
  // Rapid expansion to the smart bomb radius (approx 300 units)
  // Using an exponential-like ease-out for power
  const scale = 1 + (Math.pow(progress, 0.4) * 320)
  sw.mesh.scale.setScalar(scale)

  // Fade out towards the end
  const mat = sw.mesh.material as THREE.MeshBasicMaterial
  mat.opacity = 0.8 * (1 - Math.pow(progress, 2))

  return true
}

/**
 * Clean up shockwave resources.
 */
export function disposeShockwave(sw: Shockwave): void {
  sw.mesh.geometry.dispose()
  if (sw.mesh.material instanceof THREE.Material) {
    sw.mesh.material.dispose()
  }
}
