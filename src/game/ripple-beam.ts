import * as THREE from 'three'

const RIPPLE_CORE = 0xffffff
const RIPPLE_GLOW = 0x77ffcc

/** Half-angle of the wave-front arc (radians). Defines how wide each ring
 *  segment is — purely a visual spread, no longer used by a filled cone. */
const RIPPLE_HALF_ANGLE = Math.PI / 8 // 22.5°
/** Number of curved sound-wave arcs traveling outward at any time. */
const ARC_COUNT = 6
/** Thickness (radial) of each arc as a fraction of the beam length. */
const ARC_THICKNESS_FRAC = 0.06

interface BeamRefs {
  arcs: THREE.Mesh[]
}

/**
 * Build a "speaker sound-wave" beam: curved arcs (concentric ring segments)
 * that emanate outward in the aim direction. The filled wedge backing
 * previously sat behind the arcs has been dropped — the waves alone read
 * cleaner and tile better when the beam runs all the way off-screen.
 */
export function createRippleBeam(): THREE.Group {
  const group = new THREE.Group()
  group.visible = false

  // Sound-wave arcs. RingGeometry's "theta" zero points along +X with CCW
  // sweep, so we offset to center the arc on +Y (apex pointing along +Y).
  const arcs: THREE.Mesh[] = []
  for (let i = 0; i < ARC_COUNT; i++) {
    const arcGeom = new THREE.RingGeometry(
      1,
      1 + ARC_THICKNESS_FRAC,
      48,
      1,
      Math.PI / 2 - RIPPLE_HALF_ANGLE,
      RIPPLE_HALF_ANGLE * 2,
    )
    // Mix a bright white core with a soft mint outer glow at the same
    // position. Without the wedge backing, the arcs need slightly more
    // body of their own.
    const core = new THREE.Mesh(
      arcGeom,
      new THREE.MeshBasicMaterial({
        color: RIPPLE_CORE,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    core.position.z = 0.02 + i * 0.005
    group.add(core)
    arcs.push(core)

    const glow = new THREE.Mesh(
      arcGeom,
      new THREE.MeshBasicMaterial({
        color: RIPPLE_GLOW,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    glow.position.z = 0.018 + i * 0.005
    // The glow scales slightly larger than the core so it reads as a halo
    // wrapping the bright crest of the wave.
    glow.userData.haloOf = core
    group.add(glow)
  }

  group.userData = { arcs } satisfies BeamRefs
  return group
}

export function updateRippleBeam(
  beam: THREE.Group,
  visible: boolean,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  elapsed: number,
): void {
  beam.visible = visible
  if (!visible) return

  const dx = endX - startX
  const dy = endY - startY
  const length = Math.hypot(dx, dy)
  if (length < 0.1) {
    beam.visible = false
    return
  }

  // Anchor apex at the ship; rotate local +Y to point along the aim.
  beam.position.set(startX, startY, 0.45)
  beam.rotation.z = Math.atan2(dy, dx) - Math.PI / 2

  // Each arc travels from r=0 (apex) out to r=length on a staggered cycle.
  // Fade with distance so they read as fading sound waves.
  const refs = beam.userData as BeamRefs
  for (let i = 0; i < refs.arcs.length; i++) {
    const arc = refs.arcs[i]
    const t = (elapsed * 1.4 + i / refs.arcs.length) % 1
    const r = t * length
    arc.scale.set(r, r, 1)
    const mat = arc.material as THREE.MeshBasicMaterial
    // Strong near the apex, fading out as the wave dissipates.
    mat.opacity = 0.85 * (1 - t) * (1 - t) + 0.08
  }

  // The glow children walk the group looking for their core sibling so the
  // halo always tracks its wave.
  for (const child of beam.children) {
    if (!(child instanceof THREE.Mesh)) continue
    const halo = child.userData.haloOf as THREE.Mesh | undefined
    if (!halo) continue
    child.scale.set(halo.scale.x * 1.18, halo.scale.y * 1.18, 1)
    const haloMat = child.material as THREE.MeshBasicMaterial
    const coreMat = halo.material as THREE.MeshBasicMaterial
    haloMat.opacity = coreMat.opacity * 0.55
  }
}

export function disposeRippleBeam(beam: THREE.Group): void {
  beam.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (obj.material instanceof THREE.Material) obj.material.dispose()
    }
  })
}
