# T-023: Bite and saw blade

**Source:** [strategy-depth design](../../reports/designs/2026-11-26-strategy-depth-design.md) §4; owner notes 2 (weapons: "bite attack", "saw blade in straight line from the tower") · **Model:** Opus · **Depends on:** T-017, T-018, T-019, T-022 — all merged

## Why

The bite is the single-target execute with heavy knockback; the saw blade is a **positional** zoning weapon: it fires from the tower along the line through the dragon, so where you stand relative to the tower aims it. Both are physical.

## What

1. **Bite** (`bite`, physical, from the dragon): every cooldown, the dragon bites the **nearest** enemy within `reach` (ties to the lower id): one hit of `damage`, **×2 against an enemy below 30% of its max HP** (execute), knock. No target in reach → no bite, and the cooldown waits at 0 (fires as soon as something is in reach). Amount: +1 bite per volley on the next-nearest targets. Area scales `reach`.
2. **Saw blade** (`saw`, physical, from the tower): every cooldown the tower launches a blade along the unit vector from the tower **through the dragon** (if they coincide, the dragon's aim). It flies out `range` px at `speed`, spins in place for `dwell` s, then flies back to the tower and is removed on arrival (the tower may have moved: it homes to the tower's current position on the way back). It hits **every** enemy it overlaps (radius `r`), each at most once per `rehit` s (per blade), never stops on a hit. Velocity scales speed and range; Area scales `r`; Duration scales `dwell`; Amount fires extra blades fanned ±12° per extra blade; procs do not apply (physical).
3. **Starting numbers** (*unmeasured*; into the §10 tables):

| Weapon | L | cooldown | damage | shape | knock | other |
|---|---|---|---|---|---|---|
| Bite | 1→5 | 1.6 → 1.0 | 8 → 18 | reach 50 → 64 | 30 | execute ×2 below 30% HP |
| Saw blade | 1→5 | 3.0 → 2.0 | 2 → 5 | r 10 → 14, range 260 → 320, speed 260, dwell 0.6 → 1.2 s | 6 | rehit 0.4 s, blades 1 → 2 at L4 |

4. **Hits** through `dealDamage(game, e, amount, 'physical', source, knock)` (bite: source = dragon; saw: source = blade position), knock × Force; both break braziers via `breakBraziersWhere` with their shape (T-022).
5. **Art (new, `art/`, pack style per `art/README.md`):** bite: a jaws snap effect at the target (~16 × 16, 3 frames: open, closing, shut), drawn facing the target; saw blade: a spinning toothed disc 12 × 12, 4 frames (rotation by frame, not by canvas rotation, so pixels stay on the grid); icons `icon.bite` and `icon.saw` (9 × 9). Iterate in `tools/art-preview.html` on grass beside the claws until they read clearly; T-022's notes: render real-pixel PNGs on grass to judge.
6. **Debug:** grant keys for both (F9, F10, or extend T-022's scheme); `?debug=1` draws the bite reach and blade hit circles.
7. **Instrument:** `tools/measure.mjs` greedy policy knows both weapons.
8. **Spec:** §10.8 bite, §10.9 saw blade, knock table, §2.1 step placement (blades move in step 7 with projectiles or their own step; say which), §4.1 state (`game.blades` or reuse of `slashes`), §5 draw order, §14.1 card texts, §17 icons, §19 debug, plain text.

## Notes from T-022

Reuse `src/sim/claws.js` patterns (queued strikes, `dealDamage`, `breakBraziersWhere`); add each weapon to `WEAPON_IDS`, the §10 knock table and the content test's `sections` and `knockNames` maps; use `weaponMaxLevel(id)`; the card pool now includes claws, so rng-pinned offer tests shift — update the one you shift and list it under `Expectations changed`.

## Tests

Bite: nearest-in-reach with ties, waits with no target, execute threshold exactly at 30%, Amount next-nearest, knock away from the dragon. Saw: launch direction through the dragon (and the coincide fallback), out-dwell-back path homing to a moved tower, rehit per enemy per blade, Amount fan, Duration/Velocity/Area effects, removal on return. Both: resistances (physical), braziers broken, determinism and snapshot, render writes no state.

## Must not

Retune existing numbers. Another agent (T-024: horses, mounted knights, stages) changes `src/sim/{enemies,spawner,content,game}.js`, the manifest and the atlas in parallel: expect a manifest/atlas merge; rebuild with `npm run build:assets` after merging main. Do not edit `docs/backlog.md`, merge into main or push. Follow the browser-checks rule (own port, own tab, pass `tabId`).

## Done means

`npm run gate` green; `npm run build:assets` reproduces the atlas; both weapons visible and working in a run; spec updated; `Measured:` in the commit body; commit `T-023: …` with `Closes: T-023`.

**Paused at the usage limit (2026-11-26):** WIP commits on branch `worktree-agent-afd0ae2baa58e6335` (art, sim, render, spec, tests; not yet gated). Resume from that branch.
