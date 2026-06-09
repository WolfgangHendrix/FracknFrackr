import * as THREE from 'three'
import type { Ship } from '@/lib/schemas'
import { VOXEL_SIZE } from './ship-constants'
import { SHIP_COLLISION_RADIUS, ENEMY_COLLISION_RADIUS } from './collision-constants'
import { PROJECTILE_RADIUS, LAZER_DAMAGE_MULTIPLIER } from './blaster-constants'
import type { Asteroid, Projectile } from './types'
import { segmentBlockedByAsteroid, resolveEnemyAsteroidCollision } from './collision'

/** Re-exported for callers that import it alongside the enemy ship API. */
export { ENEMY_COLLISION_RADIUS } from './collision-constants'

// ---------------------------------------------------------------------------
// Enemy ship constants
// ---------------------------------------------------------------------------

/** Enemy HP — dies in 1 hit. */
export const ENEMY_MAX_HP = 1

/** Enemy movement speed (units/sec). */
const ENEMY_SPEED = 18

/** Maximum turn rate (radians/sec) — controls how sharply the enemy can steer. */
const ENEMY_TURN_RATE = 1.8

/** How often the enemy picks a new strafe direction (seconds). */
const ENEMY_STRAFE_CHANGE_INTERVAL = 3.0

/** Duration of idle (drifting) periods when in orbit sweet spot. */
const ENEMY_IDLE_DURATION = 3.0
/** Interval between idle periods. */
const ENEMY_IDLE_INTERVAL = 3.0

/** How often the enemy shoots (average seconds between shots). */
const ENEMY_SHOOT_INTERVAL = 3

/** Minimum interval between enemy shots. */
const ENEMY_SHOOT_MIN_INTERVAL = 1.5

/** Enemy projectile speed (units/sec). */
const ENEMY_PROJECTILE_SPEED = 120

/** Enemy projectile damage — very low for tutorial. */
export const ENEMY_PROJECTILE_DAMAGE = 5

/** Enemy projectile lifetime (seconds). */
const ENEMY_PROJECTILE_LIFETIME = 2.0

/** Enemy projectile collision radius. */
const ENEMY_PROJECTILE_RADIUS = 0.8

/** Orbit distance — enemy tries to stay roughly this far from player. */
export const ORBIT_DISTANCE = 50

/** How far from the player the enemy spawns. */
export const ENEMY_SPAWN_DISTANCE = 120

// --- Sniper: long-range, charges a high-damage aimed shot ---
export const SNIPER_MAX_HP = 2
const SNIPER_RANGE = 115
const SNIPER_SPEED = 16
/** Wind-up time before the sniper fires (the laser sight is shown). */
const SNIPER_CHARGE_TIME = 1.3
/** Cooldown after a shot before the sniper can charge again. */
const SNIPER_COOLDOWN = 2.4
const SNIPER_PROJECTILE_SPEED = 280
/** Charged shots hit far harder than a grunt's pot-shot. */
const SNIPER_DAMAGE_MULT = 3

// --- Scavenger: ignores the player, steals dropped loot, flees with it ---
export const SCAVENGER_MAX_HP = 3
const SCAVENGER_SPEED = 48
/** Distance the scavenger loiters at while no loot is in reach. */
const SCAVENGER_LOITER_DISTANCE = 75
/** How close the scavenger must get to snatch a loot item. */
export const SCAVENGER_GRAB_RANGE = 6
/** Once fleeing, the scavenger escapes (despawns) past this distance. */
export const SCAVENGER_ESCAPE_DISTANCE = 380

// --- Carrier: slow, tanky, launches drone swarms ---
export const CARRIER_MAX_HP = 70
/** Shield pool that must be depleted before the carrier's hull takes damage. */
export const CARRIER_SHIELD_HP = 30
const CARRIER_SPEED = 10
const CARRIER_RANGE = 135
/** Seconds between drone launches. */
export const CARRIER_DRONE_INTERVAL = 3.6
/** Max drones a carrier keeps in the field at once. */
export const CARRIER_MAX_DRONES = 3
/** Carrier collision radius — a hulking mothership, far bigger than a grunt. */
const CARRIER_COLLISION_RADIUS = 36
/** Visual scale applied to the carrier's voxel body. */
const CARRIER_BODY_SCALE = 6

// --- Drone: tiny, fast, fragile swarm unit launched by carriers ---
export const DRONE_MAX_HP = 1
/** Drones deal a fraction of the carrier's configured projectile damage. */
export const DRONE_DAMAGE_MULT = 0.5
const DRONE_COLLISION_RADIUS = 3
const DRONE_LAUNCH_SPEED = 42

// --- Drifter: slow, weak, weaponless XP filler that crosses the screen ---
export const DRIFTER_MAX_HP = 1
/** Constant flight speed (units/sec) — set at spawn, never recomputed. */
export const DRIFTER_SPEED = 14
/** Slightly larger than a grunt's hit disc — drifters are easy XP but the
 *  player still needs to see and aim at them. */
const DRIFTER_COLLISION_RADIUS = 3.5

// --- Wedge: V-formation flier that swoops in from a bearing ---
export const WEDGE_MAX_HP = 2
/** Speed of a wedge ship while flying its formation swoop. */
const WEDGE_FORMATION_SPEED = 34
/** Distance to the player at which the wing breaks and members fall into grunt AI. */
const WEDGE_ENGAGE_DISTANCE = 55
/** Max units a follower can stretch ahead of its leader before snapping speed up. */
const WEDGE_CATCHUP_GAIN = 2.4
const WEDGE_COLLISION_RADIUS = ENEMY_COLLISION_RADIUS

// --- Splitter: large slow ship that births 3 grunts on death ---
export const SPLITTER_MAX_HP = 14
const SPLITTER_SPEED = 12
const SPLITTER_RANGE = 90
/** Splitter fires a small 3-shot fan; per-bolt damage = projectileDamage. */
const SPLITTER_SHOOT_INTERVAL = 2.4
const SPLITTER_PROJECTILE_SPEED = 100
/** Number of grunt children spawned when a splitter dies. */
export const SPLITTER_CHILD_COUNT = 3
const SPLITTER_COLLISION_RADIUS = 9
/** Body scale chosen so the visible silhouette (voxel diamond radius 3 × VOXEL_SIZE 0.5 × scale)
 *  comfortably covers the 9-unit hit disc — without this, shots felt like they
 *  were passing through empty space around an invisible hitbox. */
const SPLITTER_BODY_SCALE = 3.2

// --- Hornet: Galaga-style alien that sweeps in and dive-bombs in arcs ---
export const HORNET_MAX_HP = 2
const HORNET_COLLISION_RADIUS = 3.5
/** Speed of a committed dive run (units/sec). */
const HORNET_DIVE_SPEED = 60
/** Speed while arcing back out to a standoff before the next dive. */
const HORNET_REGROUP_SPEED = 40
/** Steering agility — high, so the banking arcs read as nimble swoops. */
const HORNET_TURN_RATE = 2.8
/** Peak lateral bank added to the dive heading (radians) — makes the curved arc. */
const HORNET_BANK = 0.95
/** Seconds a dive run lasts before the hornet arcs back out. */
const HORNET_DIVE_TIME = 2.0
/** Seconds spent climbing back to a standoff between dives. */
const HORNET_REGROUP_TIME = 1.4
/** Standoff distance the hornet pulls back to between dives. */
const HORNET_STANDOFF = 72
/** Max player-distance at which a diving hornet will snap off a shot. */
const HORNET_FIRE_RANGE = 95
/** Seconds between a diving hornet's shots. */
const HORNET_FIRE_INTERVAL = 1.1

// --- Missile: Arbiter-launched homing warhead the player must shoot down ---
/** Takes two blaster bolts (or one lazer tick) to destroy. */
export const MISSILE_MAX_HP = 2
/** Launch/cruise speed cap (units/sec). Slow enough to out-turn, fast enough to threaten. */
const MISSILE_MAX_SPEED = 78
/** Acceleration toward cap (units/sec²). */
const MISSILE_ACCEL = 110
/** Turn rate (rad/sec) — capped so a juking player can break the lock. */
const MISSILE_TURN_RATE = 1.6
const MISSILE_COLLISION_RADIUS = 3
/** Seconds a missile flies before it fizzles out (handled in game-tick). */
export const MISSILE_LIFETIME = 7

/** The behavioural class of a hostile ship. */
export type EnemyKind =
  | 'grunt'
  | 'sniper'
  | 'scavenger'
  | 'carrier'
  | 'drone'
  | 'drifter'
  | 'wedge'
  | 'splitter'
  | 'missile'
  | 'hornet'

/** Colors for the enemy ship. */
const ENEMY_COLORS = {
  hull: 0xaa3333,
  cockpit: 0xff2200,
  engine: 0xff8800,
  wingTip: 0xff4444,
} as const

/** Colors for enemy projectiles — red energy. */
const ENEMY_PROJECTILE_COLORS = {
  core: 0xff3333,
  glow: 0xff6666,
} as const

// ---------------------------------------------------------------------------
// Shipwreck debris constants
// ---------------------------------------------------------------------------

