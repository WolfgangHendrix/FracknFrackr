import * as THREE from 'three'
import { VOXEL_SIZE } from './ship-constants'

/** Dark gunmetal used for all three armor layers. */
const ARMOR_COLOR = 0x445566

/** Industrial palette for the asteroid-mining vessel. */
const MINING_COLORS = {
  hull: 0x7c8a99, // steel plating
  hullDark: 0x49545f, // gunmetal frame
  cockpit: 0x35d0ff, // bridge glass
  engine: 0xff7a1a, // thruster glow
  hazard: 0xf2b21c, // hazard-stripe yellow
  drill: 0xcdd2db, // drill-bit alloy
  claw: 0xe8842a, // mining-claw orange
} as const

function addVoxelSized(
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

function addVoxel(group: THREE.Group, x: number, y: number, z: number, color: number): void {
  addVoxelSized(group, x, y, z, color, VOXEL_SIZE)
}

/**
 * Build a voxel-style player ship.
 * 'prologue' applies all hull and armor modules on top of the normal ship
 * so the intro shows exactly the ship the player is working toward.
 */
export function createShipModel(variant: 'normal' | 'prologue' = 'normal'): THREE.Group {
  const ship = createMiningShipModel()
  if (variant === 'prologue') {
    applyHullModules(ship, 3)
    applyArmorModules(ship, 3)
  }
  return ship
}

/**
 * Build the standard player vessel — a chunky asteroid-mining ship.
 *
 * Facing local +Y: a wide rear engine block, an armoured cargo midsection
 * flanked by hazard-striped ore pods, a glass bridge, and a forward mining
 * rig (twin pincer claws around a central drill bit). The aim turret sits on
 * top of the hull and rotates independently.
 */
function createMiningShipModel(): THREE.Group {
  const ship = new THREE.Group()
  const { hull, hullDark, cockpit, engine, hazard, drill, claw } = MINING_COLORS

  // --- Rear engine block — wide gunmetal mount with thruster nozzles ---
  for (let x = -2; x <= 2; x++) {
    addVoxel(ship, x, -3, 0, hullDark)
  }
  // Recessed thruster nozzles (engine trail anchors here)
  for (let x = -1; x <= 1; x++) {
    addVoxel(ship, x, -4, -0.3, engine)
  }
  addVoxel(ship, -2, -4, -0.3, engine)
  addVoxel(ship, 2, -4, -0.3, engine)

  // --- Armoured cargo midsection — 3-wide hull core ---
  for (let row = -2; row <= 2; row++) {
    for (let x = -1; x <= 1; x++) {
      // Hazard stripe runs down the spine
      const color = x === 0 && (row === -1 || row === 1) ? hazard : hull
      addVoxel(ship, x, row, 0, color)
    }
  }

  // --- Side ore pods — hazard-striped containers flanking the hull ---
  for (const side of [-1, 1]) {
    const px = side * 2
    addVoxel(ship, px, -1, 0, hullDark)
    addVoxel(ship, px, 0, 0, hazard)
    addVoxel(ship, px, 1, 0, hullDark)
    // Stacked upper container
    addVoxel(ship, px, 0, 0.7, hullDark)
  }

  // --- Bridge — glass cockpit set between two frame blocks ---
  addVoxel(ship, -1, 3, 0.2, hullDark)
  addVoxel(ship, 1, 3, 0.2, hullDark)
  addVoxel(ship, 0, 3, 0.5, cockpit)

  // --- Forward mining rig — twin pincer claws around a central drill ---
  // Claw mounts
  addVoxel(ship, -2, 3, 0, hullDark)
  addVoxel(ship, 2, 3, 0, hullDark)
  // Left claw arm, curving inward toward the tip
  addVoxel(ship, -2, 4, 0, claw)
  addVoxel(ship, -2, 5, 0, claw)
  addVoxel(ship, -1, 6, 0, claw)
  // Right claw arm, mirrored
  addVoxel(ship, 2, 4, 0, claw)
  addVoxel(ship, 2, 5, 0, claw)
  addVoxel(ship, 1, 6, 0, claw)
  // Central drill bit — grouped under a 'drillNose' Object3D so the scene
  // can spin it about its forward axis while the Drill Nose upgrade is
  // actively drilling an asteroid. Spiral-offset ridge voxels around the
  // shaft make the rotation visually obvious (a symmetric stack of cubes
  // looks identical at every angle).
  const drillNose = new THREE.Group()
  drillNose.name = 'drillNose'
  addVoxel(drillNose, 0, 4, 0, drill)
  addVoxel(drillNose, 0, 5, 0, drill)
  addVoxel(drillNose, 0, 6, 0, drill)
  addVoxel(drillNose, 0, 7, 0, drill)
  // Ridge voxels offset off the central axis so a spin reads as motion.
  // Slightly smaller (60% size) and placed in a tight helix around the bit.
  const ridge = (x: number, y: number, z: number): void => {
    const geo = new THREE.BoxGeometry(VOXEL_SIZE * 0.6, VOXEL_SIZE * 0.6, VOXEL_SIZE * 0.6)
    const mat = new THREE.MeshStandardMaterial({ color: claw, flatShading: true })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x * VOXEL_SIZE, y * VOXEL_SIZE, z * VOXEL_SIZE)
    drillNose.add(mesh)
  }
  ridge(0.5, 4.3, 0)
  ridge(-0.5, 4.9, 0)
  ridge(0.5, 5.5, 0)
  ridge(-0.5, 6.1, 0)
  ship.add(drillNose)

  // --- Turret (rotates independently to track the player's aim) ---
  // Named 'turret' so scene.ts can grab it and set rotation.z each frame.
  // Arrow shape pointing along local +Y at rest, so the player can read the
  // aim direction at a glance.
  ship.add(buildArrowTurret(VOXEL_SIZE))

  return ship
}

