/**
 * Frak'n Frak'r — Game Engine Entry Point
 */

export { BLASTER_COSTS, COLLECTOR_COSTS, STORAGE_COSTS } from './types'
export type { GameEngine, Asteroid, Fragment, Projectile } from './types'

export {
  SHIP_ACCELERATION,
  SHIP_MAX_SPEED,
  SHIP_FRICTION,
  SHIP_COLORS,
  VOXEL_SIZE,
} from './ship-constants'
export { createShipModel } from './ship-model'
export { createLargeAsteroidModel, ASTEROID_COLORS } from './asteroid-model'
export { createProjectileModel } from './projectile-model'
export {
  BASE_PROJECTILE_SPEED,
  SPEED_MULTIPLIERS,
  FIRE_RATES,
  DAMAGE_PER_TIER,
  PROJECTILE_LIFETIME,
  PROJECTILE_RADIUS,
  DUAL_SPREAD_ANGLE,
  TRIPLE_SPREAD_ANGLE,
  PROJECTILE_COLOR,
  PROJECTILE_CORE_COLOR,
} from './blaster-constants'
export {
  createBlasterState,
  updateBlasterCooldown,
  fireBlaster,
  updateProjectiles,
} from './blaster'
export type { BlasterState } from './blaster'
export {
  createInputState,
  createInputHandler,
  createAimState,
  createAimHandler,
  inputToDirection,
} from './input'
export type { InputState, AimState } from './input'
export { updateShip, aimToRotation } from './ship-controller'
export { createVirtualJoystick } from './virtual-joystick'
export type { VirtualJoystick } from './virtual-joystick'
export {
  createGamepadHandler,
  createGamepadHandlerState,
  readGamepadSnapshot,
  applyGamepadFrame,
} from './gamepad'
export type { GamepadHandler, GamepadHandlerState, GamepadSnapshot } from './gamepad'
export {
  SHIP_COLLISION_RADIUS,
  ASTEROID_COLLISION_RADIUS,
  COLLISION_PUSH_BUFFER,
} from './collision-constants'
export { resolveShipAsteroidCollision, checkProjectileAsteroidCollisions } from './collision'
export type { ProjectileHit } from './collision'
export { createExplosion, updateExplosion, disposeExplosion, EXPLOSION_DURATION } from './explosion'
export type { Explosion } from './explosion'
export {
  breakChunks,
  updateDebrisChunk,
  disposeDebrisChunk,
  HITS_PER_BREAK,
} from './asteroid-debris'
export type { DebrisChunk } from './asteroid-debris'
export {
  bounceMetalOffShip,
  bounceMetalOffAsteroid,
  updateMetalChunk,
  METAL_CHUNK_RADIUS,
  METAL_SPAWN_CHANCE,
} from './metal-chunk'
export type { MetalChunk } from './metal-chunk'
export { computeHealthMeterState } from './asteroid-health-meter'
export type { HealthMeterState } from './asteroid-health-meter'
export { createCollectorVfx, updateCollectorVfx, disposeCollectorVfx } from './collector-vfx'
export type { CollectorVfx } from './collector-vfx'
export {
  resumeAudio,
  startCollectorHum,
  stopCollectorHum,
  playCollectPling,
  disposeAudio,
} from './audio'
export {
  startMusic,
  setMusicIntensity,
  updateMusic,
  suspendMusic,
  resumeMusic,
  disposeMusic,
  setMusicFilter,
} from './music'
export {
  playLaserFire,
  playExplosion,
  playPlayerHit,
  playKlaxon,
  startEngineSound,
  updateEngineSound,
  suspendEngineSound,
  resumeEngineSound,
  stopEngineSound,
  disposeSfx,
} from './sfx'
export { createScreenShake, addTrauma, updateScreenShake } from './screen-shake'
export type { ScreenShake } from './screen-shake'
export {
  createTwinkleStars,
  updateTwinkleStars,
  disposeTwinkleStars,
  createNebulaSystem,
  updateNebulaSystem,
  disposeNebulaSystem,
  createBlackHole,
  updateBlackHole,
  disposeBlackHole,
} from './background-effects'
export type { TwinkleStars, NebulaSystem, BlackHole } from './background-effects'
export { createEngineTrail, updateEngineTrail, disposeEngineTrail } from './engine-trail'
export type { EngineTrail } from './engine-trail'
export { getSfxVolume, setSfxVolume, getMusicVolume, setMusicVolume } from './volume-control'
export { createGameScene } from './scene'
export type { GameScene, MetalVariant, GameSceneOptions } from './scene'