/** Number of shipwreck debris particles on destruction. */
const WRECK_PARTICLE_COUNT = 16

/** How long wreck debris lasts (seconds). */
const WRECK_DURATION = 1.2

/** Speed wreck debris flies outward (units/sec). */
const WRECK_SPEED = 50

/** Wreck debris colors — mix of hull and fire. */
const WRECK_COLORS = [0xaa3333, 0xff6600, 0x884422, 0xff4444, 0x663322] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnemyShip {
  id: string
  mesh: THREE.Group
  /** Behavioural class — drives which AI runs in updateEnemyShip. */
  kind: EnemyKind
  /** Hull collision radius (varies by kind). */
  collisionRadius: number
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  hp: number
  maxHp: number
  alive: boolean
  /** Damage dealt by this enemy's projectiles when they hit the player. */
  projectileDamage: number
  /** Current heading angle (radians) — smoothly steered toward desired. */
  heading: number
  /** Timer for switching strafe direction (CW vs CCW). */
  strafeTimer: number
  /** +1 or -1 — current tangential strafe direction around the player. */
  strafeDir: number
  /** Time until next shot. */
  shootTimer: number
  /** Countdown to next idle/active transition. */
  idleTimer: number
  /** Whether the enemy is currently drifting idle. */
  idling: boolean
  /** Target cardinal angle (0, π/2, π, -π/2) the enemy is steering toward. */
  targetCardinal: number
  // --- Sniper state ---
  /** True while winding up a charged shot (laser sight visible). */
  charging: boolean
  /** Seconds remaining in the current charge. */
  chargeTimer: number
  // --- Scavenger state ---
  /** True once the scavenger has loot and is bolting for the sector edge. */
  fleeing: boolean
  /** Loot the scavenger has stolen — scattered back when it is destroyed. */
  stolenLoot: ('metal' | 'scrap')[]
  /** Id of the loot item the scavenger is currently chasing, or null. */
  targetLootId: string | null
  /** Last known position of the targeted loot. */
  targetLootX: number
  targetLootY: number
  // --- Carrier state ---
  /** Shield pool that absorbs all damage before the hull can be hit. 0 = shield down. */
  carrierShieldHp: number
  /** Countdown to the next drone launch. */
  droneTimer: number
  /** True while a carrier-launched drone is leaving its bay for a staging point. */
  launching: boolean
  launchTargetX: number
  launchTargetY: number
  // --- Formation state (wedge) ---
  /**
   * Direct reference to the wing leader, or null. Followers steer to a slot
   * relative to the leader; the leader itself has null here. Held as a runtime
   * ref (not an id lookup) because TickState is never serialized — wing
   * members are pruned together when the patrol pool is filtered.
   */
  formationLeader: EnemyShip | null
  /** Lateral slot offset (perpendicular to the swoop bearing), units. */
  formationSlotX: number
  /** Trailing slot offset (along the swoop bearing, negative = behind), units. */
  formationSlotY: number
  /** True while still flying the V-formation; false once the wing has broken. */
  inFormation: boolean
  /** Shared id for a formation-entry forcefield. Null for non-formation ships. */
  formationShieldId: string | null
  /** True while the formation-entry forcefield should absorb player damage. */
  formationShieldActive: boolean
  /** World heading the wing is sweeping along, radians. */
  swoopBearing: number
  /** Player-distance at which the leader breaks formation. */
  engageDistance: number
  /**
   * Seconds of life remaining (missiles only). Set at spawn; game-tick
   * decrements it and detonates the missile when it reaches 0 so the warhead
   * can't loiter forever. Unused (0) for every other kind.
   */
  lifeTimer: number
}

export interface EnemyProjectile {
  id: string
  mesh: THREE.Group
  x: number
  y: number
  vx: number
  vy: number
  elapsed: number
  /** Damage dealt to the player on hit. */
  damage: number
}

export interface ShipwreckDebris {
  group: THREE.Group
  particles: { mesh: THREE.Mesh; vx: number; vy: number; rotSpeed: number }[]
  elapsed: number
}

// ---------------------------------------------------------------------------
// Enemy ship model
// ---------------------------------------------------------------------------

let nextEnemyProjectileId = 0

function addVoxel(group: THREE.Group, x: number, y: number, z: number, color: number): void {
  const geo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE)
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x * VOXEL_SIZE, y * VOXEL_SIZE, z * VOXEL_SIZE)
  group.add(mesh)
}

/**
 * Build a voxel enemy ship — similar shape to player but red-themed and
 * slightly more angular/aggressive looking.
 */
function createEnemyShipModel(): THREE.Group {
  const group = new THREE.Group()
  const { hull, cockpit, engine, wingTip } = ENEMY_COLORS

  // Main body — narrower, more aggressive
  for (let row = -2; row <= 3; row++) {
    addVoxel(group, 0, row, 0, hull)
    if (row >= -1 && row <= 2) {
      addVoxel(group, -1, row, 0, hull)
      addVoxel(group, 1, row, 0, hull)
    }
  }

  // Cockpit — red glow
  addVoxel(group, 0, 4, 0.5, cockpit)

  // Wings — swept back, sharper
  for (let w = 2; w <= 4; w++) {
    const row = -w + 1
    addVoxel(group, -w, row, 0, hull)
    addVoxel(group, w, row, 0, hull)
  }

  // Wing tips — red accent
  addVoxel(group, -4, -3, 0, wingTip)
  addVoxel(group, 4, -3, 0, wingTip)

  // Engine glow
  addVoxel(group, -1, -3, -0.3, engine)
  addVoxel(group, 0, -3, -0.3, engine)
  addVoxel(group, 1, -3, -0.3, engine)

  return group
}

/** A thin red beam the sniper projects while charging — scaled by scene.ts. */
function createLaserSight(): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.4, 1, 0.4)
  geo.translate(0, 0.5, 0) // base at the origin, extends along +Y
  const mat = new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.45 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(0, 8, 0.4) // start just past the barrel tip
  mesh.visible = false
  return mesh
}

/** Sniper — slim violet hull with a long forward barrel and a laser sight. */
function createSniperModel(): THREE.Group {
  const group = new THREE.Group()
  const hull = 0x6a3a9a
  const accent = 0xcc66ff
  const eye = 0xff55ff

  for (let row = -3; row <= 3; row++) addVoxel(group, 0, row, 0, hull)
  addVoxel(group, -1, 0, 0, hull)
  addVoxel(group, 1, 0, 0, hull)
  addVoxel(group, -1, -1, 0, hull)
  addVoxel(group, 1, -1, 0, hull)
  // Long barrel reaching forward
  for (let row = 4; row <= 7; row++) addVoxel(group, 0, row, 0.2, accent)
  addVoxel(group, 0, 1, 0.6, eye)
  // Swept fins
  addVoxel(group, -2, -2, 0, hull)
  addVoxel(group, 2, -2, 0, hull)
  addVoxel(group, -2, -3, 0, accent)
  addVoxel(group, 2, -3, 0, accent)
  addVoxel(group, 0, -4, -0.3, 0xff8800)

  const sight = createLaserSight()
  group.add(sight)
  group.userData.laserSight = sight
  return group
}

/** Scavenger — junky amber hull with forward grabber claws. */
function createScavengerModel(): THREE.Group {
  const group = new THREE.Group()
  const hull = 0xaa7722
  const accent = 0xffcc44
  const dark = 0x5a4420

  for (let x = -1; x <= 1; x++) {
    for (let y = -2; y <= 2; y++) {
      addVoxel(group, x, y, 0, x === 0 ? hull : dark)
    }
  }
  // Grabber claws
  addVoxel(group, -2, 3, 0, accent)
  addVoxel(group, 2, 3, 0, accent)
  addVoxel(group, -2, 2, 0, hull)
  addVoxel(group, 2, 2, 0, hull)
  addVoxel(group, -1, 3, 0, hull)
  addVoxel(group, 1, 3, 0, hull)
  addVoxel(group, 0, 1, 0.6, 0x66ffaa)
  // Salvage strapped to the back
  addVoxel(group, -1, -3, 0.3, accent)
  addVoxel(group, 1, -3, -0.3, dark)
  addVoxel(group, 0, -3, 0, hull)
  addVoxel(group, 0, -4, -0.3, 0xff8800)
  return group
}

/**
 * Carrier — a hulking teal mothership with side drone bays and triple
 * engines. The voxels live in an inner group scaled up by CARRIER_BODY_SCALE
 * so the carrier dwarfs the drones it launches; the returned outer group is
 * left unscaled so attachments (health meter) keep their normal size.
 */
