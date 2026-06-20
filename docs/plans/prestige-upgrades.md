# Plan: Prestige ("Tycoon-Tier") Upgrades

**Status:** Implemented (typecheck + lint clean; pending in-game playtest)
**Owner:** —
**Created:** 2026-06-19
**Last updated:** 2026-06-19

> Living document. Keep this in sync as we implement — check items off, jot
> decisions inline. This is the single source of truth for the prestige-upgrade
> feature so we don't lose track mid-implementation.

---

## 1. Goal

Add a tier of **ultra-expensive end-game upgrades** priced so high a player can
realistically only afford them after *mastering* the game and generating
astronomical scrap. Aspirational "you've made it" chase purchases — not part of
the normal shopping arc.

Pricing context (today): top normal upgrade ≈ 600 scrap; highest **Hull** tier
purchase ≈ 110 scrap (base 70 × 1.25² ramp); minerals sell 3–150 each. Prestige
costs sit one to two orders of magnitude higher.

### The two upgrades (final scope)

| # | Key          | Label              | Cost (draft) | Max | One-liner |
|---|--------------|--------------------|--------------|-----|-----------|
| 1 | `refinery`   | Quantum Refinery   | 12,000       | 1   | +100% scrap from all material sales (sale value ×2). |
| 2 | `exoticHull` | Exotic Matter Hull | 15,000       | 1   | The capstone. Big extra hull buffer (no self-repair) **+** full black-hole immunity **+** unlocks buying a 3rd Option Orb **+** orbs fly a figure-four formation (you at front) **+** ship turns dark with a cosmic-pink aura. |

Both are **one-shot unlocks** (`max 1`, flat cost). The **3rd Option Orb** is
*not* a new key — it's a new purchasable tier of the existing `options` upgrade
(cap 2 → 3), gated behind owning `exoticHull`.

---

## 2. Where upgrades are wired (touch-points)

New keys (`refinery`, `exoticHull`) must be added in **all four** places, in order:

1. **`src/lib/schemas.ts`** — `UpgradesSchema` (`z.number().int().min(0).max(1).default(0)`) + `defaultUpgrades()` (key → `0`). **Also** bump `options` max 2 → 3 here.
2. **`src/hooks/useGameState.ts`** — `UPGRADE_MAX` (new keys → 1; `options` 2 → 3) + add the two new keys to the one-shot "max out on purchase" ternary in `buyUpgrade()` (~158-166). (`options` stays a normal tiered increment — do NOT add it to the one-shot list.)
3. **`src/components/TradeMenu.tsx`** — new `PRESTIGE` catalog section for the two keys; `maxLevelForUpgrade()` (`options` → 3; new keys → 1); `isFlatCostUpgrade()` (new keys); `computePrereqLock()` (see §4, incl. the per-tier `options` gate); label ternary (~599-618, new keys in `OWNED/LOCKED` group).
4. **`src/game/scene.ts`** (~3297-3327) — mirror `upgrades.exoticHull` → the new `tickState` fields, then consume in `game-tick.ts`. (`refinery` is React-side only — no `tickState` field.)
5. **`src/components/HUD.tsx`** (~161-180) — the loadout panel is a hardcoded list of `upgrades.X > 0 && <div>…</div>` rows. Add a **REFINERY** row and an **EXOTIC HULL** row so they list "along with the others." The existing `OPTION x{upgrades.options}` row auto-shows `x3`.
6. **`src/app/page.tsx`** `hudUpgrades` memo (~281-300) — the prologue's display mirror. See §3.3.

> The HUD panel (touch-points 5–6) is **display-only** and reads `hudUpgrades`,
> which is separate from the real `upgrades` used for achievement evaluation —
> so showing maxed prestige in the prologue does **not** unlock achievements.

> ⚠️ One-shot unlocks are special-cased in **three** spots: the `buyUpgrade`
> ternary, `isFlatCostUpgrade`, and the label ternary. Keep new keys consistent.

---

## 3. Per-upgrade design & implementation

### 3.1 Quantum Refinery (`refinery`)

**Effect:** sale value ×2, stacking *multiplicatively* with the existing
full-cargo +20% bonus.

