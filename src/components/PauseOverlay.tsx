'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getMasterVolumeRaw,
  getMusicVolumeRaw,
  getSfxVolumeRaw,
  setMasterVolume,
  setMusicVolume,
  setSfxVolume,
} from '@/game/volume-control'
import {
  getPauseSettings,
  setScreenShake,
  setFlashIntensity,
  setShowTips,
  setRetroMode,
} from '@/game/pause-settings'
import { LeaderboardMenu } from './LeaderboardMenu'
import { AchievementsMenu } from './AchievementsMenu'
import type { AchievementListItem } from './AchievementsMenu'

// ---------------------------------------------------------------------------
// Input-mode detection (keyboard / gamepad / touch)
// ---------------------------------------------------------------------------

type InputMode = 'keyboard' | 'gamepad' | 'touch'

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
  { binding: 'Shift', action: 'Boost' },
  { binding: 'Q', action: 'Toggle mining tool' },
  { binding: '1 / 2 / 3', action: 'Blaster / Lazer / Ripple' },
  { binding: 'ESC', action: 'Pause' },
]

const GAMEPAD_ROWS: ControlRow[] = [
  { binding: 'Left Stick', action: 'Move' },
  { binding: 'Right Stick', action: 'Aim & Fire' },
  { binding: 'Left / Right Trigger', action: 'Boost' },
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

// ---------------------------------------------------------------------------
// Quick-tip rotator
// ---------------------------------------------------------------------------

const TIPS = [
  'Shield charges absorb before hull modules — buy a couple before the next Arbiter.',
  'Splitters birth three grunts on death. Bait them away from a swarm before killing.',
  'Wedge formations always head straight for you — strafe perpendicular to break their lead.',
  'Lazer mining is best on m-type and v-type. Ripple chews c-type fields fast.',
  'Mining drones keep working at the station — drop a rally point near rich rock.',
  'Auto-tool (upgrade) swaps weapons to the optimum for the asteroid under your aim.',
  'Smart Bomb resurrects you at 1 HP AND clears the screen. Save it for boss phase 2.',
  'Drifters give free XP — let them cross the screen, line up a shot, easy scrap.',
  'Mark withdrawals refund 90 Ledger — flee the boss if your defenses are spent.',
  'Hull modules tear off in order: scoop, then pods, then wings. Re-buy at station.',
] as const

function useRotatingTip(enabled: boolean): string {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % TIPS.length)
    }, 6000)
    return () => window.clearInterval(id)
  }, [enabled])
  return TIPS[idx]
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatRunTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00'
  const total = Math.floor(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Fullscreen helper
// ---------------------------------------------------------------------------

function useFullscreen(): { isFullscreen: boolean; toggle: () => void } {
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' && document.fullscreenElement !== null,
  )
  useEffect(() => {
    const onChange = (): void => {
      setIsFullscreen(document.fullscreenElement !== null)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggle = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {
        // Some browsers reject exitFullscreen when not in fullscreen — ignore.
      })
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        // User-gesture requirement may block it on some platforms — ignore.
      })
    }
  }
  return { isFullscreen, toggle }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PauseRunStats {
  runTimeSec: number
  ledger: number
  peakLedger: number
  marksDefeated: number
  score: number
}

interface PauseOverlayProps {
  visible: boolean
  onResume: () => void
  onRestart: () => void
  onQuitToTitle: () => void
  /** Enter photo mode — page closes pause, hides HUD, freezes sim, shows
   *  PhotoModeOverlay. Called once on button press. */
  onEnterPhotoMode: () => void
  /** Snapshot of run stats. Null when no run is in progress. */
  runStats: PauseRunStats | null
  achievementItems: AchievementListItem[]
}

// ---------------------------------------------------------------------------
// Reusable UI atoms
// ---------------------------------------------------------------------------

function ActionButton({
  label,
  onClick,
  variant = 'default',
}: {
  label: string
  onClick: () => void
  variant?: 'default' | 'primary' | 'danger'
}) {
  const color =
    variant === 'primary'
      ? 'border-hud-green/60 bg-hud-green/15 text-hud-green hover:bg-hud-green/25 focus:ring-hud-green'
      : variant === 'danger'
        ? 'border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500/20 focus:ring-red-500'
        : 'border-hud-blue/40 bg-hud-blue/10 text-hud-blue hover:bg-hud-blue/20 focus:ring-hud-blue'
  return (
    <button
      type="button"
      data-menu-item
      onClick={onClick}
      className={`px-3 py-2 text-xs sm:text-sm font-bold tracking-wider rounded border focus:outline-none focus:ring-2 ${color}`}
    >
      {label}
    </button>
  )
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex justify-between font-mono text-[11px] text-white/70">
        <span>{label}</span>
        <span className="text-white/40">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        data-menu-item
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full h-5 rounded-full appearance-none cursor-pointer accent-hud-blue bg-space-700 focus:outline-none focus:ring-2 focus:ring-hud-blue rounded-full"
        aria-label={label}
      />
    </label>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      data-menu-item
      onClick={() => onChange(!value)}
      className={`flex items-center justify-between gap-2 w-full px-3 py-1.5 rounded border text-left text-xs ${
        value
          ? 'border-hud-green/40 bg-hud-green/10 text-hud-green'
          : 'border-white/15 bg-white/5 text-white/50'
      }`}
    >
      <span>{label}</span>
      <span className="font-mono text-[10px]">{value ? 'ON' : 'OFF'}</span>
    </button>
  )
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center bg-space-900/40 rounded border border-white/5 py-2 px-1">
      <span className="text-[9px] tracking-widest text-white/40">{label}</span>
      <span className="text-base font-mono text-white/90">{value}</span>
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] tracking-[0.25em] text-hud-blue/70 mt-3 mb-1.5">{label}</p>
  )
}

