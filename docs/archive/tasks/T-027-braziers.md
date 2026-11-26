# T-027: Braziers and pickups (the candlestick)

**Source:** [strategy-depth design](../../../reports/designs/2026-11-26-strategy-depth-design.md) §8; owner notes 2 "candlestick equivalent from VS (for heals)" · **Model:** Opus · **Depends on:** T-017 (art pipeline, merged)

## Why

The tower never heals except by the Repair card. The owner wants a Vampire Survivors candlestick: breakable light sources that drop heals and other pickups, which also pull the player out of position (a control decision).

## What

1. **Braziers:** every `BRAZIER_INTERVAL = 25` s (*unmeasured*) one brazier appears at a random point 250–450 px from the tower, placed **just outside the current view** if possible (so you walk to it), never closer than 120 px to another brazier; at most 4 exist. It is a stationary object (`game.braziers`), not an enemy: enemies ignore it and walk through it; it is not in the bestiary and not counted as a kill. Any player hit (projectile, ring, explosion, and later claws/bite/saw) breaks it; it takes no damage numbers. Breaking it plays a sound from the pack (choose one that fits) and drops one pickup.
2. **Pickups:** `game.pickups`, collected by the dragon on contact (like gems, `GEM_COLLECT_RADIUS`, they do **not** home), each lasting 30 s, blinking in its last 5 s:
   - **Heart** 60%: tower +20 HP (max HP cap).
   - **Magnet** 25%: every gem on the ground starts homing.
   - **Bomb** 15%: 60 fire damage through `dealDamage` to every enemy within the view rectangle around the dragon (golem untouched), with an `explosion.big` effect at the dragon and a screen-wide flash (render only).
   Weights and amounts *unmeasured*.
3. **Art (new, in `art/`, pack style, see `art/README.md`):** brazier 12 × 16 with a 2–3 frame flame flicker (study the pack's `burn` anim for the flame); a broken-brazier frame or a short break anim; heart, magnet, bomb pickups 8 × 8 (or 9 × 9), each readable on grass at 2×. Check them in `tools/art-preview.html` on grass and iterate until they read clearly.
4. **Randomness:** brazier placement and pickup rolls use `game.rng`; the brazier timer is deterministic. Document the draw order.
5. **Duration buff** (T-019 is adding it): a pickup's lifetime is multiplied by the Duration buff once it exists; if T-019 has not landed when you finish, leave a clear hook and say so.
6. **HUD:** a small marker at the screen edge pointing to an off-screen brazier (like an arrow) so players know where to walk.
7. **Spec:** a new section (e.g. §14.2) with all of the above; §2.1 tick order (braziers spawn in the spawner step or their own step, pickups in the gems step; say which); §4.1 state; §5 draw order; plain text.

## Spec sections to read (whole)

§2.1, §4.1, §5, §12.1, §14, §15, §17, §20; `art/README.md`.

## Tests

Spawn timing, placement bounds, cap, spacing; breaking by each hit type; pickup weights by stubbed rng; heart cap, magnet homing, bomb damage through resistances and golem immunity; lifetime and blink; determinism and snapshot; the edge-marker maths.

## Must not

Change other numbers. Another agent (T-019) changes buffs/knockback in `src/sim/{damage,weapons,projectiles,levelup,content,enemies}.js` in parallel: keep your edits there to calling `dealDamage` and the hooks you need, and expect a merge. Do not edit `docs/backlog.md`, merge or push. Follow the browser-checks rule (own port, own tab, pass `tabId`).

## Done means

`npm run gate` green; `npm run build:assets` reproduces the atlas; braziers and pickups visible and working in a run; spec updated; `Measured:` summary in the commit body; commit `T-027: …` with `Closes: T-027`.