- `useGameState.sellMaterials()` — multiply `earned` by `upgrades.refinery ? 2 : 1`.
- `TradeMenu` `SellPanel` — mirror in the preview math; show a "Quantum Refinery (×2)" line.
- No `tickState` field.
- **Prereq (`computePrereqLock`):** `storage >= 3`.

### 3.2 Exotic Matter Hull (`exoticHull`) — the capstone

Owning this single upgrade does **five** things. Stage them as separate commits
(gameplay before visuals).

**(a) Extra hull buffer (no self-repair).**
Normal Hull = bolt-on pieces, each absorbs one hit then tears off; max 3,
tracked as `tickState.hullCharges`, rendered by `applyHullModules(shipModel, n)`.
- New `tickState.exoticHullCharges`, set to a fixed block (draft **3**) when
  owned; **no regen** (confirmed). Consumed in the damage ladder — find the
  existing absorption order (shield → hull → armor → smartBomb) and slot exotic
  charges in as the outermost layer.
- v1 may show charges in the HUD only; bespoke exotic-plate geometry is a
  follow-up.

**(b) Black-hole immunity for the player ship.**
Today the ship is affected in two `game-tick.ts` spots:
- pull: `applyBlackHolePullToBody(state.ship, …, BLACK_HOLE_PLAYER_PULL_MULT)` (~1817-1821)
- death: `applyBlackHoleConsumption` → `isInsideBlackHole(state.ship,…)` sets `playerHp = 0` (~1398)

Add `tickState.voidImmune = upgrades.exoticHull > 0`. Guard **both** spots: skip
the ship pull loop and skip the consumption death when `voidImmune`. Leave
asteroids/projectiles/enemies still affected. Optional small VFX cue when the
ship sits in a hole unharmed.

**(c) Unlocks buying the 3rd Option Orb.**
Options cap rises 2 → 3 (schema + `UPGRADE_MAX` + `maxLevelForUpgrade`). The 3rd
tier is purchasable **only** once `exoticHull` is owned — handled via a
per-tier prereq in `computePrereqLock` (§4). Two `Math.min(2,…)` clamps must
rise to 3 **together**:
- `game-tick.ts optionMuzzlePositions()` (~931)
- `scene.ts syncOptionOrbs()` (~1505)

Firing scales off `optionMuzzlePositions`, so the 3rd orb fires for free. Blaster
damage scalar `3.8 + optionCount*0.7` (game-tick ~2320) auto-scales — leave as is.

**(d) Figure-four formation, player at front.**
Orbs today trail along `positionHistory` (snake line). When there are **3 orbs**
(i.e. `exoticHull` owned + 3rd option bought), switch to a fixed **figure-four /
diamond** relative to ship heading: player at the nose, 3 orbs forming the rest,
rotated by `ship.rotation`.
- Branch inside `optionMuzzlePositions` + `syncOptionOrbs`: when in formation
  mode, place orbs at heading-relative offsets instead of history sampling.
  Keep muzzle math and renderer in sync so shots originate from the visible orbs.
- Trigger condition: simplest is `optionCount >= 3`. (Don't reuse the unrelated
  **enemy** wedge "formation" code in `enemy-ship.ts`.)

**(e) Visual: darker ship + cosmic-pink aura.**
Ship geometry/materials live in `src/game/ship-model.ts` (`createShipModel`).
When `exoticHull` owned:
- Darken base materials toward near-black (material color/emissive override on a flag).
- Add a **cosmic-pink** additive aura (model after the option-orb material at
  scene.ts:1509-1515, color ~`0xff66ff` to match the `exotics` palette);
  optionally tint thruster puffs pink.
- Apply at hydrate (scene.ts ~3317) **and** after the post-prologue
  `createShipModel('normal')` rebuild (scene.ts ~3441) so it survives the swap.

- **Prereq for `exoticHull` itself (`computePrereqLock`):** `hull >= 3` **and**
  `options >= 2` (Options maxed). The 3rd-orb unlock is only usable once Options
  is already maxed, so requiring it here keeps the benefit immediately meaningful
  — confirmed with user.

### 3.3 Prologue showcase + HUD panel

