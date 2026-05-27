import * as THREE from 'three'
import type { AsteroidType } from './types'

/** Asteroid voxel colors (hex values). */
export const ASTEROID_COLORS = {
  rock: 0x8b7355,
  rockDark: 0x6b5340,
  rockLight: 0xa08868,
  crystal: 0x88ccff,
} as const

/** Color palettes for each asteroid type, tuned to real spectral-class albedo. */
const TYPE_PALETTES: Record<
  AsteroidType,
  { primary: number; dark: number; light: number; accent: number }
> = {
  'c-type': { primary: 0x4a3f33, dark: 0x2e2620, light: 0x6b5a48, accent: 0x5a5043 },
  's-type': { primary: 0xa07658, dark: 0x7a5a42, light: 0xb89070, accent: 0x88aa55 },
  'm-type': { primary: 0x9098a8, dark: 0x606878, light: 0xc8d0e0, accent: 0xe8eef8 },
  'v-type': { primary: 0xa0552a, dark: 0x753c1d, light: 0xc0703a, accent: 0x6aa563 },
  'd-type': { primary: 0x3a1a1f, dark: 0x231013, light: 0x5a2a30, accent: 0xff5544 },
  comet: { primary: 0x4a6a8b, dark: 0x2a4a6b, light: 0x6a8aab, accent: 0x66ffcc },
}

/** Voxel size for large asteroids — bigger than ship voxels for imposing scale. */
const ASTEROID_VOXEL = 2.0

function addVoxel(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  color: number,
  voxelSize: number,
): void {
  const geo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize)
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x * voxelSize, y * voxelSize, z * voxelSize)
  group.add(mesh)
}

/**
 * Build a voxel-style large asteroid (~10×10×4 voxels).
 * Irregular, rocky shape with a few crystal accents.
 */
export function createLargeAsteroidModel(): THREE.Group {
  const asteroid = new THREE.Group()
  const { rock, rockDark, rockLight, crystal } = ASTEROID_COLORS

  // Core — solid 6×6 center
  for (let x = -3; x <= 3; x++) {
    for (let y = -3; y <= 3; y++) {
      const dist = Math.abs(x) + Math.abs(y)
      if (dist <= 4) {
        const color = (x + y) % 3 === 0 ? rockDark : rock
        addVoxel(asteroid, x, y, 0, color, ASTEROID_VOXEL)
      }
    }
  }

  // Top layer — slightly smaller for 3D depth
  for (let x = -2; x <= 2; x++) {
    for (let y = -2; y <= 2; y++) {
      const dist = Math.abs(x) + Math.abs(y)
      if (dist <= 3) {
        const color = (x * y) % 2 === 0 ? rockLight : rock
        addVoxel(asteroid, x, y, 1, color, ASTEROID_VOXEL)
      }
    }
  }

  // Bottom layer — offset slightly for asymmetry
  for (let x = -2; x <= 3; x++) {
    for (let y = -3; y <= 2; y++) {
      const dist = Math.abs(x) + Math.abs(y)
      if (dist <= 3) {
        addVoxel(asteroid, x, y, -1, rockDark, ASTEROID_VOXEL)
      }
    }
  }

  // Bumpy protrusions — irregular edges
  addVoxel(asteroid, -4, 0, 0, rock, ASTEROID_VOXEL)
  addVoxel(asteroid, 4, 1, 0, rockDark, ASTEROID_VOXEL)
  addVoxel(asteroid, 0, -4, 0, rock, ASTEROID_VOXEL)
  addVoxel(asteroid, 1, 4, 0, rockDark, ASTEROID_VOXEL)
  addVoxel(asteroid, -3, -3, 0, rock, ASTEROID_VOXEL)

  // Crystal accents — small mineral deposits
  addVoxel(asteroid, 2, 1, 1, crystal, ASTEROID_VOXEL)
  addVoxel(asteroid, -1, -2, 1, crystal, ASTEROID_VOXEL)

  return asteroid
}

/** Collision radius per asteroid size (0 = moon, 1 = large, 2 = medium, 3 = small). */
export const ASTEROID_SIZE_RADIUS: Record<number, number> = {
  0: 16,
  1: 8,
  2: 5,
  3: 3,
}

/**
 * Simple seeded random number generator for reproducible asteroid shapes.
 * Returns a function that produces values in [0, 1).
 */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

