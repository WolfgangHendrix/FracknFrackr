import * as THREE from 'three'

const BEAM_COLOR = 0x00ccff
const BEAM_CORE_COLOR = 0x88eeff
const BEAM_WIDTH = 0.6
const BEAM_CORE_WIDTH = 0.2

export interface LazerImpact {
  group: THREE.Group
  ring: THREE.Mesh
  glow: THREE.Mesh
  elapsed: number
}

export function createLazerBeam(): THREE.Group {
  const group = new THREE.Group()

  const glowGeo = new THREE.PlaneGeometry(BEAM_WIDTH, 1)
  const glowMat = new THREE.MeshBasicMaterial({
    color: BEAM_COLOR,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  group.add(glow)

  const coreGeo = new THREE.PlaneGeometry(BEAM_CORE_WIDTH, 1)
  const coreMat = new THREE.MeshBasicMaterial({
    color: BEAM_CORE_COLOR,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const core = new THREE.Mesh(coreGeo, coreMat)
  core.position.z = 0.01
  group.add(core)

  const glow2Geo = new THREE.PlaneGeometry(BEAM_WIDTH * 2.5, 1)
  const glow2Mat = new THREE.MeshBasicMaterial({
    color: BEAM_COLOR,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glow2 = new THREE.Mesh(glow2Geo, glow2Mat)
  glow2.position.z = -0.01
  group.add(glow2)

  group.visible = false
  group.renderOrder = 5
  return group
}

export function updateLazerBeam(
  beam: THREE.Group,
  visible: boolean,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  elapsed?: number,
): void {
  beam.visible = visible
  if (!visible) return

  const dx = endX - startX
  const dy = endY - startY
  const length = Math.sqrt(dx * dx + dy * dy)

  if (length < 0.1) {
    beam.visible = false
    return
  }

  beam.position.set((startX + endX) / 2, (startY + endY) / 2, 0.5)
  beam.rotation.z = Math.atan2(dy, dx) - Math.PI / 2

  const pulse = elapsed !== undefined ? 1 + Math.sin(elapsed * 60) * 0.08 : 1
  beam.scale.set(pulse, length * pulse, 1)

  const glowMat = (beam.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial
  if (glowMat) glowMat.opacity = 0.35 + (elapsed !== undefined ? Math.sin(elapsed * 50) * 0.1 : 0)

  const glow2Mat = (beam.children[2] as THREE.Mesh).material as THREE.MeshBasicMaterial
  if (glow2Mat) glow2Mat.opacity = 0.1 + (elapsed !== undefined ? Math.sin(elapsed * 45) * 0.04 : 0)
}

export function createLazerImpact(endX: number, endY: number): LazerImpact {
  const group = new THREE.Group()
  group.position.set(endX, endY, 0.5)

  const ringGeo = new THREE.RingGeometry(0.3, 1.2, 24)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x88eeff,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  group.add(ring)

  const glowGeo = new THREE.SphereGeometry(1.5, 12, 8)
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x00ccff,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  glow.position.z = 0.5
  group.add(glow)

  return { group, ring, glow, elapsed: 0 }
}

export function updateLazerImpact(vfx: LazerImpact, dt: number): boolean {
  vfx.elapsed += dt
  if (vfx.elapsed > 0.3) return false

  const t = vfx.elapsed / 0.3
  const scale = 1 + t * 4
  vfx.ring.scale.setScalar(scale)
  const ringMat = vfx.ring.material as THREE.MeshBasicMaterial
  ringMat.opacity = 0.7 * (1 - t)

  const glowMat = vfx.glow.material as THREE.MeshBasicMaterial
  glowMat.opacity = 0.3 * (1 - t * t)

  vfx.group.scale.setScalar(1 + t * 3)

  return true
}

export function disposeLazerImpact(vfx: LazerImpact): void {
  vfx.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (obj.material instanceof THREE.Material) obj.material.dispose()
    }
  })
}

export function disposeLazerBeam(beam: THREE.Group): void {
  beam.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (obj.material instanceof THREE.Material) obj.material.dispose()
    }
  })
}
