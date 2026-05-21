import * as THREE from 'three'
import { createShipModel } from './ship-model'
import { createAsteroidModel } from './asteroid-model'
import { spawnAsteroidField, spawnPrologueField } from './asteroid-spawner'
import { createArbiterModel } from './arbiter-model'
import {
  PROLOGUE_ASTEROID_COUNT,
  PROLOGUE_MOON_COUNT,
  PROLOGUE_SHIP,
  ARBITER_SPAWN_DISTANCE,
} from './prologue-config'
import {
  createGasStationModel,
  initGasStationNeon,
  updateGasStationNeon,
} from './gas-station-model'
import { createProjectileModel } from './projectile-model'
import { createLazerBeam, updateLazerBeam, disposeLazerBeam } from './lazer-beam'
import { createTractorBeam, updateTractorBeam, disposeTractorBeam } from './tractor-beam'
import type { TractorBeam } from './tractor-beam'
import { createInputState, createInputHandler, createAimState, createAimHandler } from './input'
import { createVirtualJoystick, createAimJoystick } from './virtual-joystick'
import { createGamepadHandler } from './gamepad'
import { createToolToggleButton } from './fire-button'
import type { ToolToggleButton } from './fire-button'
import { createRechargeMeter, updateRechargeMeter } from './recharge-meter'
import { createExplosion, updateExplosion, disposeExplosion } from './explosion'
import type { Explosion } from './explosion'
import {
  createHealthMeter,
  updateHealthMeter,
  attachAsteroidHealthMeter,
  HEALTH_BAR_OFFSET_Y,
} from './asteroid-health-meter'
import {
  breakChunks,
  updateDebrisChunk,
  disposeDebrisChunk,
  HITS_PER_BREAK,
} from './asteroid-debris'
import type { DebrisChunk } from './asteroid-debris'
import { disposeMetalChunk } from './metal-chunk'
import type { MiningTool } from './types'
import { tick, createTickState, PLAYER_MAX_HP, collectorRangeForTier } from './game-tick'
import type { TickState, TickInput } from './game-tick'
import { FIRST_PATROL_DELAY, ASTEROID_REPLENISH_INTERVAL, computeScore } from './ledger-config'
import type { RunStats } from './ledger-config'
import type { ArbiterHudInfo } from './arbiter-comms'
import { createCollectorVfx, updateCollectorVfx, disposeCollectorVfx } from './collector-vfx'
import {
  resumeAudio,
  startCollectorHum,
  stopCollectorHum,
  playCollectPling,
  disposeAudio,
} from './audio'
import {
  playLaserFire,
  playExplosion,
  playPlayerHit,
  startEngineSound,
  updateEngineSound,
  suspendEngineSound,
  startArbiterSiren,
  updateArbiterSiren,
  stopArbiterSiren,
  disposeSfx,
} from './sfx'
import { createRadar, updateRadar, disposeRadar } from './radar'
import type { Radar, RadarBlip } from './radar'
import { createScreenShake, addTrauma, updateScreenShake } from './screen-shake'
import type { ScreenShake } from './screen-shake'
import {
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
import type { TwinkleStars, NebulaSystem, BlackHole } from './background-effects'
import { createEngineTrail, updateEngineTrail, disposeEngineTrail } from './engine-trail'
import type { EngineTrail } from './engine-trail'
import { createWarpStreaks, updateWarpStreaks, disposeWarpStreaks } from './warp-streaks'
import {
  disposeEnemyProjectile,
  disposeEnemyShip,
  createShipwreckDebris,
  updateShipwreckDebris,
  disposeShipwreckDebris,
} from './enemy-ship'
import type { ShipwreckDebris } from './enemy-ship'
import { disposeScrapBox } from './scrap-box'
import type { TutorialStep } from '@/hooks/useTutorial'

function disposeMesh(obj: THREE.Object3D): void {
  if (obj instanceof THREE.Mesh) {
    obj.geometry.dispose()
    if (Array.isArray(obj.material)) {
      obj.material.forEach((m) => m.dispose())
    } else {
      obj.material.dispose()
    }
  }
  if (obj instanceof THREE.Points) {
    obj.geometry.dispose()
    if (obj.material instanceof THREE.Material) {
      obj.material.dispose()
    }
  }
}

const CAMERA_HEIGHT = 150
const CAMERA_LERP = 0.08
const STAR_COUNT = 400

export { PLAYER_MAX_HP } from './game-tick'

export type MetalVariant = 'silver' | 'gold'

export interface GameSceneOptions {
  onCollect?: (variant: MetalVariant) => void
  onShipMoved?: () => void
  onAsteroidHit?: () => void
  onMetalSpawned?: () => void
  onMetalCollected?: () => void
  onPlayerDamage?: (hp: number) => void
  onScrapCollect?: (amount: number) => void
  onEnemyNearby?: () => void
  onEnemyDestroyed?: () => void
  onScrapCollected?: () => void
  onNearStation?: () => void
  onStationRange?: (inRange: boolean) => void
  onStationDriveThrough?: () => void
  onCrystallineDeflect?: () => void
  onToolChange?: (tool: MiningTool) => void
  /** Endless mode — fired when the integer Ledger value changes. */
  onLedgerChanged?: (ledger: number) => void
  /** Endless mode — Arbiter boss HP/Mark for the HUD; null when none active. */
  onArbiterChanged?: (info: ArbiterHudInfo | null) => void
  /** Endless mode — Arbiter encounter lifecycle events for comms banners. */
  onArbiterEvent?: (event: { type: 'arrives' | 'defeated' | 'withdrawn'; mark: number }) => void
  /** Endless mode — fired once when the player's hull is lost. */
  onRunEnded?: (stats: RunStats) => void
  // Prologue callbacks
  onPrologueReady?: () => void
  onFieldCleared?: () => void
  onArbiterArrived?: () => void
  onStripComplete?: () => void
}

export interface GameScene {
  dispose: () => void
  setFireRateBonus: (multiplier: number) => void
  resetShipToStation: () => void
  setMiningTool: (tool: MiningTool) => void
  setCollectorTier: (tier: number) => void
  respawnAfterDeath: () => void
}

/**
 * Initialize the Three.js scene, renderer, camera, ship, starfield,
 * and game loop inside the given container element.
 */
export function createGameScene(
  container: HTMLElement,
  getPaused: () => boolean,
  getTutorialStep: () => TutorialStep,
  options?: GameSceneOptions,
): GameScene {
  const onCollect = options?.onCollect
  const onShipMoved = options?.onShipMoved
  const onAsteroidHit = options?.onAsteroidHit
  const onMetalSpawned = options?.onMetalSpawned
  const onMetalCollected = options?.onMetalCollected
  const onPlayerDamage = options?.onPlayerDamage
  const onScrapCollect = options?.onScrapCollect
  const onEnemyNearby = options?.onEnemyNearby
  const onEnemyDestroyed = options?.onEnemyDestroyed
  const onScrapCollected = options?.onScrapCollected
  const onNearStation = options?.onNearStation
  const onStationRange = options?.onStationRange
  const onStationDriveThrough = options?.onStationDriveThrough
  const onCrystallineDeflect = options?.onCrystallineDeflect
  const onToolChange = options?.onToolChange
  const onLedgerChanged = options?.onLedgerChanged
  const onArbiterChanged = options?.onArbiterChanged
  const onArbiterEvent = options?.onArbiterEvent
  const onRunEnded = options?.onRunEnded
  const onPrologueReady = options?.onPrologueReady
  const onFieldCleared = options?.onFieldCleared
  const onArbiterArrived = options?.onArbiterArrived
  const onStripComplete = options?.onStripComplete

  // --- Renderer ---
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setClearColor(0x0a0a1a)
  container.appendChild(renderer.domElement)

  // --- Radar mini-map (lower-left overlay canvas) ---
  const radar: Radar | null = createRadar(container)

  // --- Scene ---
  const scene = new THREE.Scene()

  // --- Camera (top-down with slight perspective) ---
  const aspect = container.clientWidth / container.clientHeight
  const camera = new THREE.PerspectiveCamera(50, aspect, 1, 1000)
  camera.position.set(0, 0, CAMERA_HEIGHT)
  camera.lookAt(0, 0, 0)

  // --- Lighting ---
  const ambient = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambient)
  const directional = new THREE.DirectionalLight(0xffffff, 0.8)
  directional.position.set(20, 40, 60)
  scene.add(directional)

  // --- Starfield ---
  const starGeo = new THREE.BufferGeometry()
  const starPositions = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 800
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 800
    starPositions[i * 3 + 2] = -20 + Math.random() * -30
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true })
  const stars = new THREE.Points(starGeo, starMat)
  scene.add(stars)

  // --- Ship ---
  let shipModel = createShipModel('prologue')
  scene.add(shipModel)

  // --- Arbiter (added to scene during prologue-arbiter step) ---
  let arbiterModel: THREE.Group | null = null

  // --- Recharge Meter (positioned at ship, but not parented to avoid rotation) ---
  const rechargeMeter = createRechargeMeter()
  scene.add(rechargeMeter)

  // --- Lazer Beam (persistent mesh, hidden when not firing) ---
  const lazerBeam = createLazerBeam()
  scene.add(lazerBeam)

  // --- Arbiter Tractor Beam (persistent mesh, hidden when not active) ---
  const tractorBeam: TractorBeam = createTractorBeam()
  scene.add(tractorBeam.group)

  // --- Asteroids ---
  // Map of asteroid id → { model, healthMeter } for all asteroids in the world
  const asteroidModels = new Map<string, { model: THREE.Group; healthMeter: THREE.Group }>()

  // --- Space Gas Station (north of the tutorial asteroid) ---
  const GAS_STATION_X = 30
  const GAS_STATION_Y = 200
  const STATION_ENTER_DISTANCE = 60
  const gasStation = createGasStationModel()
  gasStation.group.position.set(GAS_STATION_X, GAS_STATION_Y, 0)
  initGasStationNeon(gasStation.neonMeshes)
  scene.add(gasStation.group)

  // --- Directional Arrow (hidden until go-to-station tutorial step) ---
  const arrowGroup = new THREE.Group()
  arrowGroup.visible = false
  arrowGroup.scale.setScalar(0.35)
  scene.add(arrowGroup)
  // Chevron shape: 2 angled bars forming a ">" pointing right (rotated later)
  const arrowMat = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x39ff14,
    emissiveIntensity: 1.2,
    flatShading: true,
  })
  // Top bar of chevron
  const barGeo = new THREE.BoxGeometry(12, 2.5, 2)
  const topBar = new THREE.Mesh(barGeo, arrowMat)
  topBar.position.set(3, 2.5, 0)
  topBar.rotation.z = -0.5 // angle downward
  arrowGroup.add(topBar)
  // Bottom bar of chevron
  const botBar = new THREE.Mesh(barGeo.clone(), arrowMat)
  botBar.position.set(3, -2.5, 0)
  botBar.rotation.z = 0.5 // angle upward
  arrowGroup.add(botBar)
  // Second chevron (trailing, slightly transparent)
  const arrowMat2 = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x39ff14,
    emissiveIntensity: 0.7,
    flatShading: true,
    transparent: true,
    opacity: 0.6,
  })
  const topBar2 = new THREE.Mesh(barGeo.clone(), arrowMat2)
  topBar2.position.set(-5, 2.5, 0)
  topBar2.rotation.z = -0.5
  arrowGroup.add(topBar2)
  const botBar2 = new THREE.Mesh(barGeo.clone(), arrowMat2)
  botBar2.position.set(-5, -2.5, 0)
  botBar2.rotation.z = 0.5
  arrowGroup.add(botBar2)
  // Station proximity flags are now in tickState

  // --- Game State (shared with game-tick.ts) ---
  // Start with prologue asteroid field; resetShipToStation replaces it with the real field
  const prologueAsteroids = spawnPrologueField(0, 0, PROLOGUE_ASTEROID_COUNT, PROLOGUE_MOON_COUNT)
  const tickState: TickState = createTickState({
    asteroids: prologueAsteroids,
    stationPosition: { x: GAS_STATION_X, y: GAS_STATION_Y },
    blasterTier: 5,
    miningTool: 'lazer',
    fireRateBonus: 1.1 ** 4,
  })

  // Create 3D models for prologue asteroids
  for (const a of prologueAsteroids) {
    const model = createAsteroidModel(a.type, a.size, hashString(a.id))
    model.position.set(a.x, a.y, 0)
    scene.add(model)
    const hm = attachAsteroidHealthMeter(model, a.size)
    asteroidModels.set(a.id, { model, healthMeter: hm })
  }

  // Convenience aliases for rendering code
  const ship = tickState.ship
  const asteroids = tickState.asteroids

  // Rendering-only state (not part of game tick)
  const projectileModels = new Map<string, THREE.Group>()
  const explosions: Explosion[] = []
  const debrisChunks: DebrisChunk[] = []
  const shipwreckDebrisList: ShipwreckDebris[] = []

  // --- Collector VFX ---
  const collectorVfx = createCollectorVfx()
  scene.add(collectorVfx.group)

  // --- Screen Shake ---
  const screenShake: ScreenShake = createScreenShake()

  // --- Background Effects ---
  const twinkleStars: TwinkleStars = createTwinkleStars()
  scene.add(twinkleStars.points)

  const nebulaSystem: NebulaSystem = createNebulaSystem()
  scene.add(nebulaSystem.group)

  const blackHole: BlackHole = createBlackHole(-200, 200)
  scene.add(blackHole.group)

  // --- Engine Trail ---
  const engineTrail: EngineTrail = createEngineTrail()
  scene.add(engineTrail.group)

  // --- Warp Streaks (Arbiter approach effect) ---
  const warpStreaks = createWarpStreaks()
  scene.add(warpStreaks.group)

  // Hit counts are tracked in tickState.asteroidHitCounts

  // --- Input ---
  const inputState = createInputState()
  const inputHandler = createInputHandler(inputState)
  inputHandler.attach()

  // --- Aim (mouse/touch tracking) ---
  const aimState = createAimState()
  const aimHandler = createAimHandler(aimState, container)
  aimHandler.attach()

  // --- Virtual Joystick (mobile touch movement — left side) ---
  const joystick = createVirtualJoystick(inputState, container)
  joystick.attach()

  // --- Aim Joystick (mobile twin-stick aim + fire — right side) ---
  const aimJoystick = createAimJoystick(aimState, container)
  aimJoystick.attach()

  // --- Gamepad (XInput / Xbox 360 mapping) ---
  // Left stick → movement, right stick → aim + fire, RT → toggle fire-lock.
  const gamepad = createGamepadHandler(inputState, aimState, container)
  gamepad.attach()

  // --- Screen-to-world coordinate conversion ---
  const raycaster = new THREE.Raycaster()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const ndcVec = new THREE.Vector2()
  const worldIntersect = new THREE.Vector3()

  function screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const w = renderer.domElement.clientWidth
    const h = renderer.domElement.clientHeight
    // Convert screen pixels to NDC (-1 to 1)
    ndcVec.x = (screenX / w) * 2 - 1
    ndcVec.y = -(screenY / h) * 2 + 1
    raycaster.setFromCamera(ndcVec, camera)
    const hit = raycaster.ray.intersectPlane(groundPlane, worldIntersect)
    if (!hit) return { x: camera.position.x, y: camera.position.y }
    return { x: worldIntersect.x, y: worldIntersect.y }
  }

  // --- Fire handlers ---
  let fireTarget: { x: number; y: number } | null = null
  let mouseHoldingFire = false

  // Detect touch support to decide between mobile buttons and mouse controls
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  function onMouseDown(e: MouseEvent): void {
    resumeAudio()
    startEngineSound()
    if (getPaused()) return
    if (e.button === 0) {
      // Left-click: fire weapon (and track hold for auto-fire)
      mouseHoldingFire = true
      const rect = renderer.domElement.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      fireTarget = screenToWorld(sx, sy)
    } else if (e.button === 2) {
      // Right-click: activate collector/magnet
      mouseCollecting = true
      collecting = true
    }
  }

  function onMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      mouseHoldingFire = false
    } else if (e.button === 2) {
      mouseCollecting = false
      if (!collectKeyDown) collecting = false
    }
  }

  function onContextMenu(e: Event): void {
    e.preventDefault()
  }

  renderer.domElement.addEventListener('mousedown', onMouseDown)
  renderer.domElement.addEventListener('mouseup', onMouseUp)
  renderer.domElement.addEventListener('contextmenu', onContextMenu)

  // --- Tool Toggle (keyboard Q + mobile button) ---
  let toolToggleButton: ToolToggleButton | null = null

  function toggleMiningTool(): void {
    const newTool = tickState.activeMiningTool === 'lazer' ? 'blaster' : 'lazer'
    tickState.activeMiningTool = newTool
    toolToggleButton?.setTool(newTool)
    onToolChange?.(newTool)
  }

  if (hasTouch) {
    toolToggleButton = createToolToggleButton(container, () => {
      if (getPaused()) return
      toggleMiningTool()
    })
    toolToggleButton.attach()
  }

  function onToolToggleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'KeyQ') {
      toggleMiningTool()
    }
  }
  window.addEventListener('keydown', onToolToggleKeyDown)

  // --- Collect (mouse right-click + keyboard + mobile button) ---
  let collecting = false
  let collectKeyDown = false
  let mouseCollecting = false

  function onCollectKeyDown(e: KeyboardEvent): void {
    if (e.code === 'KeyE' || e.code === 'Space') {
      if (!collectKeyDown) {
        collectKeyDown = true
        collecting = true
        resumeAudio()
      }
    }
  }
  function onCollectKeyUp(e: KeyboardEvent): void {
    if (e.code === 'KeyE' || e.code === 'Space') {
      collectKeyDown = false
      if (!mouseCollecting) collecting = false
    }
  }
  window.addEventListener('keydown', onCollectKeyDown)
  window.addEventListener('keyup', onCollectKeyUp)

  // Swallow right-half touches that miss the fire button so the browser
  // doesn't synthesize mouse events that rotate the ship or break the joystick.
  function onTouchStartSwallow(e: TouchEvent): void {
    resumeAudio()
    startEngineSound()
    const rect = container.getBoundingClientRect()
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      if (touch.clientX - rect.left >= rect.width / 2) {
        e.preventDefault()
        return
      }
    }
  }
  container.addEventListener('touchstart', onTouchStartSwallow, { passive: false })

  // --- Resize ---
  function onResize(): void {
    const w = container.clientWidth
    const h = container.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  // Helper to remove a projectile model from the scene
  function removeProjectileModel(id: string): void {
    const model = projectileModels.get(id)
    if (model) {
      scene.remove(model)
      model.traverse(disposeMesh)
      projectileModels.delete(id)
    }
  }

  // --- Game Loop ---
  let prevTime = performance.now()
  let animId = 0
  let wasPaused = false
  let prevLedgerInt = -1
  let prevArbiterKey = ''
  let prevTractorActive = false

  function loop(): void {
    animId = requestAnimationFrame(loop)
    const now = performance.now()
    const dt = Math.min((now - prevTime) / 1000, 0.05) // cap at 50ms
    prevTime = now

    // --- Build per-frame input for the shared tick function ---
    const paused = getPaused()

    // --- Gamepad poll: writes to inputState/aimState, returns firing intent ---
    const gamepadResult = gamepad.poll()

    // --- Aim joystick poll: writes to aimState, returns firing intent ---
    const aimJoystickResult = aimJoystick.poll()

    // Compute world-space aim from screen-space aimState
    let aimWorldPosition: { x: number; y: number } | null = null
    if (aimState.active) {
      const w = screenToWorld(aimState.screenX, aimState.screenY)
      aimWorldPosition = { x: w.x, y: w.y }
    }

    // Sync fire state from DOM event handlers into tickState
    if (fireTarget) {
      tickState.fireTarget = fireTarget
      fireTarget = null
    }

    // Gamepad fire (right stick past deadzone OR fire-lock engaged with last aim)
    if (!paused && gamepadResult.firing && aimState.active) {
      const w = screenToWorld(aimState.screenX, aimState.screenY)
      tickState.fireTarget = { x: w.x, y: w.y }
    }

    // Touch twin-stick fire (right-side aim joystick)
    if (!paused && aimJoystickResult.firing && aimState.active) {
      const w = screenToWorld(aimState.screenX, aimState.screenY)
      tickState.fireTarget = { x: w.x, y: w.y }
    }

    // Always sync from DOM — tick's input cooldown handles stale events
    tickState.mouseHoldingFire = mouseHoldingFire
    tickState.aimActive = aimState.active

    // Camera-visible world rectangle (camera looks straight down at the z=0
    // play plane). Used by tick() to gate fire to on-screen targets only.
    const camHalfH = camera.position.z * Math.tan((camera.fov * Math.PI) / 360)
    const camHalfW = camHalfH * camera.aspect

    const tickInput: TickInput = {
      dt,
      paused,
      inputState,
      aimWorldPosition,
      collecting,
      tutorialStep: getTutorialStep(),
      viewBounds: {
        centerX: camera.position.x,
        centerY: camera.position.y,
        halfW: camHalfW,
        halfH: camHalfH,
      },
      blackHole: {
        x: blackHole.x + camera.position.x * 0.1,
        y: blackHole.y + camera.position.y * 0.1,
      },
    }

    // Snapshot mesh-bearing objects before tick (tick may splice them out)
    const metalMeshMap = new Map(tickState.metalChunks.map((m) => [m.id, m.mesh]))
    const scrapMeshMap = new Map(tickState.scrapBoxes.map((s) => [s.id, s.mesh]))
    const enemyProjMeshMap = new Map(tickState.enemyProjectiles.map((p) => [p.id, p.mesh]))
    const enemyBeforeTick = tickState.enemy

    const result = tick(tickState, tickInput)

    // Sync cleared aim/fire state back to scene-level variables
    aimState.active = tickState.aimActive
    mouseHoldingFire = tickState.mouseHoldingFire

    if (!paused) {
      // --- Process tick result for rendering ---

      // Recharge meter (rendering-only)
      updateRechargeMeter(
        rechargeMeter,
        tickState.blasterState,
        tickState.blasterTier,
        tickState.activeMiningTool,
        tickState.lazerState,
      )

      // Lazer beam visual
      updateLazerBeam(
        lazerBeam,
        result.beamActive,
        result.beamStartX,
        result.beamStartY,
        result.beamEndX,
        result.beamEndY,
      )
      if (result.beamActive) {
        playLaserFire()
      }

      // Beam hit VFX (explosions on hit asteroids)
      for (const hit of result.beamHits) {
        if (hit.deflected) continue
        // Only show explosion VFX periodically (not every frame)
        const hitCount = tickState.asteroidHitCounts.get(hit.asteroidId) ?? 0
        if (hitCount > 0 && hitCount % HITS_PER_BREAK === 0) {
          const explosion = createExplosion(hit.x, hit.y)
          scene.add(explosion.group)
          explosions.push(explosion)
          playExplosion()

          const hitModel = asteroidModels.get(hit.asteroidId)?.model
          if (hitModel) {
            const chunks = breakChunks(hitModel, hit.x, hit.y, 2 + Math.floor(Math.random() * 2))
            for (const chunk of chunks) {
              scene.add(chunk.mesh)
              debrisChunks.push(chunk)
            }
          }
        }
      }

      // Sync asteroid model positions
      for (const a of asteroids) {
        const entry = asteroidModels.get(a.id)
        if (entry) {
          entry.model.position.set(a.x, a.y, 0)
        }
      }

      // New projectile models
      if (result.newProjectiles.length > 0) {
        playLaserFire()
      }
      for (const p of result.newProjectiles) {
        const model = createProjectileModel(p.tool)
        model.position.set(p.x, p.y, 0)
        const angle = Math.atan2(p.velocityY, p.velocityX)
        model.rotation.z = angle - Math.PI / 2
        scene.add(model)
        projectileModels.set(p.id, model)
      }

      // Remove expired/hit projectile models
      for (const id of result.expiredProjectileIds) {
        removeProjectileModel(id)
      }

      // Asteroid hit VFX
      for (const hit of result.asteroidHits) {
        removeProjectileModel(hit.projectileId)
        if (hit.deflected) continue

        const explosion = createExplosion(hit.x, hit.y)
        scene.add(explosion.group)
        explosions.push(explosion)
        playExplosion()

        // Break off visual debris chunks
        const hitCount = tickState.asteroidHitCounts.get(hit.asteroidId) ?? 0
        if (hitCount > 0 && hitCount % HITS_PER_BREAK === 0) {
          const hitModel = asteroidModels.get(hit.asteroidId)?.model
          if (hitModel) {
            const chunks = breakChunks(hitModel, hit.x, hit.y, 2 + Math.floor(Math.random() * 2))
            for (const chunk of chunks) {
              scene.add(chunk.mesh)
              debrisChunks.push(chunk)
            }
          }
        }
      }

      // Endless mode: replenished asteroid models
      for (const a of result.newAsteroids) {
        const model = createAsteroidModel(a.type, a.size, hashString(a.id))
        model.position.set(a.x, a.y, 0)
        scene.add(model)
        const hm = attachAsteroidHealthMeter(model, a.size)
        asteroidModels.set(a.id, { model, healthMeter: hm })
      }

      // Endless mode: dispose destroyed/culled asteroid models
      for (const id of result.expiredAsteroidIds) {
        const entry = asteroidModels.get(id)
        if (entry) {
          scene.remove(entry.model)
          entry.model.traverse(disposeMesh)
          asteroidModels.delete(id)
        }
      }

      // New metal chunk models
      for (const metal of result.newMetalChunks) {
        scene.add(metal.mesh)
      }

      // Metal collected — remove meshes from scene
      for (const mc of result.metalCollected) {
        const mesh = metalMeshMap.get(mc.id)
        if (mesh) {
          scene.remove(mesh)
          mesh.traverse(disposeMesh)
        }
        playCollectPling()
      }

      // Add meshes for scrap boxes spawned this tick (enemy / patrol drops).
      // Replaces the old "last box" heuristic, which dropped boxes whenever
      // several enemies died on the same tick.
      for (const sb of tickState.scrapBoxes) {
        if (!scrapMeshMap.has(sb.id)) {
          scene.add(sb.mesh)
          scrapMeshMap.set(sb.id, sb.mesh)
        }
      }

      // Scrap collected — remove meshes from scene
      for (const sc of result.scrapCollected) {
        const mesh = scrapMeshMap.get(sc.id)
        if (mesh) {
          scene.remove(mesh)
          mesh.traverse(disposeMesh)
        }
        playCollectPling()
      }

      // Loot stolen by scavengers — remove meshes silently (no pling, no credit)
      for (const id of result.metalStolen) {
        const mesh = metalMeshMap.get(id)
        if (mesh) {
          scene.remove(mesh)
          mesh.traverse(disposeMesh)
        }
      }
      for (const id of result.scrapStolen) {
        const mesh = scrapMeshMap.get(id)
        if (mesh) {
          scene.remove(mesh)
          mesh.traverse(disposeMesh)
        }
      }

      // Enemy spawned — add mesh to scene
      if (result.enemySpawned) {
        scene.add(result.enemySpawned.mesh)
        // Enemy faces the player, so place the bar behind the ship (-Y),
        // pushed clear of bigger hulls (the carrier).
        const enemyHealthMeter = createHealthMeter(
          -Math.max(HEALTH_BAR_OFFSET_Y, result.enemySpawned.collisionRadius + 8),
        )
        result.enemySpawned.mesh.add(enemyHealthMeter)
        result.enemySpawned.mesh.userData.healthMeter = enemyHealthMeter
      }

      // Enemy projectiles — add meshes
      for (const proj of result.newEnemyProjectiles) {
        scene.add(proj.mesh)
        // Register in mesh map so same-tick hits (spawned & collided in one frame) can be cleaned up
        enemyProjMeshMap.set(proj.id, proj.mesh)
      }

      // Remove expired enemy projectile meshes from scene
      for (const id of result.expiredEnemyProjectileIds) {
        const mesh = enemyProjMeshMap.get(id)
        if (mesh) {
          scene.remove(mesh)
          mesh.traverse(disposeMesh)
        }
      }

      // Remove enemy projectiles that hit the player
      for (const hit of result.enemyProjectileHits) {
        const mesh = enemyProjMeshMap.get(hit.id)
        if (mesh) {
          scene.remove(mesh)
          mesh.traverse(disposeMesh)
        }
        const hitExplosion = createExplosion(hit.x, hit.y)
        scene.add(hitExplosion.group)
        explosions.push(hitExplosion)
        addTrauma(screenShake, 0.4 + (hit.damage / PLAYER_MAX_HP) * 0.4)
        playPlayerHit()
      }

      // Single (tutorial) enemy destroyed — remove mesh and spawn VFX.
      // Detected by "existed before the tick, now gone" so a patrol enemy
      // dying the same tick (which also sets result.enemyDestroyed) can't
      // wrongly dispose a still-alive tutorial enemy.
      if (enemyBeforeTick && !tickState.enemy) {
        scene.remove(enemyBeforeTick.mesh)
        disposeEnemyShip(enemyBeforeTick)
        const wreck = createShipwreckDebris(enemyBeforeTick.x, enemyBeforeTick.y)
        scene.add(wreck.group)
        shipwreckDebrisList.push(wreck)

        const bigExplosion = createExplosion(enemyBeforeTick.x, enemyBeforeTick.y)
        scene.add(bigExplosion.group)
        explosions.push(bigExplosion)
        playExplosion()
      }

      // Ambush / patrol enemies — add meshes + health meters for newly spawned
      for (const ae of result.ambushEnemiesSpawned) {
        scene.add(ae.mesh)
        // Enemy faces the player, so place the bar behind the ship (-Y),
        // pushed clear of bigger hulls (the carrier).
        const hm = createHealthMeter(-Math.max(HEALTH_BAR_OFFSET_Y, ae.collisionRadius + 8))
        ae.mesh.add(hm)
        ae.mesh.userData.healthMeter = hm
      }

      // Ambush enemies destroyed — remove mesh, spawn explosion + wreckage
      for (const ae of result.ambushEnemiesDestroyed) {
        scene.remove(ae.mesh)
        disposeEnemyShip(ae)

        const wreck = createShipwreckDebris(ae.x, ae.y)
        scene.add(wreck.group)
        shipwreckDebrisList.push(wreck)

        const bigExplosion = createExplosion(ae.x, ae.y)
        scene.add(bigExplosion.group)
        explosions.push(bigExplosion)
        playExplosion()
      }

      // Scavengers that escaped with loot — remove their meshes quietly
      // (they are far off-screen by the time they slip away).
      for (const ae of result.enemiesEscaped) {
        scene.remove(ae.mesh)
        disposeEnemyShip(ae)
      }

      // Update ambush enemy mesh positions (alive only)
      for (const ae of tickState.ambushEnemies) {
        if (ae.alive) {
          ae.mesh.position.set(ae.x, ae.y, 0)
          ae.mesh.rotation.z = ae.rotation
        }
      }

      // --- Fire callbacks from tick result ---
      if (result.shipMoved) onShipMoved?.()
      if (result.asteroidHit) onAsteroidHit?.()
      if (result.crystallineDeflect) onCrystallineDeflect?.()
      if (result.metalSpawned) onMetalSpawned?.()
      for (const mc of result.metalCollected) {
        onCollect?.(mc.variant)
        onMetalCollected?.()
      }
      if (result.playerDamaged) onPlayerDamage?.(tickState.playerHp)
      for (const sc of result.scrapCollected) {
        onScrapCollect?.(sc.value)
        onScrapCollected?.()
      }
      if (result.enemyNearby) onEnemyNearby?.()
      if (result.enemyDestroyedEvent) onEnemyDestroyed?.()
      if (result.nearStation) onNearStation?.()
      if (result.stationRangeChanged !== null) onStationRange?.(result.stationRangeChanged)
      if (result.stationRepaired) onStationDriveThrough?.()
      // --- Prologue events ---
      if (result.prologueReady) onPrologueReady?.()
      if (result.fieldCleared) onFieldCleared?.()
      if (result.arbiterArrived) onArbiterArrived?.()
      if (result.stripComplete) onStripComplete?.()

      // --- Endless mode: push the Ledger to the HUD when its integer changes ---
      const ledgerInt = Math.floor(result.ledger)
      if (ledgerInt !== prevLedgerInt) {
        prevLedgerInt = ledgerInt
        onLedgerChanged?.(ledgerInt)
      }

      // --- Arbiter visual management (prologue intro OR endless boss) ---
      const wantArbiter = tickState.prologueArbiterSpawned || tickState.arbiter !== null
      if (wantArbiter && !arbiterModel) {
        arbiterModel = createArbiterModel()
        scene.add(arbiterModel)
      } else if (!wantArbiter && arbiterModel) {
        scene.remove(arbiterModel)
        arbiterModel.traverse(disposeMesh)
        arbiterModel = null
      }
      if (arbiterModel) {
        if (tickState.arbiter) {
          arbiterModel.position.set(tickState.arbiter.x, tickState.arbiter.y, 0)
          arbiterModel.rotation.z = tickState.arbiter.rotation
        } else {
          // Prologue: game-tick drives the scripted approach distance.
          arbiterModel.position.set(ship.x, ship.y + tickState.prologueArbiterDistance, 0)
        }
      }

      // --- Arbiter encounter events ---
      if (result.arbiterSpawned) {
        addTrauma(screenShake, 0.6)
        onArbiterEvent?.({ type: 'arrives', mark: result.arbiterSpawned.mark })
      }
      if (result.arbiterDefeated) {
        const { x, y, mark } = result.arbiterDefeated
        addTrauma(screenShake, 1.0)
        for (let i = 0; i < 6; i++) {
          const boom = createExplosion(
            x + (Math.random() - 0.5) * 24,
            y + (Math.random() - 0.5) * 24,
          )
          scene.add(boom.group)
          explosions.push(boom)
        }
        const wreck = createShipwreckDebris(x, y)
        scene.add(wreck.group)
        shipwreckDebrisList.push(wreck)
        playExplosion()
        onArbiterEvent?.({ type: 'defeated', mark })
      }
      if (result.arbiterWithdrawn) {
        onArbiterEvent?.({ type: 'withdrawn', mark: result.arbiterWithdrawn.mark })
      }

      // --- Run ended — hull lost ---
      if (result.playerKilled) {
        onRunEnded?.({
          marksDefeated: tickState.marksDefeated,
          peakLedger: Math.round(tickState.peakLedger),
          runTime: tickState.runTime,
          score: computeScore(tickState.peakLedger, tickState.marksDefeated),
        })
      }

      // --- Arbiter HUD sync (only when Mark / hull / phase changes) ---
      const arb = tickState.arbiter
      const arbiterKey = arb ? `${arb.mark}:${Math.ceil(arb.hp)}:${arb.phase}` : 'none'
      if (arbiterKey !== prevArbiterKey) {
        prevArbiterKey = arbiterKey
        onArbiterChanged?.(
          arb ? { mark: arb.mark, hp: arb.hp, maxHp: arb.maxHp, phase: arb.phase } : null,
        )
      }

      // --- Arbiter tractor beam visual + feedback ---
      updateTractorBeam(
        tractorBeam,
        !!arb?.tractorActive,
        arb ? arb.x : 0,
        arb ? arb.y : 0,
        arb ? arb.tractorAngle : 0,
        arb ? arb.tractorElapsed : 0,
      )
      if (arb?.tractorActive && !prevTractorActive) addTrauma(screenShake, 0.45)
      prevTractorActive = !!arb?.tractorActive
      if (result.arbiterCaptureHit) {
        addTrauma(screenShake, 0.85)
        playPlayerHit()
      }

      // Strip modules during prologue-strip
      if (result.stripAdvanced) {
        const moduleNames = ['turret', 'scoop', 'cargoPods', 'lazerLens']
        const phase = tickState.prologueStripPhase - 1
        if (phase >= 0 && phase < moduleNames.length) {
          const mod = shipModel.getObjectByName(moduleNames[phase])
          if (mod) {
            shipModel.remove(mod)
            mod.traverse(disposeMesh)
          }
        }
      }

      // --- Update asteroid health meters & visibility ---
      for (const a of asteroids) {
        const entry = asteroidModels.get(a.id)
        if (entry) {
          updateHealthMeter(entry.healthMeter, a.hp, a.maxHp)
          entry.model.visible = a.hp > 0
        }
      }

      // --- Update enemy health meter ---
      if (tickState.enemy && tickState.enemy.alive) {
        const ehm = tickState.enemy.mesh.userData.healthMeter as THREE.Group | undefined
        if (ehm) {
          updateHealthMeter(ehm, tickState.enemy.hp, tickState.enemy.maxHp)
        }
      }

      // --- Update ambush / patrol enemy health meters + sniper sights ---
      for (const ae of tickState.ambushEnemies) {
        if (!ae.alive) continue
        const ahm = ae.mesh.userData.healthMeter as THREE.Group | undefined
        if (ahm) updateHealthMeter(ahm, ae.hp, ae.maxHp)

        // Sniper laser sight — visible and stretched to the player while charging
        if (ae.kind === 'sniper') {
          const sight = ae.mesh.userData.laserSight as THREE.Mesh | undefined
          if (sight) {
            sight.visible = ae.charging
            if (ae.charging) {
              const sdx = ship.x - ae.x
              const sdy = ship.y - ae.y
              sight.scale.y = Math.max(1, Math.hypot(sdx, sdy) - 8)
            }
          }
        }
      }

      // --- Update Shipwreck Debris ---
      for (let i = shipwreckDebrisList.length - 1; i >= 0; i--) {
        const alive = updateShipwreckDebris(shipwreckDebrisList[i], dt)
        if (!alive) {
          scene.remove(shipwreckDebrisList[i].group)
          disposeShipwreckDebris(shipwreckDebrisList[i])
          shipwreckDebrisList.splice(i, 1)
        }
      }

      // --- Update Explosions ---
      for (let i = explosions.length - 1; i >= 0; i--) {
        const alive = updateExplosion(explosions[i], dt)
        if (!alive) {
          scene.remove(explosions[i].group)
          disposeExplosion(explosions[i])
          explosions.splice(i, 1)
        }
      }

      // --- Update Debris Chunks ---
      for (let i = debrisChunks.length - 1; i >= 0; i--) {
        const alive = updateDebrisChunk(debrisChunks[i], dt)
        if (!alive) {
          scene.remove(debrisChunks[i].mesh)
          disposeDebrisChunk(debrisChunks[i])
          debrisChunks.splice(i, 1)
        }
      }

      // --- Collector VFX & Audio ---
      // Collector VFX/hum: drive by "is any pickup within the active magnet
      // range right now?" The magnet itself is always-on; this just keeps the
      // visual swirl + audio quiet when there's nothing to pull.
      const isPrologueStep = getTutorialStep().startsWith('prologue-')
      const collectorRange = tickState.prologueShipFrozen
        ? 0
        : isPrologueStep
          ? PROLOGUE_SHIP.collectorRange
          : collectorRangeForTier(tickState.collectorTier)
      const rangeSq = collectorRange * collectorRange
      let anyInRange = false
      if (collectorRange > 0) {
        for (const m of tickState.metalChunks) {
          if ((m.x - ship.x) ** 2 + (m.y - ship.y) ** 2 < rangeSq) {
            anyInRange = true
            break
          }
        }
        if (!anyInRange) {
          for (const s of tickState.scrapBoxes) {
            if ((s.x - ship.x) ** 2 + (s.y - ship.y) ** 2 < rangeSq) {
              anyInRange = true
              break
            }
          }
        }
      }
      const collectingActive = anyInRange || tickState.prologueAutoCollect
      updateCollectorVfx(collectorVfx, dt, collectingActive, ship.x, ship.y, collectorRange)
      if (collectingActive) {
        startCollectorHum()
      } else {
        stopCollectorHum()
      }

      // --- Update Gas Station Neon ---
      updateGasStationNeon(gasStation.neonMeshes, now / 1000)

      // --- Engine Trail & Sound ---
      const shipSpeed = Math.sqrt(ship.velocityX * ship.velocityX + ship.velocityY * ship.velocityY)
      const speedNorm = Math.min(1, shipSpeed / 50)
      updateEngineTrail(engineTrail, dt, ship.x, ship.y, ship.rotation, speedNorm)
      updateEngineSound(speedNorm)

      // --- Warp Streaks (active when Arbiter takes control) ---
      const currentStep = getTutorialStep()
      const warpActive =
        currentStep === 'prologue-arbiter' ||
        currentStep === 'prologue-dialogue' ||
        currentStep === 'prologue-strip'
      updateWarpStreaks(warpStreaks, dt, warpActive, ship.x, ship.y, tickState.elapsedTime)

      // --- Screen Shake ---
      updateScreenShake(screenShake, dt, now / 1000)

      // --- Background Effects ---
      updateTwinkleStars(twinkleStars, now / 1000, camera.position.x, camera.position.y)
      updateNebulaSystem(nebulaSystem, now / 1000, camera.position.x, camera.position.y)
      updateBlackHole(blackHole, now / 1000, camera.position.x, camera.position.y)

      // --- Tutorial: Station Arrow ---
      const sdx = GAS_STATION_X - ship.x
      const sdy = GAS_STATION_Y - ship.y
      const sDist = Math.sqrt(sdx * sdx + sdy * sdy)
      const inStationRange = sDist <= 60
      const tutStep = getTutorialStep()
      const showArrow = tutStep === 'go-to-station' || tutStep === 'approach-station'
      arrowGroup.visible = showArrow && !inStationRange
      if (showArrow) {
        const angle = Math.atan2(sdy, sdx)
        const arrowDist = 8
        arrowGroup.position.set(
          ship.x + Math.cos(angle) * arrowDist,
          ship.y + Math.sin(angle) * arrowDist,
          5,
        )
        arrowGroup.rotation.z = angle
        const flash = 0.6 + 0.4 * Math.sin((now / 1000) * 4.0)
        arrowMat.emissiveIntensity = flash * 1.5
        arrowMat2.emissiveIntensity = flash * 0.7
        arrowGroup.position.z = 5 + Math.sin((now / 1000) * 2.5) * 2
      }

      // --- Sync projectile positions ---
      for (const p of tickState.projectiles) {
        const model = projectileModels.get(p.id)
        if (model) {
          model.position.set(p.x, p.y, 0)
        }
      }

      // Sync ship model
      shipModel.position.set(ship.x, ship.y, 0)
      shipModel.rotation.z = ship.rotation
      rechargeMeter.position.set(ship.x, ship.y, 0)

      // --- Turret rotation — tracks the player's aim (mouse / right stick).
      // Arrow barrel points in local +Y at rest; setting local rotation.z =
      // (worldAimAngle - π/2) - ship.rotation puts the arrow on the aim ray.
      // Falls back to "forward" (local 0) when no aim is active.
      const turret = shipModel.getObjectByName('turret')
      if (turret) {
        if (aimWorldPosition) {
          const tdx = aimWorldPosition.x - ship.x
          const tdy = aimWorldPosition.y - ship.y
          if (tdx * tdx + tdy * tdy > 0.25) {
            const worldAim = Math.atan2(tdy, tdx)
            turret.rotation.z = worldAim - Math.PI / 2 - ship.rotation
          }
        } else {
          turret.rotation.z = 0
        }
      }

      // Camera follows ship
      const lerpFactor = 1 - Math.pow(1 - CAMERA_LERP, dt * 60)
      camera.position.x += (ship.x - camera.position.x) * lerpFactor
      camera.position.y += (ship.y - camera.position.y) * lerpFactor

      camera.position.x += screenShake.offsetX
      camera.position.y += screenShake.offsetY

      stars.position.x = camera.position.x * 0.5
      stars.position.y = camera.position.y * 0.5

      // --- Arbiter approach siren ---
      // Wails throughout the prologue-arbiter beat, rising as it closes in.
      if (currentStep === 'prologue-arbiter') {
        startArbiterSiren()
        updateArbiterSiren(1 - tickState.prologueArbiterDistance / ARBITER_SPAWN_DISTANCE)
      } else if (tickState.arbiter && tickState.arbiter.mode === 'hunting') {
        startArbiterSiren()
        const adx = tickState.arbiter.x - ship.x
        const ady = tickState.arbiter.y - ship.y
        const adist = Math.sqrt(adx * adx + ady * ady)
        updateArbiterSiren(Math.max(0.15, Math.min(1, 1 - adist / 220)))
      } else {
        stopArbiterSiren()
      }

      // --- Radar mini-map ---
      if (radar) {
        const radarEnemies: RadarBlip[] = []
        if (tickState.enemy && tickState.enemy.alive) {
          radarEnemies.push({ x: tickState.enemy.x, y: tickState.enemy.y })
        }
        for (const ae of tickState.ambushEnemies) {
          if (ae.alive) radarEnemies.push({ x: ae.x, y: ae.y })
        }
        updateRadar(radar, {
          shipX: ship.x,
          shipY: ship.y,
          shipRotation: ship.rotation,
          asteroids: asteroids.filter((a) => a.hp > 0),
          enemies: radarEnemies,
          station: { x: GAS_STATION_X, y: GAS_STATION_Y },
          arbiter: arbiterModel
            ? { x: arbiterModel.position.x, y: arbiterModel.position.y }
            : null,
        })
      }

      wasPaused = false
    } else {
      // --- Paused: mute all looping audio ---
      if (!wasPaused) {
        wasPaused = true
        suspendEngineSound()
        stopCollectorHum()
        stopArbiterSiren()
      }
    }

    renderer.render(scene, camera)
  }
  loop()

  // --- Cleanup ---
  function dispose(): void {
    cancelAnimationFrame(animId)
    inputHandler.detach()
    aimHandler.detach()
    joystick.detach()
    aimJoystick.detach()
    gamepad.detach()
    if (toolToggleButton) toolToggleButton.detach()
    renderer.domElement.removeEventListener('mousedown', onMouseDown)
    renderer.domElement.removeEventListener('mouseup', onMouseUp)
    renderer.domElement.removeEventListener('contextmenu', onContextMenu)
    container.removeEventListener('touchstart', onTouchStartSwallow)
    window.removeEventListener('keydown', onCollectKeyDown)
    window.removeEventListener('keyup', onCollectKeyUp)
    window.removeEventListener('keydown', onToolToggleKeyDown)
    window.removeEventListener('resize', onResize)

    // Clean up projectile tracking state
    projectileModels.clear()
    tickState.projectileElapsed.clear()
    tickState.projectiles = []

    // Clean up lazer beam
    disposeLazerBeam(lazerBeam)
    disposeTractorBeam(tractorBeam)

    // Clean up explosions
    for (const e of explosions) {
      disposeExplosion(e)
    }
    explosions.length = 0

    // Clean up debris
    for (const d of debrisChunks) {
      disposeDebrisChunk(d)
    }
    debrisChunks.length = 0

    // Clean up metal chunks
    for (const m of tickState.metalChunks) {
      disposeMetalChunk(m)
    }
    tickState.metalChunks.length = 0

    // Clean up enemy
    if (tickState.enemy) {
      disposeEnemyShip(tickState.enemy)
    }
    for (const ae of tickState.ambushEnemies) {
      disposeEnemyShip(ae)
    }
    tickState.ambushEnemies.length = 0
    for (const ep of tickState.enemyProjectiles) {
      disposeEnemyProjectile(ep)
    }
    tickState.enemyProjectiles.length = 0
    for (const wd of shipwreckDebrisList) {
      disposeShipwreckDebris(wd)
    }
    shipwreckDebrisList.length = 0
    for (const sb of tickState.scrapBoxes) {
      disposeScrapBox(sb)
    }
    tickState.scrapBoxes.length = 0

    // Clean up asteroid models
    asteroidModels.clear()

    // Clean up collector VFX & audio
    disposeCollectorVfx(collectorVfx)
    disposeAudio()
    disposeSfx()

    // Remove the radar overlay canvas
    if (radar) disposeRadar(radar)

    // Clean up background effects & engine trail
    disposeTwinkleStars(twinkleStars)
    disposeNebulaSystem(nebulaSystem)
    disposeBlackHole(blackHole)
    disposeEngineTrail(engineTrail)
    disposeWarpStreaks(warpStreaks)

    // Dispose all Three.js geometries and materials
    scene.traverse(disposeMesh)

    renderer.dispose()
    if (renderer.domElement.parentElement) {
      renderer.domElement.parentElement.removeChild(renderer.domElement)
    }
  }

  function setFireRateBonus(multiplier: number) {
    tickState.fireRateBonus = multiplier
  }

  function setMiningTool(tool: MiningTool) {
    tickState.activeMiningTool = tool
    toolToggleButton?.setTool(tool)
  }

  function setCollectorTier(tier: number) {
    tickState.collectorTier = Math.max(1, Math.min(5, Math.round(tier)))
  }

  /** Reset ship to just north of station with full HP, swap to normal ship, clear prologue. */
  function resetShipToStation() {
    // Move ship to just north of the station (outside station range)
    ship.x = GAS_STATION_X
    ship.y = GAS_STATION_Y + STATION_ENTER_DISTANCE - 10
    ship.velocityX = 0
    ship.velocityY = 0

    // Restore full HP
    tickState.playerHp = PLAYER_MAX_HP
    onPlayerDamage?.(tickState.playerHp)

    // Reset to tier-1 ship and clear prologue state
    tickState.blasterTier = 1
    tickState.collectorTier = 1
    tickState.fireRateBonus = 1.0
    tickState.activeMiningTool = 'blaster'
    toolToggleButton?.setTool('blaster')
    onToolChange?.('blaster')
    tickState.prologueShipFrozen = false
    tickState.prologueAutoAim = null
    tickState.prologueAutoCollect = false
    tickState.prologueAutoPilotForward = false
    tickState.aimActive = false
    tickState.mouseHoldingFire = false
    tickState.fireTarget = null
    tickState.prologueArbiterSpawned = false
    tickState.prologueArbiterDistance = 0
    tickState.prologueFieldSpawned = false
    tickState.prologueEnemiesSpawned = false
    tickState.prologueStripPhase = 0
    tickState.prologueStripTimer = 0
    tickState.ambushSpawned = false
    tickState.playerKilledFired = false
    tickState.nearStationFired = false
    tickState.wasInStationRange = false
    tickState.repairedThisVisit = false
    tickState.enemySpawned = false
    tickState.enemyNearbyFired = false
    tickState.firstMetalCollectedTime = null

    // Reset endless-mode state — resetShipToStation marks the start of the run.
    tickState.ledger = 0
    tickState.patrolTimer = FIRST_PATROL_DELAY
    tickState.asteroidRespawnTimer = ASTEROID_REPLENISH_INTERVAL
    tickState.asteroidSpawnCounter = 1
    tickState.arbiter = null
    tickState.arbiterMark = 0
    prevLedgerInt = -1
    prevArbiterKey = ''
    onLedgerChanged?.(0)
    onArbiterChanged?.(null)

    // Swap ship model to normal variant
    scene.remove(shipModel)
    shipModel.traverse(disposeMesh)
    shipModel = createShipModel('normal')
    scene.add(shipModel)

    // Remove Arbiter
    if (arbiterModel) {
      scene.remove(arbiterModel)
      arbiterModel.traverse(disposeMesh)
      arbiterModel = null
    }

    // Remove ambush enemies
    for (const ae of tickState.ambushEnemies) {
      scene.remove(ae.mesh)
      disposeEnemyShip(ae)
    }
    tickState.ambushEnemies.length = 0

    // Remove all enemy projectiles
    for (let i = tickState.enemyProjectiles.length - 1; i >= 0; i--) {
      scene.remove(tickState.enemyProjectiles[i].mesh)
      disposeEnemyProjectile(tickState.enemyProjectiles[i])
    }
    tickState.enemyProjectiles.length = 0

    // Clear all explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
      scene.remove(explosions[i].group)
      disposeExplosion(explosions[i])
    }
    explosions.length = 0

    // Clear shipwreck debris
    for (let i = shipwreckDebrisList.length - 1; i >= 0; i--) {
      scene.remove(shipwreckDebrisList[i].group)
      disposeShipwreckDebris(shipwreckDebrisList[i])
    }
    shipwreckDebrisList.length = 0

    // --- Spawn asteroid field around the station ---
    // Remove old asteroid models from scene
    for (const [, entry] of asteroidModels) {
      scene.remove(entry.model)
      entry.model.traverse(disposeMesh)
    }
    asteroidModels.clear()
    tickState.asteroidHitCounts.clear()

    // Clear old asteroid data and generate new field
    asteroids.length = 0
    const newAsteroids = spawnAsteroidField(GAS_STATION_X, GAS_STATION_Y)
    for (const a of newAsteroids) {
      asteroids.push(a)

      // Create a visually unique model for each asteroid
      const model = createAsteroidModel(a.type, a.size, hashString(a.id))
      model.position.set(a.x, a.y, 0)
      scene.add(model)

      const hm = attachAsteroidHealthMeter(model, a.size)
      asteroidModels.set(a.id, { model, healthMeter: hm })
      tickState.asteroidHitCounts.set(a.id, 0)
    }

    // Sync ship model to new position immediately so it's not visible at the old spot
    shipModel.position.set(ship.x, ship.y, 0)
    rechargeMeter.position.set(ship.x, ship.y, 0)

    // Snap camera to station immediately
    camera.position.x = ship.x
    camera.position.y = ship.y
  }

  /**
   * Soft-fail respawn after the hull is lost: tow the ship home, restore full
   * hull, wipe every hostile and the Ledger, and lay down a fresh asteroid
   * field — but keep the player's upgrades. The summary screen handles the
   * cargo wipe and high-score on the React side.
   */
  function respawnAfterDeath() {
    ship.x = GAS_STATION_X
    ship.y = GAS_STATION_Y + STATION_ENTER_DISTANCE - 10
    ship.velocityX = 0
    ship.velocityY = 0
    tickState.playerHp = PLAYER_MAX_HP
    onPlayerDamage?.(tickState.playerHp)

    // Drop the Arbiter
    tickState.arbiter = null
    tickState.arbiterMark = 0

    // Remove all enemies
    for (const ae of tickState.ambushEnemies) {
      scene.remove(ae.mesh)
      disposeEnemyShip(ae)
    }
    tickState.ambushEnemies.length = 0
    if (tickState.enemy) {
      scene.remove(tickState.enemy.mesh)
      disposeEnemyShip(tickState.enemy)
      tickState.enemy = null
    }

    // Remove enemy projectiles
    for (const ep of tickState.enemyProjectiles) {
      scene.remove(ep.mesh)
      disposeEnemyProjectile(ep)
    }
    tickState.enemyProjectiles.length = 0

    // Remove player projectiles
    for (const [, model] of projectileModels) {
      scene.remove(model)
      model.traverse(disposeMesh)
    }
    projectileModels.clear()
    tickState.projectiles = []
    tickState.projectileElapsed.clear()

    // Remove metal chunks & scrap boxes
    for (const m of tickState.metalChunks) {
      scene.remove(m.mesh)
      disposeMetalChunk(m)
    }
    tickState.metalChunks.length = 0
    for (const sb of tickState.scrapBoxes) {
      scene.remove(sb.mesh)
      disposeScrapBox(sb)
    }
    tickState.scrapBoxes.length = 0

    // Clear explosions & shipwreck debris
    for (const e of explosions) {
      scene.remove(e.group)
      disposeExplosion(e)
    }
    explosions.length = 0
    for (const wd of shipwreckDebrisList) {
      scene.remove(wd.group)
      disposeShipwreckDebris(wd)
    }
    shipwreckDebrisList.length = 0

    // Respawn a fresh asteroid field around the station
    for (const [, entry] of asteroidModels) {
      scene.remove(entry.model)
      entry.model.traverse(disposeMesh)
    }
    asteroidModels.clear()
    tickState.asteroidHitCounts.clear()
    asteroids.length = 0
    for (const a of spawnAsteroidField(GAS_STATION_X, GAS_STATION_Y)) {
      asteroids.push(a)
      const model = createAsteroidModel(a.type, a.size, hashString(a.id))
      model.position.set(a.x, a.y, 0)
      scene.add(model)
      const hm = attachAsteroidHealthMeter(model, a.size)
      asteroidModels.set(a.id, { model, healthMeter: hm })
      tickState.asteroidHitCounts.set(a.id, 0)
    }

    // Reset endless state for a fresh run
    tickState.ledger = 0
    tickState.patrolTimer = FIRST_PATROL_DELAY
    tickState.asteroidRespawnTimer = ASTEROID_REPLENISH_INTERVAL
    tickState.asteroidSpawnCounter = 1
    tickState.peakLedger = 0
    tickState.marksDefeated = 0
    tickState.runTime = 0
    tickState.endlessDeathFired = false
    tickState.nearStationFired = false
    tickState.wasInStationRange = false
    tickState.repairedThisVisit = false
    prevLedgerInt = -1
    prevArbiterKey = ''
    prevTractorActive = false
    onLedgerChanged?.(0)
    onArbiterChanged?.(null)

    // Sync visuals & snap the camera home
    shipModel.position.set(ship.x, ship.y, 0)
    rechargeMeter.position.set(ship.x, ship.y, 0)
    camera.position.x = ship.x
    camera.position.y = ship.y
  }

  /** Simple string hash for deterministic asteroid shape seeds. */
  function hashString(str: string): number {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33 + str.charCodeAt(i)) % 2147483647
    }
    return hash
  }

  return {
    dispose,
    setFireRateBonus,
    resetShipToStation,
    setMiningTool,
    setCollectorTier,
    respawnAfterDeath,
  }
}