/**
 * Build the aim-tracking turret. Arrow-shaped (shaft + 3-voxel arrowhead +
 * point), sits on top of the hull, rotates about its base. Sized via the
 * `voxelSize` argument so the prologue ship can use a larger version.
 *
 * Red palette so the aim indicator reads with combat urgency at a glance.
 */
function buildArrowTurret(voxelSize: number): THREE.Group {
  const turret = new THREE.Group()
  turret.name = 'turret'
  const yoke = 0x661111 // dark red base
  const blade = 0xff3333 // bright red shaft + arrowhead + point
  // Pivot/yoke on top of the hull
  addVoxelSized(turret, 0, 0, 1.0, yoke, voxelSize)
  // Shaft just forward of the pivot
  addVoxelSized(turret, 0, 1, 1.2, blade, voxelSize)
  // Arrowhead (3 voxels wide)
  addVoxelSized(turret, -1, 2, 1.2, blade, voxelSize)
  addVoxelSized(turret, 0, 2, 1.2, blade, voxelSize)
  addVoxelSized(turret, 1, 2, 1.2, blade, voxelSize)
  // Arrow point
  addVoxelSized(turret, 0, 3, 1.2, blade, voxelSize)
  return turret
}

/**
 * Hull-bulk module names. Stored as child Group names on the ship so we can
 * remove them by name when the player's tier drops (e.g. on respawn).
 */
const HULL_MODULE_NAMES = ['hullScoop', 'hullCargoPods', 'hullWings'] as const

/** Tier 1: front collector scoop (mint), evokes the prologue scoop. */
function buildHullScoopModule(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'hullScoop'
  const scoop = 0x44cc88
  addVoxel(g, -2, 3, 0, scoop)
  addVoxel(g, 2, 3, 0, scoop)
  addVoxel(g, -3, 2, 0, scoop)
  addVoxel(g, 3, 2, 0, scoop)
  return g
}

/** Tier 2: rear cargo pods flanking the engine. */
function buildHullCargoPodsModule(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'hullCargoPods'
  const cargo = 0x888899
  for (const side of [-1, 1]) {
    const cx = side * 3
    addVoxel(g, cx, -2, 0, cargo)
    addVoxel(g, cx, -3, 0, cargo)
    addVoxel(g, cx, -2, 0.6, cargo)
    addVoxel(g, cx, -3, 0.6, cargo)
  }
  return g
}

/** Tier 3: extended wings + gold accents along the hull. */
function buildHullWingsModule(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'hullWings'
  const gold = 0xccaa44
  const wingTip = 0xe89030
  // Swept-back wings either side.
  for (let w = 3; w <= 4; w++) {
    const row = -w + 2
    addVoxel(g, -w, row, 0, gold)
    addVoxel(g, w, row, 0, gold)
  }
  addVoxel(g, -4, -2, 0, wingTip)
  addVoxel(g, 4, -2, 0, wingTip)
  // Gold spine accents.
  addVoxel(g, 0, -1, 0.6, gold)
  addVoxel(g, 0, 1, 0.6, gold)
  return g
}

