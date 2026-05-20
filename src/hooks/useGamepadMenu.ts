'use client'

import { useEffect, useRef } from 'react'
import { playMenuMove, playMenuSelect, playSellChime, playBuyRegister } from '@/game/sfx'

/**
 * Gamepad-driven menu navigation.
 *
 * Polls the first connected gamepad each frame while mounted. Up/down (D-pad
 * or left stick) moves DOM focus between elements with `data-menu-item`,
 * skipping disabled ones. A (button 0) clicks the focused element. B
 * (button 1) clicks the element tagged `data-menu-back`, if any.
 *
 * Focus is reset to the first item whenever `resetKey` changes — pass a key
 * that encodes the visible screen (e.g. mode + confirmation state) so focus
 * lands sensibly after each transition.
 */

const BUTTON_A = 0
const BUTTON_B = 1
const DPAD_UP = 12
const DPAD_DOWN = 13
const DPAD_LEFT = 14
const DPAD_RIGHT = 15
const AXIS_LEFT_X = 0
const AXIS_LEFT_Y = 1
const STICK_THRESHOLD = 0.6

interface UseGamepadMenuOptions {
  enabled: boolean
  resetKey: string
}

function focusableItems(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-menu-item]:not([disabled])'),
  )
}

function moveFocus(delta: number): void {
  const items = focusableItems()
  if (items.length === 0) return
  const current = document.activeElement
  const idx = current instanceof HTMLElement ? items.indexOf(current) : -1
  const base = idx === -1 ? (delta > 0 ? -1 : 0) : idx
  const next = (base + delta + items.length) % items.length
  items[next].focus()
  // Audible cue as the active highlight moves between options.
  playMenuMove()
}

function focusFirst(): void {
  const items = focusableItems()
  if (items.length > 0) items[0].focus()
}

export function useGamepadMenu({ enabled, resetKey }: UseGamepadMenuOptions): void {
  // Reset DOM focus when the visible menu changes.
  useEffect(() => {
    if (!enabled) return
    // Defer one tick so the new DOM has mounted before we query for items.
    const id = window.setTimeout(focusFirst, 0)
    return () => window.clearTimeout(id)
  }, [enabled, resetKey])

  // Play a confirmation sound whenever a menu item is activated — by mouse,
  // keyboard, or the gamepad A button (which dispatches a synthetic click).
  // `data-menu-sound` lets specific buttons opt into a themed sound.
  useEffect(() => {
    if (!enabled) return
    if (typeof document === 'undefined') return
    const onClick = (e: MouseEvent): void => {
      if (!(e.target instanceof Element)) return
      const item = e.target.closest('[data-menu-item]')
      if (!item) return
      const sound = item.getAttribute('data-menu-sound')
      if (sound === 'sell') playSellChime()
      else if (sound === 'buy') playBuyRegister()
      else playMenuSelect()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [enabled])

  const prev = useRef({
    a: false,
    b: false,
    up: false,
    down: false,
    left: false,
    right: false,
  })

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return

    let raf = 0
    const tick = (): void => {
      raf = requestAnimationFrame(tick)
      const pads = Array.from(navigator.getGamepads())
      const pad = pads.find((p) => p && p.connected) ?? null
      if (!pad) {
        prev.current = {
          a: false,
          b: false,
          up: false,
          down: false,
          left: false,
          right: false,
        }
        return
      }

      const aDown = pad.buttons[BUTTON_A]?.pressed ?? false
      const bDown = pad.buttons[BUTTON_B]?.pressed ?? false
      const stickX = pad.axes[AXIS_LEFT_X] ?? 0
      const stickY = pad.axes[AXIS_LEFT_Y] ?? 0
      const upDown = (pad.buttons[DPAD_UP]?.pressed ?? false) || stickY < -STICK_THRESHOLD
      const downDown = (pad.buttons[DPAD_DOWN]?.pressed ?? false) || stickY > STICK_THRESHOLD
      // Left / right walk focus too — for side-by-side options (e.g. YES / NO).
      // Focus order follows DOM order, which matches the visual left-to-right
      // order of horizontal layouts.
      const leftDown = (pad.buttons[DPAD_LEFT]?.pressed ?? false) || stickX < -STICK_THRESHOLD
      const rightDown = (pad.buttons[DPAD_RIGHT]?.pressed ?? false) || stickX > STICK_THRESHOLD

      if (upDown && !prev.current.up) moveFocus(-1)
      if (downDown && !prev.current.down) moveFocus(+1)
      if (leftDown && !prev.current.left) moveFocus(-1)
      if (rightDown && !prev.current.right) moveFocus(+1)

      if (aDown && !prev.current.a) {
        const el = document.activeElement
        if (
          el instanceof HTMLElement &&
          el.matches('[data-menu-item]') &&
          !(el as HTMLButtonElement).disabled
        ) {
          ;(el as HTMLButtonElement).click()
        }
      }

      if (bDown && !prev.current.b) {
        const back = document.querySelector<HTMLButtonElement>('[data-menu-back]:not([disabled])')
        if (back) back.click()
      }

      prev.current = {
        a: aDown,
        b: bDown,
        up: upDown,
        down: downDown,
        left: leftDown,
        right: rightDown,
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled])
}
