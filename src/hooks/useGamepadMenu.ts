'use client'

import { useEffect, useRef } from 'react'
import {
  playMenuMove,
  playMenuSelectDown,
  playMenuSelectUp,
  playSellChime,
  playBuyRegister,
  primeAudio,
} from '@/game/sfx'

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

function isInertMenuItem(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true'
}

function isVisibleMenuItem(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const style = window.getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
}

function pointHitsElement(el: HTMLElement, x: number, y: number): boolean {
  const top = document.elementFromPoint(x, y)
  if (!top) return false
  if (el.contains(top)) return true
  return top.closest('[data-menu-item]') === el
}

function isTopmostMenuItem(el: HTMLElement): boolean {
  if (!isVisibleMenuItem(el)) return false
  const rect = el.getBoundingClientRect()
  const x = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2))
  const y = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2))
  if (pointHitsElement(el, x, y)) return true

  // Some buttons have decorative focus rings or text layouts that put the
  // geometric center on a child/empty zone. Sampling inset corners keeps the
  // filter robust while still rejecting controls covered by a modal backdrop.
  const insetX = Math.min(rect.width * 0.25, 12)
  const insetY = Math.min(rect.height * 0.25, 12)
  return (
    pointHitsElement(el, rect.left + insetX, rect.top + insetY) ||
    pointHitsElement(el, rect.right - insetX, rect.top + insetY) ||
    pointHitsElement(el, rect.left + insetX, rect.bottom - insetY) ||
    pointHitsElement(el, rect.right - insetX, rect.bottom - insetY)
  )
}

function focusableItems(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-menu-item]:not([disabled])'),
  ).filter(isTopmostMenuItem)
}

function moveFocus(delta: number): void {
  const items = focusableItems()
  if (items.length === 0) return
  const current = document.activeElement
  const idx = current instanceof HTMLElement ? items.indexOf(current) : -1
  const base = idx === -1 ? (delta > 0 ? -1 : 0) : idx
  const next = (base + delta + items.length) % items.length
  // The focusin listener below plays the move blip — calling .focus() here
  // triggers it, so we don't need a direct playMenuMove() call.
  items[next].focus()
}

function focusFirst(): void {
  const items = focusableItems()
  if (items.length === 0) return
  const preferred = items
    .slice()
    .reverse()
    .find((item) => item.hasAttribute('data-menu-default') && !isInertMenuItem(item))
  ;(preferred ?? items[0]).focus()
}

/** True when the focused element is a range-input slider — used to remap
 *  left/right from focus-walk to value-nudge. */
function focusedRange(): HTMLInputElement | null {
  const el = document.activeElement
  if (el instanceof HTMLInputElement && el.type === 'range') return el
  return null
}

/** Nudge a focused range input by ±step and notify React. */
function nudgeRange(input: HTMLInputElement, direction: 1 | -1): void {
  const step = Number(input.step) || 1
  const min = Number(input.min) || 0
  const max = Number(input.max) || 100
  const current = Number(input.value)
  const next = Math.max(min, Math.min(max, current + direction * step))
  if (next === current) return
  // React's onChange listens for the native 'input' event under the hood
  // — setting .value alone won't trigger it. Use the prototype setter to
  // bypass React's value-tracker, then dispatch a bubbling input event.
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, String(next))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