function createCarrierModel(): THREE.Group {
  const group = new THREE.Group()
  const body = new THREE.Group()
  const hull = 0x3a6a7a
  const accent = 0x66ddee
  const dark = 0x223a44

  for (let x = -2; x <= 2; x++) {
    for (let y = -3; y <= 3; y++) {
      const edge = Math.abs(x) === 2 || Math.abs(y) === 3
      addVoxel(body, x, y, 0, edge ? dark : hull)
    }
  }
  // Drone bays — glowing slots on the flanks
  addVoxel(body, -3, 0, 0, accent)
  addVoxel(body, 3, 0, 0, accent)
  addVoxel(body, -3, -1, 0, dark)
  addVoxel(body, 3, -1, 0, dark)
  addVoxel(body, -3, 1, 0, dark)
  addVoxel(body, 3, 1, 0, dark)
  // Command bridge
  addVoxel(body, 0, 2, 0.8, accent)
  addVoxel(body, 0, 1, 0.6, hull)
  // Triple engines
  addVoxel(body, -1, -4, -0.3, 0xff8800)
  addVoxel(body, 1, -4, -0.3, 0xff8800)
  addVoxel(body, 0, -4, -0.3, 0xffaa00)

  body.scale.setScalar(CARRIER_BODY_SCALE)
  group.add(body)
  return group
}

/**
 * Drone — a carrier-launched fighter. Same footprint as a regular grunt,
 * with a brighter orange-red palette and straight (rather than swept) wings
 * so it still reads as a distinct unit.
 */
function createDroneModel(): THREE.Group {
  const group = new THREE.Group()
  const hull = 0xcc4444
  const wing = 0xff6644

  // Body — matches the grunt's dimensions
  for (let row = -2; row <= 3; row++) {
    addVoxel(group, 0, row, 0, hull)
    if (row >= -1 && row <= 2) {
      addVoxel(group, -1, row, 0, hull)
      addVoxel(group, 1, row, 0, hull)
    }
  }
  // Cockpit
  addVoxel(group, 0, 4, 0.5, 0xff8888)
  // Straight wings
  for (let w = 2; w <= 4; w++) {
    addVoxel(group, -w, 0, 0, wing)
    addVoxel(group, w, 0, 0, wing)
  }
  addVoxel(group, -4, 1, 0, wing)
  addVoxel(group, 4, 1, 0, wing)
  // Engine glow
  addVoxel(group, -1, -3, -0.3, 0xff8800)
  addVoxel(group, 0, -3, -0.3, 0xff8800)
  addVoxel(group, 1, -3, -0.3, 0xff8800)
  return group
}

/** Drifter — chunky green-grey scout. No cockpit, no weapons, fat squat hull
 *  built wide enough to be a readable target at normal camera distance. */
function createDrifterModel(): THREE.Group {
  const group = new THREE.Group()
  const hull = 0x6a8a6a
  const dark = 0x3a4a3a
  const blink = 0xaaffaa
  // Hull: 3 wide × 4 long — comparable footprint to a grunt body.
  for (let x = -1; x <= 1; x++) {
    for (let y = -2; y <= 2; y++) {
      addVoxel(group, x, y, 0, hull)
    }
  }
  // Stubby side wings push the silhouette out to 5 voxels wide so the
  // outline reads clearly against the starfield.
  addVoxel(group, -2, 0, 0, dark)
  addVoxel(group, 2, 0, 0, dark)
  addVoxel(group, -2, 1, 0, hull)
  addVoxel(group, 2, 1, 0, hull)
  addVoxel(group, -2, -1, 0, hull)
  addVoxel(group, 2, -1, 0, hull)
  // Top-side antenna blip — pure visual marker so the player can tell front
  // from back as it crosses the screen.
  addVoxel(group, 0, 2, 0.4, blink)
  addVoxel(group, 0, -3, -0.2, 0x55aa55)
  return group
}

/** Wedge — sharp red-orange fighter, beefier than a grunt with forward-swept wings. */
function createWedgeModel(): THREE.Group {
  const group = new THREE.Group()
  const hull = 0xcc4422
  const accent = 0xffaa44
  const dark = 0x661111
  // Arrowhead body — wider than the original to read clearly at distance.
  for (let row = -3; row <= 4; row++) addVoxel(group, 0, row, 0, hull)
  for (let row = -1; row <= 2; row++) {
    addVoxel(group, -1, row, 0, hull)
    addVoxel(group, 1, row, 0, hull)
  }
  addVoxel(group, -1, 3, 0, dark)
  addVoxel(group, 1, 3, 0, dark)
  addVoxel(group, 0, 5, 0.5, accent) // cockpit / nose tip
  // Forward-swept wings — span ±4 to match grunt readability, distinct shape
  // (swept FORWARD rather than back) so wedge ships read as a different unit.
  addVoxel(group, -2, 2, 0, accent)
  addVoxel(group, 2, 2, 0, accent)
  addVoxel(group, -3, 3, 0, accent)
  addVoxel(group, 3, 3, 0, accent)
  addVoxel(group, -4, 4, 0, accent)
  addVoxel(group, 4, 4, 0, accent)
  // Trailing tail fins
  addVoxel(group, -1, -2, 0, dark)
  addVoxel(group, 1, -2, 0, dark)
  // Engine
  addVoxel(group, -1, -3, -0.3, 0xff8800)
  addVoxel(group, 0, -3, -0.3, 0xff8800)
  addVoxel(group, 1, -3, -0.3, 0xff8800)
  return group
}

/** Splitter — large bulbous teal-purple core wreathed in fragmenting plates.
 *  Body voxels are deliberately small in voxel count; the heavy lifting is the
 *  `SPLITTER_BODY_SCALE` scalar applied to the whole inner group so the visible
 *  hull comfortably covers the 9-unit collision disc. */
function createSplitterModel(): THREE.Group {
  const group = new THREE.Group()
  const body = new THREE.Group()
  const core = 0x884466
  const accent = 0xff66cc
  const plate = 0x442233
  const cracked = 0xff3388
  // Lobed body — diamond cross-section of radius 3 (so silhouette ≈ 6 voxels
  // across pre-scale, ~9.6 world units post-scale).
  for (let x = -3; x <= 3; x++) {
    for (let y = -3; y <= 3; y++) {
      const r = Math.abs(x) + Math.abs(y)
      if (r > 3) continue
      addVoxel(body, x, y, 0, r >= 3 ? plate : core)
    }
  }
  // Raised central core
  addVoxel(body, 0, 0, 0.8, accent)
  addVoxel(body, 0, 0, 1.4, cracked)
  // Asymmetric crack lines hinting at the upcoming split
  addVoxel(body, -2, 1, 0.3, accent)
  addVoxel(body, 2, -1, 0.3, accent)
  addVoxel(body, -1, -2, 0.3, cracked)
  addVoxel(body, 1, 2, 0.3, cracked)
  // Rear vent / engine
  addVoxel(body, 0, -4, -0.2, 0xff8800)
  body.scale.setScalar(SPLITTER_BODY_SCALE)
  group.add(body)
  return group
}

/** Hornet — a Galaga-style alien: squat yellow body, swept cyan wings, two
 *  forward antenna nubs. Reads clearly as a "bug" distinct from the human
 *  fighters so its dive-bombing telegraphs a different threat. */
function createHornetModel(): THREE.Group {
  const group = new THREE.Group()
  const body = 0xffd23f
  const wing = 0x33d6ff
  const dark = 0x9a5b00
  const eye = 0xff3b6b
  // Compact 3×3 carapace.
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      addVoxel(group, x, y, 0, body)
    }
  }
  // Swept-back wings (broad span so it reads at distance).
  addVoxel(group, -2, 0, 0, wing)
  addVoxel(group, 2, 0, 0, wing)
  addVoxel(group, -3, -1, 0, wing)
  addVoxel(group, 3, -1, 0, wing)
  // Antenna nubs up front + glowing eyes.
  addVoxel(group, -1, 2, 0.2, dark)
  addVoxel(group, 1, 2, 0.2, dark)
  addVoxel(group, 0, 1, 0.5, eye)
  // Tail.
  addVoxel(group, 0, -2, -0.2, dark)
  return group
}

/** Missile — a small, glowing Arbiter warhead with a hot exhaust tail. */
function createMissileModel(): THREE.Group {
  const group = new THREE.Group()
  const body = 0xffee66
  const nose = 0xffffff
  const fin = 0xff5522
  // Slim 1×4 fuselage, brightest at the nose so it reads as a live warhead.
  for (let row = -1; row <= 2; row++) addVoxel(group, 0, row, 0, body)
  addVoxel(group, 0, 3, 0.2, nose)
  // Stub fins at the tail.
  addVoxel(group, -1, -1, 0, fin)
  addVoxel(group, 1, -1, 0, fin)
  // Exhaust glow.
  addVoxel(group, 0, -2, -0.2, 0xff8800)
  return group
}

