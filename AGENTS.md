# FrackingAsteroids — Agent Instructions

## Stack

- **Next.js** (App Router, TypeScript strict mode)
- **Tailwind CSS** (utility-first styling, mobile-first responsive)
- **Three.js** (voxel-style 3D rendering)
- **Upstash Redis** (persistent game state via Vercel KV)
- **Zod** (runtime validation for all data boundaries)

## Commands

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run format           # Prettier — autofix formatting
npm run format:check     # Prettier — check only
npm run lint             # ESLint — errors on unused imports
npm run lint:fix         # ESLint — autofix unused imports
npm run type-check       # TypeScript strict
npm run test:unit        # Unit tests (fast)
npm run test:coverage    # Unit tests + coverage (lines≥90%, branches≥80%, functions≥90%)
npm run test:integration # Integration tests (headless gameplay flows)
npm run test:smoke       # Smoke tests
npm run test:e2e         # E2E tests with Playwright
npm run test:e2e:headed  # E2E tests with GUI
```

## Task Tracking with .dots

We use [dots](https://github.com/joelreymont/dots) for persistent task tracking.

### Essential Commands

```bash
dot ls                          # List active tasks
dot ready                       # Show tasks ready to work on
dot add -t "title" -p 2         # Create task (priority 0–4)
dot on <id>                     # Start working on a task
dot off <id> -r "What was done" # Complete a task
dot "Short description"         # Quick-add a task
dot add "Description" -p 1 -d "Details"
dot add "Subtask" -P dots-1     # Add subtask under parent
dot add "After X" -a dots-2     # Add task after another
dot show dots-1                 # Show task details
dot tree                        # Show task tree
dot find "query"                # Search tasks
```

### Priority Levels

| Level | Meaning  |
|-------|----------|
| 0     | Critical |
| 1     | High     |
| 2     | Medium   |
| 3     | Low      |
| 4     | Backlog  |

### Rules for Agents

- Always create or verify dots before coding
- Use `dot on <id>` before starting work
- Use `dot off <id> -r "reason"` when done
- Commit the entire `.dots/` directory with your changes

## Unit Tests & Coverage

- **Lines ≥ 90%**, **Branches ≥ 80%**, **Functions ≥ 90%**
- Measured on `src/game/**` and `src/lib/**`

### Rules for agents

- Run `npm run test:unit` after any game logic or lib changes
- Run `npm run test:coverage` before committing
- Never merge with coverage below thresholds — if coverage is already below when you start, fix it before pushing your own changes

## Integration Tests

Headless gameplay-flow tests that exercise multiple game systems together without
Three.js, DOM, or a browser.

```
tests/integration/
  helpers/mock-three.ts    — Lightweight Three.js mock (install before imports)
  game-simulation.ts       — Headless game loop using existing pure functions
  game-test-harness.ts     — Convenience wrapper with actions & assertions
  flows/
    mining-flow.test.ts    — Projectile firing, asteroid damage, metal collection
    lazer-tool.test.ts     — Crystalline deflection, lazer damage, tool switching
    pause-resume.test.ts   — Stale fire state, pause/freeze/unpause behavior
```

### Architecture

1. **`mock-three.ts`** — Stubs `THREE.Group`, `Mesh`, `BoxGeometry`, etc. so game
   modules that touch `.mesh.position.set()` can be imported without WebGL.
   Call `installMockThree()` in `before()` and `uninstallMockThree()` in `after()`.
2. **`GameSimulation`** — Replicates the `scene.ts` game loop orchestration
   (ship physics, blaster, collisions, enemies, metal, station proximity) using
   the same pure functions. Supports `step(dt)` / `stepN(n)`, input injection
   (`fireAt`, `holdFireAt`, `setInput`, `startCollecting`), world injection
   (`spawnAsteroid`, `spawnEnemy`, `spawnMetal`, `teleportShip`), and event capture.
3. **`GameTestHarness`** — Wraps `GameSimulation` with high-level actions
   (`fireAndWait`, `destroyAsteroid`, `collectAllMetal`, `moveToward`, `stepUntil`)
   and assertion helpers (`assertHp`, `assertAsteroidDestroyed`, `assertEventCount`).

### Rules for agents

- Run `npm run test:integration` after changes to game logic or scene orchestration
- New gameplay features should have at least one integration test flow
- Keep `GameSimulation.step()` in sync with `scene.ts` game loop changes
- Use `GameTestHarness` for readable tests; avoid raw `step()` loops in flow tests

## Smoke Tests

```bash
npm run build && npm start &
npx wait-on http://localhost:3000
npm run test:smoke
```

- Smoke tests verify the app builds and the health/version endpoints respond

## E2E Tests (Playwright)

```bash
npm run test:e2e
npm run test:e2e:headed
npx playwright test --ui
```

### Rules for agents

- Run `npm run test:e2e` after UI or game logic changes
- E2E tests expose the game instance on `window.__game` for test manipulation
- Mobile viewport tests run alongside desktop (Pixel 5 device profile)

## Formatting, Linting & TypeScript

- Prettier: no semicolons, single quotes, 100 char width, trailing commas
- ESLint: zero warnings policy (`--max-warnings 0`)
- TypeScript: strict mode with `noUnusedLocals` and `noUnusedParameters`

## Strict Typing Rules (enforced by ESLint)

- **No `any`** — use `unknown` and narrow
- **No non-null assertions (`!`)** — validate instead
- **Consistent type imports** — use `import type` where applicable
- All types derived from Zod schemas via `z.infer<>`, never duplicate

## Schema Validation Rules

- **Zod-first types** — derive types with `z.infer<>`, never hand-write duplicates
- **Boundary validation** — all external data must use `.safeParse()`
- All API route handlers validate request bodies with Zod before processing

## Upstash Redis

- Client lives in `src/lib/kv.ts` — lazy singleton via `getKv()`
- Build succeeds without env vars (lazy initialization)
- Key prefixes: `game:` for game state, `feedback:` for feedback
- All reads must be validated with Zod `.safeParse()` before use

## CI/CD

Three GitHub Actions workflows run on push/PR to `main`:

1. **CI** — format check, lint, type-check, unit tests with coverage
2. **E2E** — Playwright tests with chromium (dummy KV credentials)
3. **Smoke** — build, start server, run smoke tests

Auto-deploy to Vercel via Git integration on push to `main`.

## Game Design

- Game Design Document lives at `Docs/GDD.md`
- Update GDD **before** implementing new features
- Update milestones **after** completing features

### Rules for Agents

- Read `Docs/GDD.md` before starting work on game features
- Propose GDD changes before implementing

## 3D / Voxel Art Guidelines

- Ship model uses `VOXEL_SIZE` from `src/game/ship-constants.ts` (currently 0.5)
- Asteroids and other large objects should use their own larger voxel size constant — **not** the ship's `VOXEL_SIZE` — to appear properly scaled at the camera's height (~150 units)
- A voxel size of **2.0** makes ~10-voxel-wide objects clearly visible on screen
- The camera looks down the Z-axis (`position.z = 150`, FOV 50°), so the visible area is roughly 140×100 units — size models accordingly
- Voxel models are built with `THREE.Group` containing `THREE.Mesh` children (BoxGeometry + MeshStandardMaterial with `flatShading: true`)
- Use dedicated color palettes per object type (see `ASTEROID_COLORS` in `asteroid-model.ts`)

## Pre-Push Checklist

```bash
npm run format
npm run lint:fix
npm run test:unit
npm run test:integration
npm run build
```

## Input & Event Handling

- **No duplicate event listeners on shared elements** — before adding mouse/touch handlers to a container, check whether other systems (e.g. virtual joystick, aim handler) already listen on the same element for the same event types. Two systems fighting over `touchmove` on the same element is a bug.
- **Separate mouse and touch concerns** — desktop uses mouse events for aiming; mobile uses touch events for the virtual joystick and tap-to-fire. Don't mix them in a single handler — they have different semantics and will conflict on multi-touch.
- **Always `preventDefault()` on handled touch events** — the browser synthesizes mouse events (`mousemove`, `mousedown`) from unhandled touches. If a touch handler processes an event but doesn't call `e.preventDefault()`, the synthetic mouse event will leak into mouse-only systems (e.g. aim handler), causing unintended side effects like the ship rotating toward a tap. Every `touchstart`/`touchmove` handler that consumes the event must call `e.preventDefault()`.
- **Swallow all touches in every screen region** — every area of the screen must have a touch handler that calls `e.preventDefault()`, even if the touch does nothing gameplay-wise. If you replace a broad touch handler (e.g. "right-half tap to fire") with a smaller element (e.g. a fire button), the uncovered area still receives touches that the browser will convert into synthetic mouse events. Always add a catch-all `touchstart` handler with `preventDefault()` for any region not covered by a specific touch control.
- **Ship rotation is joystick-only on mobile** — the left-side virtual joystick is the sole control for ship facing direction on mobile. Right-side taps fire in the ship's current facing direction. No touch event on the right side should influence `aimState` or ship rotation. If adding new touch interactions, verify they don't feed into the aim/rotation pipeline.
- **No speed gates on input-driven rotation** — when the player is actively providing directional input (joystick or keyboard), the ship must rotate to face that direction immediately, regardless of current velocity. Never require a minimum speed before allowing rotation — it makes controls feel broken.
- **Handle nullable returns from Three.js** — methods like `raycaster.ray.intersectPlane()` can return `null`. Always handle the null case even when it seems unlikely with the current camera setup.

## Code Quality

- **Docstrings must match the actual data** — if a field stores screen-space pixels, don't document it as "world coordinates." Misleading docs are worse than no docs.
- **No dead code in tests** — no empty `afterEach` blocks, no unused variables. Tests are code too; keep them clean.
- **Self-review before committing** — re-read every changed file for: conflicting event handlers on shared elements, misleading comments/docs, unhandled nullable returns, and dead code. These are the most common issues.

## No Broken Windows

Fix broken tools, tests, or builds immediately — even if someone else broke them. If CI is red when you start, fix it first. If coverage is below thresholds, raise it. Never leave the codebase in a worse state than you found it.

## Boy Scout Rule

Leave files cleaner than you found them. Small improvements add up.

## Commits

- **One logical unit per commit** — atomic, reviewable changes
- **No force pushes** unless explicitly instructed
- **No AI attribution** in commit messages

## Dependency Upgrade Gate

The agent runs the gate at every loop boundary that touches `main`:

- After landing on fresh `main` (post-merge or fresh pull), before picking the next slice.
- Before opening a new PR, in case a watched release landed while the slice was in flight.

Read `Docs/DEPENDENCY_LEDGER.md`. For every watched dep (currently: `@randroids-dojo/vibekit`), run its **Detect-new** command and compare against the ledger's **Currently pinned** value. If newer, the upgrade IS the next slice unless red CI / a P0 incident takes over. Follow the per-dep procedure in `Docs/DEPENDENCY_LEDGER.md` (branch, read upstream CHANGELOG, bump pin, type-check, test, build, smoke, PR with title `chore(deps): bump <dep> from <from> to <to>`). If the upgrade requires a migration that cannot land in one PR, abort the bump, file a followup, and continue with the prior pin. The bump PR updates the ledger's **Currently pinned** line in the same diff.
