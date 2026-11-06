# T-013: Movement feel: slower world, following tower, walking dragon

**Source:** [owner play-test 1](../../../reports/feedback/2026-11-06-owner-playtest-1.md), items 1, 2, 7 · **Model:** Opus · **Depends on:** nothing open

## Why

The owner played the public demo: everything moves too fast, the tower should trail the dragon all the time (not only when the tether snaps tight), and the dragon should walk, not fly.

## What

1. **Speeds** (spec §6, §8 table, content): every enemy speed × 0.5, golem included (knight 27.5, skeleton 45, slime 35, mage 20, ghost knight 27.5, ghost 36, golem 75). `DRAGON_SPEED` 260 → 87. `TETHER_LENGTH` 150 → 105. These are the owner's numbers: do not tune them.
2. **Following tower** (spec §7, §7.1 rewritten): each tick, if `dist(tower, dragon) > TOWER_REST_DIST`, the tower walks toward the dragon at `TOWER_FOLLOW_SPEED`, never closer than `TOWER_REST_DIST`; then, if the distance is still above `TETHER_LENGTH`, the tower is clamped to exactly `TETHER_LENGTH` (dragged). `TOWER_SPEED` is removed.
   - `TOWER_FOLLOW_SPEED = 60` px/s (*unmeasured*; below the dragon's 87 so the tower lags and the tether still matters).
   - `TOWER_REST_DIST = 40` px (*unmeasured*; the 2× dragon and tower sprites stop overlapping at about this distance).
   - Minion carriers (§7.3) now show whenever the tower moved this tick: keep `towerMoving` derived from state, for example by storing `tower.moved` (boolean, set each tick in the tether step and included in the snapshot).
3. **Walking dragon** (spec §3.3, §6.3): import `dragon.walk` from `dragon/walk.txt` (2 frames, 20 px); remove `dragon.dir` from the manifest, `ATLAS_NAMES` and the spec. The dragon faces right; `flip` when facing left. Facing = the sign of `moveX` while moving horizontally, else the sign of the aim's x, else the last facing. The walk animation advances only while the dragon moves; standing still shows frame 0. Remove the 16-direction dragon formula from §6.3 (lasers still use their own 16-direction sheets; keep that formula in §10.2). Keep the bob or drop it, whichever reads better at 20 px (say which).
4. **Re-measure** with `node tools/measure.mjs` (the default run) and paste the summary table into the commit body under `Measured:`. Do not tune anything; T-016 rebalances after all the feedback lands.

## Must not

Change weapons, procs or projectile code (T-014 runs in parallel and owns `weapons.js`, `projectiles.js` and the weapon/buff tables). Expect a small merge in `content.js` and the spec. Do not edit `docs/backlog.md`, merge or push.

## Tests

Tether: the tower follows while inside the tether and stops at the rest distance; dragging at the tether keeps exactly `TETHER_LENGTH`; `tower.moved`. Dragon: facing rules, frame holds when still, advances when moving. Content cross-check (`test/content.test.mjs`) stays green with the new numbers. Update every test that hard-coded the old speeds by reading the constants instead (list them under `Expectations changed`).

## Done means

`npm run gate` green; spec §3.3, §6, §7, §8 updated as plain spec text; atlas rebuilt (`npm run build:assets`); commit `T-013: …` with `Closes: T-013`.