/** Per-kind hull stats. */
interface KindStats {
  maxHp: number
  collisionRadius: number
}
const KIND_STATS: Record<EnemyKind, KindStats> = {
  grunt: { maxHp: ENEMY_MAX_HP, collisionRadius: ENEMY_COLLISION_RADIUS },
  // Sniper's visual barrel extends ~3.5 world units past the origin. A 3-unit
  // hit disc left the barrel tip outside the hitbox, so shots aimed at the
  // most obvious visual feature flew past. Bumped to cover hull + barrel base.
  sniper: { maxHp: SNIPER_MAX_HP, collisionRadius: 4.5 },
  scavenger: { maxHp: SCAVENGER_MAX_HP, collisionRadius: ENEMY_COLLISION_RADIUS },
  carrier: { maxHp: CARRIER_MAX_HP, collisionRadius: CARRIER_COLLISION_RADIUS },
  drone: { maxHp: DRONE_MAX_HP, collisionRadius: DRONE_COLLISION_RADIUS },
  drifter: { maxHp: DRIFTER_MAX_HP, collisionRadius: DRIFTER_COLLISION_RADIUS },
  wedge: { maxHp: WEDGE_MAX_HP, collisionRadius: WEDGE_COLLISION_RADIUS },
  splitter: { maxHp: SPLITTER_MAX_HP, collisionRadius: SPLITTER_COLLISION_RADIUS },
  missile: { maxHp: MISSILE_MAX_HP, collisionRadius: MISSILE_COLLISION_RADIUS },
  hornet: { maxHp: HORNET_MAX_HP, collisionRadius: HORNET_COLLISION_RADIUS },
}

/** Build the voxel model for the given enemy kind. */
function createModelForKind(kind: EnemyKind): THREE.Group {
  switch (kind) {
    case 'sniper':
      return createSniperModel()
    case 'scavenger':
      return createScavengerModel()
    case 'carrier':
      return createCarrierModel()
    case 'drone':
      return createDroneModel()
    case 'drifter':
      return createDrifterModel()
    case 'wedge':
      return createWedgeModel()
    case 'splitter':
      return createSplitterModel()
    case 'missile':
      return createMissileModel()
    case 'hornet':
      return createHornetModel()
    default:
      return createEnemyShipModel()
  }
}

// ---------------------------------------------------------------------------
// Enemy projectile model
// ---------------------------------------------------------------------------