// ---------------------------------------------------------------------------
// PauseOverlay
// ---------------------------------------------------------------------------

export function PauseOverlay({
  visible,
  onResume,
  onRestart,
  onQuitToTitle,
  onEnterPhotoMode,
  runStats,
  achievementItems,
}: PauseOverlayProps) {
  // Volume sliders — initialized from the persisted volume-control values.
  // We read on mount only; the persisted store is the source of truth.
  const [master, setMaster] = useState(getMasterVolumeRaw)
  const [music, setMusic] = useState(getMusicVolumeRaw)
  const [sfx, setSfx] = useState(getSfxVolumeRaw)

  // Accessibility toggles — same pattern, persisted in pause-settings.
  const [accessibility, setAccessibility] = useState(getPauseSettings)
  useEffect(() => {
    // Re-read every time the menu opens so external changes (e.g. debug
    // panel) stay reflected when the player pauses again.
    if (visible) setAccessibility(getPauseSettings())
  }, [visible])

  // Quick-tip rotator + controls cycler.
  const detectedMode = useInputMode()
  const [modeOverride, setModeOverride] = useState<InputMode | null>(null)
  const mode = modeOverride ?? detectedMode

  // Optional sub-views — leaderboard peek and How-to-play are rendered
  // modal-style on top of the main pause panel; closing returns to the menu.
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [achievementsOpen, setAchievementsOpen] = useState(false)
  const [howToPlayOpen, setHowToPlayOpen] = useState(false)

  const fullscreen = useFullscreen()

  const tip = useRotatingTip(visible && accessibility.showTips)

  // Render-time stat formatting.
  const statCells = useMemo(() => {
    if (!runStats) return null
    return (
      <div className="grid grid-cols-4 gap-1.5">
        <StatCell label="TIME" value={formatRunTime(runStats.runTimeSec)} />
        <StatCell label="SCORE" value={runStats.score} />
        <StatCell label="LEDGER" value={Math.round(runStats.peakLedger)} />
        <StatCell label="MARKS" value={runStats.marksDefeated} />
      </div>
    )
  }, [runStats])

  if (!visible) return null

  // Sub-view: leaderboard peek. Mounted on top of the pause panel using the
  // same overlay backdrop so the menu visually stays where it is.
  if (leaderboardOpen) {
    return (
      <div className="absolute inset-0 z-[40] bg-black/85 flex items-center justify-center p-4">
        <LeaderboardMenu onBack={() => setLeaderboardOpen(false)} />
      </div>
    )
  }

  if (achievementsOpen) {
    return <AchievementsMenu items={achievementItems} onBack={() => setAchievementsOpen(false)} />
  }

  // Sub-view: How to Play — a single-page gameplay loop primer. Kept inline
  // rather than relaunching the prologue tutorial, which would disrupt the
  // current run's state machine. Update the copy when major systems change.
  if (howToPlayOpen) {
    return (
      <div className="absolute inset-0 z-[40] bg-black/85 flex items-center justify-center p-4 overflow-auto">
        <div className="max-w-md w-full bg-space-800/95 border-2 border-hud-blue/40 rounded-xl p-5 font-sans shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto text-sm leading-relaxed text-white/80">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-xl tracking-widest text-white/90">HOW TO PLAY</p>
            <button
              type="button"
              data-menu-item
              onClick={() => setHowToPlayOpen(false)}
              className="text-xs text-hud-blue/80 hover:text-hud-blue px-2 py-1 border border-hud-blue/30 rounded"
            >
              CLOSE
            </button>
          </div>
          <SectionHeader label="THE LOOP" />
          <p>
            Mine asteroids, fight off enemy patrols, haul scrap to the gas-station
            to upgrade your ship — then go back out and mine harder rocks. Survive
            as long as you can; score is tallied at the end of the run.
          </p>
          <SectionHeader label="DEFENSE — IT&apos;S ONE-SHOT" />
          <p>
            Any unabsorbed hit kills you instantly. Your defensive layers absorb
            hits in order:
          </p>
          <ol className="mt-1 ml-4 list-decimal text-white/70 text-xs space-y-0.5">
            <li>Shield — energy bubble, flashes</li>
            <li>Hull module — outer piece tears off</li>
            <li>Armor — internal plating</li>
            <li>Smart Bomb — resurrects + clears nearby</li>
          </ol>
          <p className="mt-2">
            Each layer is a consumable charge. Spend it, go back to the station
            and re-buy it. Position matters more than HP.
          </p>
          <SectionHeader label="THE LEDGER" />
          <p>
            Mining and hauling raise your Ledger. The Ledger decides how hard the
            sector hunts you back: more frequent patrols, bigger formations,
            harder Arbiters. Play greedy, get hunted harder.
          </p>
          <SectionHeader label="MINING TOOLS" />
          <p>
            Three weapons, each best on different asteroid types: Blaster (fast),
            Lazer (heavy), Ripple (wide). Press Q (or Y on gamepad) to cycle.
            Buy Auto-Tool at the station to swap automatically based on what
            you&apos;re aiming at.
          </p>
        </div>
      </div>
    )
  }

  const cycleMode = (): void => {
    const idx = MODE_ORDER.indexOf(mode)
    setModeOverride(MODE_ORDER[(idx + 1) % MODE_ORDER.length])
  }

  return (
    <div className="absolute inset-0 z-[40] bg-black/75 flex items-center justify-center p-4 overflow-auto">
      <div className="max-w-md w-full bg-space-800/95 border-2 border-hud-blue/40 rounded-xl p-5 font-sans shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Title row */}
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-xl sm:text-2xl tracking-widest text-white/90">PAUSED</p>
          <p className="text-xs text-white/40">ESC to resume</p>
        </div>

        {/* Primary actions */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <ActionButton label="RESUME" onClick={onResume} variant="primary" />
          <ActionButton label="PHOTO MODE" onClick={onEnterPhotoMode} />
          <ActionButton label="HOW TO PLAY" onClick={() => setHowToPlayOpen(true)} />
          <ActionButton
            label={fullscreen.isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}
            onClick={fullscreen.toggle}
          />
          <ActionButton label="ACHIEVEMENTS" onClick={() => setAchievementsOpen(true)} />
          <ActionButton label="LEADERBOARD" onClick={() => setLeaderboardOpen(true)} />
          <ActionButton label="RESTART RUN" onClick={onRestart} variant="danger" />
          <ActionButton label="QUIT TO TITLE" onClick={onQuitToTitle} variant="danger" />
        </div>

        {/* Run stats */}
        {statCells && (
          <>
            <SectionHeader label="RUN STATS" />
            {statCells}
          </>
        )}

        {/* Audio sliders */}
        <SectionHeader label="AUDIO" />
        <div className="flex flex-col gap-2">
          <Slider
            label="MASTER"
            value={master}
            onChange={(v) => {
              setMaster(v)
              setMasterVolume(v)
            }}
          />
          <Slider
            label="MUSIC"
            value={music}
            onChange={(v) => {
              setMusic(v)
              setMusicVolume(v)
            }}
          />
          <Slider
            label="SFX"
            value={sfx}
            onChange={(v) => {
              setSfx(v)
              setSfxVolume(v)
            }}
          />
        </div>

        {/* Accessibility */}
        <SectionHeader label="ACCESSIBILITY" />
        <div className="flex flex-col gap-1.5">
          <Toggle
            label="Screen shake"
            value={accessibility.screenShake}
            onChange={(v) => {
              setAccessibility((s) => ({ ...s, screenShake: v }))
              setScreenShake(v)
            }}
          />
          <Toggle
            label="Flash intensity (bloom / vignette)"
            value={accessibility.flashIntensity}
            onChange={(v) => {
              setAccessibility((s) => ({ ...s, flashIntensity: v }))
              setFlashIntensity(v)
            }}
          />
          <Toggle
            label="Show gameplay tips"
            value={accessibility.showTips}
            onChange={(v) => {
              setAccessibility((s) => ({ ...s, showTips: v }))
              setShowTips(v)
            }}
          />
          <Toggle
            label="Retro mode (chunky pixel render)"
            value={accessibility.retroMode}
            onChange={(v) => {
              setAccessibility((s) => ({ ...s, retroMode: v }))
              setRetroMode(v)
            }}
          />
        </div>

        {/* Controls reference */}
        <SectionHeader label="CONTROLS" />
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] text-white/40">{MODE_LABEL[mode]}</p>
          <button
            type="button"
            data-menu-item
            onClick={cycleMode}
            className="text-[10px] text-hud-blue/80 hover:text-hud-blue px-2 py-0.5 border border-hud-blue/30 rounded focus:outline-none focus:ring-2 focus:ring-hud-blue"
            aria-label="Switch control scheme"
          >
            SWITCH ▸
          </button>
        </div>
        <ul className="space-y-1 text-xs">
          {rowsFor(mode).map((row) => (
            <li
              key={row.binding}
              className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-1"
            >
              <span className="text-hud-blue/90 shrink-0 text-[11px]">{row.binding}</span>
              <span className="text-white/70 text-right text-[11px]">{row.action}</span>
            </li>
          ))}
        </ul>

        {/* Quick tip footer */}
        {accessibility.showTips && (
          <div className="mt-4 px-2 py-2 bg-space-900/60 border border-white/5 rounded text-[11px] text-white/60 italic">
            <span className="text-hud-amber/80 not-italic mr-2">TIP</span>
            {tip}
          </div>
        )}
      </div>
    </div>
  )
}
