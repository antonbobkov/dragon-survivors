# T-011: Close the growth test gaps found in review

**Source:** [T-005 review](../../reports/reviews/2026-11-06-T-005-review.md), finding 4 · **Model:** Sonnet · **Depends on:** T-005 (merged)

## Why

The growth code matches the spec, but these rules have no test: each mutation below survived the whole suite. The snapshot one matters most: state left out of `snapshot()` is invisible to every determinism test.

## What

Add tests (new file `test/growth-review.test.mjs`) so each mutation makes at least one test fail. Apply each locally, run the suite, revert. Never commit a mutation.

| Rule | Mutation that must fail |
|---|---|
| A laser counts golem hits toward `maxHits` (§12) | move the laser hit count below the proc-immune early return |
| `snapshot()` covers all run state | remove `miniTowers` or `buffs` from `snapshot()`. Prefer a generic test: every own field of `Game` except the documented exclusions (`rng`, grid, `events`) appears in the snapshot, so new state cannot be forgotten |
| Explosion centred on the projectile's hit point; damage = projectile damage (buff applied once) | centre on the enemy; multiply by the damage buff again |
| Split children start at the projectile's position | start them at the enemy |
| Ring knockback is away from the ball | take it from the dragon (use a layout where dragon, ball and golem are not collinear) |
| Ring spin ignores the cooldown buff; the angle wraps at 2π; ball radius ignores area; each ring hit spawns `explosion.small` | each of those four mutations |
| Mini tower lobs toward the **nearest** enemy, ties to the lower id | first enemy; no tie-break |
| The newly dropped gem is a merge candidate | exclude it |
| Fireball and laser switch sprite and radius at level 4 (`bigFrom`) | `bigFrom` 4 → 5 for each |
| Buffs keep gained order (HUD order, §11) | prepend new buffs |
| D-pad highlight clamps to `offers.length − 1` | clamp to 2 (test with a Repair-only offer) |

## Must not

Change behaviour (tests only; a spec violation found → minimal fix, listed under `Expectations changed`). T-006 is working in parallel on debug tools, `tools/measure.mjs` and content numbers: do not touch those. Do not edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green; the commit body lists each mutation and its catching test; `Closes: T-011`.