function createEnemyProjectileModel(): THREE.Group {
  const group = new THREE.Group()
  const coreGeo = new THREE.BoxGeometry(0.8, 1.6, 0.8)
  const coreMat = new THREE.MeshStandardMaterial({
    color: ENEMY_PROJECTILE_COLORS.core,
    emissive: ENEMY_PROJECTILE_COLORS.core,
    emissiveIntensity: 0.8,
    flatShading: true,
  })
  const core = new THREE.Mesh(coreGeo, coreMat)
  group.add(core)

  const glowGeo = new THREE.BoxGeometry(1.2, 0.8, 0.6)
  const glowMat = new THREE.MeshStandardMaterial({
    color: ENEMY_PROJECTILE_COLORS.glow,
    emissive: ENEMY_PROJECTILE_COLORS.glow,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.6,
    flatShading: true,
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  group.add(glow)

  return group
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Create an enemy ship at the given position.
 *
 * @param projectileDamage - Damage this enemy's shots deal to the player.
 *   Defaults to the standard enemy value; the prologue ambush and endless
 *   patrols pass their own scaled values.
 * @param kind - Behavioural class. Defaults to the standard orbiting grunt.
 */
export function createEnemyShip(
  x: number,
  y: number,
  projectileDamage: number = ENEMY_PROJECTILE_DAMAGE,
  kind: EnemyKind = 'grunt',
): EnemyShip {
  const mesh = createModelForKind(kind)
  mesh.position.set(x, y, 0)

  // Pick the nearest cardinal angle based on spawn position relative to origin
  const spawnAngle = Math.atan2(y, x)
  const initialCardinal = nearestCardinal(spawnAngle)
  const stats = KIND_STATS[kind]

  return {
    id: `enemy-${nextEnemyId++}`,
    mesh,
    kind,
    collisionRadius: stats.collisionRadius,
    x,
    y,
    vx: 0,
    vy: 0,
    rotation: 0,
    // The grunt traditionally spawns half-damaged; others spawn at full hull.
    hp: kind === 'grunt' ? Math.ceil(ENEMY_MAX_HP / 2) : stats.maxHp,
    maxHp: stats.maxHp,
    alive: true,
    projectileDamage,
    heading: Math.random() * Math.PI * 2,
    strafeTimer: ENEMY_STRAFE_CHANGE_INTERVAL * (0.5 + Math.random() * 0.5),
    strafeDir: Math.random() < 0.5 ? 1 : -1,
    shootTimer: ENEMY_SHOOT_INTERVAL * 0.5, // first shot comes quicker
    idleTimer: ENEMY_IDLE_INTERVAL * (0.5 + Math.random() * 0.5),
    idling: false,
    targetCardinal: initialCardinal,
    charging: false,
    chargeTimer: 0,
    fleeing: false,
    stolenLoot: [],
    targetLootId: null,
    targetLootX: 0,
    targetLootY: 0,
    carrierShieldHp: kind === 'carrier' ? CARRIER_SHIELD_HP : 0,
    droneTimer: CARRIER_DRONE_INTERVAL * (0.4 + Math.random() * 0.5),
    launching: false,
    launchTargetX: x,
    launchTargetY: y,
    formationLeader: null,
    formationSlotX: 0,
    formationSlotY: 0,
    inFormation: false,
    formationShieldId: null,
    formationShieldActive: false,
    swoopBearing: 0,
    engageDistance: WEDGE_ENGAGE_DISTANCE,
    lifeTimer: 0,
  }
}

// ---------------------------------------------------------------------------
// AI update
// ---------------------------------------------------------------------------

/**
 * Normalise an angle to the range (-PI, PI].
 */
function normaliseAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a <= -Math.PI) a += Math.PI * 2
  return a
}

/** The four cardinal angles (12, 3, 6, 9 o'clock). */
const CARDINAL_ANGLES = [
  Math.PI / 2, // 12 o'clock (up / +Y)
  0, // 3 o'clock (right / +X)
  -Math.PI / 2, // 6 o'clock (down / -Y)
  Math.PI, // 9 o'clock (left / -X)
] as const

/**
 * Return the cardinal angle (0, π/2, π, -π/2) closest to the given angle.
 */
function nearestCardinal(angle: number): number {
  let best = CARDINAL_ANGLES[0]
  let bestDiff = Math.abs(normaliseAngle(angle - best))
  for (let i = 1; i < CARDINAL_ANGLES.length; i++) {
    const diff = Math.abs(normaliseAngle(angle - CARDINAL_ANGLES[i]))
    if (diff < bestDiff) {
      bestDiff = diff
      best = CARDINAL_ANGLES[i]
    }
  }
  return best
}

/**
 * Return the next cardinal angle in the given direction (+1 = CCW, -1 = CW).
 */
function nextCardinal(current: number, direction: number): number {
  // Find current index in CARDINAL_ANGLES (sorted CCW: 90°, 0°, -90°, 180°)
  // We need to order them by angle for rotation: 0, π/2, π/-π, -π/2
  const ordered = [0, Math.PI / 2, Math.PI, -Math.PI / 2] // CCW order
  let idx = 0
  let bestDiff = Math.abs(normaliseAngle(current - ordered[0]))
  for (let i = 1; i < ordered.length; i++) {
    const diff = Math.abs(normaliseAngle(current - ordered[i]))
    if (diff < bestDiff) {
      bestDiff = diff
      idx = i
    }
  }
  const next = (idx + (direction > 0 ? 1 : 3)) % 4
  return ordered[next]
}

/**
 * Push the enemy out of any asteroid it overlaps, then sync its mesh
 * transform to the simulation state. Every per-kind AI ends with this.
 */
function finalizeEnemy(enemy: EnemyShip, asteroids: Asteroid[]): void {
  for (const a of asteroids) {
    if (a.hp > 0) resolveEnemyAsteroidCollision(enemy, a)
  }
  enemy.mesh.position.set(enemy.x, enemy.y, 0)
  enemy.mesh.rotation.z = enemy.rotation
}

/** Smoothly steer `enemy.heading` toward `desired`, capped by the turn rate. */
function steerHeading(enemy: EnemyShip, desired: number, dt: number, turnRate: number): void {
  const diff = normaliseAngle(desired - enemy.heading)
  const maxTurn = turnRate * dt
  enemy.heading = Math.abs(diff) <= maxTurn ? desired : enemy.heading + Math.sign(diff) * maxTurn
  enemy.heading = normaliseAngle(enemy.heading)
}

/**
 * Advance one hostile ship by a frame. Dispatches to the per-kind AI and
 * returns any projectiles spawned this frame.
 *
 * Pass `asteroids` so ranged kinds hold fire when their line of sight to the
 * player is blocked by a live rock.
 */
export function updateEnemyShip(
  enemy: EnemyShip,
  player: Ship,
  dt: number,
  asteroids: Asteroid[] = [],
): EnemyProjectile[] {
  if (!enemy.alive) return []
  if (enemy.kind === 'drone' && enemy.launching) {
    return updateDroneLaunchAI(enemy, dt, asteroids)
  }

  switch (enemy.kind) {
    case 'sniper':
      return updateSniperAI(enemy, player, dt, asteroids)
    case 'scavenger':
      return updateScavengerAI(enemy, player, dt, asteroids)
    case 'carrier':
      return updateCarrierAI(enemy, player, dt, asteroids)
    case 'drifter':
      return updateDrifterAI(enemy, dt, asteroids)
    case 'wedge':
      return updateWedgeAI(enemy, player, dt, asteroids)
    case 'splitter':
      return updateSplitterAI(enemy, player, dt, asteroids)
    case 'missile':
      return updateMissileAI(enemy, player, dt, asteroids)
    case 'hornet':
      return updateHornetAI(enemy, player, dt, asteroids)
    default:
      // grunt and carrier-launched drones share the orbiting dogfight AI
      return updateGruntAI(enemy, player, dt, asteroids)
  }
}

/**
 * Drifter AI — fly along the velocity set at spawn, forever. No steering,
 * no shooting, no awareness of the player. The straight-line motion plus
 * trivial HP makes them ideal "feel powerful" XP while teaching new players
 * to lead a moving target.
 */
function updateDrifterAI(
  enemy: EnemyShip,
  dt: number,
  asteroids: Asteroid[] = [],
): EnemyProjectile[] {
  enemy.x += enemy.vx * dt
  enemy.y += enemy.vy * dt
  // Face the flight direction. atan2 of zero velocity returns 0, which is
  // fine — drifters are always spawned with a non-zero velocity.
  enemy.rotation = Math.atan2(enemy.vy, enemy.vx) - Math.PI / 2
  finalizeEnemy(enemy, asteroids)
  return []
}

/**
 * Wedge AI — V-formation flight in from a fixed bearing, broken into grunt AI
 * once the wing engages.
 *
 * The break condition is per-ship: the leader checks distance to the player
 * each frame and clears its own `inFormation` flag when close enough; followers
 * inherit the break by reading their leader's flag. Once broken, each ship
 * routes through {@link updateGruntAI} so the rest of the fight is the same
 * orbit/strafe behaviour the player already knows. Followers also break
 * immediately if the leader dies — without the leader the slot offset has
 * no anchor, and pretending to hold formation would look broken.
 */
function updateWedgeAI(
  enemy: EnemyShip,
  player: Ship,
  dt: number,
  asteroids: Asteroid[] = [],
): EnemyProjectile[] {
  const leader = enemy.formationLeader
  const leaderActive = leader === null ? true : leader.alive && leader.inFormation

  if (!enemy.inFormation || !leaderActive) {
    // Wing has broken — clear formation refs so a follower's leader pointer
    // doesn't keep a dead enemy alive, then hand off to the grunt AI.
    enemy.inFormation = false
    enemy.formationLeader = null
    return updateGruntAI(enemy, player, dt, asteroids)
  }

  const cos = Math.cos(enemy.swoopBearing)
  const sin = Math.sin(enemy.swoopBearing)

  if (leader === null) {
    // Leader: fly straight along the swoop bearing at formation speed.
    enemy.vx = cos * WEDGE_FORMATION_SPEED
    enemy.vy = sin * WEDGE_FORMATION_SPEED
    enemy.x += enemy.vx * dt
    enemy.y += enemy.vy * dt
    enemy.heading = enemy.swoopBearing
    enemy.rotation = enemy.swoopBearing - Math.PI / 2

    // Break when close to the player. The followers see this next frame via
    // their `leaderActive` check and break in lockstep.
    const dx = player.x - enemy.x
    const dy = player.y - enemy.y
    if (dx * dx + dy * dy < enemy.engageDistance * enemy.engageDistance) {
      enemy.inFormation = false
    }
  } else {
    // Follower: world target = leader + slot rotated into bearing axes.
    // Forward axis = (cos, sin); lateral axis = (-sin, cos).
    const targetX = leader.x + enemy.formationSlotY * cos + enemy.formationSlotX * -sin
    const targetY = leader.y + enemy.formationSlotY * sin + enemy.formationSlotX * cos
    const dxT = targetX - enemy.x
    const dyT = targetY - enemy.y
    const distT = Math.sqrt(dxT * dxT + dyT * dyT)
    const desiredAngle = distT > 0.1 ? Math.atan2(dyT, dxT) : enemy.swoopBearing
    // Snap heading — formation tightness matters more than smooth steering
    // here, and the leader's straight-line flight makes overshoot unlikely.
    enemy.heading = desiredAngle
    // Speed up if behind the slot so the wing stays in shape; capped so a
    // follower yanked too far forward doesn't rocket past the leader.
    const speed = WEDGE_FORMATION_SPEED + Math.min(distT * WEDGE_CATCHUP_GAIN, 14)
    enemy.vx = Math.cos(enemy.heading) * speed
    enemy.vy = Math.sin(enemy.heading) * speed
    enemy.x += enemy.vx * dt
    enemy.y += enemy.vy * dt
    enemy.rotation = enemy.swoopBearing - Math.PI / 2
  }

  finalizeEnemy(enemy, asteroids)
  return []
}

/**
 * Splitter AI — slow, ranged, tanky. Edges in to a mid-range fan-shot window
 * and lobs a 3-bolt spray, backing off if the player closes the gap. Children
 * are spawned by game-tick on death, not here.
 */
function updateSplitterAI(
  enemy: EnemyShip,
  player: Ship,
  dt: number,
  asteroids: Asteroid[] = [],
): EnemyProjectile[] {
  const newProjectiles: EnemyProjectile[] = []
  const dx = player.x - enemy.x
  const dy = player.y - enemy.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const toPlayer = Math.atan2(dy, dx)

  let moveAngle = toPlayer
  let speed = SPLITTER_SPEED
  if (dist < SPLITTER_RANGE * 0.7) {
    moveAngle = toPlayer + Math.PI
    speed = SPLITTER_SPEED * 0.6
  } else if (dist > SPLITTER_RANGE * 1.2) {
    moveAngle = toPlayer
  } else {
    // Sweet spot — drift gently to keep the bulk reading as a mid-range threat.
    moveAngle = toPlayer + (Math.PI / 2) * enemy.strafeDir
    speed = SPLITTER_SPEED * 0.35
  }
  steerHeading(enemy, moveAngle, dt, ENEMY_TURN_RATE * 0.4)
  enemy.vx = Math.cos(enemy.heading) * speed
  enemy.vy = Math.sin(enemy.heading) * speed
  enemy.x += enemy.vx * dt
  enemy.y += enemy.vy * dt
  enemy.rotation = toPlayer - Math.PI / 2

  enemy.strafeTimer -= dt
  if (enemy.strafeTimer <= 0) {
    enemy.strafeTimer = ENEMY_STRAFE_CHANGE_INTERVAL * (0.7 + Math.random() * 0.6)
    enemy.strafeDir = -enemy.strafeDir
  }

  enemy.shootTimer -= dt
  if (enemy.shootTimer <= 0) {
    const losBlocked =
      asteroids.length > 0 &&
      segmentBlockedByAsteroid(enemy.x, enemy.y, player.x, player.y, asteroids)
    if (losBlocked) {
      enemy.shootTimer = 0.4
    } else {
      enemy.shootTimer = SPLITTER_SHOOT_INTERVAL
      // 3-bolt fan ±10° around the toPlayer vector.
      for (let i = -1; i <= 1; i++) {
        const a = toPlayer + i * 0.18
        const nx = Math.cos(a)
        const ny = Math.sin(a)
        const proj = createEnemyProjectile(
          enemy.x + nx * 6,
          enemy.y + ny * 6,
          nx * SPLITTER_PROJECTILE_SPEED,
          ny * SPLITTER_PROJECTILE_SPEED,
          enemy.projectileDamage,
        )
        newProjectiles.push(proj)
      }
    }
  }

  finalizeEnemy(enemy, asteroids)
  return newProjectiles
}

/**
 * Missile AI — a homing warhead. Steers toward the player at a capped turn
 * rate (so a juking player can slip the lock) while accelerating up to its
 * speed cap. It never shoots; its threat is the body itself. Lifetime and the
 * detonation-on-contact are owned by game-tick so the warhead removes cleanly
 * with a wreck instead of being silently pruned.
 */
function updateMissileAI(
  enemy: EnemyShip,
  player: Ship,
  dt: number,
  asteroids: Asteroid[] = [],
): EnemyProjectile[] {
  const dx = player.x - enemy.x
  const dy = player.y - enemy.y
  const toPlayer = Math.atan2(dy, dx)
  steerHeading(enemy, toPlayer, dt, MISSILE_TURN_RATE)

  // Accelerate along the current heading toward the speed cap.
  const hx = Math.cos(enemy.heading)
  const hy = Math.sin(enemy.heading)
  enemy.vx += hx * MISSILE_ACCEL * dt
  enemy.vy += hy * MISSILE_ACCEL * dt
  const speed = Math.hypot(enemy.vx, enemy.vy)
  if (speed > MISSILE_MAX_SPEED) {
    const s = MISSILE_MAX_SPEED / speed
    enemy.vx *= s
    enemy.vy *= s
  }
  enemy.x += enemy.vx * dt
  enemy.y += enemy.vy * dt
  enemy.rotation = enemy.heading - Math.PI / 2

  finalizeEnemy(enemy, asteroids)
  return []
}

/**
 * Hornet AI — a Galaga-style dive-bomber. It alternates between two states
 * (reusing the shared idle flag/timer): a committed DIVE run that banks in a
 * curved arc toward the player (firing if close), and a REGROUP arc that pulls
 * back out to a standoff before swooping again. The banking offset shrinks as
 * it closes, so each pass reads as a sweeping curve rather than a straight line.
 */
function updateHornetAI(
  enemy: EnemyShip,
  player: Ship,
  dt: number,
  asteroids: Asteroid[] = [],
): EnemyProjectile[] {
  const newProjectiles: EnemyProjectile[] = []
  const dx = player.x - enemy.x
  const dy = player.y - enemy.y
  const dist = Math.hypot(dx, dy) || 1
  const toPlayer = Math.atan2(dy, dx)

  // Toggle dive / regroup. `idling === true` means regrouping. Each fresh dive
  // picks a new bank direction so successive passes sweep from varied angles.
  enemy.idleTimer -= dt
  if (enemy.idleTimer <= 0) {
    enemy.idling = !enemy.idling
    enemy.idleTimer = enemy.idling ? HORNET_REGROUP_TIME : HORNET_DIVE_TIME
    if (!enemy.idling) {
      enemy.inFormation = false
      enemy.strafeDir = Math.random() < 0.5 ? 1 : -1
    }
  }

  let desired: number
  let speed: number
  if (!enemy.idling) {
    // Dive: bank toward the player, the offset easing out as range closes.
    const bank = HORNET_BANK * enemy.strafeDir * Math.min(1, dist / 80)
    desired = toPlayer + bank
    speed = HORNET_DIVE_SPEED
  } else if (dist < HORNET_STANDOFF) {
    // Regroup: arc away to a standoff above/beside the player.
    desired = toPlayer + Math.PI + (Math.PI / 3) * enemy.strafeDir
    speed = HORNET_REGROUP_SPEED
  } else {
    // Far enough out — curl back toward the player so it never wanders off.
    desired = toPlayer + (Math.PI / 4) * enemy.strafeDir
    speed = HORNET_REGROUP_SPEED
  }

  steerHeading(enemy, desired, dt, HORNET_TURN_RATE)
  enemy.vx = Math.cos(enemy.heading) * speed
  enemy.vy = Math.sin(enemy.heading) * speed
  enemy.x += enemy.vx * dt
  enemy.y += enemy.vy * dt
  // Bees point where they fly (model faces +Y).
  enemy.rotation = enemy.heading - Math.PI / 2

  // Snap off shots during a dive when the player's in range and in the open.
  enemy.shootTimer -= dt
  if (!enemy.idling && enemy.shootTimer <= 0 && dist < HORNET_FIRE_RANGE) {
    const losBlocked =
      asteroids.length > 0 &&
      segmentBlockedByAsteroid(enemy.x, enemy.y, player.x, player.y, asteroids)
    if (losBlocked) {
      enemy.shootTimer = 0.3
    } else {
      enemy.shootTimer = HORNET_FIRE_INTERVAL
      const nx = dx / dist
      const ny = dy / dist
      newProjectiles.push(
        createEnemyProjectile(
          enemy.x + nx * 4,
          enemy.y + ny * 4,
          nx * ENEMY_PROJECTILE_SPEED,
          ny * ENEMY_PROJECTILE_SPEED,
          enemy.projectileDamage,
        ),
      )
    }
  }

  finalizeEnemy(enemy, asteroids)
  return newProjectiles
}

/**
 * Carrier-launched drones visibly depart the mothership before entering their
 * normal dogfight AI. They do not shoot until they reach the staging slot.
 */
function updateDroneLaunchAI(
  enemy: EnemyShip,
  dt: number,
  asteroids: Asteroid[] = [],
): EnemyProjectile[] {
  const dx = enemy.launchTargetX - enemy.x
  const dy = enemy.launchTargetY - enemy.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist <= Math.max(0.8, DRONE_LAUNCH_SPEED * dt)) {
    enemy.x = enemy.launchTargetX
    enemy.y = enemy.launchTargetY
    enemy.vx = 0
    enemy.vy = 0
    enemy.launching = false
  } else {
    const nx = dx / dist
    const ny = dy / dist
    enemy.vx = nx * DRONE_LAUNCH_SPEED
    enemy.vy = ny * DRONE_LAUNCH_SPEED
    enemy.x += enemy.vx * dt
    enemy.y += enemy.vy * dt
  }

  enemy.rotation = Math.atan2(dy, dx) - Math.PI / 2
  finalizeEnemy(enemy, asteroids)
  return []
}