/**
 * Create a voxel asteroid model with visual variety based on type, size, and a shape seed.
 *
 * @param type - Asteroid type determines color palette
 * @param size - 1 = large (~10 voxels), 2 = medium (~6 voxels), 3 = small (~4 voxels)
 * @param shapeSeed - Seed for deterministic shape variation
 */
export function createAsteroidModel(
  type: AsteroidType,
  size: number,
  shapeSeed: number,
): THREE.Group {
  const asteroid = new THREE.Group()
  const palette = TYPE_PALETTES[type]
  const rand = seededRandom(shapeSeed)

  // Scale voxel size and grid radius by asteroid size (0 = moon, 1 = large, 2 = med, 3 = small)
  const voxelSize = size === 0 ? 3.0 : size === 1 ? 2.0 : size === 2 ? 1.4 : 1.0
  const coreRadius = size === 0 ? 6 : size === 1 ? 4 : size === 2 ? 3 : 2
  const topRadius = Math.max(1, coreRadius - 1)

  // Core layer (z=0) — irregular shape using manhattan distance with random threshold
  const distThreshold = coreRadius + 1
  for (let x = -coreRadius; x <= coreRadius; x++) {
    for (let y = -coreRadius; y <= coreRadius; y++) {
      const dist = Math.abs(x) + Math.abs(y)
      // Vary the edge to create irregular shapes
      const edgeJitter = rand() < 0.3 ? 1 : 0
      if (dist <= distThreshold - edgeJitter) {
        const color = rand() < 0.35 ? palette.dark : palette.primary
        addVoxel(asteroid, x, y, 0, color, voxelSize)
      }
    }
  }

  // Top layer (z=1) — slightly smaller
  for (let x = -topRadius; x <= topRadius; x++) {
    for (let y = -topRadius; y <= topRadius; y++) {
      const dist = Math.abs(x) + Math.abs(y)
      if (dist <= topRadius && rand() < 0.85) {
        const color = rand() < 0.4 ? palette.light : palette.primary
        addVoxel(asteroid, x, y, 1, color, voxelSize)
      }
    }
  }

  // Bottom layer (z=-1) — offset for asymmetry
  const botOffset = rand() < 0.5 ? 1 : 0
  for (let x = -topRadius + botOffset; x <= topRadius; x++) {
    for (let y = -topRadius; y <= topRadius - botOffset; y++) {
      const dist = Math.abs(x) + Math.abs(y)
      if (dist <= topRadius && rand() < 0.8) {
        addVoxel(asteroid, x, y, -1, palette.dark, voxelSize)
      }
    }
  }

  // Extra layers for moon-size asteroids (z = ±2)
  if (size === 0) {
    const innerRadius = Math.max(1, topRadius - 1)
    for (let x = -innerRadius; x <= innerRadius; x++) {
      for (let y = -innerRadius; y <= innerRadius; y++) {
        const dist = Math.abs(x) + Math.abs(y)
        if (dist <= innerRadius && rand() < 0.75) {
          addVoxel(asteroid, x, y, 2, palette.light, voxelSize)
        }
        if (dist <= innerRadius && rand() < 0.7) {
          addVoxel(asteroid, x, y, -2, palette.dark, voxelSize)
        }
      }
    }
  }

  // Bumpy protrusions — random irregular edges (2-5 bumps)
  const bumpCount = 2 + Math.floor(rand() * 4)
  for (let i = 0; i < bumpCount; i++) {
    const angle = rand() * Math.PI * 2
    const bx = Math.round(Math.cos(angle) * (coreRadius + 1))
    const by = Math.round(Math.sin(angle) * (coreRadius + 1))
    const color = rand() < 0.5 ? palette.primary : palette.dark
    addVoxel(asteroid, bx, by, 0, color, voxelSize)
  }

  // Accent voxels (mineral deposits). High-value spectral classes show more
  // visible inclusions — platinum/gold flecks on M-type, basaltic crystal
  // patches on V-type, exotic volatile pockets on D-type.
  const richType = type === 'm-type' || type === 'v-type' || type === 'd-type'
  const accentCount = richType ? 3 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 2)
  for (let i = 0; i < accentCount; i++) {
    const ax = Math.floor(rand() * (topRadius * 2 + 1)) - topRadius
    const ay = Math.floor(rand() * (topRadius * 2 + 1)) - topRadius
    if (Math.abs(ax) + Math.abs(ay) <= topRadius) {
      addVoxel(asteroid, ax, ay, 1, palette.accent, voxelSize)
    }
  }

  // Apply a random rotation around Z for visual variety
  asteroid.rotation.z = rand() * Math.PI * 2

  return asteroid
}
