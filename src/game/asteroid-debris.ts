import * as THREE from 'three'
import type { AsteroidType } from './types'

/** How long debris chunks fly before disappearing (seconds). */
const DEBRIS_LIFETIME = 1.2

/** Speed debris flies outward (units/sec). */
const DEBRIS_SPEED = 25

/** Rotation speed of tumbling debris (radians/sec). */
const DEBRIS_TUMBLE_SPEED = 6

/** How many hits between chunk break-offs. */
export const HITS_PER_BREAK = 3

export interface DebrisChunk {
  mesh: THREE.Mesh
  vx: number
  vy: number
  rotSpeed: number
  elapsed: number
  /** Seconds this chunk lives before vanishing — soft rocks fade faster. */
  lifetime: number
}

/**
 * Pick and remove outer voxel meshes from an asteroid model near the hit point.
 * Returns the removed meshes repositioned to world space for use as flying debris.
 *
 * @param asteroidModel - The THREE.Group containing voxel meshes (mutated — children removed)
 * @param hitX - World-space X of the projectile hit
 * @param hitY - World-space Y of the projectile hit
 * @param count - Number of chunks to break off
 */
export function breakChunks(
  asteroidModel: THREE.Group,
  hitX: number,
  hitY: number,
  count: number,
): DebrisChunk[] {
  // Collect all voxel meshes (skip non-Mesh children like the health meter group)
  const meshes: THREE.Mesh[] = []
  for (const child of asteroidModel.children) {
    if (child instanceof THREE.Mesh) {
      meshes.push(child)
    }
  }

  if (meshes.length <= 4) return [] // keep a minimal core

  // Hit position in local space
  const localHitX = hitX - asteroidModel.position.x
  const localHitY = hitY - asteroidModel.position.y

  // Score meshes: prefer outer voxels near the hit point
  const scored = meshes.map((mesh) => {
    const distFromCenter = Math.sqrt(mesh.position.x ** 2 + mesh.position.y ** 2)
    const dx = mesh.position.x - localHitX
    const dy = mesh.position.y - localHitY
    const distFromHit = Math.sqrt(dx * dx + dy * dy)
    // Higher score = better candidate (far from center, close to hit)
    return { mesh, score: distFromCenter - distFromHit * 0.5 }
  })

  scored.sort((a, b) => b.score - a.score)

  const toRemove = Math.min(count, meshes.length - 4)
  const chunks: DebrisChunk[] = []

  for (let i = 0; i < toRemove; i++) {
    const { mesh } = scored[i]

    // Convert mesh position to world space before removing from parent
    const worldPos = new THREE.Vector3()
    mesh.getWorldPosition(worldPos)

    asteroidModel.remove(mesh)

    // Set mesh to world position (it's now a root-level object)
    mesh.position.copy(worldPos)

    // Fly outward from asteroid center
    const dx = worldPos.x - asteroidModel.position.x
    const dy = worldPos.y - asteroidModel.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const nx = dist > 0.01 ? dx / dist : Math.random() - 0.5
    const ny = dist > 0.01 ? dy / dist : Math.random() - 0.5
    const speed = DEBRIS_SPEED * (0.7 + Math.random() * 0.6)

    chunks.push({
      mesh,
      vx: nx * speed,
      vy: ny * speed,
      rotSpeed: (Math.random() - 0.5) * DEBRIS_TUMBLE_SPEED * 2,
      elapsed: 0,
      lifetime: DEBRIS_LIFETIME,
    })
  }

  return chunks
}

/**
 * How each asteroid type flies apart when fully destroyed. Tuned so the
 * material "reads" from the debris: metallic types throw sharp shards fast,
 * carbonaceous/cometary types crumble into a short-lived spray, and the
 * organic d-type splits into a few slow heavy pieces.
 */
interface ShatterProfile {
  /** Fraction of the model's voxels ejected as flying debris (0..1). */
  fraction: number
  /** Outward speed multiplier vs DEBRIS_SPEED. */
  speedMul: number
  /** Tumble-rate multiplier vs DEBRIS_TUMBLE_SPEED. */
  tumbleMul: number
  /** Lifetime multiplier vs DEBRIS_LIFETIME. */
  lifetimeMul: number
  /** Radial direction jitter (radians) — wider = more scattered burst. */
  spread: number
}