The intro prologue flies a **fully maxed-out ship** as a power fantasy before
the Arbiter strips it. The prestige upgrades must appear maxed **and be denoted
on the side panel** alongside the others (user request).

**(a) Side panel denotation — `page.tsx hudUpgrades` memo (~281-300).**
Add `refinery: 1`, `exoticHull: 1`, and bump `options: 3` to the prologue branch
so the HUD lists them. (Pair with the HUD.tsx rows from §2 touch-point 5.)

**(b) Showcase the effects in the prologue sim** (so the maxed ship visibly flies
them, not just lists them):
- `PROLOGUE_SHIP.optionCount` (prologue-config.ts:15) `2 → 3`.
- `prologueTick` grants (game-tick.ts ~1460-1477, sets `optionCount = PROLOGUE_SHIP.optionCount`) — also flip `voidImmune = true` and the cosmic-pink/dark visual on, so the intro shows the figure-four formation and the capstone look.
- scene.ts prologue path (~3769 sets `tickState.optionCount = 2`; ~3355 "fully-maxed loadout" block) — mirror to 3 and apply the pink/dark ship material.
- This means **Phase 2 clamps (→3) and Phase 3 visuals must also cover the prologue path**, not just live play.

**(c) Safety:** `hudUpgrades` is display-only; the real `upgrades` stays minimal
during the prologue, so none of this trips achievement unlocks (verified §6).

---

## 4. Prerequisite gating (`computePrereqLock`)

| Item                 | Lock condition | Message |
|----------------------|----------------|---------|
| `refinery`           | `storage < 3` | "Requires Cargo Expansion III" |
| `exoticHull`         | `hull < 3 \|\| options < 2` | "Requires Hull III + Options maxed" |
| `options` (3rd tier) | `options >= 2 && exoticHull === 0` | "Requires Exotic Matter Hull" |

The `options` entry is **per-tier**: returns `null` (buyable) for tiers 1–2,
and only locks the 3rd purchase. `computePrereqLock` already gets `upgrades`, so
it can read both `upgrades.options` (current level) and `upgrades.exoticHull`.
Locked rows reuse the existing greyed/`LOCK` pattern.

---

## 5. Implementation phases / checklist

### Phase 1 — Plumbing + `refinery` + `exoticHull` hull/immunity
- [ ] schemas.ts: add `refinery`, `exoticHull`; bump `options` max 2 → 3; defaults
- [ ] useGameState.ts: `UPGRADE_MAX` (new keys → 1, `options` → 3); `buyUpgrade` one-shot list (+2 keys)
- [ ] useGameState.ts: `sellMaterials()` applies `refinery` ×2
- [ ] TradeMenu.tsx: `PRESTIGE` section; `maxLevelForUpgrade`/`isFlatCostUpgrade`/label ternary; `options` → 3
- [ ] TradeMenu.tsx: `computePrereqLock` (refinery, exoticHull, per-tier options) + `refinery` sell-preview line
- [ ] scene.ts: mirror `exoticHull` → `tickState` (`exoticHullCharges`, `voidImmune`)
- [ ] game-tick.ts: `exoticHullCharges` buffer + damage-order; `voidImmune` guards on pull (~1817) and consumption (~1398)
- [ ] Manual test: grind scrap, buy both, verify ×2 sell, extra hull hits, fly into black hole unharmed

### Phase 2 — 3rd orb + figure-four formation
- [ ] Raise both `Math.min(2,…)` clamps to 3 (game-tick ~931, scene ~1505)
- [ ] Buy 3rd option after exoticHull; confirm it fires
- [ ] Figure-four formation branch in `optionMuzzlePositions` + `syncOptionOrbs`
- [ ] Manual test: formation reads right at speed/turns; shots originate from orbs

### Phase 3 — Cosmic-pink visuals
- [ ] Darken ship materials + pink aura in ship-model.ts / scene.ts
- [ ] Reapply after post-prologue ship rebuild (scene.ts ~3441)
- [ ] Optional: pink thruster tint; in-hole "immune" cue

### Cross-cutting
- [ ] PRESTIGE section visibility — **default: always shown, greyed/locked with prereq hints**.
- [ ] `npm run lint` + typecheck; play a full run.
- [ ] Optional: achievement/HUD nod for owning the capstone.

