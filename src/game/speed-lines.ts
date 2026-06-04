/**
 * Directional speed lines — thin streaks aligned with the ship's direction of
 * travel that scroll past the ship to sell a burst of speed (the boost dash).
 *
 * Unlike warp-streaks.ts (radial lines exploding out from screen centre, used
 * for the Arbiter pull-in), these all point the same way — along the velocity
 * vector — and slide backward relative to the ship, like the world rushing by.
 */

import * as THREE from 'three'

const LINE_COUNT = 64
const LINE_LENGTH_MIN = 5
const LINE_LENGTH_MAX = 14
/** Half-width of the band the lines scatter across, perpendicular to travel. */
const LATERAL_SPREAD = 90
/** Half-length of the scroll track along the travel axis (lines wrap within it). */
const ALONG_SPAN = 110
const LINE_Z = -4

interface SpeedLine {
  mesh: THREE.Mesh
  /** Offset perpendicular to the travel direction (constant per line). */
  lateral: number
  /** Position along the travel axis; scrolls backward and wraps. */
  along: number
  scrollSpeed: number
  phase: number
}

export interface SpeedLines {
  group: THREE.Group
  lines: SpeedLine[]
  intensity: number
}

export function createSpeedLines(): SpeedLines {
  const group = new THREE.Group()
  const lines: SpeedLine[] = []

  for (let i = 0; i < LINE_COUNT; i++) {
    const length = LINE_LENGTH_MIN + Math.random() * (LINE_LENGTH_MAX - LINE_LENGTH_MIN)
    // Box is tall along local +Y; we rotate it to the travel direction each frame.
    const geo = new THREE.BoxGeometry(0.25, length, 0.25)
    const hue = 0.55 + Math.random() * 0.1 // blue to cyan
    const color = new THREE.Color().setHSL(hue, 0.6, 0.7 + Math.random() * 0.3)
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.visible = false
    group.add(mesh)

    lines.push({
      mesh,
      lateral: (Math.random() * 2 - 1) * LATERAL_SPREAD,
      along: (Math.random() * 2 - 1) * ALONG_SPAN,
      scrollSpeed: 0.8 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
    })
  }

  return { group, lines, intensity: 0 }
}

/**
 * @param active   Whether speed lines should be showing (boost window open).
 * @param centerX  Camera/ship centre X in world space.
 * @param centerY  Camera/ship centre Y in world space.
 * @param dirAngle Direction of travel (atan2(vy, vx)); lines align to this.
 * @param speed    Ship speed (units/sec); scales scroll rate so faster = busier.
 */
export function updateSpeedLines(
  lines: SpeedLines,
  dt: number,
  active: boolean,
  centerX: number,
  centerY: number,
  dirAngle: number,
  speed: number,
  time: number,
): void {
  const target = active ? 1 : 0
  const rampSpeed = active ? 6.0 : 4.0
  lines.intensity += (target - lines.intensity) * Math.min(1, rampSpeed * dt)

  if (lines.intensity < 0.01) {
    for (const line of lines.lines) line.mesh.visible = false
    return
  }

  // Unit vectors: travel direction and its perpendicular (for lateral scatter).
  const dx = Math.cos(dirAngle)
  const dy = Math.sin(dirAngle)
  const px = -dy
  const py = dx
  // Scroll backward along travel, faster with ship speed so the rush ramps up.
  const scroll = (40 + speed * 1.2) * dt

  for (const line of lines.lines) {
    line.mesh.visible = true

    line.along -= scroll * line.scrollSpeed
    if (line.along < -ALONG_SPAN) line.along += ALONG_SPAN * 2

    line.mesh.position.x = centerX + dx * line.along + px * line.lateral
    line.mesh.position.y = centerY + dy * line.along + py * line.lateral
    line.mesh.position.z = LINE_Z

    // Orient the streak along the travel direction (box is tall on local +Y).
    line.mesh.rotation.z = dirAngle - Math.PI / 2

    // Stretch along travel and flicker so the lines read as motion, not bars.
    const pulse = 0.6 + 0.4 * Math.sin(time * 12 * line.scrollSpeed + line.phase)
    line.mesh.scale.set(1, 1 + lines.intensity * 2.5, 1)
    ;(line.mesh.material as THREE.MeshBasicMaterial).opacity = lines.intensity * pulse * 0.8
  }
}

export function disposeSpeedLines(lines: SpeedLines): void {
  for (const line of lines.lines) {
    line.mesh.geometry.dispose()
    ;(line.mesh.material as THREE.MeshBasicMaterial).dispose()
  }
}
