import * as THREE from 'three'

/**
 * Visuals for a roaming comet: a glowing icy head trailing a tapered, flaring
 * tail. The data lives in game-tick (see {@link Comet}); this module owns only
 * the meshes. The scene creates one per active comet, points the tail opposite
 * the travel direction each frame, and disposes it when the comet is gone.
 */
export interface CometModel {
  group: THREE.Group
  /** Tail mesh — rotated each frame to point away from the velocity. */
  tail: THREE.Mesh
  /** Soft glow sprite-like disc behind the head. */
  glow: THREE.Mesh
}

const HEAD_COLOR = 0x9fe8ff
const TAIL_COLOR = 0x66ffcc

/** Build a comet head + tail group, centered on the head at the origin. */
export function createCometModel(): CometModel {
  const group = new THREE.Group()

  // --- Soft glow halo behind the head ---
  const glowGeo = new THREE.CircleGeometry(7, 20)
  const glowMat = new THREE.MeshBasicMaterial({
    color: TAIL_COLOR,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  glow.position.z = -0.5
  group.add(glow)

  // --- Icy head: a small faceted core ---
  const headGeo = new THREE.IcosahedronGeometry(2.6, 0)
  const headMat = new THREE.MeshStandardMaterial({
    color: HEAD_COLOR,
    emissive: HEAD_COLOR,
    emissiveIntensity: 0.9,
    flatShading: true,
  })
  const head = new THREE.Mesh(headGeo, headMat)
  group.add(head)

  // --- Tail: a flat triangle flaring out behind the head. Built pointing
  //     toward +X so the scene can aim it by rotating to the reverse-velocity
  //     angle. Additive blending makes it read as glowing gas. ---
  const tailLen = 26
  const tailWidth = 6
  const tailGeo = new THREE.BufferGeometry()
  tailGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [0, -1.6, 0, 0, 1.6, 0, tailLen, -tailWidth, 0, tailLen, tailWidth, 0],
      3,
    ),
  )
  tailGeo.setIndex([0, 2, 1, 1, 2, 3])
  const tailMat = new THREE.MeshBasicMaterial({
    color: TAIL_COLOR,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const tail = new THREE.Mesh(tailGeo, tailMat)
  tail.position.z = -0.3
  group.add(tail)

  return { group, tail, glow }
}

/**
 * Orient the tail to stream away from the travel direction and add a subtle
 * shimmer to the head glow. `vx, vy` is the comet velocity; `time` seconds.
 */
export function updateCometModel(
  model: CometModel,
  vx: number,
  vy: number,
  time: number,
): void {
  // The tail points opposite the velocity (i.e. toward where the comet came
  // from). Geometry flares toward +X, so aim +X at the reverse heading.
  const angle = Math.atan2(-vy, -vx)
  model.tail.rotation.z = angle
  const flicker = 0.4 + Math.sin(time * 9) * 0.12
  ;(model.tail.material as THREE.MeshBasicMaterial).opacity = flicker
  ;(model.glow.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(time * 5) * 0.06
}

/** Dispose a comet model's geometries and materials. */
export function disposeCometModel(model: CometModel): void {
  model.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      const mat = obj.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat.dispose()
    }
  })
}
