import type { MiningTool } from './types'

function getButtonSize(): number {
  const vw = Math.min(window.innerWidth, window.innerHeight)
  return Math.max(56, Math.min(80, Math.round(vw * 0.12)))
}

const BORDER_WIDTH = 3

interface ButtonStyle {
  r: number
  g: number
  b: number
}

const STYLE_FIRE: ButtonStyle = { r: 255, g: 170, b: 0 }
const STYLE_LAZER: ButtonStyle = { r: 0, g: 204, b: 255 }
const STYLE_RIPPLE: ButtonStyle = { r: 119, g: 255, b: 204 }

function rgba(s: ButtonStyle, a: number): string {
  return `rgba(${s.r},${s.g},${s.b},${a})`
}

/** Bottom offset for the corner tool button — clear of the twin-stick zones. */
function getToolBottom(): string {
  return window.innerHeight < 600 ? '20%' : '24%'
}

export interface ToolToggleButton {
  attach: () => void
  detach: () => void
  setTool: (tool: MiningTool) => void
}

/**
 * Creates the mining-tool toggle button in the bottom-right corner. Tapping
 * switches between blaster and lazer.
 *
 * It stops touch-event propagation so a tap here never also anchors the
 * right-side aim joystick (which listens on the container for the whole
 * right half of the screen).
 */
export function createToolToggleButton(
  container: HTMLElement,
  onToggle: () => void,
): ToolToggleButton {
  const size = getButtonSize()
  const rightMargin = Math.max(16, Math.round(size * 0.4))
  const button = document.createElement('div')
  button.setAttribute('aria-label', 'Switch mining tool')
  button.setAttribute('role', 'button')
  button.style.cssText =
    `position:absolute;bottom:${getToolBottom()};right:${rightMargin}px;` +
    `width:${size}px;height:${size}px;border-radius:50%;` +
    `border:${BORDER_WIDTH}px solid ${rgba(STYLE_FIRE, 0.6)};` +
    `background:${rgba(STYLE_FIRE, 0.15)};z-index:10;touch-action:none;` +
    `display:flex;align-items:center;justify-content:center;`

  const label = document.createElement('div')
  label.style.cssText =
    `color:${rgba(STYLE_FIRE, 0.9)};font-family:var(--font-rubik), ui-sans-serif, sans-serif;font-weight:bold;` +
    `font-size:${Math.round(size * 0.22)}px;pointer-events:none;text-align:center;` +
    `line-height:1.1;`
  label.textContent = 'BLS'
  button.appendChild(label)
  container.appendChild(button)

  function updateStyle(tool: MiningTool): void {
    const style = tool === 'lazer' ? STYLE_LAZER : tool === 'ripple' ? STYLE_RIPPLE : STYLE_FIRE
    button.style.borderColor = rgba(style, 0.6)
    button.style.background = rgba(style, 0.15)
    label.style.color = rgba(style, 0.9)
    label.textContent = tool === 'lazer' ? 'LZR' : tool === 'ripple' ? 'RPL' : 'BLS'
  }

  function onTouchStart(e: TouchEvent): void {
    // Stop the touch reaching the container so the aim joystick does not
    // also anchor on this tap.
    e.preventDefault()
    e.stopPropagation()
    onToggle()
  }

  return {
    attach() {
      button.addEventListener('touchstart', onTouchStart, { passive: false })
    },
    detach() {
      button.removeEventListener('touchstart', onTouchStart)
      if (button.parentElement) button.parentElement.removeChild(button)
    },
    setTool(tool: MiningTool) {
      updateStyle(tool)
    },
  }
}