/**
 * Grunt/drone AI — smoothly orbits the player like a dogfight and pots shots.
 */
function updateGruntAI(
  enemy: EnemyShip,
  player: Ship,
  dt: number,
  asteroids: Asteroid[] = [],
): EnemyProjectile[] {
  const newProjectiles: EnemyProjectile[] = []

  // --- Compute desired heading based on distance to player ---
  const dx = player.x - enemy.x
  const dy = player.y - enemy.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const toPlayer = Math.atan2(dy, dx)

  // Blend a radial component (toward/away from player) with a cardinal-
  // seeking component. The enemy prefers to sit at 90° angles (12/3/6/9
  // o'clock) from the player at ORBIT_DISTANCE.
  let radialWeight: number
  if (dist < ORBIT_DISTANCE * 0.7) {
    // Too close — push away
    radialWeight = -0.8
  } else if (dist > ORBIT_DISTANCE * 1.3) {
    // Too far — pull in
    radialWeight = 0.8
  } else {
    // In the sweet spot — gentle distance correction
    const t = (dist - ORBIT_DISTANCE) / (ORBIT_DISTANCE * 0.3)
    radialWeight = t * 0.3
  }

  // Strafe timer — move to the next cardinal position
  enemy.strafeTimer -= dt
  if (enemy.strafeTimer <= 0) {
    enemy.strafeTimer = ENEMY_STRAFE_CHANGE_INTERVAL * (0.7 + Math.random() * 0.6)
    enemy.strafeDir = -enemy.strafeDir
    enemy.targetCardinal = nextCardinal(enemy.targetCardinal, enemy.strafeDir)
  }

  // Idle timer — periodically drift to a stop when near target cardinal
  const inSweetSpot = dist >= ORBIT_DISTANCE * 0.7 && dist <= ORBIT_DISTANCE * 1.3
  enemy.idleTimer -= dt
  if (enemy.idleTimer <= 0) {
    if (enemy.idling) {
      enemy.idling = false
      enemy.idleTimer = ENEMY_IDLE_INTERVAL * (0.7 + Math.random() * 0.6)
    } else {
      enemy.idling = true
      enemy.idleTimer = ENEMY_IDLE_DURATION * (0.7 + Math.random() * 0.6)
    }
  }

  // The target position on the orbit circle at the desired cardinal angle
  const targetX = player.x + Math.cos(enemy.targetCardinal) * ORBIT_DISTANCE
  const targetY = player.y + Math.sin(enemy.targetCardinal) * ORBIT_DISTANCE
  const toTargetDx = targetX - enemy.x
  const toTargetDy = targetY - enemy.y
  const toTargetDist = Math.sqrt(toTargetDx * toTargetDx + toTargetDy * toTargetDy)

  // Only idle when close to the target cardinal and at the right distance
  const nearCardinal = toTargetDist < ORBIT_DISTANCE * 0.3
  const effectivelyIdle = enemy.idling && inSweetSpot && nearCardinal

  // Compute desired heading: blend radial correction with cardinal-seeking
  let desiredAngle: number
  const absRadial = Math.abs(radialWeight)
  if (absRadial > 0.3) {
    // Distance correction dominates — move radially with some cardinal pull
    const radialAngle = radialWeight >= 0 ? toPlayer : toPlayer + Math.PI
    const cardinalAngle = toTargetDist > 0.1 ? Math.atan2(toTargetDy, toTargetDx) : enemy.heading
    const cardinalWeight = 1 - absRadial
    const desiredX = Math.cos(radialAngle) * absRadial + Math.cos(cardinalAngle) * cardinalWeight
    const desiredY = Math.sin(radialAngle) * absRadial + Math.sin(cardinalAngle) * cardinalWeight
    desiredAngle = Math.atan2(desiredY, desiredX)
  } else {
    // In sweet spot — steer toward the target cardinal position
    desiredAngle = toTargetDist > 0.1 ? Math.atan2(toTargetDy, toTargetDx) : enemy.heading
  }

  // --- Smoothly steer heading toward desired angle ---
  const angleDiff = normaliseAngle(desiredAngle - enemy.heading)
  const maxTurn = ENEMY_TURN_RATE * dt
  if (Math.abs(angleDiff) <= maxTurn) {
    enemy.heading = desiredAngle
  } else {
    enemy.heading += Math.sign(angleDiff) * maxTurn
  }
  enemy.heading = normaliseAngle(enemy.heading)

  // --- Move along current heading (decelerate when idling) ---
  const speed = effectivelyIdle ? 0 : ENEMY_SPEED
  enemy.vx = Math.cos(enemy.heading) * speed
  enemy.vy = Math.sin(enemy.heading) * speed
  enemy.x += enemy.vx * dt
  enemy.y += enemy.vy * dt

  // --- Face toward player ---
  const toPlayerDx = player.x - enemy.x
  const toPlayerDy = player.y - enemy.y
  const toPlayerDist = Math.sqrt(toPlayerDx * toPlayerDx + toPlayerDy * toPlayerDy)
  enemy.rotation = Math.atan2(toPlayerDy, toPlayerDx) - Math.PI / 2

  // --- Shoot timer ---
  enemy.shootTimer -= dt
  if (enemy.shootTimer <= 0) {
    // Line-of-sight check: don't fire through asteroids.
    // If blocked, reset to a short retry interval instead of a full reload.
    const losBlocked =
      asteroids.length > 0 &&
      segmentBlockedByAsteroid(enemy.x, enemy.y, player.x, player.y, asteroids)

    if (losBlocked) {
      enemy.shootTimer = 0.25 + Math.random() * 0.25
    } else {
      enemy.shootTimer =
        ENEMY_SHOOT_MIN_INTERVAL +
        Math.random() * (ENEMY_SHOOT_INTERVAL - ENEMY_SHOOT_MIN_INTERVAL)

      // Fire toward player
      if (toPlayerDist > 0.1) {
        const nx = toPlayerDx / toPlayerDist
        const ny = toPlayerDy / toPlayerDist
        const proj = createEnemyProjectile(
          enemy.x + nx * 4,
          enemy.y + ny * 4,
          nx * ENEMY_PROJECTILE_SPEED,
          ny * ENEMY_PROJECTILE_SPEED,
          enemy.projectileDamage,
        )
        newProjectiles.push(proj)
      }
    }
  }

  finalizeEnemy(enemy, asteroids)
  return newProjectiles
}

