import * as THREE from 'three'
import { COLLECTOR_RANGE } from './metal-chunk'

// ---------------------------------------------------------------------------
// Collector visual effects — magnetic field particles + range ring
// ---------------------------------------------------------------------------

/** Number of stream particles spiraling inward. */
const PARTICLE_COUNT = 12

/** How fast particles spiral inward (units/sec). */
const PARTICLE_INWARD_SPEED = 40

/** Rotation speed of the spiral (radians/sec). */
const PARTICLE_SPIRAL_SPEED = 4

/** Size of each particle cube. */
const PARTICLE_SIZE = 0.5

/** Colors — cyan/blue tones matching the collect button. */
const VFX_COLORS = [0x00ccff, 0x00aaff, 0x44ddff, 0x0088ff] as const

/** Pulsing ring line width. */
const RING_SEGMENTS = 64

interface StreamParticle {
  mesh: THREE.Mesh
  /** Current distance from center (shrinks toward 0). */
  radius: number
  /** Current angle in radians. */
  angle: number
  /** Inward speed for this particle. */
  speed: number
  /** Spawn distance as a fraction (0–1) of the live collector range. */
  startFraction: number
  /** Absolute spawn radius (startFraction × range), refreshed each frame. */
  startRadius: number
}

export interface CollectorVfx {
  group: THREE.Group
  particles: StreamParticle[]
  ring: THREE.Line
  ringMaterial: THREE.LineBasicMaterial
  elapsed: number
}

/**
 * Create the collector VFX group (initially invisible).
 * Add `vfx.group` to the scene, then call `updateCollectorVfx` each frame.
 */
export function createCollectorVfx(): CollectorVfx {
  const group = new THREE.Group()
  group.visible = false

  // --- Stream particles ---
  const particles: StreamParticle[] = []

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const color = VFX_COLORS[i % VFX_COLORS.length]
    const geo = new THREE.BoxGeometry(PARTICLE_SIZE, PARTICLE_SIZE, PARTICLE_SIZE)
    const mat = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      emissive: color,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.7,
    })
    const mesh = new THREE.Mesh(geo, mat)
    group.add(mesh)

    // Spawn fraction in [0.4, 1.0] of the range so particles stream from
    // across the whole magnetic field, not just its outer edge.
    const startFraction = 0.4 + Math.random() * 0.6
    const startRadius = startFraction * COLLECTOR_RANGE
    const angle = Math.random() * Math.PI * 2
    const speed = PARTICLE_INWARD_SPEED * (0.7 + Math.random() * 0.6)

    particles.push({ mesh, radius: startRadius, angle, speed, startFraction, startRadius })
  }

  // --- Range ring ---
  // Built as a unit circle; updateCollectorVfx scales it to the live
  // collector range so the ring always matches the magnet's actual reach.
  const ringGeo = new THREE.BufferGeometry()
  const ringPositions = new Float32Array((RING_SEGMENTS + 1) * 3)
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const theta = (i / RING_SEGMENTS) * Math.PI * 2
    ringPositions[i * 3] = Math.cos(theta)
    ringPositions[i * 3 + 1] = Math.sin(theta)
    ringPositions[i * 3 + 2] = 0
  }
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPositions, 3))
  const ringMaterial = new THREE.LineBasicMaterial({
    color: 0x00aaff,
    transparent: true,
    opacity: 0.25,
  })
  const ring = new THREE.Line(ringGeo, ringMaterial)
  group.add(ring)

  return { group, particles, ring, ringMaterial, elapsed: 0 }
}

/**
 * Update the collector VFX each frame.
 * @param active - Whether the collector is currently active.
 * @param shipX - Ship world X position.
 * @param shipY - Ship world Y position.
 * @param range - Current magnet pickup range (world units). The range ring
 *                and particle stream are sized to match.
 */
export function updateCollectorVfx(
  vfx: CollectorVfx,
  dt: number,
  active: boolean,
  shipX: number,
  shipY: number,
  range: number,
): void {
  vfx.group.visible = active
  if (!active) {
    vfx.elapsed = 0
    return
  }

  vfx.elapsed += dt

  // Position VFX group at ship
  vfx.group.position.set(shipX, shipY, 0)

  // Size the range ring to the live magnet reach (geometry is a unit circle)
  vfx.ring.scale.setScalar(range)

  // Update stream particles — spiral inward, respawn at edge
  for (const p of vfx.particles) {
    // Track the live range so the stream fills the whole magnetic field
    p.startRadius = Math.max(2, p.startFraction * range)
    p.radius -= p.speed * dt
    p.angle += PARTICLE_SPIRAL_SPEED * dt

    // Respawn at a random edge position when it reaches center
    if (p.radius <= 1) {
      p.radius = p.startRadius
      p.angle = Math.random() * Math.PI * 2
    }

    p.mesh.position.x = Math.cos(p.angle) * p.radius
    p.mesh.position.y = Math.sin(p.angle) * p.radius
    p.mesh.position.z = 0

    // Fade / shrink as it approaches center
    const t = p.radius / p.startRadius
    const scale = 0.3 + t * 0.7
    p.mesh.scale.setScalar(scale)

    const mat = p.mesh.material as THREE.MeshStandardMaterial
    mat.opacity = 0.3 + t * 0.5
  }

  // Pulse the range ring
  const pulse = 0.15 + Math.sin(vfx.elapsed * 4) * 0.1
  vfx.ringMaterial.opacity = pulse
}

/**
 * Dispose all geometries and materials in the collector VFX.
 */
export function disposeCollectorVfx(vfx: CollectorVfx): void {
  for (const p of vfx.particles) {
    p.mesh.geometry.dispose()
    if (p.mesh.material instanceof THREE.Material) {
      p.mesh.material.dispose()
    }
  }
  vfx.ring.geometry.dispose()
  vfx.ringMaterial.dispose()
}