export function useGamepadMenu({ enabled, resetKey }: UseGamepadMenuOptions): void {
  const suppressUntilRelease = useRef(false)

  // Reset DOM focus when the visible menu changes.
  useEffect(() => {
    if (!enabled) return
    suppressUntilRelease.current = true
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
    const onPointerDown = (e: Event): void => {
      // pointerdown is a real user-activation gesture, so it's a valid spot
      // to resume the audio context if nothing has done so yet. Idempotent.
      primeAudio()
      if (!(e.target instanceof Element)) return
      const item = e.target.closest('[data-menu-item]')
      if (!item) return
      const sound = item.getAttribute('data-menu-sound')
      // Themed sounds (sell/buy) play in one shot on click; only the default
      // two-note blip is split across press and release.
      if (sound === 'sell' || sound === 'buy') return
      playMenuSelectDown()
    }
    const onClick = (e: MouseEvent): void => {
      if (!(e.target instanceof Element)) return
      const item = e.target.closest('[data-menu-item]')
      if (!item) return
      const sound = item.getAttribute('data-menu-sound')
      if (sound === 'sell') playSellChime()
      else if (sound === 'buy') playBuyRegister()
      else playMenuSelectUp()
    }
    // Hover/focus blip — mirrors the gamepad-scroll cue so mouse and keyboard
     // users get the same audible "this is selectable" feedback. Tracks the
     // last-blipped element so re-entering doesn't repeat the sound.
    let lastHover: Element | null = null
    const onPointerOver = (e: Event): void => {
      if (!(e.target instanceof Element)) return
      const item = e.target.closest('[data-menu-item]')
      if (!item || item === lastHover) return
      if (item instanceof HTMLButtonElement && item.disabled) return
      lastHover = item
      playMenuMove()
    }
    const onPointerOut = (e: Event): void => {
      if (!(e.target instanceof Element)) return
      const item = e.target.closest('[data-menu-item]')
      if (!item || item !== lastHover) return
      // pointerout fires every time the cursor crosses a child boundary
      // inside the same button. Only clear lastHover if the cursor is
      // actually leaving the menu-item element — otherwise the next
      // pointerover fires a duplicate blip on the same option.
      const pe = e as PointerEvent
      const into = pe.relatedTarget
      if (into instanceof Node && item.contains(into)) return
      lastHover = null
    }
    const onFocusIn = (e: Event): void => {
      if (!(e.target instanceof Element)) return
      const item = e.target.closest('[data-menu-item]')
      if (!item || item === lastHover) return
      if (item instanceof HTMLButtonElement && item.disabled) return
      lastHover = item
      playMenuMove()
    }
    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('pointerout', onPointerOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('click', onClick)
    }
  }, [enabled])

  const prev = useRef({
    a: false,
    b: false,
    up: false,
    down: false,
    left: false,
    right: false,
  })
  // Hold-repeat timing for slider nudges. After an initial delay (~400ms at
  // 60fps) the value re-nudges every `RANGE_REPEAT_INTERVAL` frames (~80ms),
  // so a held d-pad sweeps the slider smoothly instead of tapping once.
  const rangeHold = useRef({ frames: 0, direction: 0 as -1 | 0 | 1 })
  const RANGE_REPEAT_DELAY = 24
  const RANGE_REPEAT_INTERVAL = 5

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
      const nextPrev = {
        a: aDown,
        b: bDown,
        up: upDown,
        down: downDown,
        left: leftDown,
        right: rightDown,
      }

      if (suppressUntilRelease.current) {
        prev.current = nextPrev
        if (!aDown && !bDown && !upDown && !downDown && !leftDown && !rightDown) {
          suppressUntilRelease.current = false
        }
        return
      }

      if (upDown && !prev.current.up) moveFocus(-1)
      if (downDown && !prev.current.down) moveFocus(+1)

      // Left/right: on a slider, nudge value; otherwise walk focus. Holding
      // a direction on a slider repeats the nudge after a short delay so the
      // player can sweep across the range without spamming d-pad presses.
      const range = focusedRange()
      if (range) {
        const direction: -1 | 0 | 1 = leftDown ? -1 : rightDown ? 1 : 0
        if (direction !== 0 && direction !== rangeHold.current.direction) {
          // Fresh press (or swapped direction) — nudge once and reset timer.
          nudgeRange(range, direction)
          rangeHold.current.direction = direction
          rangeHold.current.frames = 0
        } else if (direction !== 0) {
          rangeHold.current.frames += 1
          const f = rangeHold.current.frames
          if (f >= RANGE_REPEAT_DELAY && (f - RANGE_REPEAT_DELAY) % RANGE_REPEAT_INTERVAL === 0) {
            nudgeRange(range, direction)
          }
        } else {
          rangeHold.current.direction = 0
          rangeHold.current.frames = 0
        }
      } else {
        rangeHold.current.direction = 0
        rangeHold.current.frames = 0
        if (leftDown && !prev.current.left) moveFocus(-1)
        if (rightDown && !prev.current.right) moveFocus(+1)
      }

      // Press: low note. Release: click (which fires the high note via the
      // click listener). Themed sounds (sell/buy) skip the press blip so
      // their one-shot chime isn't muddied. Both phases respect
      // aria-disabled in addition to the native `disabled` attribute —
      // locked menu rows (can't afford, prereq missing, already maxed)
      // use aria-disabled so they stay in the focus walk (so the player
      // can scroll through and inspect them) but the A press is a no-op,
      // matching how clicking a native-disabled button does nothing.
      if (aDown && !prev.current.a) {
        const el = document.activeElement
        if (
          el instanceof HTMLElement &&
          el.matches('[data-menu-item]') &&
          !isInertMenuItem(el) &&
          isTopmostMenuItem(el)
        ) {
          const sound = el.getAttribute('data-menu-sound')
          if (sound !== 'sell' && sound !== 'buy') playMenuSelectDown()
        }
      }
      if (!aDown && prev.current.a) {
        const el = document.activeElement
        if (
          el instanceof HTMLElement &&
          el.matches('[data-menu-item]') &&
          !isInertMenuItem(el) &&
          isTopmostMenuItem(el)
        ) {
          ;(el as HTMLButtonElement).click()
        }
      }

      if (bDown && !prev.current.b) {
        const back = focusableItems()
          .filter((item): item is HTMLButtonElement => item instanceof HTMLButtonElement)
          .filter((item) => item.hasAttribute('data-menu-back'))
          .at(-1)
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
