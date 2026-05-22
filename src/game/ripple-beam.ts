import * as THREE from 'three'

const RIPPLE_COLOR = 0x77ffcc
const RIPPLE_CORE = 0xffffff

export function createRippleBeam(): THREE.Group {
  const group = new THREE.Group()
  group.visible = false

  const coneShape = new THREE.Shape()
  coneShape.moveTo(0, -0.5)
  coneShape.lineTo(0.5, 0.5)
  coneShape.lineTo(-0.5, 0.5)
  coneShape.closePath()

  const glow = new THREE.Mesh(
    new THREE.ShapeGeometry(coneShape),
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
    new THREE.ShapeGeometry(coneShape),
    new THREE.MeshBasicMaterial({
      color: RIPPLE_CORE,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  core.position.z = 0.02
  group.add(core)

  for (let i = 0; i < 4; i++) {
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.035),
      new THREE.MeshBasicMaterial({
        color: RIPPLE_CORE,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    band.position.z = 0.04 + i * 0.01
    group.add(band)
  }

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

  beam.position.set((startX + endX) / 2, (startY + endY) / 2, 0.45)
  beam.rotation.z = Math.atan2(dy, dx) - Math.PI / 2

  const maxWidth = Math.max(10, length * 0.42)
  const pulse = 1 + Math.sin(elapsed * 18) * 0.05
  beam.children[0].scale.set(maxWidth * pulse, length, 1)
  beam.children[1].scale.set(maxWidth * 0.45 * pulse, length, 1)

  for (let i = 2; i < beam.children.length; i++) {
    const band = beam.children[i] as THREE.Mesh
    const t = (elapsed * 1.8 + (i - 2) * 0.24) % 1
    band.position.y = -length / 2 + t * length
    band.scale.set(Math.max(0.4, maxWidth * t), 1, 1)
    const mat = band.material
    if (mat instanceof THREE.MeshBasicMaterial) {
      mat.opacity = 0.5 * (1 - t) + 0.08
    }
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
