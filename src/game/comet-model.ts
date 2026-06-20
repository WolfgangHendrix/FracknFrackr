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

  // --- Voxel Head: a central cube and satellite cubes ---
  const head = new THREE.Group()
  const headBoxGeo = new THREE.BoxGeometry(2.8, 2.8, 2.8)
  const headMat = new THREE.MeshStandardMaterial({
    color: HEAD_COLOR,
    emissive: HEAD_COLOR,
    emissiveIntensity: 0.9,
    flatShading: true,
  })
  const centerBox = new THREE.Mesh(headBoxGeo, headMat)
  head.add(centerBox)

  // Add satellite cubes around the center for a chunky voxel cluster look
  const satOffsets = [
    { x: 1.5, y: 0.2, z: -0.2, s: 1.2 },
    { x: -1.4, y: -0.3, z: 0.3, s: 1.4 },
    { x: 0.2, y: 1.5, z: 0.4, s: 1.1 },
    { x: -0.3, y: -1.4, z: -0.4, s: 1.3 },
    { x: 0.4, y: -0.2, z: 1.5, s: 1.2 },
    { x: -0.2, y: 0.4, z: -1.5, s: 1.0 },
  ]
  for (const sat of satOffsets) {
    const satGeo = new THREE.BoxGeometry(sat.s, sat.s, sat.s)
    const satMesh = new THREE.Mesh(satGeo, headMat)
    satMesh.position.set(sat.x, sat.y, sat.z)
    head.add(satMesh)
  }
  group.add(head)

  // --- Voxel Tail: a collection of trailing voxels merged into a single BufferGeometry ---
  const vertices: number[] = []
  const indices: number[] = []
  let vertexOffset = 0

  function addVoxel(x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const hx = sx / 2
    const hy = sy / 2
    const hz = sz / 2

    // 8 corners
    const localVerts = [
      x - hx, y - hy, z - hz,
      x + hx, y - hy, z - hz,
      x + hx, y + hy, z - hz,
      x - hx, y + hy, z - hz,
      x - hx, y - hy, z + hz,
      x + hx, y - hy, z + hz,
      x + hx, y + hy, z + hz,
      x - hx, y + hy, z + hz,
    ]
    vertices.push(...localVerts)

    // 12 triangles (6 faces)
    const localIndices = [
      0, 2, 1,  0, 3, 2,
      4, 5, 6,  4, 6, 7,
      0, 4, 7,  0, 7, 3,
      1, 2, 6,  1, 6, 5,
      3, 7, 6,  3, 6, 2,
      0, 1, 5,  0, 5, 4,
    ].map(idx => idx + vertexOffset)
    indices.push(...localIndices)

    vertexOffset += 8
  }

  // Central tapering trail (pointing along +X direction)
  addVoxel(2, 0, 0, 2.2, 2.2, 2.2)
  addVoxel(5.5, 0, 0, 1.8, 1.8, 1.8)
  addVoxel(9.5, 0, 0, 1.4, 1.4, 1.4)
  addVoxel(14, 0, 0, 1.0, 1.0, 1.0)
  addVoxel(19, 0, 0, 0.7, 0.7, 0.7)
  addVoxel(25, 0, 0, 0.4, 0.4, 0.4)

  // Sparkly side voxels
  addVoxel(3, 1.2, 0.3, 0.8, 0.8, 0.8)
  addVoxel(3, -1.2, -0.3, 0.8, 0.8, 0.8)
  addVoxel(7, 1.6, -0.4, 0.7, 0.7, 0.7)
  addVoxel(7, -1.6, 0.4, 0.7, 0.7, 0.7)
  addVoxel(12, 1.2, 0.2, 0.6, 0.6, 0.6)
  addVoxel(12, -1.2, -0.2, 0.6, 0.6, 0.6)
  addVoxel(17, 0.8, -0.1, 0.4, 0.4, 0.4)
  addVoxel(17, -0.8, 0.1, 0.4, 0.4, 0.4)

  const tailGeo = new THREE.BufferGeometry()
  tailGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  tailGeo.setIndex(indices)
  tailGeo.computeVertexNormals()

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
