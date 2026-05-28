import * as THREE from 'three'
import type { Ship } from '@/lib/schemas'
import { SHIP_COLLISION_RADIUS } from './collision-constants'
import { COLLECTOR_RANGE, COLLECTOR_PULL_ACCEL } from './metal-chunk'

// ---------------------------------------------------------------------------
// Scrap box constants
// ---------------------------------------------------------------------------

/** Collision radius for scrap boxes. */
export const SCRAP_BOX_RADIUS = 2.0

/** Voxel size for the scrap box. */
const BOX_VOXEL = 1.6

/** How much scrap a box gives when collected. */
export const SCRAP_BOX_VALUE = 10

/** Friction applied each frame. */
const BOX_FRICTION = 0.99

/** Slow tumble speed (radians/sec). */
const BOX_TUMBLE_SPEED = 1.5

/** Salvage palette — a charred chunk torn from the destroyed enemy ship. */
const SALVAGE_COLORS = {
  hull: 0xaa3333, // enemy hull red
  charred: 0x4a2828, // scorched, burnt metal
  strut: 0x7b828c, // exposed structural metal
  accent: 0xffaa00, // glowing salvage marker
} as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

let nextScrapBoxId = 0

export interface ScrapBox {
  id: string
  mesh: THREE.Group
  x: number
  y: number
  vx: number
  vy: number
  rotSpeed: number
  /** Scrap awarded on collection. Defaults to SCRAP_BOX_VALUE; the Bounty
   *  Manifest upgrade bumps this multiplicatively for enemy-kill drops. */
  value: number
}

// ---------------------------------------------------------------------------
// Salvage model — a wreckage chunk torn from the destroyed enemy ship
// ---------------------------------------------------------------------------

/** Build the MeshStandardMaterial for a salvage voxel of the given color. */
function salvageMaterial(color: number): THREE.MeshStandardMaterial {
  if (color === SALVAGE_COLORS.accent) {
    // Glowing salvage core.
    return new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      metalness: 0.4,
      roughness: 0.4,
      emissive: color,
      emissiveIntensity: 0.6,
    })
  }
  if (color === SALVAGE_COLORS.charred) {
    // Burnt metal — matte, non-reflective.
    return new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      metalness: 0.2,
      roughness: 0.85,
    })
  }
  if (color === SALVAGE_COLORS.strut) {
    // Bare structural metal — shiny.
    return new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      metalness: 0.8,
      roughness: 0.3,
    })
  }
  // Hull plating.
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    metalness: 0.5,
    roughness: 0.5,
  })
}

/**
 * Build the dropped salvage: an irregular voxel cluster that reads as a
 * torn-off piece of the enemy ship — scorched red hull plating, buckled
 * fragments, and exposed structural struts jutting from the break, with a
 * glowing core so it still stands out as a collectible.
 */
function createScrapBoxModel(): THREE.Group {
  const group = new THREE.Group()
  const { hull, charred, strut, accent } = SALVAGE_COLORS

  const voxels: [number, number, number, number][] = [
    // Base hull slab — jagged, asymmetric
    [-1, -1, 0, hull],
    [0, -1, 0, charred],
    [1, -1, 0, hull],
    [-1, 0, 0, hull],
    [0, 0, 0, accent],
    [1, 0, 0, hull],
    [-1, 1, 0, charred],
    [0, 1, 0, hull],
    // Buckled fragments raised off the slab
    [-1, 0, 1, hull],
    [0, 1, 1, charred],
    [1, -1, 1, hull],
    // Exposed structural struts jutting from the break
    [2, 0, 0, strut],
    [-2, 0, 0, strut],
  ]

  for (const [vx, vy, vz, color] of voxels) {
    // Struts are slimmer so they read as torn framework, not full blocks.
    const size = color === strut ? BOX_VOXEL * 0.55 : BOX_VOXEL
    const geo = new THREE.BoxGeometry(size, size, size)
    const mesh = new THREE.Mesh(geo, salvageMaterial(color))
    mesh.position.set(vx * BOX_VOXEL, vy * BOX_VOXEL, vz * BOX_VOXEL * 0.5)
    group.add(mesh)
  }

  return group
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a scrap box at the given position, drifting slowly.
 */
export function createScrapBox(x: number, y: number, value = SCRAP_BOX_VALUE): ScrapBox {
  const mesh = createScrapBoxModel()
  mesh.position.set(x, y, 0)

  // Small random drift
  const angle = Math.random() * Math.PI * 2
  const speed = 3 + Math.random() * 4

  return {
    id: `scrap-box-${nextScrapBoxId++}`,
    mesh,
    value,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    rotSpeed: (Math.random() - 0.5) * BOX_TUMBLE_SPEED * 2,
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update scrap box position and rotation.
 */
export function updateScrapBox(box: ScrapBox, dt: number): void {
  box.vx *= Math.pow(BOX_FRICTION, dt * 60)
  box.vy *= Math.pow(BOX_FRICTION, dt * 60)

  box.x += box.vx * dt
  box.y += box.vy * dt

  box.mesh.position.set(box.x, box.y, 0)
  box.mesh.rotation.z += box.rotSpeed * dt
  box.mesh.rotation.x += box.rotSpeed * 0.3 * dt
}

/**
 * Attract a scrap box toward the ship when collector is active.
 * Returns true if the box is close enough to be collected.
 */
export function attractScrapBoxToShip(
  box: ScrapBox,
  ship: Ship,
  dt: number,
  rangeOverride?: number,
): boolean {
  const dx = ship.x - box.x
  const dy = ship.y - box.y
  const distSq = dx * dx + dy * dy
  const range = rangeOverride ?? COLLECTOR_RANGE

  if (distSq > range * range) return false

  const dist = Math.sqrt(distSq)
  const collectDist = SCRAP_BOX_RADIUS + SHIP_COLLISION_RADIUS

  if (dist < collectDist) return true

  const nx = dx / dist
  const ny = dy / dist

  // Steer existing velocity toward ship
  box.vx += (nx * Math.abs(box.vx) - box.vx) * 0.15
  box.vy += (ny * Math.abs(box.vy) - box.vy) * 0.15

  // Accelerate toward ship — stronger when closer
  const proximity = 1 - dist / range
  const accel = COLLECTOR_PULL_ACCEL * (0.3 + 0.7 * proximity)
  box.vx += nx * accel * dt
  box.vy += ny * accel * dt

  // Clamp to max pull speed
  const speed = Math.sqrt(box.vx ** 2 + box.vy ** 2)
  if (speed > 100) {
    const s = 100 / speed
    box.vx *= s
    box.vy *= s
  }

  return false
}

// ---------------------------------------------------------------------------
// Dispose
// ---------------------------------------------------------------------------

export function disposeScrapBox(box: ScrapBox): void {
  for (const child of box.mesh.children) {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (child.material instanceof THREE.Material) {
        child.material.dispose()
      }
    }
  }
}

/** Reset scrap box ID counter (for testing). */
export function resetScrapBoxIdCounter(): void {
  nextScrapBoxId = 0
}
