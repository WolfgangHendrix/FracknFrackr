import type { InputState, AimState } from './input'

const STICK_DEADZONE = 0.2
const STICK_AXIS_THRESHOLD = 0.3
const TRIGGER_THRESHOLD = 0.5
/** Aim point offset from canvas center, as a fraction of min(width, height). */
const AIM_SCREEN_RADIUS_FACTOR = 0.4

// Standard Gamepad layout (Xbox 360 / XInput)
const AXIS_LEFT_X = 0
const AXIS_LEFT_Y = 1
const AXIS_RIGHT_X = 2
const AXIS_RIGHT_Y = 3
const BUTTON_Y = 3
const BUTTON_LT = 6
const BUTTON_RT = 7

export interface GamepadSnapshot {
  leftX: number
  leftY: number
  rightX: number
  rightY: number
  yPressed: boolean
  ltPressed: boolean
  rtPressed: boolean
}

export interface GamepadHandlerState {
  /** RT toggle: true while fire-lock is engaged. */
  fireLocked: boolean
  /** Previous-frame RT pressed state for edge detection. */
  prevRt: boolean
  prevY: boolean
  /** Last non-deadzone aim direction (gamepad space, +X right / +Y down). */
  lockedAimX: number
  lockedAimY: number
  /** Whether the gamepad drove movement last frame (used to clean up cardinal flags on release). */
  droveMovement: boolean
  /** Whether the gamepad drove aim last frame (used to clean up aimState.active on release). */
  droveAim: boolean
}

export function createGamepadHandlerState(): GamepadHandlerState {
  return {
    fireLocked: false,
    prevRt: false,
    lockedAimX: 0,
    lockedAimY: 0,
    droveMovement: false,
    droveAim: false,
    prevY: false,
  }
}

/**
 * Pull a snapshot for the first connected gamepad, or null if none are connected.
 */
export function readGamepadSnapshot(getPads: () => (Gamepad | null)[]): GamepadSnapshot | null {
  const pads = getPads()
  for (const pad of pads) {
    if (pad && pad.connected) {
      return {
        leftX: pad.axes[AXIS_LEFT_X] ?? 0,
        leftY: pad.axes[AXIS_LEFT_Y] ?? 0,
        rightX: pad.axes[AXIS_RIGHT_X] ?? 0,
        rightY: pad.axes[AXIS_RIGHT_Y] ?? 0,
        yPressed: pad.buttons[BUTTON_Y]?.pressed ?? false,
        ltPressed: (pad.buttons[BUTTON_LT]?.value ?? 0) > TRIGGER_THRESHOLD,
        rtPressed: (pad.buttons[BUTTON_RT]?.value ?? 0) > TRIGGER_THRESHOLD,
      }
    }
  }
  return null
}

/**
 * Apply one frame of gamepad input to the shared InputState and AimState.
 *
 * Behavior:
 * - Left stick drives movement (mirrors virtual joystick: cardinal flags + joystickAngle).
 * - Right stick drives aim and fires while past deadzone.
 * - RT press (edge-detected) toggles fire-lock. While locked, fire continues at the
 *   last aim direction; moving the right stick updates that locked direction.
 * - When the gamepad releases a control it only clears the bits it owned (so keyboard
 *   and mouse inputs are not stomped on).
 *
 * Returns whether the player should fire this frame and the aim screen point used.
 */