/**
 * Attach/detach hull modules on the running ship to match the player's
 * `hull` upgrade tier. Tier 0 = stock ship, tier 3 = scoop + cargo + wings.
 * Idempotent — safe to call every frame, only touches the scene graph when
 * the visible set changes.
 */
export function applyHullModules(ship: THREE.Group, tier: number): void {
  const wantScoop = tier >= 1
  const wantCargo = tier >= 2
  const wantWings = tier >= 3
  const wants: Record<(typeof HULL_MODULE_NAMES)[number], boolean> = {
    hullScoop: wantScoop,
    hullCargoPods: wantCargo,
    hullWings: wantWings,
  }
  // Remove any modules that are no longer wanted.
  for (const name of HULL_MODULE_NAMES) {
    const existing = ship.getObjectByName(name)
    if (!wants[name] && existing) {
      ship.remove(existing)
      existing.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          if (obj.material instanceof THREE.Material) obj.material.dispose()
        }
      })
    }
  }
  // Attach any that are wanted but missing.
  if (wantScoop && !ship.getObjectByName('hullScoop')) ship.add(buildHullScoopModule())
  if (wantCargo && !ship.getObjectByName('hullCargoPods')) ship.add(buildHullCargoPodsModule())
  if (wantWings && !ship.getObjectByName('hullWings')) ship.add(buildHullWingsModule())
}

// ---------------------------------------------------------------------------
// Armor modules — three layers of plating that sit above the hull geometry.
// Lost one-at-a-time when armor charges are depleted; reattached when the
// player re-purchases Armor Plating at the trade station.
// ---------------------------------------------------------------------------

const ARMOR_MODULE_NAMES = ['armorBody', 'armorWings', 'armorTurret'] as const

/** Tier 1: dorsal spine plates over the hull midsection. */
function buildArmorBodyModule(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'armorBody'
  for (const [x, y] of [
    [0, -1], [0, 0], [0, 1],
    [-1, -1], [1, -1],
    [-1, 0], [1, 0],
  ] as [number, number][]) {
    addVoxel(g, x, y, 1, ARMOR_COLOR)
  }
  return g
}

/** Tier 2: shoulder guards above the ore-pod positions. */
function buildArmorWingsModule(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'armorWings'
  for (const side of [-1, 1]) {
    addVoxel(g, side * 2, -2, 1, ARMOR_COLOR)
    addVoxel(g, side * 2, -1, 1, ARMOR_COLOR)
    addVoxel(g, side * 2, 0, 1, ARMOR_COLOR)
  }
  return g
}

/** Tier 3: protective cowl ringing the turret base. */
function buildArmorTurretModule(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'armorTurret'
  addVoxel(g, -1, 0, 1.5, ARMOR_COLOR)
  addVoxel(g, 1, 0, 1.5, ARMOR_COLOR)
  addVoxel(g, 0, -1, 1.5, ARMOR_COLOR)
  addVoxel(g, -1, -1, 1.5, ARMOR_COLOR)
  addVoxel(g, 1, -1, 1.5, ARMOR_COLOR)
  return g
}

/**
 * Attach/detach armor modules to match the player's `armor` upgrade tier.
 * Tier 0 = no armor, tier 3 = body + shoulders + turret cowl.
 * Idempotent — safe to call on every hit or purchase.
 */
export function applyArmorModules(ship: THREE.Group, tier: number): void {
  const wants: Record<(typeof ARMOR_MODULE_NAMES)[number], boolean> = {
    armorBody: tier >= 1,
    armorWings: tier >= 2,
    armorTurret: tier >= 3,
  }
  for (const name of ARMOR_MODULE_NAMES) {
    const existing = ship.getObjectByName(name)
    if (!wants[name] && existing) {
      ship.remove(existing)
      existing.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          if (obj.material instanceof THREE.Material) obj.material.dispose()
        }
      })
    }
  }
  if (wants.armorBody && !ship.getObjectByName('armorBody')) ship.add(buildArmorBodyModule())
  if (wants.armorWings && !ship.getObjectByName('armorWings')) ship.add(buildArmorWingsModule())
  if (wants.armorTurret && !ship.getObjectByName('armorTurret')) ship.add(buildArmorTurretModule())
}
