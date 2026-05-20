'use client'

import { useEffect, useState } from 'react'

/** Stick magnitude past which we treat the controller as "in use". */
const STICK_DEADZONE = 0.5

/**
 * Tracks whether a gamepad is the player's *active* input device.
 *
 * Returns `true` once any gamepad button or stick is used, and flips back to
 * `false` as soon as the player touches the keyboard, mouse, or screen. This
 * lets the UI show controller-specific prompts only when a controller is
 * genuinely in use — not merely connected.
 */
export function useGamepadActive(): boolean {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return

    let raf = 0
    const poll = (): void => {
      raf = requestAnimationFrame(poll)
      for (const pad of navigator.getGamepads()) {
        if (!pad || !pad.connected) continue
        const buttonDown = pad.buttons.some((b) => b.pressed)
        const stickMoved = pad.axes.some((a) => Math.abs(a) > STICK_DEADZONE)
        if (buttonDown || stickMoved) {
          // setState bails out when the value is unchanged, so calling this
          // every frame while the pad is held does not cause re-renders.
          setActive(true)
          return
        }
      }
    }
    raf = requestAnimationFrame(poll)

    // Any keyboard / mouse / touch input means the player switched away.
    const toOtherInput = (): void => setActive(false)
    window.addEventListener('keydown', toOtherInput)
    window.addEventListener('mousedown', toOtherInput)
    window.addEventListener('touchstart', toOtherInput)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', toOtherInput)
      window.removeEventListener('mousedown', toOtherInput)
      window.removeEventListener('touchstart', toOtherInput)
    }
  }, [])

  return active
}