export function applyGamepadFrame(
  snapshot: GamepadSnapshot | null,
  state: GamepadHandlerState,
  inputState: InputState,
  aimState: AimState,
  canvasWidth: number,
  canvasHeight: number,
): { firing: boolean; toolToggle: boolean } {
  let toolToggle = false
  if (snapshot?.yPressed && !state.prevY) toolToggle = true
  state.prevY = snapshot?.yPressed ?? false

  // RT edge → toggle fire-lock
  if (snapshot) {
    if (snapshot.rtPressed && !state.prevRt) {
      state.fireLocked = !state.fireLocked
    }
    state.prevRt = snapshot.rtPressed
  } else {
    state.prevRt = false
    state.fireLocked = false
  }
  inputState.boost = !!snapshot && (snapshot.ltPressed || snapshot.rtPressed)

  // --- Movement (left stick) ---
  const lx = snapshot?.leftX ?? 0
  const ly = snapshot?.leftY ?? 0
  const lmag = Math.sqrt(lx * lx + ly * ly)
  if (snapshot && lmag > STICK_DEADZONE) {
    inputState.left = lx < -STICK_AXIS_THRESHOLD
    inputState.right = lx > STICK_AXIS_THRESHOLD
    inputState.up = ly < -STICK_AXIS_THRESHOLD
    inputState.down = ly > STICK_AXIS_THRESHOLD
    // Match virtual-joystick.ts convention: atan2(-x, -y) on a +Y-down coord system
    // gives a Three.js rotation.z that points "out" along the stick direction.
    inputState.joystickAngle = Math.atan2(-lx, -ly)
    state.droveMovement = true
  } else if (state.droveMovement) {
    inputState.left = false
    inputState.right = false
    inputState.up = false
    inputState.down = false
    inputState.joystickAngle = null
    state.droveMovement = false
  }

  // --- Aim (right stick) + fire ---
  const rx = snapshot?.rightX ?? 0
  const ry = snapshot?.rightY ?? 0
  const rmag = Math.sqrt(rx * rx + ry * ry)
  let aimDirX = 0
  let aimDirY = 0
  let stickAiming = false
  if (snapshot && rmag > STICK_DEADZONE) {
    stickAiming = true
    aimDirX = rx / rmag
    aimDirY = ry / rmag
    state.lockedAimX = aimDirX
    state.lockedAimY = aimDirY
  }

  let firing = false
  if (stickAiming) {
    firing = true
  } else if (state.fireLocked && (state.lockedAimX !== 0 || state.lockedAimY !== 0)) {
    aimDirX = state.lockedAimX
    aimDirY = state.lockedAimY
    firing = true
  }

  if (firing) {
    const cx = canvasWidth / 2
    const cy = canvasHeight / 2
    const radius = Math.min(canvasWidth, canvasHeight) * AIM_SCREEN_RADIUS_FACTOR
    aimState.screenX = cx + aimDirX * radius
    aimState.screenY = cy + aimDirY * radius
    aimState.active = true
    state.droveAim = true
  } else if (state.droveAim) {
    aimState.active = false
    state.droveAim = false
  }

  return { firing, toolToggle }
}

export interface GamepadHandler {
  attach: () => void
  detach: () => void
  /** Poll the connected gamepad and write to inputState/aimState. Returns whether to fire this frame. */
  poll: () => { firing: boolean; toolToggle: boolean }
  isFireLocked: () => boolean
}

/**
 * Create a gamepad handler that, on each `poll()`, reads the first connected
 * gamepad and mutates the shared InputState / AimState in place. Designed to
 * coexist with mouse and virtual-joystick: gamepad only clears the bits it
 * actively wrote, so other input sources are not disturbed.
 */
export function createGamepadHandler(
  inputState: InputState,
  aimState: AimState,
  canvas: HTMLElement,
): GamepadHandler {
  const state = createGamepadHandlerState()

  return {
    attach() {
      // No event listeners — polling each frame via navigator.getGamepads().
    },
    detach() {
      state.fireLocked = false
      state.droveMovement = false
      state.droveAim = false
      inputState.boost = false
    },
    poll() {
      const getPads = (): (Gamepad | null)[] => {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) return []
        return Array.from(navigator.getGamepads())
      }
      const snap = readGamepadSnapshot(getPads)
      return applyGamepadFrame(
        snap,
        state,
        inputState,
        aimState,
        canvas.clientWidth,
        canvas.clientHeight,
      )
    },
    isFireLocked() {
      return state.fireLocked
    },
  }
}
