# T-014: Weapon rules: no free explosions, no free pierce, shared fireball

**Source:** [owner play-test 1](../../../reports/feedback/2026-11-06-owner-playtest-1.md), items 3, 4, 5, 8 · **Model:** Opus · **Depends on:** nothing open

## Why

The owner wants explosions and piercing to be things you earn from buffs, and the mini tower to be an extension of your fireball rather than a separate gun.

## What

1. **No hit effects** (spec §10, §12): a projectile hit (fireball, laser, mini-tower shot) and a ring hit spawn no effect. Explosions appear only from the Explode proc. Drop the "Spawns `explosion.small` on hit" / "`explosion.laser` on each hit" lines and the ring's hit effect. `explosion.small` and `explosion.laser` may stay in the atlas unused (say so in §3.3) or be removed with `ATLAS_NAMES`; keep `castle.destroy` and the proc explosions.
2. **Laser** (spec §10.2, §11, §12): the laser stops at its first hit. The `maxHits` column goes. The Pierce buff gives the laser the same pierce chance as the fireball (20/35/50%), rolled per hit. **The laser never explodes**: Explode applies to fireball and mini-tower shots only. Split stays fireball and mini-tower shots only. Card text and §11's "Applies to" column change accordingly.
3. **Mini tower shoots your fireball** (spec §10.3): each mini-tower shot is a copy of the dragon's fireball at its current level, with the same buffs: damage, speed, range, radius, sprite (big from level 4), kind `fireball` and the fireball's procs. The `damage` column of the mini-tower table goes; `fireRate`, `cooldown`, `duration`, `maxActive` and the 300 px targeting radius stay. The `miniShot` kind goes away (§4.1, §12). The fireball is the starting weapon and cannot be lost, so its level always exists.
4. **Re-measure** with `node tools/measure.mjs` (default run) and paste the summary table into the commit body under `Measured:`. Do not tune; T-016 rebalances.

## Determinism note

A game without chance buffs must still draw no proc rolls (§12 gating). The laser now rolls pierce only when Pierce is owned.

## Must not

Touch movement, tether, dragon rendering, enemy speeds or the atlas manifest beyond removing unused hit-effect names (T-013 runs in parallel and owns `dragon.js`, `tower.js`, the enemy table speeds and the manifest; coordinate by keeping your `content.js` edits to the weapon/buff tables and constants). Do not edit `docs/backlog.md`, merge or push.

## Tests

Update growth tests for the new rules (no hit effects; laser stops at first hit without Pierce, survives on a pierce roll with it, never explodes even with Explode L3; mini-tower shot equals a fireball shot at L1 and L5 with buffs, including the big sprite and proc eligibility). List every changed assertion under `Expectations changed` with why. The review-pin files (`test/*-review.test.mjs`) hold old rules in places: change only what the new rules contradict, and say which.

## Done means

`npm run gate` green; spec §4.1, §10, §11, §12 updated as plain spec text; commit `T-014: …` with `Closes: T-014`.
