'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameCanvasHandle } from './GameCanvas'
import type { DebugApi } from '@/game/scene'
import { DEBUG_ENABLED } from '@/lib/debug'
import type { Cargo, GameState, Upgrades } from '@/lib/schemas'
import { defaultGameState } from '@/lib/schemas'

/** The slice of useGameState the panel needs. Keeping it narrow avoids a
 *  circular import + keeps the panel testable in isolation. */
export interface DebugGameStateBridge {
  scrap: number
  cargo: Cargo
  upgrades: Upgrades
  playerHp: number
  achievements: string[]
  metrics: GameState['metrics']
  onScrapCollect: (amount: number) => void
  setUpgradeLevel: (type: keyof Upgrades, value: number) => void
  hydrateFromSave: (s: GameState) => void
}

interface DebugPanelProps {
  canvasRef: React.RefObject<GameCanvasHandle | null>
  state: DebugGameStateBridge
  onRequestSave: () => void
}

const ENEMY_KINDS = ['grunt', 'sniper', 'scavenger', 'carrier', 'drone'] as const
const ASTEROID_TYPES = ['c-type', 's-type', 'm-type', 'v-type', 'd-type', 'comet'] as const
const DRONE_STATES = ['seeking', 'drilling', 'returning', 'retreating'] as const

/**
 * Floating debug panel. F1 toggles visibility, F2 toggles the perf overlay
 * independently. The whole module is no-op exported when DEBUG_ENABLED is
 * false — webpack tree-shakes it from production bundles.
 */
export function DebugPanel({ canvasRef, state, onRequestSave }: DebugPanelProps) {
  if (!DEBUG_ENABLED) return null

  return <DebugPanelInner canvasRef={canvasRef} state={state} onRequestSave={onRequestSave} />
}

function DebugPanelInner({ canvasRef, state, onRequestSave }: DebugPanelProps) {
  const [open, setOpen] = useState(false)
  const [perfOn, setPerfOn] = useState(false)
  // Force-update tick — many of the debug toggles read from the scene's
  // internal state, so we re-render on a regular cadence to keep checkboxes
  // honest without wiring up a full event bus.
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => forceTick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [open])

  // Keyboard shortcuts. F1 toggles the panel; F2 toggles the perf overlay
  // standalone (since it's useful even without the full panel open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'F1') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.code === 'F2') {
        e.preventDefault()
        setPerfOn((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const getApi = useCallback((): DebugApi | null => {
    return canvasRef.current?.getDebugApi() ?? null
  }, [canvasRef])

  return (
    <>
      {perfOn && <PerfOverlay />}
      {open && (
        <PanelContent
          getApi={getApi}
          state={state}
          onRequestSave={onRequestSave}
          perfOn={perfOn}
          setPerfOn={setPerfOn}
          onClose={() => setOpen(false)}
        />
      )}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute top-2 right-2 z-[100] px-2 py-1 text-[10px] font-mono bg-black/70 border border-hud-amber/40 text-hud-amber/70 rounded hover:bg-black/90 hover:text-hud-amber"
          aria-label="Open debug panel (F1)"
        >
          DBG [F1]
        </button>
      )}
    </>
  )
}

interface PanelContentProps {
  getApi: () => DebugApi | null
  state: DebugGameStateBridge
  onRequestSave: () => void
  perfOn: boolean
  setPerfOn: (v: boolean) => void
  onClose: () => void
}

