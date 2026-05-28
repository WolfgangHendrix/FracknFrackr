'use client'

import { useEffect, useState } from 'react'

type InputMode = 'keyboard' | 'gamepad' | 'touch'

/**
 * Detect the current input mode. Touch wins outright on touch-capable
 * devices. Otherwise we poll for a connected gamepad; if one shows up we
 * switch to that view. Falls back to keyboard+mouse.
 */
function useInputMode(): InputMode {
  const [mode, setMode] = useState<InputMode>(() => {
    if (typeof window === 'undefined') return 'keyboard'
    if ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0) return 'touch'
    return 'keyboard'
  })

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return
    let raf = 0
    const check = (): void => {
      const pads = Array.from(navigator.getGamepads())
      const padConnected = pads.some((p) => p && p.connected)
      setMode((prev) => {
        if (padConnected && prev !== 'touch') return 'gamepad'
        if (!padConnected && prev === 'gamepad') return 'keyboard'
        return prev
      })
      raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
    return () => cancelAnimationFrame(raf)
  }, [])

  return mode
}

interface ControlRow {
  binding: string
  action: string
}

const KEYBOARD_ROWS: ControlRow[] = [
  { binding: 'W / A / S / D', action: 'Move' },
  { binding: 'Mouse', action: 'Aim' },
  { binding: 'Left Click', action: 'Fire' },
  { binding: 'Right Click / E / Space', action: 'Collect' },
  { binding: 'Q', action: 'Toggle mining tool' },
  { binding: '1 / 2 / 3', action: 'Select Blaster / Lazer / Ripple' },
  { binding: 'ESC', action: 'Pause' },
]

const GAMEPAD_ROWS: ControlRow[] = [
  { binding: 'Left Stick', action: 'Move' },
  { binding: 'Right Stick', action: 'Aim & Fire' },
  { binding: 'Right Trigger (RT)', action: 'Fire-lock toggle' },
  { binding: 'A', action: 'Confirm / collect' },
  { binding: 'B', action: 'Back / cancel' },
  { binding: 'Y', action: 'Toggle mining tool' },
  { binding: 'D-Pad / Left Stick', action: 'Menu navigation' },
  { binding: 'Start', action: 'Pause' },
]

const TOUCH_ROWS: ControlRow[] = [
  { binding: 'Left joystick', action: 'Move ship' },
  { binding: 'Right joystick', action: 'Aim & fire' },
  { binding: 'Tool button (bottom-right)', action: 'Toggle mining tool' },
  { binding: 'Shop button', action: 'Open trade station' },
  { binding: 'Pause icon (HUD)', action: 'Pause' },
]

const MODE_LABEL: Record<InputMode, string> = {
  keyboard: 'KEYBOARD + MOUSE',
  gamepad: 'GAMEPAD',
  touch: 'TOUCH',
}

const MODE_ORDER: InputMode[] = ['keyboard', 'gamepad', 'touch']

function rowsFor(mode: InputMode): ControlRow[] {
  if (mode === 'gamepad') return GAMEPAD_ROWS
  if (mode === 'touch') return TOUCH_ROWS
  return KEYBOARD_ROWS
}

interface PauseOverlayProps {
  visible: boolean
  onResume: () => void
}

export function PauseOverlay({ visible, onResume }: PauseOverlayProps) {
  const detected = useInputMode()
  const [override, setOverride] = useState<InputMode | null>(null)
  const mode = override ?? detected

  if (!visible) return null

  const cycle = (): void => {
    const idx = MODE_ORDER.indexOf(mode)
    setOverride(MODE_ORDER[(idx + 1) % MODE_ORDER.length])
  }

  return (
    <div className="absolute inset-0 z-[40] bg-black/75 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-space-800/95 border-2 border-hud-blue/40 rounded-xl p-5 font-sans shadow-2xl">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-xl sm:text-2xl tracking-widest text-white/90">PAUSED</p>
          <p className="text-xs text-white/40">ESC to resume</p>
        </div>

        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-white/50 tracking-wider">CONTROLS</p>
          <button
            type="button"
            data-menu-item
            onClick={cycle}
            className="text-xs text-hud-blue/80 hover:text-hud-blue px-2 py-1 border border-hud-blue/30 rounded focus:outline-none focus:ring-2 focus:ring-hud-blue"
            aria-label="Switch control scheme"
          >
            {MODE_LABEL[mode]} ▸
          </button>
        </div>

        <ul className="space-y-1.5 text-sm">
          {rowsFor(mode).map((row) => (
            <li
              key={row.binding}
              className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-1"
            >
              <span className="text-hud-blue/90 shrink-0">{row.binding}</span>
              <span className="text-white/70 text-right">{row.action}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex justify-center">
          <button
            type="button"
            data-menu-item
            onClick={onResume}
            className="px-6 py-2 bg-hud-green/20 border border-hud-green/60 text-hud-green text-sm font-bold tracking-wider rounded hover:bg-hud-green/30 focus:outline-none focus:ring-2 focus:ring-hud-green"
          >
            RESUME
          </button>
        </div>
      </div>
    </div>
  )
}