---

## 6. Achievements impact (`src/lib/achievements.ts`)

Adding upgrade keys and touching options/black-hole behavior ripples into the
achievement system. Handle each:

**Required (compile-breaking):**
- [ ] **`STARTING_UPGRADE_LEVEL`** (~line 112) is a `Record<keyof Upgrades, number>`
  — must add `refinery: 0` and `exoticHull: 0` or TypeScript fails.

**Decision — keep "Full Compliance" achievable:**
- [ ] **`PERMANENT_UPGRADE_KEYS`** (~138) + `hasFullCompliance` drive the
  **`full-compliance-package`** achievement ("Own every permanent upgrade").
  **Do NOT add `refinery`/`exoticHull` here.** If we did, Full Compliance would
  suddenly require ~27k+ scrap of prestige purchases, gating a previously
  mid-game achievement behind the astronomical tier. Prestige items are
  *aspirational extras*, deliberately excluded from "own everything."
  (`hasAnyPurchasedUpgrade` iterates all keys, so buying a prestige item still
  counts for **`approved-purchase-order`** — that's fine.)

**Meta / "maxed-everything" achievements — audited, all safe:**
- **No completionist achievement** (no "unlock all achievements" / platinum).
  `ACHIEVEMENT_COUNT` (= `DEFINITIONS.length`) is used only for the
  "UNLOCKED X / TOTAL" UI (AchievementsMenu.tsx, page.tsx); it auto-scales if we
  add the optional new achievements. Nothing to break.
- **No hull-max achievement** — the only "max" achievement is `max-blaster`
  (`blaster >= 5`). Adding Exotic Matter Hull / a hull buffer affects nothing.
- **`full-compliance-package`** ("own every permanent upgrade") checks
  `upgrades[key] > STARTING_UPGRADE_LEVEL[key]` (own ≥1, **not** maxed) over
  `PERMANENT_UPGRADE_KEYS`. `options` is in that list → its `>0` gate is
  unchanged by the 2→3 cap raise. `hull` is **not** in the list. With prestige
  keys excluded (above), this stays achievable. ✓

**Unaffected but verify:**
- **`orbital-accounting`** (`options >= 2`, "Own both Options") — gate is `>=2`;
  raising the cap to 3 doesn't change when it fires. Wording still reads fine at
  the 2-orb gate. No change.
- **`defensive-spending`** (shield + hull + armor each absorb a hit) — exotic-hull
  charges are a **separate** counter (`exoticHullCharges`), so absorbing one must
  NOT set `hullAbsorbedThisRun`. Keep the two distinct so this achievement's
  meaning is unchanged.

**Behavior shift to note (not blocking):**
- **`edge-of-the-permit`** (Hidden — approach a black hole and escape) — driven by
  `blackHoleWarned` → `blackHoleEscapedThisRun` (page.tsx ~866-878), set on
  proximity to the warning ring, not the event horizon. With `exoticHull`
  immunity the approach/escape becomes risk-free, making this trivial for capstone
  owners. Still *functions* (warned→escaped flow intact). Most players earn it
  long before affording the 15k capstone, so leave as-is; flag only.

**Optional new achievements (propose, not required):**
- "Quantum Refinery" owned / first ×2 sale.
- "Event Horizon Tourist" — sit inside a black hole and live (only possible with
  `exoticHull`); would need a new run-state flag set when `voidImmune` && inside
  horizon. Nice payoff for the capstone.
  Decide with user before adding — see §9.

---

## 7. Risks / gotchas

- **Two clamp sites** for options (game-tick + scene) must change together or the 3rd orb fires invisibly / renders without firing.
- **Per-tier options lock** is new (existing locks are all-or-nothing); verify tiers 1–2 stay freely buyable and only the 3rd locks pre-`exoticHull`.
- **Ship rebuild** post-prologue (`createShipModel('normal')`) drops material overrides — reapply visuals there.
- **Damage-order** for `exoticHullCharges` interacts with the shield/hull/armor/smartBomb ladder; confirm order before inserting.
- Arcade runs reset upgrades (`resetRunState`) — these are **per-run** chase goals (see §8).

---

## 8. Open questions

- ~~**Persistence**~~ — RESOLVED: behave exactly like other upgrades (per-run;
  reset by `resetRunState`). No new persistence.
- **Final costs** — drafts: Refinery 12k, Exotic Matter Hull 15k; tune in playtest.
- **`exoticHull` buffer size** — draft 3 charges, no regen (confirmed no self-repair).
- **Optional new achievements** — add "Quantum Refinery owned" and/or "Event
  Horizon Tourist" (§6)? User said existing achievement handling is fine; default
  **skip** the two optional adds for v1 unless requested.

---

## 9. Decision log

- 2026-06-19 — Drafted, then revised. **Merged** the former "Voidheart Core" into
  **Exotic Matter Hull**: one capstone upgrade = extra hull buffer (no self-repair)
  + black-hole immunity + unlocks buying a 3rd Option Orb (existing `options`
  upgrade, cap 2→3, gated behind ownership) + figure-four orb formation +
  dark/cosmic-pink ship. Final set is two prestige upgrades: Quantum Refinery and
  Exotic Matter Hull. Three-phase rollout.
- 2026-06-19 — Confirmed `exoticHull` prereq = `hull >= 3` **and** `options >= 2`
  (Options maxed). Audited achievements: must extend `STARTING_UPGRADE_LEVEL`;
  deliberately **exclude** prestige keys from `PERMANENT_UPGRADE_KEYS` so
  "Full Compliance" stays mid-game-achievable; keep `exoticHullCharges` separate
  from `hullAbsorbedThisRun`; noted `edge-of-the-permit` trivializes under
  immunity (non-blocking).
- 2026-06-19 — User additions: (1) **Persistence resolved** — prestige acts like
  every other upgrade, per-run. (2) Prologue showcase must fly the prestige
  upgrades maxed **and denote them on the HUD side panel** (`hudUpgrades` memo +
  HUD.tsx rows; prologue sim → 3 orbs + immunity + pink visuals). (3) Meta-
  achievement audit: **no** completionist/"unlock-all" or hull-max achievement
  exists; `full-compliance-package` and `orbital-accounting` both verified safe
  under the options 2→3 cap and the new keys.
- 2026-06-19 — **Implemented all three phases + both optional achievements**
  ("Quantum Dividends", "Event Horizon Tourist"). Touched: schemas, useGameState
  (UPGRADE_MAX/buyUpgrade/sellMaterials), TradeMenu (PRESTIGE section + helpers +
  per-tier options lock + sell preview), HUD rows, page.tsx hudUpgrades +
  black-hole-survived handler, achievements (STARTING_UPGRADE_LEVEL + run flag +
  2 defs), game-tick (exoticHullCharges/voidImmune fields, damage ladder, void
  guards, shared `optionOrbPositions` figure-four, prologue grants, EXOTIC_HULL_
  CHARGES), scene (setCombatUpgrades/reset/syncOptionOrbs/survive callback),
  ship-model (`applyExoticHullVisual`), GameCanvas (callback plumbing),
  ledger-config (optionCount 0..3), prologue-config (optionCount 3), DebugPanel
  (max-all literal). Exotic-hull buffer refills on resync like shield/armor
  (matches existing pattern). `npx tsc --noEmit` + `next lint` both clean.
- 2026-06-19 — Added **Wormhole Generator** (`wormhole`, tiered 0-2, prestige).
  Gated behind `exoticHull` (per `computePrereqLock`). On entering a black hole
  while void-immune it teleports the ship: Mk1 → a random other hole, Mk2 → the
  farthest other hole ("far side of the map"), with an origin-mirror fallback
  when no other hole exists. Lands just outside the destination's pull radius,
  zeroes velocity, 3s cooldown to prevent ping-pong, cosmic-pink arrival VFX.
  Cost 30k (Mk1) ramping. Wired through the same four layers + TickState
  (`wormholeTier`/`wormholeCooldown`) + TickResult (`wormholeTeleported`) +
  prologue/debug/HUD. Black holes are suppressed in the prologue so it only
  showcases (no live jump). tsc + lint clean.
