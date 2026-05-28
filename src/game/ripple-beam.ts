import * as THREE from 'three'

const RIPPLE_COLOR = 0x77ffcc
const RIPPLE_CORE = 0xffffff

/** Half-angle of the pie-slice cone (radians). */
const RIPPLE_HALF_ANGLE = Math.PI / 8 // 22.5°
/** Number of curved sound-wave arcs traveling outward at any time. */
const ARC_COUNT = 5
/** Thickness (radial) of each arc as a fraction of the beam length. */
const ARC_THICKNESS_FRAC = 0.05

interface BeamRefs {
  glow: THREE.Mesh
  core: THREE.Mesh
  arcs: THREE.Mesh[]
}

/**
 * Build a "speaker sound-wave" beam: a pie-slice wedge of additive glow with
 * curved arcs (concentric ring segments) that emanate outward. The wedge
 * apex sits at the local origin and the beam extends along local +Y.
 */
export function createRippleBeam(): THREE.Group {
  const group = new THREE.Group()
  group.visible = false

  // Unit wedge: apex at origin, extending to y=1 with half-angle defined
  // above. Rendered geometry is scaled to actual length each frame.
  const wedgeShape = new THREE.Shape()
  const halfW = Math.tan(RIPPLE_HALF_ANGLE)
  wedgeShape.moveTo(0, 0)
  wedgeShape.lineTo(halfW, 1)
  // Curve the far edge slightly so the wedge reads as a rounded pie slice
  // rather than a flat triangle.
  wedgeShape.quadraticCurveTo(0, 1 + halfW * 0.4, -halfW, 1)
  wedgeShape.closePath()

  const glow = new THREE.Mesh(
    new THREE.ShapeGeometry(wedgeShape),
    new THREE.MeshBasicMaterial({
      color: RIPPLE_COLOR,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  group.add(glow)

  const core = new THREE.Mesh(
    new THREE.ShapeGeometry(wedgeShape),
    new THREE.MeshBasicMaterial({
      color: RIPPLE_CORE,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  core.position.z = 0.01
  group.add(core)

  // Sound-wave arcs. RingGeometry's "theta" zero points along +X with CCW
  // sweep, so we offset to center the arc on +Y (apex pointing along +Y).
  // thetaStart = PI/2 - halfAngle, thetaLength = 2 * halfAngle.
  const arcs: THREE.Mesh[] = []
  for (let i = 0; i < ARC_COUNT; i++) {
    const arcGeom = new THREE.RingGeometry(
      1,
      1 + ARC_THICKNESS_FRAC,
      32,
      1,
      Math.PI / 2 - RIPPLE_HALF_ANGLE,
      RIPPLE_HALF_ANGLE * 2,
    )
    const arc = new THREE.Mesh(
      arcGeom,
      new THREE.MeshBasicMaterial({
        color: RIPPLE_CORE,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    arc.position.z = 0.02 + i * 0.005
    group.add(arc)
    arcs.push(arc)
  }

  group.userData = { glow, core, arcs } satisfies BeamRefs
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

  const refs = beam.userData as BeamRefs
  const pulse = 1 + Math.sin(elapsed * 14) * 0.04
  refs.glow.scale.set(length * pulse, length, 1)
  refs.core.scale.set(length * 0.92, length, 1)

  // Each arc travels from r=0 (apex) out to r=length on a staggered cycle.
  // Fade with distance so they read as fading sound waves.
  for (let i = 0; i < refs.arcs.length; i++) {
    const arc = refs.arcs[i]
    const t = (elapsed * 1.4 + i / refs.arcs.length) % 1
    const r = t * length
    arc.scale.set(r, r, 1)
    const mat = arc.material as THREE.MeshBasicMaterial
    // Strong near the apex, fading out as the wave dissipates.
    mat.opacity = 0.65 * (1 - t) * (1 - t) + 0.05
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
