/**
 * Background visual effects — nebula swirls, distant black holes,
 * and twinkling deep-space stars.
 */

import * as THREE from 'three'
import {
  BLACK_HOLE_EVENT_HORIZON_RADIUS,
  BLACK_HOLE_POINT_OF_NO_RETURN_RADIUS,
} from './black-hole-constants'

// ---------------------------------------------------------------------------
// Twinkling Stars — enhanced star layer with brightness variation
// ---------------------------------------------------------------------------

const TWINKLE_STAR_COUNT = 200

export interface TwinkleStars {
  points: THREE.Points
  geometry: THREE.BufferGeometry
  /** Per-star base brightness (0.3–1.0). */
  baseBrightness: Float32Array
  /** Per-star twinkle phase offset. */
  phases: Float32Array
  /** Per-star twinkle speed. */
  speeds: Float32Array
}

export function createTwinkleStars(): TwinkleStars {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(TWINKLE_STAR_COUNT * 3)
  const colors = new Float32Array(TWINKLE_STAR_COUNT * 3)
  const baseBrightness = new Float32Array(TWINKLE_STAR_COUNT)
  const phases = new Float32Array(TWINKLE_STAR_COUNT)
  const speeds = new Float32Array(TWINKLE_STAR_COUNT)

  // Star color palette — warm whites, pale blues, subtle golds
  const starColors = [
    [1.0, 1.0, 1.0],
    [0.8, 0.9, 1.0],
    [1.0, 0.95, 0.8],
    [0.7, 0.85, 1.0],
    [1.0, 0.9, 0.9],
  ]

  for (let i = 0; i < TWINKLE_STAR_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 1200
    positions[i * 3 + 1] = (Math.random() - 0.5) * 1200
    positions[i * 3 + 2] = -40 + Math.random() * -20

    const c = starColors[Math.floor(Math.random() * starColors.length)]
    colors[i * 3] = c[0]
    colors[i * 3 + 1] = c[1]
    colors[i * 3 + 2] = c[2]

    baseBrightness[i] = 0.3 + Math.random() * 0.7
    phases[i] = Math.random() * Math.PI * 2
    speeds[i] = 0.5 + Math.random() * 2.0
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size: 0.8,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
  })

  const points = new THREE.Points(geometry, material)

  return { points, geometry, baseBrightness, phases, speeds }
}

export function updateTwinkleStars(
  stars: TwinkleStars,
  time: number,
  camX: number,
  camY: number,
): void {
  // Parallax at slower rate than main stars
  stars.points.position.x = camX * 0.3
  stars.points.position.y = camY * 0.3

  // Update brightness via color attribute
  const colors = stars.geometry.getAttribute('color') as THREE.BufferAttribute
  const arr = colors.array as Float32Array

  for (let i = 0; i < TWINKLE_STAR_COUNT; i++) {
    const brightness =
      stars.baseBrightness[i] * (0.6 + 0.4 * Math.sin(time * stars.speeds[i] + stars.phases[i]))

    const baseR = arr[i * 3]
    const baseG = arr[i * 3 + 1]
    const baseB = arr[i * 3 + 2]

    // Modulate existing color by brightness
    arr[i * 3] = baseR > 0 ? Math.min(1, (baseR / Math.max(baseR, baseG, baseB)) * brightness) : 0
    arr[i * 3 + 1] =
      baseG > 0 ? Math.min(1, (baseG / Math.max(baseR, baseG, baseB)) * brightness) : 0
    arr[i * 3 + 2] =
      baseB > 0 ? Math.min(1, (baseB / Math.max(baseR, baseG, baseB)) * brightness) : 0
  }

  colors.needsUpdate = true
}

export function disposeTwinkleStars(stars: TwinkleStars): void {
  stars.geometry.dispose()
  if (stars.points.material instanceof THREE.Material) {
    stars.points.material.dispose()
  }
}

// ---------------------------------------------------------------------------
// Nebula Swirls — large semi-transparent glowing clouds
// ---------------------------------------------------------------------------

const NEBULA_COUNT = 5

export interface NebulaSwirl {
  mesh: THREE.Mesh
  baseX: number
  baseY: number
  rotationSpeed: number
  driftSpeed: number
  driftAngle: number
  pulseSpeed: number
  pulsePhase: number
}

