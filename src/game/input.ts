/**
 * Keyboard input state tracker.
 * Tracks which movement keys are currently held down.
 */
export interface InputState {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  boost: boolean
  /** Precise joystick angle in radians (Three.js rotation.z convention), or null when joystick is inactive. */
  joystickAngle: number | null
}

/**
 * Aim state tracks where the player is pointing (mouse cursor).
 * Stored in screen-space; converted to world-space by the scene.
 */
export interface AimState {
  /** Whether an aim target is currently active */
  active: boolean
  /** Screen-space X of the aim target (pixels from left of canvas) */
  screenX: number
  /** Screen-space Y of the aim target (pixels from top of canvas) */
  screenY: number
}

export function createInputState(): InputState {
  return { up: false, down: false, left: false, right: false, boost: false, joystickAngle: null }
}

export function createAimState(): AimState {
  return { active: false, screenX: 0, screenY: 0 }
}

/**
 * Returns true when the event target is a focused text input, textarea, or
 * contenteditable element — i.e. somewhere the player is typing. Used to
 * gate window-level game keydown handlers so the run-summary initials box
 * (and any future text input) gets its keystrokes instead of having them
 * preventDefault'd or routed to ship movement / tool toggles.
 *
 * Intentionally NOT used for keyup — we want held state (movement / collect)
 * to release cleanly even if focus changes mid-press, so the ship doesn't
 * get stuck thrusting when the player Alt-Tabs into an input field.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export type InputDirection = 'up' | 'down' | 'left' | 'right'

export const KEY_MAP: Record<string, InputDirection> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
}

export function createInputHandler(state: InputState): {
  attach: () => void
  detach: () => void
} {
  function onKeyDown(e: KeyboardEvent): void {
    // Let typing in inputs go through untouched — without this the run-
    // summary initials box loses W/A/S/D entirely (preventDefault blocks
    // them) and Shift gets swallowed silently.
    if (isEditableTarget(e.target)) return
    const dir = KEY_MAP[e.code]
    if (dir) {
      state[dir] = true
      e.preventDefault()
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      state.boost = true
      e.preventDefault()
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    const dir = KEY_MAP[e.code]
    if (dir) {
      state[dir] = false
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      state.boost = false
    }
  }

  return {
    attach() {
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      // Reset on detach
      state.up = false
      state.down = false
      state.left = false
      state.right = false
      state.boost = false
    },
  }
}

/**
 * Creates a mouse aim handler that tracks cursor position over the canvas.
 * Mouse-only — mobile aiming is handled separately via tap-to-fire to
 * avoid conflicts with the virtual joystick touch events.
 */
export function createAimHandler(
  aimState: AimState,
  canvas: HTMLElement,
): {
  attach: () => void
  detach: () => void
} {
  function onMouseMove(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect()
    aimState.active = true
    aimState.screenX = e.clientX - rect.left
    aimState.screenY = e.clientY - rect.top
  }

  function onMouseLeave(): void {
    aimState.active = false
  }

  return {
    attach() {
      canvas.addEventListener('mousemove', onMouseMove)
      canvas.addEventListener('mouseleave', onMouseLeave)
    },
    detach() {
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      aimState.active = false
    },
  }
}

/**
 * Convert input state to a normalized direction vector.
 * Returns [dx, dy] where each is in range [-1, 1].
 */
export function inputToDirection(input: InputState): [number, number] {
  let dx = 0
  let dy = 0
  if (input.left) dx -= 1
  if (input.right) dx += 1
  if (input.up) dy += 1
  if (input.down) dy -= 1

  // Normalize diagonal movement
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len > 1) {
    dx /= len
    dy /= len
  }

  return [dx, dy]
}