/**
 * Sniper AI — holds at long range, winds up a telegraphed charged shot
 * (laser sight on), and fires a fast, high-damage round. Aborts the charge
 * if the player breaks line of sight behind an asteroid.
 */
function updateSniperAI(
  enemy: EnemyShip,
  player: Ship,
  dt: number,
  asteroids: Asteroid[],
): EnemyProjectile[] {
  const newProjectiles: EnemyProjectile[] = []
  const dx = player.x - enemy.x
  const dy = player.y - enemy.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const toPlayer = Math.atan2(dy, dx)

  // Reposition only while not committed to a charge.
  if (enemy.charging) {
    enemy.vx = 0
    enemy.vy = 0
  } else {
    let moveAngle: number
    let speed = SNIPER_SPEED
    if (dist < SNIPER_RANGE * 0.8) {
      moveAngle = toPlayer + Math.PI // back away
    } else if (dist > SNIPER_RANGE * 1.2) {
      moveAngle = toPlayer // close in
    } else {
      moveAngle = toPlayer + (Math.PI / 2) * enemy.strafeDir // strafe
      speed = SNIPER_SPEED * 0.5
    }
    steerHeading(enemy, moveAngle, dt, ENEMY_TURN_RATE)
    enemy.vx = Math.cos(enemy.heading) * speed
    enemy.vy = Math.sin(enemy.heading) * speed
    enemy.x += enemy.vx * dt
    enemy.y += enemy.vy * dt
    enemy.strafeTimer -= dt
    if (enemy.strafeTimer <= 0) {
      enemy.strafeTimer = ENEMY_STRAFE_CHANGE_INTERVAL * (0.7 + Math.random() * 0.6)
      enemy.strafeDir = -enemy.strafeDir
    }
  }

  enemy.rotation = toPlayer - Math.PI / 2

  const losBlocked =
    asteroids.length > 0 &&
    segmentBlockedByAsteroid(enemy.x, enemy.y, player.x, player.y, asteroids)

  if (enemy.charging) {
    enemy.chargeTimer -= dt
    if (losBlocked) {
      // Lost the shot — abort and reacquire shortly.
      enemy.charging = false
      enemy.shootTimer = 0.6
    } else if (enemy.chargeTimer <= 0) {
      enemy.charging = false
      enemy.shootTimer = SNIPER_COOLDOWN
      const nx = dx / dist
      const ny = dy / dist
      const proj = createEnemyProjectile(
        enemy.x + nx * 6,
        enemy.y + ny * 6,
        nx * SNIPER_PROJECTILE_SPEED,
        ny * SNIPER_PROJECTILE_SPEED,
        enemy.projectileDamage * SNIPER_DAMAGE_MULT,
      )
      proj.mesh.scale.setScalar(1.7)
      newProjectiles.push(proj)
    }
  } else {
    enemy.shootTimer -= dt
    if (enemy.shootTimer <= 0) {
      if (losBlocked) {
        enemy.shootTimer = 0.4
      } else {
        enemy.charging = true
        enemy.chargeTimer = SNIPER_CHARGE_TIME
      }
    }
  }

  finalizeEnemy(enemy, asteroids)
  return newProjectiles
}

/**
 * Scavenger AI — ignores combat. Loiters near the player until loot is in
 * reach, darts to grab it, then bolts for the sector edge. Targeting and the
 * actual steal/escape are driven by game-tick (which owns the loot arrays);
 * this AI just flies toward whatever target state has been set.
 */
function updateScavengerAI(
  enemy: EnemyShip,
  player: Ship,
  dt: number,
  asteroids: Asteroid[],
): EnemyProjectile[] {
  const dx = player.x - enemy.x
  const dy = player.y - enemy.y
  const distPlayer = Math.sqrt(dx * dx + dy * dy) || 1

  let moveAngle: number
  let speed = SCAVENGER_SPEED
  if (enemy.fleeing) {
    moveAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x) // straight away
  } else if (enemy.targetLootId) {
    moveAngle = Math.atan2(enemy.targetLootY - enemy.y, enemy.targetLootX - enemy.x)
  } else {
    // Loiter — circle the player at standoff distance, waiting for loot.
    if (distPlayer < SCAVENGER_LOITER_DISTANCE * 0.7) {
      moveAngle = Math.atan2(-dy, -dx)
    } else if (distPlayer > SCAVENGER_LOITER_DISTANCE * 1.3) {
      moveAngle = Math.atan2(dy, dx)
    } else {
      moveAngle = Math.atan2(dy, dx) + (Math.PI / 2) * enemy.strafeDir
    }
    speed = SCAVENGER_SPEED * 0.6
  }

  steerHeading(enemy, moveAngle, dt, ENEMY_TURN_RATE * 1.5)
  enemy.vx = Math.cos(enemy.heading) * speed
  enemy.vy = Math.sin(enemy.heading) * speed
  enemy.x += enemy.vx * dt
  enemy.y += enemy.vy * dt
  enemy.rotation = enemy.heading - Math.PI / 2 // faces its flight path

  enemy.strafeTimer -= dt
  if (enemy.strafeTimer <= 0) {
    enemy.strafeTimer = ENEMY_STRAFE_CHANGE_INTERVAL * (0.7 + Math.random() * 0.6)
    enemy.strafeDir = -enemy.strafeDir
  }

  finalizeEnemy(enemy, asteroids)
  return []
}

/**
 * Carrier AI — slow and tanky, keeps long range from the player. Drone
 * launches are timed here (droneTimer) but game-tick performs the spawn.
 */
function updateCarrierAI(
  enemy: EnemyShip,
  player: Ship,
  dt: number,
  asteroids: Asteroid[],
): EnemyProjectile[] {
  const dx = player.x - enemy.x
  const dy = player.y - enemy.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const toPlayer = Math.atan2(dy, dx)

  let moveAngle: number
  let speed = CARRIER_SPEED
  if (dist < CARRIER_RANGE * 0.85) {
    moveAngle = toPlayer + Math.PI
  } else if (dist > CARRIER_RANGE * 1.25) {
    moveAngle = toPlayer
  } else {
    moveAngle = toPlayer + (Math.PI / 2) * enemy.strafeDir
    speed = CARRIER_SPEED * 0.7
  }

  steerHeading(enemy, moveAngle, dt, ENEMY_TURN_RATE * 0.5)
  enemy.vx = Math.cos(enemy.heading) * speed
  enemy.vy = Math.sin(enemy.heading) * speed
  enemy.x += enemy.vx * dt
  enemy.y += enemy.vy * dt
  enemy.rotation = toPlayer - Math.PI / 2

  enemy.strafeTimer -= dt
  if (enemy.strafeTimer <= 0) {
    enemy.strafeTimer = ENEMY_STRAFE_CHANGE_INTERVAL
    enemy.strafeDir = -enemy.strafeDir
  }

  // Wind the launch timer down; game-tick reads it and spawns the drone.
  enemy.droneTimer -= dt

  finalizeEnemy(enemy, asteroids)
  return []
}

/**
 * Create a hostile projectile. Used by grunt enemies and the Arbiter alike;
 * `damage` is carried per-projectile so each shooter scales independently.
 */
export function createEnemyProjectile(
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number,
): EnemyProjectile {
  const mesh = createEnemyProjectileModel()
  mesh.position.set(x, y, 0)
  const angle = Math.atan2(vy, vx)
  mesh.rotation.z = angle - Math.PI / 2

  return {
    id: `enemy-proj-${nextEnemyProjectileId++}`,
    mesh,
    x,
    y,
    vx,
    vy,
    elapsed: 0,
    damage,
  }
}

// ---------------------------------------------------------------------------
// Enemy projectile update
// ---------------------------------------------------------------------------