export interface NebulaSystem {
  swirls: NebulaSwirl[]
  group: THREE.Group
}

const NEBULA_COLORS = [
  0x220044, // deep purple
  0x001133, // dark blue
  0x110022, // dark magenta
  0x002222, // dark teal
  0x1a0011, // dark maroon
] as const

export function createNebulaSystem(): NebulaSystem {
  const group = new THREE.Group()
  const swirls: NebulaSwirl[] = []

  for (let i = 0; i < NEBULA_COUNT; i++) {
    const size = 80 + Math.random() * 120
    const geo = new THREE.CircleGeometry(size, 32)
    const color = NEBULA_COLORS[i % NEBULA_COLORS.length]

    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08 + Math.random() * 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    const mesh = new THREE.Mesh(geo, mat)
    const baseX = (Math.random() - 0.5) * 600
    const baseY = (Math.random() - 0.5) * 600
    mesh.position.set(baseX, baseY, -15)

    group.add(mesh)

    swirls.push({
      mesh,
      baseX,
      baseY,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      driftSpeed: 1 + Math.random() * 2,
      driftAngle: Math.random() * Math.PI * 2,
      pulseSpeed: 0.3 + Math.random() * 0.5,
      pulsePhase: Math.random() * Math.PI * 2,
    })
  }

  return { swirls, group }
}

export function updateNebulaSystem(
  system: NebulaSystem,
  time: number,
  camX: number,
  camY: number,
): void {
  // Parallax at very slow rate
  system.group.position.x = camX * 0.15
  system.group.position.y = camY * 0.15

  for (const swirl of system.swirls) {
    swirl.mesh.rotation.z += swirl.rotationSpeed * 0.016 // approx per-frame
    const mat = swirl.mesh.material as THREE.MeshBasicMaterial
    const basePulse = 0.06 + Math.sin(time * swirl.pulseSpeed + swirl.pulsePhase) * 0.03
    mat.opacity = basePulse
  }
}

export function disposeNebulaSystem(system: NebulaSystem): void {
  for (const swirl of system.swirls) {
    swirl.mesh.geometry.dispose()
    if (swirl.mesh.material instanceof THREE.Material) {
      swirl.mesh.material.dispose()
    }
  }
}

// ---------------------------------------------------------------------------
// Black Hole — gravitational distortion visual
// ---------------------------------------------------------------------------

export interface BlackHole {
  group: THREE.Group
  /** Rotating voxel accretion bands (each a Group of cubes), spun in update. */
  spinners: THREE.Group[]
  /** The bright "point of no return" warning ring — pulses in update. */
  dangerRing: THREE.Mesh
  coreMesh: THREE.Mesh
  /** Time of first update, used to ramp a spawn fade-in. null until first seen.
   *  Holes spawn at fixed positions the instant the player crosses a distance
   *  threshold — sometimes on-screen — so we fade them in to avoid a hard pop. */
  spawnTime: number | null
  x: number
  y: number
}

/** Seconds the spawn fade-in takes to reach full opacity. */
const BLACK_HOLE_FADE_IN = 1.2

/** Visual void radius — matches the gameplay death radius so "sucked in" reads. */
const CORE_RADIUS = BLACK_HOLE_EVENT_HORIZON_RADIUS
/** Warning-ring radius — the gameplay point of no return, drawn so it's legible. */
const DANGER_RADIUS = BLACK_HOLE_POINT_OF_NO_RETURN_RADIUS

/** Build one rotating band of voxel cubes orbiting at `radius`. */
function buildAccretionBand(
  radius: number,
  count: number,
  size: number,
  color: number,
  opacity: number,
): THREE.Group {
  const band = new THREE.Group()
  const geo = new THREE.BoxGeometry(size, size, size)
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const cube = new THREE.Mesh(geo, mat)
    // Slight radial + depth jitter so the disk looks churned, not stamped.
    const r = radius + (Math.random() - 0.5) * size * 1.5
    cube.position.set(Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 4)
    cube.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
    band.add(cube)
  }
  return band
}