function PanelContent({
  getApi,
  state,
  onRequestSave,
  perfOn,
  setPerfOn,
  onClose,
}: PanelContentProps) {
  const api = getApi()

  const apply = useCallback(
    (fn: (a: DebugApi) => void) => {
      const a = getApi()
      if (a) fn(a)
    },
    [getApi],
  )

  // --- Snapshot dump/load ---
  const [snapshotText, setSnapshotText] = useState('')
  const dumpSnapshot = useCallback(() => {
    const a = getApi()
    if (!a) return
    const scene = a.snapshotTickState()
    const reactState = {
      scrap: state.scrap,
      cargo: state.cargo,
      upgrades: state.upgrades,
      playerHp: state.playerHp,
      achievements: state.achievements,
      metrics: state.metrics,
    }
    const payload = JSON.stringify(
      { scene: JSON.parse(scene), react: reactState },
      null,
      2,
    )
    setSnapshotText(payload)
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(payload).catch(() => {})
    }
  }, [getApi, state])

  const loadSnapshot = useCallback(async () => {
    try {
      const text = snapshotText || (await navigator.clipboard.readText())
      const parsed = JSON.parse(text) as { react?: Record<string, unknown> }
      if (parsed.react) {
        // Use hydrateFromSave to push react-side state — falls back gracefully
        // if the snapshot is just scene state.
        const fake = { ...defaultGameState(), ...(parsed.react as object) }
        state.hydrateFromSave(fake as ReturnType<typeof defaultGameState>)
      }
    } catch {
      // Ignore malformed paste.
    }
  }, [snapshotText, state])

  return (
    <div
      className="absolute top-2 right-2 z-[100] w-[320px] max-h-[calc(100vh-16px)] overflow-y-auto bg-black/85 border border-hud-amber/50 rounded shadow-2xl font-mono text-[11px] text-white/85 p-3 space-y-3"
      data-testid="debug-panel"
    >
      <div className="flex items-center justify-between">
        <span className="text-hud-amber font-bold tracking-wider">DEBUG · F1</span>
        <button
          type="button"
          onClick={onClose}
          className="px-2 text-white/60 hover:text-white"
          aria-label="Close debug panel"
        >
          ✕
        </button>
      </div>

      <Section title="PLAYER">
        <Toggle
          label="God mode"
          value={api?.getGodMode() ?? false}
          onChange={(v) => apply((a) => a.setGodMode(v))}
        />
        <Row>
          <Btn onClick={() => apply((a) => a.setPlayerHp(100))}>HP 100</Btn>
          <Btn onClick={() => apply((a) => a.setPlayerHp(25))}>HP 25</Btn>
          <Btn onClick={() => apply((a) => a.killPlayer())}>Kill (silent)</Btn>
        </Row>
        <Row>
          <Btn onClick={() => apply((a) => a.forceDeathSequence())}>Force death seq</Btn>
          <Btn onClick={() => apply((a) => a.refillShieldArmor())}>Refill shield+armor</Btn>
        </Row>
      </Section>

      <Section title="ECONOMY">
        <Row>
          <Btn onClick={() => state.onScrapCollect(100)}>+100</Btn>
          <Btn onClick={() => state.onScrapCollect(1000)}>+1000</Btn>
          <Btn onClick={() => state.onScrapCollect(10000)}>+10000</Btn>
        </Row>
        <Row>
          <Btn
            onClick={() => {
              // Push every upgrade to its cap on the react side, then mirror to scene.
              const maxed: typeof state.upgrades = {
                blaster: 5,
                collector: 5,
                storage: 5,
                missiles: 8,
                ripple: 1,
                options: 2,
                speed: 5,
                armor: 3,
                shield: 3,
                smartBomb: 1,
                lazer: 1,
                autoTool: 1,
                drone: 4,
                spread: 1,
              }
              for (const k of Object.keys(maxed) as (keyof typeof maxed)[]) {
                state.setUpgradeLevel(k, maxed[k])
              }
              apply((a) => a.setUpgradesMaxed())
              onRequestSave()
            }}
          >
            Max all upgrades
          </Btn>
        </Row>
        <Row>
          <Btn onClick={() => apply((a) => a.unlockAllTools())}>Unlock tools (scene only)</Btn>
        </Row>
      </Section>

      <Section title="ENEMIES">
        <Row>
          {ENEMY_KINDS.map((k) => (
            <Btn
              key={k}
              onClick={() =>
                apply((a) => {
                  const w = a.getCursorWorld()
                  if (!w) return
                  a.spawnEnemyAtCursor(k, w.x, w.y)
                })
              }
            >
              {k}
            </Btn>
          ))}
        </Row>
        <Row>
          <Btn onClick={() => apply((a) => a.spawnArbiter())}>Spawn Arbiter</Btn>
          <Btn onClick={() => apply((a) => a.despawnAllEnemies())}>Despawn all</Btn>
        </Row>
        <Toggle
          label="Disable enemy spawns"
          value={api?.getEnemySpawnsDisabled() ?? false}
          onChange={(v) => apply((a) => a.setEnemySpawnsDisabled(v))}
        />
        <Row>
          <NumberField
            label="Ledger"
            initial={0}
            onApply={(v) => apply((a) => a.setLedger(v))}
          />
          <Btn onClick={() => apply((a) => a.addLedger(500))}>+500 ledger</Btn>
        </Row>
      </Section>

      <Section title="ASTEROIDS">
        <Row>
          {ASTEROID_TYPES.map((t) => (
            <Btn
              key={t}
              onClick={() =>
                apply((a) => {
                  const w = a.getCursorWorld()
                  if (!w) return
                  a.spawnAsteroidAtCursor(t, w.x, w.y)
                })
              }
            >
              {t}
            </Btn>
          ))}
        </Row>
        <Row>
          <Btn onClick={() => apply((a) => a.clearAsteroids())}>Clear all</Btn>
        </Row>
      </Section>

      <Section title="DRONES">
        <Row>
          <Btn
            onClick={() =>
              apply((a) => {
                const built = a.buildDronesUpToCap()
                if (built > 0) onRequestSave()
              })
            }
          >
            Build to cap
          </Btn>
        </Row>
        <Row>
          {DRONE_STATES.map((s) => (
            <Btn key={s} onClick={() => apply((a) => a.forceDroneState(s))}>
              {s}
            </Btn>
          ))}
        </Row>
      </Section>

      <Section title="TIME">
        <Row>
          {[0, 0.25, 0.5, 1, 2, 4].map((m) => (
            <Btn
              key={m}
              onClick={() => apply((a) => a.setDtMultiplier(m))}
              active={Math.abs((api?.getDtMultiplier() ?? 1) - m) < 0.01}
            >
              {m}x
            </Btn>
          ))}
        </Row>
      </Section>

      <Section title="NAV">
        <Row>
          <Btn onClick={() => apply((a) => a.teleportToStation())}>Station</Btn>
          <Btn onClick={() => apply((a) => a.teleportToArbiter())}>Arbiter</Btn>
          <Btn onClick={() => apply((a) => a.teleportToNearestEnemy())}>Nearest enemy</Btn>
        </Row>
      </Section>

      <Section title="VISUALS">
        <Toggle
          label="Collision overlay"
          value={api?.getCollisionDebugEnabled() ?? false}
          onChange={(v) => apply((a) => a.setCollisionDebugEnabled(v))}
        />
        <Toggle
          label="Perf overlay (F2)"
          value={perfOn}
          onChange={setPerfOn}
        />
        <Toggle
          label="Bloom"
          value={true}
          onChange={(v) => apply((a) => a.setBloomEnabled(v))}
        />
        <Toggle
          label="Vignette"
          value={true}
          onChange={(v) => apply((a) => a.setVignetteEnabled(v))}
        />
        <Toggle
          label="Chromatic aberration"
          value={true}
          onChange={(v) => apply((a) => a.setChromaticAberrationEnabled(v))}
        />
        <Toggle
          label="Screen shake"
          value={true}
          onChange={(v) => apply((a) => a.setScreenShakeEnabled(v))}
        />
      </Section>

      <Section title="SNAPSHOT">
        <Row>
          <Btn onClick={dumpSnapshot}>Dump → clipboard</Btn>
          <Btn onClick={loadSnapshot}>Load from clipboard</Btn>
        </Row>
        {snapshotText && (
          <textarea
            value={snapshotText}
            onChange={(e) => setSnapshotText(e.target.value)}
            className="w-full h-32 bg-black/60 border border-white/20 text-white/70 text-[10px] p-1 mt-1 font-mono"
            spellCheck={false}
          />
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/10 pt-2 first:border-t-0 first:pt-0">
      <div className="text-hud-amber/80 text-[10px] tracking-wider mb-1">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1 items-center">{children}</div>
}

function Btn({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 border rounded text-[10px] transition-colors ${
        active
          ? 'bg-hud-amber/30 border-hud-amber text-hud-amber'
          : 'bg-white/5 border-white/15 hover:bg-white/10 text-white/75'
      }`}
    >
      {children}
    </button>
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
    <label className="flex items-center justify-between gap-2 cursor-pointer select-none py-0.5">
      <span className="text-white/80">{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5"
      />
    </label>
  )
}

function NumberField({
  label,
  initial,
  onApply,
}: {
  label: string
  initial: number
  onApply: (v: number) => void
}) {
  const [val, setVal] = useState(String(initial))
  return (
    <div className="flex items-center gap-1">
      <span className="text-white/60">{label}</span>
      <input
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          const n = Number(val)
          if (Number.isFinite(n)) onApply(n)
        }}
        className="w-16 bg-black/60 border border-white/15 text-white/85 px-1 py-0.5"
      />
    </div>
  )
}

/** FPS / frame-time / entity-count overlay. Pulls counts via the debug API. */
function PerfOverlay() {
  const frames = useRef<number[]>([])
  const [stats, setStats] = useState({ fps: 0, ft: 0 })
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number): void => {
      const dt = now - last
      last = now
      const arr = frames.current
      arr.push(dt)
      if (arr.length > 60) arr.shift()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const id = setInterval(() => {
      const arr = frames.current
      if (arr.length === 0) return
      const sum = arr.reduce((a, b) => a + b, 0)
      const avg = sum / arr.length
      setStats({ fps: Math.round(1000 / avg), ft: Math.round(avg * 10) / 10 })
    }, 250)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(id)
    }
  }, [])

  const display = useMemo(
    () => `${stats.fps} FPS · ${stats.ft.toFixed(1)}ms`,
    [stats],
  )

  return (
    <div className="absolute top-2 left-2 z-[100] px-2 py-1 bg-black/70 border border-white/20 rounded font-mono text-[10px] text-hud-green">
      {display}
    </div>
  )
}
