/**
 * Debug-only collision-radius overlay. Renders a colored ring at every
 * collidable entity so testers can see hit-box mismatches at a glance.
 *
 * Implementation: we keep a pool of THREE.Line ring meshes inside the
 * caller-owned Group and reuse them across frames. Lines beyond the count
 * we need are hidden rather than disposed, since the per-frame allocation
 * cost is what we're trying to avoid in the first place.
 */
import * as THREE from 'three'
import type { Ship } from '@/lib/schemas'
import type { Asteroid, Projectile } from './types'
import type { EnemyProjectile, EnemyShip } from './enemy-ship'
import type { MiningDrone } from './mining-drone'
import { SHIP_COLLISION_RADIUS } from './collision-constants'
import { ASTEROID_SIZE_RADIUS } from './asteroid-model'
import { PROJECTILE_RADIUS } from './blaster-constants'
import { MINING_DRONE_COLLISION_RADIUS } from './mining-drone'

const SEGMENTS = 28

function makeRingGeometry(): THREE.BufferGeometry {
  const verts = new Float32Array((SEGMENTS + 1) * 3)
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2
    verts[i * 3] = Math.cos(t)
    verts[i * 3 + 1] = Math.sin(t)
    verts[i * 3 + 2] = 0
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  return geom
}

const RING_GEOMETRY = makeRingGeometry()

function ensureRing(
  group: THREE.Group,
  index: number,
  color: number,
): THREE.Line {
  let line = group.children[index] as THREE.Line | undefined
  if (!line) {
    line = new THREE.Line(
      RING_GEOMETRY,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }),
    )
    line.renderOrder = 50
    group.add(line)
  }
  ;(line.material as THREE.LineBasicMaterial).color.setHex(color)
  line.visible = true
  return line
}

export function updateCollisionDebugRings(
  group: THREE.Group,
  ship: Ship,
  asteroids: readonly Asteroid[],
  projectiles: readonly Projectile[],
  enemyProjectiles: readonly EnemyProjectile[],
  drones: readonly MiningDrone[],
  enemy: EnemyShip | null,
  ambushEnemies: readonly EnemyShip[],
): void {
  group.visible = true
  let i = 0

  // Ship — cyan.
  const sLine = ensureRing(group, i++, 0x00ddff)
  sLine.position.set(ship.x, ship.y, 0.5)
  sLine.scale.setScalar(SHIP_COLLISION_RADIUS)

  // Asteroids — amber.
  for (const a of asteroids) {
    if (a.hp <= 0) continue
    const r = ASTEROID_SIZE_RADIUS[a.size] ?? 0
    if (r <= 0) continue
    const line = ensureRing(group, i++, 0xffaa00)
    line.position.set(a.x, a.y, 0.5)
    line.scale.setScalar(r)
  }

  // Player projectiles — pale yellow.
  for (const p of projectiles) {
    const line = ensureRing(group, i++, 0xffee88)
    line.position.set(p.x, p.y, 0.5)
    line.scale.setScalar(PROJECTILE_RADIUS)
  }

  // Enemy projectiles — red.
  for (const p of enemyProjectiles) {
    const line = ensureRing(group, i++, 0xff4466)
    line.position.set(p.x, p.y, 0.5)
    line.scale.setScalar(PROJECTILE_RADIUS)
  }

  // Drones — mint.
  for (const d of drones) {
    const line = ensureRing(group, i++, 0x77ffcc)
    line.position.set(d.x, d.y, 0.5)
    line.scale.setScalar(MINING_DRONE_COLLISION_RADIUS)
  }

  // Single enemy — orange.
  if (enemy && enemy.alive) {
    const line = ensureRing(group, i++, 0xff7700)
    line.position.set(enemy.x, enemy.y, 0.5)
    line.scale.setScalar(enemy.collisionRadius)
  }

  // Ambush patrols — orange.
  for (const e of ambushEnemies) {
    if (!e.alive) continue
    const line = ensureRing(group, i++, 0xff7700)
    line.position.set(e.x, e.y, 0.5)
    line.scale.setScalar(e.collisionRadius)
  }

  // Hide leftover rings beyond what we need this frame.
  for (let j = i; j < group.children.length; j++) {
    group.children[j].visible = false
  }
}

export function hideCollisionDebugRings(group: THREE.Group): void {
  for (const c of group.children) c.visible = false
  group.visible = false
}