export function createBlackHole(x: number, y: number): BlackHole {
  const group = new THREE.Group()
  group.position.set(x, y, -10)

  // Faint gravity-well glow — a big, dim red disc that gives the whole thing
  // a sense of dread bleeding outward.
  const glowGeo = new THREE.CircleGeometry(DANGER_RADIUS * 2.2, 48)
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x3a0010,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  group.add(new THREE.Mesh(glowGeo, glowMat))

  // The void — a hard black disc the size of the death radius.
  const coreGeo = new THREE.CircleGeometry(CORE_RADIUS, 48)
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.97 })
  const coreMesh = new THREE.Mesh(coreGeo, coreMat)
  coreMesh.position.z = 1 // just in front of the glow
  group.add(coreMesh)

  // Purple lensing rim hugging the void.
  const rimGeo = new THREE.RingGeometry(CORE_RADIUS, CORE_RADIUS + 5, 48)
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0x7a2cff,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const rim = new THREE.Mesh(rimGeo, rimMat)
  rim.position.z = 1
  group.add(rim)

  // Voxel accretion disk — chunky cubes in rotating bands, hot core to cooler
  // edge, reaching well past the old ~26-unit footprint for real menace.
  const spinners: THREE.Group[] = [
    buildAccretionBand(CORE_RADIUS + 10, 16, 4.5, 0xff2200, 0.55),
    buildAccretionBand(DANGER_RADIUS + 16, 24, 4.0, 0xff7a00, 0.34),
    buildAccretionBand(DANGER_RADIUS + 40, 30, 3.2, 0xffbb33, 0.2),
  ]
  for (const band of spinners) group.add(band)

  // The "point of no return" warning ring — bright, pulsing, drawn at the play
  // plane (group sits at z=-10, so local z=+12 lands it ~z=+2 world) and with
  // depthTest off so it always reads as the hard boundary it represents.
  const dangerGeo = new THREE.RingGeometry(DANGER_RADIUS - 2, DANGER_RADIUS + 2, 80)
  const dangerMat = new THREE.MeshBasicMaterial({
    color: 0xff3322,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  })
  const dangerRing = new THREE.Mesh(dangerGeo, dangerMat)
  dangerRing.position.z = 12
  dangerRing.renderOrder = 5
  group.add(dangerRing)

  // Remember each material's intended opacity so the spawn fade-in can ramp
  // from 0 up to it (rather than guessing per-material targets in update).
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) {
      o.material.userData.baseOpacity = o.material.opacity
      o.material.opacity = 0 // start invisible; updateBlackHole fades it in
    }
  })

  return { group, spinners, dangerRing, coreMesh, spawnTime: null, x, y }
}

export function updateBlackHole(hole: BlackHole, time: number, camX: number, camY: number): void {
  // Parallax
  hole.group.position.x = hole.x + camX * 0.1
  hole.group.position.y = hole.y + camY * 0.1

  // Spawn fade-in: ramp every material from 0 up to its base opacity over the
  // first ~1.2s so a hole that appears on-screen eases in instead of popping.
  if (hole.spawnTime === null) hole.spawnTime = time
  const fade = Math.min(1, (time - hole.spawnTime) / BLACK_HOLE_FADE_IN)
  if (fade < 1) {
    hole.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) {
        const base = (o.material.userData.baseOpacity as number | undefined) ?? o.material.opacity
        o.material.opacity = base * fade
      }
    })
  }

  // Spin the accretion bands at different rates and directions for churn.
  for (let i = 0; i < hole.spinners.length; i++) {
    hole.spinners[i].rotation.z = time * (0.25 + i * 0.18) * (i % 2 === 0 ? 1 : -1)
  }

  // Pulse the warning ring — an ominous "breathing" so it draws the eye and
  // reads as a live hazard boundary, not scenery. Multiplied by the spawn fade
  // so it eases in with everything else.
  const pulse = 0.6 + 0.4 * Math.sin(time * 3.2)
  const mat = hole.dangerRing.material as THREE.MeshBasicMaterial
  mat.opacity = (0.45 + 0.4 * pulse) * fade
  hole.dangerRing.scale.setScalar(1 + 0.03 * Math.sin(time * 3.2))
}

export function disposeBlackHole(hole: BlackHole): void {
  // Walk the whole group so every cube/ring/disc geometry + material is freed.
  hole.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (obj.material instanceof THREE.Material) obj.material.dispose()
    }
  })
}