/**
 * Update enemy projectile position. Returns false when expired.
 */
export function updateEnemyProjectile(proj: EnemyProjectile, dt: number): boolean {
  proj.elapsed += dt
  if (proj.elapsed >= ENEMY_PROJECTILE_LIFETIME) return false

  proj.x += proj.vx * dt
  proj.y += proj.vy * dt
  proj.mesh.position.set(proj.x, proj.y, 0)

  return true
}

/**
 * Dispose an enemy projectile mesh.
 */
export function disposeEnemyProjectile(proj: EnemyProjectile): void {
  for (const child of proj.mesh.children) {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (child.material instanceof THREE.Material) {
        child.material.dispose()
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Collision: player projectiles hitting enemy
// ---------------------------------------------------------------------------

/**
 * Check if any player projectiles hit the enemy ship.
 * Returns IDs of projectiles that hit, and mutates enemy HP.
 */
export function checkProjectileEnemyCollisions(
  projectiles: Projectile[],
  enemy: EnemyShip,
): { surviving: Projectile[]; hitProjectileIds: string[] } {
  if (!enemy.alive || enemy.hp <= 0) return { surviving: projectiles, hitProjectileIds: [] }

  const surviving: Projectile[] = []
  const hitProjectileIds: string[] = []

  for (const p of projectiles) {
    if (!enemy.alive) {
      surviving.push(p)
      continue
    }

    // Swept segment-vs-circle: the projectile traversed the line from its
    // previous position to its current one this frame, so check the whole
    // segment against the enemy's hit disc. Without this, fast bolts can
    // step past small enemies (snipers, drones) in a single frame and the
    // bolt visibly passes through with no damage.
    const minDist = PROJECTILE_RADIUS + enemy.collisionRadius
    const sx = p.prevX
    const sy = p.prevY
    const ex = p.x
    const ey = p.y
    const segDx = ex - sx
    const segDy = ey - sy
    const segLenSq = segDx * segDx + segDy * segDy
    let closestDistSq: number
    if (segLenSq < 0.0001) {
      const cdx = ex - enemy.x
      const cdy = ey - enemy.y
      closestDistSq = cdx * cdx + cdy * cdy
    } else {
      let t = ((enemy.x - sx) * segDx + (enemy.y - sy) * segDy) / segLenSq
      t = Math.max(0, Math.min(1, t))
      const px = sx + t * segDx
      const py = sy + t * segDy
      const cdx = px - enemy.x
      const cdy = py - enemy.y
      closestDistSq = cdx * cdx + cdy * cdy
    }

    if (closestDistSq < minDist * minDist) {
      hitProjectileIds.push(p.id)
      if (!enemy.formationShieldActive) {
        if (enemy.carrierShieldHp > 0) {
          enemy.carrierShieldHp = Math.max(0, enemy.carrierShieldHp - p.damage)
        } else {
          enemy.hp = Math.max(0, enemy.hp - p.damage)
          if (enemy.hp <= 0) {
            enemy.alive = false
          }
        }
      }
    } else {
      surviving.push(p)
    }
  }

  return { surviving, hitProjectileIds }
}

/**
 * Closest distance squared from a point to a line segment.
 */
function pointToSegmentDistSqLocal(
  cx: number,
  cy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax
  const aby = by - ay
  const lenSq = abx * abx + aby * aby
  if (lenSq < 0.0001) {
    const dx = cx - ax
    const dy = cy - ay
    return dx * dx + dy * dy
  }
  let t = ((cx - ax) * abx + (cy - ay) * aby) / lenSq
  t = Math.max(0, Math.min(1, t))
  const px = ax + t * abx
  const py = ay + t * aby
  const dx = cx - px
  const dy = cy - py
  return dx * dx + dy * dy
}

/**
 * Apply lazer beam damage to an enemy if the beam passes through it.
 * Returns `{ hit: true, t }` if the beam intersects the enemy (where `t` is
 * the parameter along the beam at the enemy's center, in [0,1]), so the caller
 * can truncate the beam endpoint at the nearest enemy.
 */
export function checkBeamEnemyCollisions(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  damage: number,
  enemy: EnemyShip,
): { hit: boolean; t: number; killed: boolean } {
  if (!enemy.alive || enemy.hp <= 0) return { hit: false, t: 1, killed: false }

  const distSq = pointToSegmentDistSqLocal(enemy.x, enemy.y, startX, startY, endX, endY)
  if (distSq >= enemy.collisionRadius * enemy.collisionRadius) {
    return { hit: false, t: 1, killed: false }
  }

  const dx = endX - startX
  const dy = endY - startY
  const lenSq = dx * dx + dy * dy
  let t = 1
  if (lenSq > 0.0001) {
    t = Math.max(0, Math.min(1, ((enemy.x - startX) * dx + (enemy.y - startY) * dy) / lenSq))
  }

  if (enemy.formationShieldActive) {
    return { hit: true, t, killed: false }
  }

  const effective = damage * LAZER_DAMAGE_MULTIPLIER
  if (enemy.carrierShieldHp > 0) {
    enemy.carrierShieldHp = Math.max(0, enemy.carrierShieldHp - effective)
    return { hit: true, t, killed: false }
  }
  enemy.hp = Math.max(0, enemy.hp - effective)
  const killed = enemy.hp <= 0
  if (killed) enemy.alive = false

  return { hit: true, t, killed }
}

// ---------------------------------------------------------------------------
// Collision: enemy projectiles hitting player
// ---------------------------------------------------------------------------

/**
 * Check if any enemy projectiles hit the player ship.
 * Returns IDs of projectiles that hit.
 */
export function checkEnemyProjectilePlayerCollisions(
  projectiles: EnemyProjectile[],
  player: Ship,
): string[] {
  const hitIds: string[] = []

  for (const p of projectiles) {
    const dx = p.x - player.x
    const dy = p.y - player.y
    const distSq = dx * dx + dy * dy
    const minDist = ENEMY_PROJECTILE_RADIUS + SHIP_COLLISION_RADIUS

    if (distSq < minDist * minDist) {
      hitIds.push(p.id)
    }
  }

  return hitIds
}

// ---------------------------------------------------------------------------
// Shipwreck debris (explosion effect on enemy death)
// ---------------------------------------------------------------------------

/**
 * Create a shipwreck debris explosion at the enemy position.
 * Bigger and more dramatic than regular projectile explosions.
 */
export function createShipwreckDebris(x: number, y: number): ShipwreckDebris {
  const group = new THREE.Group()
  group.position.set(x, y, 0)

  const particles: ShipwreckDebris['particles'] = []

  for (let i = 0; i < WRECK_PARTICLE_COUNT; i++) {
    const angle = (i / WRECK_PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6
    const speed = WRECK_SPEED * (0.4 + Math.random() * 0.6)
    const color = WRECK_COLORS[i % WRECK_COLORS.length]

    // Vary particle sizes for interesting debris
    const size = 0.6 + Math.random() * 0.8
    const geo = new THREE.BoxGeometry(size, size, size)
    const mat = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      emissive: color,
      emissiveIntensity: 0.6,
    })
    const mesh = new THREE.Mesh(geo, mat)
    group.add(mesh)

    particles.push({
      mesh,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotSpeed: (Math.random() - 0.5) * 10,
    })
  }

  return { group, particles, elapsed: 0 }
}

/**
 * Update shipwreck debris animation. Returns true if still active.
 */
export function updateShipwreckDebris(debris: ShipwreckDebris, dt: number): boolean {
  debris.elapsed += dt
  if (debris.elapsed >= WRECK_DURATION) return false

  const progress = debris.elapsed / WRECK_DURATION

  for (const p of debris.particles) {
    p.mesh.position.x += p.vx * dt
    p.mesh.position.y += p.vy * dt
    p.mesh.rotation.z += p.rotSpeed * dt
    p.mesh.rotation.x += p.rotSpeed * 0.7 * dt

    // Shrink and fade out
    const scale = 1 - progress
    p.mesh.scale.setScalar(scale)

    // Reduce emissive as it fades
    const mat = p.mesh.material as THREE.MeshStandardMaterial
    mat.emissiveIntensity = 0.6 * (1 - progress)
  }

  return true
}

/**
 * Dispose shipwreck debris.
 */
export function disposeShipwreckDebris(debris: ShipwreckDebris): void {
  for (const p of debris.particles) {
    p.mesh.geometry.dispose()
    if (p.mesh.material instanceof THREE.Material) {
      p.mesh.material.dispose()
    }
  }
}

// ---------------------------------------------------------------------------
// Dispose enemy ship
// ---------------------------------------------------------------------------

let nextEnemyId = 0

/** Reset enemy ID counter (for testing). */
export function resetEnemyIdCounter(): void {
  nextEnemyId = 0
}

export function disposeEnemyShip(enemy: EnemyShip): void {
  enemy.mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (child.material instanceof THREE.Material) {
        child.material.dispose()
      }
    }
  })
}

/** Reset enemy projectile ID counter (for testing). */
export function resetEnemyProjectileIdCounter(): void {
  nextEnemyProjectileId = 0
}