const SHATTER_PROFILES: Record<AsteroidType, ShatterProfile> = {
  // Metallic, brittle-hard: sprays sharp shards fast, far, and spinning.
  'v-type': { fraction: 0.9, speedMul: 1.8, tumbleMul: 1.6, lifetimeMul: 1.1, spread: 0.3 },
  // Metallic, heavy: fast chunks that tumble slowly and linger.
  'm-type': { fraction: 0.8, speedMul: 1.4, tumbleMul: 0.7, lifetimeMul: 1.2, spread: 0.25 },
  // Stony reference burst — balanced in every dimension.
  's-type': { fraction: 0.8, speedMul: 1.0, tumbleMul: 1.0, lifetimeMul: 1.0, spread: 0.4 },
  // Carbonaceous, soft: crumbles into many slow, short-lived, wide-scattered bits.
  'c-type': { fraction: 1.0, speedMul: 0.6, tumbleMul: 1.2, lifetimeMul: 0.7, spread: 0.9 },
  // Organic/wet: splits into a few large, slow, lazily tumbling pieces.
  'd-type': { fraction: 0.55, speedMul: 0.8, tumbleMul: 0.5, lifetimeMul: 1.0, spread: 0.5 },
  // Icy: bursts into a fast, very wide spray that fades quickly (sublimates).
  comet: { fraction: 1.0, speedMul: 1.5, tumbleMul: 1.4, lifetimeMul: 0.6, spread: 1.2 },
}

/**
 * Fully shatter a destroyed asteroid, ejecting its voxel meshes as flying
 * debris with a per-type pattern. The meshes are detached from the model
 * (the caller must `scene.add` each returned chunk's mesh); any voxels left
 * on the model are disposed when the model itself is torn down.
 *
 * @param asteroidModel - The THREE.Group of voxel meshes (mutated — children removed)
 * @param type - Asteroid type, selecting the shatter profile
 */
export function shatterAsteroid(
  asteroidModel: THREE.Group,
  type: AsteroidType,
): DebrisChunk[] {
  const profile = SHATTER_PROFILES[type]

  const meshes: THREE.Mesh[] = []
  for (const child of asteroidModel.children) {
    if (child instanceof THREE.Mesh) meshes.push(child)
  }
  if (meshes.length === 0) return []

  // Eject the outermost voxels first so the visible shell flies apart.
  meshes.sort(
    (a, b) =>
      b.position.x ** 2 + b.position.y ** 2 - (a.position.x ** 2 + a.position.y ** 2),
  )
  const ejectCount = Math.max(1, Math.floor(meshes.length * profile.fraction))

  const chunks: DebrisChunk[] = []
  for (let i = 0; i < ejectCount; i++) {
    const mesh = meshes[i]

    const worldPos = new THREE.Vector3()
    mesh.getWorldPosition(worldPos)
    asteroidModel.remove(mesh)
    mesh.position.copy(worldPos)

    // Radial direction from the asteroid center, jittered by the profile spread.
    const dx = worldPos.x - asteroidModel.position.x
    const dy = worldPos.y - asteroidModel.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const baseX = dist > 0.01 ? dx / dist : Math.random() - 0.5
    const baseY = dist > 0.01 ? dy / dist : Math.random() - 0.5
    const jitter = (Math.random() - 0.5) * profile.spread
    const cos = Math.cos(jitter)
    const sin = Math.sin(jitter)
    const nx = baseX * cos - baseY * sin
    const ny = baseX * sin + baseY * cos
    const speed = DEBRIS_SPEED * profile.speedMul * (0.7 + Math.random() * 0.6)

    chunks.push({
      mesh,
      vx: nx * speed,
      vy: ny * speed,
      rotSpeed: (Math.random() - 0.5) * DEBRIS_TUMBLE_SPEED * 2 * profile.tumbleMul,
      elapsed: 0,
      lifetime: DEBRIS_LIFETIME * profile.lifetimeMul,
    })
  }

  return chunks
}

/**
 * Update a debris chunk. Returns true if still alive.
 */
export function updateDebrisChunk(chunk: DebrisChunk, dt: number): boolean {
  chunk.elapsed += dt
  if (chunk.elapsed >= chunk.lifetime) return false

  chunk.mesh.position.x += chunk.vx * dt
  chunk.mesh.position.y += chunk.vy * dt
  chunk.mesh.rotation.z += chunk.rotSpeed * dt
  chunk.mesh.rotation.x += chunk.rotSpeed * 0.7 * dt

  // Shrink over the last 40% of lifetime
  const fadeStart = chunk.lifetime * 0.6
  if (chunk.elapsed > fadeStart) {
    const fadeProgress = (chunk.elapsed - fadeStart) / (chunk.lifetime - fadeStart)
    chunk.mesh.scale.setScalar(1 - fadeProgress)
  }

  return true
}

/**
 * Dispose a debris chunk's geometry and material.
 */
export function disposeDebrisChunk(chunk: DebrisChunk): void {
  chunk.mesh.geometry.dispose()
  if (Array.isArray(chunk.mesh.material)) {
    chunk.mesh.material.forEach((m) => m.dispose())
  } else {
    chunk.mesh.material.dispose()
  }
}
